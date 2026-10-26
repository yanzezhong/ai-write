package svc

import (
	"log"

	"github.com/yanzezhong/ai-write/server/internal/config"
	"github.com/yanzezhong/ai-write/server/internal/model"
)

const SingleUserID = 1 // 首期单用户

type ServiceContext struct {
	Config config.Config
	Store  *model.Store // Mongo 不在线时可能为 nil，同步接口将返回 503
}

func NewServiceContext(c config.Config) *ServiceContext {
	ctx := &ServiceContext{Config: c}
	if c.Mongo.Uri != "" {
		store, err := model.NewStore(c.Mongo.Uri, c.Mongo.Database)
		if err != nil {
			log.Printf("[warn] mongo 初始化失败（同步接口暂不可用）: %v", err)
		} else {
			ctx.Store = store
		}
	}
	return ctx
}
