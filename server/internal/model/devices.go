package model

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Device 设备登记（分叉命名 / 台账展示）
type Device struct {
	UserID     uint64    `bson:"userId"`
	DeviceKey  string    `bson:"deviceKey"`
	Name       string    `bson:"name"`
	LastSeenAt time.Time `bson:"lastSeenAt"`
	CreatedAt  time.Time `bson:"createdAt"`
}

// UpsertDevice 按 (userId, deviceKey) 上报/改名设备
func (s *Store) UpsertDevice(ctx context.Context, userId uint64, deviceKey, name string) error {
	now := time.Now()
	_, err := s.devices.UpdateOne(ctx,
		bson.M{"userId": userId, "deviceKey": deviceKey},
		bson.M{"$set": bson.M{"name": name, "lastSeenAt": now}, "$setOnInsert": bson.M{"userId": userId, "deviceKey": deviceKey, "createdAt": now}},
		options.Update().SetUpsert(true),
	)
	return err
}
