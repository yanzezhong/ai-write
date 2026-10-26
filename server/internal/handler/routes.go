package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest"

	"github.com/yanzezhong/ai-write/server/internal/svc"
)

// RegisterHandlers 注册全部路由（S1：health / me；S2 增加同步 API）
func RegisterHandlers(server *rest.Server, _ *svc.ServiceContext) {
	server.AddRoutes(withPreflight([]rest.Route{
		{
			Method:  http.MethodGet,
			Path:    "/api/health",
			Handler: healthHandler(),
		},
		{
			Method:  http.MethodGet,
			Path:    "/api/me",
			Handler: meHandler(),
		},
	}))
}

// withPreflight 为每条路由补一条 OPTIONS 孪生路由：
// go-zero 对未注册的方法直接回 405（走不到全局中间件），
// 补上后浏览器跨域预检会命中该路由，由 Cors 中间件应答 204 + 头。
func withPreflight(routes []rest.Route) []rest.Route {
	seen := map[string]bool{}
	out := append([]rest.Route{}, routes...)
	for _, r := range routes {
		if seen[r.Path] {
			continue
		}
		seen[r.Path] = true
		out = append(out, rest.Route{
			Method:  http.MethodOptions,
			Path:    r.Path,
			Handler: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) },
		})
	}
	return out
}
