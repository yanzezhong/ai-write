package handler

import (
	"net/http"

	"github.com/zeromicro/go-zero/rest"

	"github.com/yanzezhong/ai-write/server/internal/logic"
	"github.com/yanzezhong/ai-write/server/internal/svc"
)

// RegisterHandlers 注册全部路由。
// 设计文档：docs/backend-plan.md §5.2；OPTIONS 孪生路由由 withPreflight 自动补齐（CORS 预检）。
func RegisterHandlers(server *rest.Server, ctx *svc.ServiceContext) {
	server.AddRoutes(withPreflight([]rest.Route{
		{Method: http.MethodGet, Path: "/api/health", Handler: healthHandler()},
		{Method: http.MethodGet, Path: "/api/me", Handler: meHandler()},

		// 项目
		{Method: http.MethodGet, Path: "/api/projects", Handler: logic.ListProjects(ctx)},
		{Method: http.MethodPost, Path: "/api/projects", Handler: logic.CreateProject(ctx)},
		{Method: http.MethodDelete, Path: "/api/projects/:id", Handler: logic.DeleteProject(ctx)},

		// 同步
		{Method: http.MethodGet, Path: "/api/projects/:id/state", Handler: logic.GetState(ctx)},
		{Method: http.MethodPost, Path: "/api/projects/:id/pull", Handler: logic.Pull(ctx)},
		{Method: http.MethodPost, Path: "/api/projects/:id/push", Handler: logic.Push(ctx)},
		{Method: http.MethodPost, Path: "/api/projects/:id/resolve", Handler: logic.Resolve(ctx)},

		// 设备
		{Method: http.MethodPost, Path: "/api/devices", Handler: logic.ReportDevice(ctx)},
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
