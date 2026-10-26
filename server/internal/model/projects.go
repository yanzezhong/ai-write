package model

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ErrNotFound 目标不存在（或已删除）
var ErrNotFound = errors.New("not found")

// FileEntry 项目内单个文本文件（内嵌存储）
type FileEntry struct {
	Path    string `bson:"path" json:"path"`
	Content string `bson:"content" json:"content"`
	Sha256  string `bson:"sha256" json:"-"`
	Size    int    `bson:"size" json:"-"`
}

// Project 主项目与分叉同集合：parentId 为空即主项目
type Project struct {
	ID               primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	UserID           uint64              `bson:"userId" json:"-"`
	ParentID         *primitive.ObjectID `bson:"parentId,omitempty" json:"-"`
	ForkBaseVersion  *int                `bson:"forkBaseVersion,omitempty" json:"-"`
	SourceDevice     string              `bson:"sourceDevice" json:"-"`
	Name             string              `bson:"name" json:"name"`
	CurrentVersion   int                 `bson:"currentVersion" json:"version"`
	CurrentMd5       string              `bson:"currentMd5" json:"md5"`
	FileCount        int                 `bson:"fileCount" json:"fileCount"`
	TotalBytes       int64               `bson:"totalBytes" json:"totalBytes"`
	Files            []FileEntry         `bson:"files" json:"-"`
	CreatedAt        time.Time           `bson:"createdAt" json:"-"`
	UpdatedAt        time.Time           `bson:"updatedAt" json:"updatedAt"`
	DeletedAt        *time.Time          `bson:"deletedAt,omitempty" json:"-"`
	// Forks 运行态字段（列表查询时组装，不入库）
	Forks []*Project `bson:"-" json:"forks,omitempty"`
}

// IsFork 是否分叉项目
func (p *Project) IsFork() bool { return p.ParentID != nil }

// ---------- 查询 ----------

func (s *Store) GetProject(ctx context.Context, id primitive.ObjectID) (*Project, error) {
	var p Project
	err := s.projects.FindOne(ctx, bson.M{"_id": id, "deletedAt": bson.M{"$exists": false}}).Decode(&p)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, ErrNotFound
	}
	return &p, err
}

// ListProjectsWithForks 主项目列表，各挂其分叉概要（不含文件内容）
func (s *Store) ListProjectsWithForks(ctx context.Context, userId uint64) ([]*Project, error) {
	cur, err := s.projects.Find(ctx, bson.M{
		"userId": userId, "deletedAt": bson.M{"$exists": false},
	}, options.Find().SetSort(bson.M{"updatedAt": -1}).SetProjection(bson.M{"files": 0}))
	if err != nil {
		return nil, err
	}
	var all []*Project
	if err := cur.All(ctx, &all); err != nil {
		return nil, err
	}
	mains := make([]*Project, 0, len(all))
	for _, p := range all {
		if p.ParentID == nil {
			mains = append(mains, p)
		}
	}
	for _, p := range all {
		if p.ParentID != nil {
			for _, m := range mains {
				if m.ID == *p.ParentID {
					m.Forks = append(m.Forks, p) // 见下：Forks 运行态字段
					break
				}
			}
		}
	}
	return mains, nil
}

// ---------- 写操作 ----------

// CreateProject 创建主项目（v0，等待首次推送）
func (s *Store) CreateProject(ctx context.Context, userId uint64, name, device string) (*Project, error) {
	now := time.Now()
	p := &Project{
		UserID: userId, Name: name, SourceDevice: device,
		CreatedAt: now, UpdatedAt: now,
	}
	res, err := s.projects.InsertOne(ctx, p)
	if err != nil {
		return nil, err
	}
	p.ID = res.InsertedID.(primitive.ObjectID)
	return p, nil
}

// PushFastForward CAS 推进：仅当 currentVersion==baseVersion（且 baseMd5 提供时指纹吻合）时写入并 +1。
// 返回 (推进成功?, 最新项目, err)。matched==0 说明基线落后 → 调用方走分叉。
func (s *Store) PushFastForward(ctx context.Context, id primitive.ObjectID, baseVersion int, baseMd5 string, device string, files []FileEntry, newMd5 string, fileCount int, totalBytes int64) (bool, *Project, error) {
	filter := bson.M{
		"_id":            id,
		"deletedAt":      bson.M{"$exists": false},
		"currentVersion": baseVersion,
	}
	if baseMd5 != "" {
		filter["currentMd5"] = baseMd5
	}
	now := time.Now()
	update := bson.M{"$set": bson.M{
		"files":          files,
		"currentVersion": baseVersion + 1,
		"currentMd5":     newMd5,
		"fileCount":      fileCount,
		"totalBytes":     totalBytes,
		"sourceDevice":   device,
		"updatedAt":      now,
	}}
	var updated Project
	err := s.projects.FindOneAndUpdate(ctx, filter, update,
		options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"files": 0})).Decode(&updated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil, nil // 基线落后 → 分叉
	}
	if err != nil {
		return false, nil, err
	}
	return true, &updated, nil
}

// CreateFork 把后到方的推送内容立为分叉项目（挂根主项目下），返回分叉。
// rootParent：若目标本身是分叉，分叉仍挂主项目根。
func (s *Store) CreateFork(ctx context.Context, target *Project, forkBaseVersion int, name, device string, files []FileEntry, md5 string, fileCount int, totalBytes int64) (*Project, error) {
	parent := target.ID
	if target.ParentID != nil {
		parent = *target.ParentID
	}
	base := forkBaseVersion
	if target.CurrentVersion < base {
		base = target.CurrentVersion
	}
	now := time.Now()
	fork := &Project{
		UserID: target.UserID, ParentID: &parent, ForkBaseVersion: &base,
		SourceDevice: device, Name: name,
		CurrentVersion: 1, CurrentMd5: md5,
		FileCount: fileCount, TotalBytes: totalBytes, Files: files,
		CreatedAt: now, UpdatedAt: now,
	}
	res, err := s.projects.InsertOne(ctx, fork)
	if err != nil {
		return nil, err
	}
	fork.ID = res.InsertedID.(primitive.ObjectID)
	return fork, nil
}

// PromoteFork 采用分叉内容作为主项目新版本（整体覆盖语义），分叉随之软删。
func (s *Store) PromoteFork(ctx context.Context, mainId, forkId primitive.ObjectID) (*Project, error) {
	fork, err := s.GetProject(ctx, forkId)
	if err != nil {
		return nil, err
	}
	if fork.ParentID == nil || *fork.ParentID != mainId {
		return nil, ErrNotFound
	}
	main, err := s.GetProject(ctx, mainId)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	// 以读取到的版本做 CAS，避免并发 promote 交错
	update := bson.M{"$set": bson.M{
		"files":          fork.Files,
		"currentVersion": main.CurrentVersion + 1,
		"currentMd5":     fork.CurrentMd5,
		"fileCount":      fork.FileCount,
		"totalBytes":     fork.TotalBytes,
		"sourceDevice":   "resolve:promote",
		"updatedAt":      now,
	}}
	var updated Project
	err = s.projects.FindOneAndUpdate(ctx,
		bson.M{"_id": mainId, "currentVersion": main.CurrentVersion, "deletedAt": bson.M{"$exists": false}},
		update, options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"files": 0})).Decode(&updated)
	if err != nil {
		return nil, err
	}
	_, _ = s.projects.UpdateOne(ctx, bson.M{"_id": forkId}, bson.M{"$set": bson.M{"deletedAt": now, "updatedAt": now}})
	return &updated, nil
}

// SoftDelete 软删项目；主项目连带软删其全部分叉
func (s *Store) SoftDelete(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now()
	p, err := s.GetProject(ctx, id)
	if err != nil {
		return err
	}
	_, err = s.projects.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"deletedAt": now, "updatedAt": now}})
	if err != nil {
		return err
	}
	if p.ParentID == nil {
		_, _ = s.projects.UpdateMany(ctx, bson.M{"parentId": id, "deletedAt": bson.M{"$exists": false}},
			bson.M{"$set": bson.M{"deletedAt": now, "updatedAt": now}})
	}
	return nil
}

// ForkName 生成分叉名：原项目名 · 分叉 MM-dd HH:mm（设备）
func ForkName(mainName, device string, t time.Time) string {
	label := device
	if label == "" {
		label = "未知设备"
	}
	name := mainName + " · 分叉 " + t.Format("01-02 15:04") + "（" + label + "）"
	if len(name) > 160 {
		name = strings.ToValidUTF8(name[:150], "")
	}
	return name
}
