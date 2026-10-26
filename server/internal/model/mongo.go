package model

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

const (
	queryTimeout = 8 * time.Second
)

// Store MongoDB 数据访问层。
// 设计要点：项目文件内嵌在 projects 文档中（文本量 MB 级，远低于 16MB 文档上限），
// 版本推进用「单文档条件更新（CAS）」保证原子性——无需副本集事务。
type Store struct {
	client   *mongo.Client
	db       *mongo.Database
	projects *mongo.Collection
	versions *mongo.Collection
	devices  *mongo.Collection
}

// NewStore 连接 MongoDB。client 创建是惰性的，Mongo 不在线时服务仍可启动（健康检查可用，
// 同步接口在首次访问时报错），驱动会自动重连。
func NewStore(uri, database string) (*Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	_ = client.Ping(ctx, readpref.Primary()) // 尽力而为，失败不阻塞启动
	db := client.Database(database)
	s := &Store{
		client:   client,
		db:       db,
		projects: db.Collection("projects"),
		versions: db.Collection("project_versions"),
		devices:  db.Collection("devices"),
	}
	s.ensureIndexes(ctx)
	return s, nil
}

// ensureIndexes 幂等建索引（裸跑不经 docker init 时也能工作）
func (s *Store) ensureIndexes(ctx context.Context) {
	type idx struct {
		coll *mongo.Collection
		keys interface{}
		opts *options.IndexOptions
	}
	for _, i := range []idx{
		{s.projects, map[string]int{"userId": 1, "updatedAt": -1}, nil},
		{s.projects, map[string]int{"parentId": 1}, nil},
		{s.versions, map[string]int{"projectId": 1, "version": 1}, options.Index().SetUnique(true)},
		{s.devices, map[string]int{"userId": 1, "deviceKey": 1}, options.Index().SetUnique(true)},
	} {
		_, _ = i.coll.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: i.keys, Options: i.opts})
	}
}

func (s *Store) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return s.client.Disconnect(ctx)
}

func ctxTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), queryTimeout)
}
