package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	// 单用户令牌：Authorization: Bearer <Token>
	Token string
	// CORS 白名单
	AllowOrigins []string
	// MySQL（S2 起使用）
	Mysql struct {
		DataSource string
	}
}
