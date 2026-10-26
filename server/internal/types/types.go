package types

// HealthResp 健康检查响应
type HealthResp struct {
	Ok   bool   `json:"ok"`
	Name string `json:"name"`
	Time string `json:"time"`
}

// MeResp 单用户信息（令牌校验通过的探针接口）
type MeResp struct {
	User string `json:"user"`
	Note string `json:"note"`
}
