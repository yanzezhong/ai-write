package svc

import (
	"log"
	"os"
	"strings"

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
	uri := c.Mongo.Uri
	if uri == "" || !strings.HasPrefix(uri, "mongodb") {
		if env := os.Getenv("AIWRITE_MONGO_URI"); env != "" {
			uri = env
		} else {
			uri = "mongodb://127.0.0.1:27017"
		}
	}
	if uri != "" {
		store, err := model.NewStore(uri, c.Mongo.Database)
		if err != nil {
			log.Printf("[warn] mongo 初始化失败（同步接口暂不可用）: %v", err)
		} else {
			ctx.Store = store
		}
	}
	return ctx
}
