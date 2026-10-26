package logic

import (
	"time"

	"github.com/yanzezhong/ai-write/server/internal/types"
)

// Health 健康检查（免鉴权，探活/部署检查用）
func Health() types.HealthResp {
	return types.HealthResp{
		Ok:   true,
		Name: "ai-write-server",
		Time: time.Now().Format(time.RFC3339),
	}
}

// Me 令牌校验探针：能返回即鉴权通过
func Me() types.MeResp {
	return types.MeResp{
		User: "single-user",
		Note: "首期单用户令牌模式，注册登录后续版本提供",
	}
}
