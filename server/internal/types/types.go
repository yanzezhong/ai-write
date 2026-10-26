package types

// ---------- 基础 ----------

type HealthResp struct {
	Ok   bool   `json:"ok"`
	Name string `json:"name"`
	Time string `json:"time"`
}

type MeResp struct {
	User string `json:"user"`
	Note string `json:"note"`
}

type ErrResp struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ---------- 项目 ----------

type CreateProjectReq struct {
	Name   string `json:"name"`
	Device string `json:"device"`
}

type ForkSummary struct {
	Id              string `json:"id"`
	Name            string `json:"name"`
	Version         int    `json:"version"`
	ForkBaseVersion int    `json:"forkBaseVersion"`
	SourceDevice    string `json:"sourceDevice"`
	UpdatedAt       string `json:"updatedAt"`
}

type ProjectSummary struct {
	Id          string         `json:"id"`
	Name        string         `json:"name"`
	Version     int            `json:"version"`
	Md5         string         `json:"md5"`
	FileCount   int            `json:"fileCount"`
	TotalBytes  int64          `json:"totalBytes"`
	SourceDevice string        `json:"sourceDevice"`
	UpdatedAt   string         `json:"updatedAt"`
	Forks       []ForkSummary  `json:"forks"`
}

type ProjectsResp struct {
	Projects []ProjectSummary `json:"projects"`
}

type CreatedResp struct {
	Id      string `json:"id"`
	Version int    `json:"version"`
}

// ---------- 同步 ----------

type StateResp struct {
	Version   int    `json:"version"`
	Md5       string `json:"md5"`
	UpdatedAt string `json:"updatedAt"`
	Forks     int    `json:"forks"`
}

type FilePayload struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type PullResp struct {
	Version int           `json:"version"`
	Md5     string        `json:"md5"`
	Files   []FilePayload `json:"files"`
}

type PushReq struct {
	BaseVersion int           `json:"baseVersion"`
	BaseMd5     string        `json:"baseMd5"`
	Device      string        `json:"device"`
	Files       []FilePayload `json:"files"`
}

// PushResp 三态：fast-forward 快进 / noop 无变化 / forked 自动分叉
type PushResp struct {
	Status  string        `json:"status"` // "ok" | "noop" | "forked"
	Version int           `json:"version"`
	Md5     string        `json:"md5"`
	Fork    *ForkSummary  `json:"fork,omitempty"`  // forked 时：本次内容落到的分叉
	Main    *ProjectSummary `json:"main,omitempty"` // forked 时：主项目当前状态
}

type ResolveReq struct {
	ForkId string `json:"forkId"`
	Action string `json:"action"` // promote | discard
}

type ResolveResp struct {
	Version int    `json:"version"` // promote 后主项目新版本；discard 时不变
	Md5     string `json:"md5"`
}

type DeviceReq struct {
	DeviceKey string `json:"deviceKey"`
	Name      string `json:"name"`
}
