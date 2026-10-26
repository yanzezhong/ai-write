// ai-write 云同步服务（go-zero）。
// S1：健康检查 + 单用户令牌鉴权 + CORS；S2 起接入 MySQL 与同步 API。
// 设计文档见 docs/backend-plan.md（V1.1 自动分叉模型）。
package main

import (
	"flag"
	"log"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"

	"github.com/yanzezhong/ai-write/server/internal/config"
	"github.com/yanzezhong/ai-write/server/internal/handler"
	"github.com/yanzezhong/ai-write/server/internal/middleware"
	"github.com/yanzezhong/ai-write/server/internal/svc"
)

var configFile = flag.String("f", "etc/aiwrite-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	server := rest.MustNewServer(c.RestConf)
	defer server.Stop()

	ctx := svc.NewServiceContext(c)

	// 全局中间件：CORS（始终）+ 单用户令牌（除 /api/health 外全部校验）
	server.Use(middleware.Cors(c.AllowOrigins))
	server.Use(middleware.BearerToken(c.Token, "/api/health"))

	handler.RegisterHandlers(server, ctx)

	log.Printf("ai-write server listening on %s:%d…", c.Host, c.Port)
	server.Start()
}
