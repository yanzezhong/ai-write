package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	// 单用户令牌：Authorization: Bearer <Token>
	Token string
	// CORS 白名单
	AllowOrigins []string
	// MongoDB（文本项目内嵌单文档：单文档原子更新即天然 CAS，无需事务）
	Mongo struct {
		Uri      string
		Database string
	}
}
