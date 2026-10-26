package model

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VersionEntry 版本台账（内容不可变凭证，只增不改）
type VersionEntry struct {
	ProjectID  primitive.ObjectID `bson:"projectId"`
	Version    int                `bson:"version"`
	Md5        string             `bson:"md5"`
	FileCount  int                `bson:"fileCount"`
	TotalBytes int64              `bson:"totalBytes"`
	Device     string             `bson:"device"`
}

// AddVersion 记录一版（唯一索引保证幂等，重复写入不算错误）
func (s *Store) AddVersion(ctx context.Context, e VersionEntry) error {
	_, err := s.versions.UpdateOne(ctx,
		bson.M{"projectId": e.ProjectID, "version": e.Version},
		bson.M{"$setOnInsert": e},
		options.Update().SetUpsert(true),
	)
	return err
}
