package middleware

import (
	"net/http"
	"strings"
)

// Cors 为所有响应附加 CORS 头，并直接应答预检 OPTIONS。
// 允许携带 Authorization（客户端同步引擎使用 Bearer 令牌）。
func Cors(allowOrigins []string) func(http.HandlerFunc) http.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowOrigins))
	for _, o := range allowOrigins {
		allowed[o] = struct{}{}
	}
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, If-Match")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next(w, r)
		}
	}
}

// BearerToken 校验单用户令牌；skipPrefixes 内列出的路径免鉴权（如健康检查）。
func BearerToken(token string, skipPrefixes ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			for _, p := range skipPrefixes {
				if strings.HasPrefix(r.URL.Path, p) {
					next(w, r)
					return
				}
			}
			auth := r.Header.Get("Authorization")
			got, ok := strings.CutPrefix(auth, "Bearer ")
			if !ok || token == "" || got != token {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"code":401,"message":"invalid or missing token"}`))
				return
			}
			next(w, r)
		}
	}
}
