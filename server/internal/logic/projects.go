package logic

import (
	"errors"
	"net/http"
	"strings"

	"github.com/zeromicro/go-zero/rest/httpx"
	"github.com/zeromicro/go-zero/rest/pathvar"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/yanzezhong/ai-write/server/internal/model"
	"github.com/yanzezhong/ai-write/server/internal/svc"
	"github.com/yanzezhong/ai-write/server/internal/types"
)

// pathID 从路径参数解析项目 id（路由 /api/projects/:id/…）
func pathID(r *http.Request) (primitive.ObjectID, error) {
	id, err := primitive.ObjectIDFromHex(pathvar.Vars(r)["id"])
	if err != nil {
		return primitive.NilObjectID, errBadID
	}
	return id, nil
}

// ---------- 项目列表 / 创建 / 删除 ----------

func ListProjects(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		mains, err := ctx.Store.ListProjectsWithForks(r.Context(), svc.SingleUserID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		resp := types.ProjectsResp{Projects: make([]types.ProjectSummary, 0, len(mains))}
		for _, m := range mains {
			resp.Projects = append(resp.Projects, toSummary(m))
		}
		httpx.OkJson(w, resp)
	}
}

func CreateProject(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.CreateProjectReq
		if err := httpx.ParseJsonBody(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		name := sanitizeName(req.Name)
		if name == "" {
			writeErr(w, http.StatusBadRequest, errors.New("项目名不合法"))
			return
		}
		p, err := ctx.Store.CreateProject(r.Context(), svc.SingleUserID, name, req.Device)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		httpx.OkJson(w, types.CreatedResp{Id: p.ID.Hex(), Version: p.CurrentVersion})
	}
}

func DeleteProject(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		if err := ctx.Store.SoftDelete(r.Context(), id); err != nil {
			writeErr(w, mapErr(err))
			return
		}
		httpx.OkJson(w, map[string]bool{"ok": true})
	}
}

// ---------- 工具 ----------

func sanitizeName(raw string) string {
	name := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return -1
		}
		return r
	}, strings.TrimSpace(raw))
	if len(name) > 128 {
		name = name[:128]
	}
	return name
}

func toSummary(p *model.Project) types.ProjectSummary {
	s := types.ProjectSummary{
		Id: p.ID.Hex(), Name: p.Name, Version: p.CurrentVersion, Md5: p.CurrentMd5,
		FileCount: p.FileCount, TotalBytes: p.TotalBytes, SourceDevice: p.SourceDevice,
		UpdatedAt: p.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Forks:     []types.ForkSummary{},
	}
	for _, f := range p.Forks {
		base := 0
		if f.ForkBaseVersion != nil {
			base = *f.ForkBaseVersion
		}
		s.Forks = append(s.Forks, types.ForkSummary{
			Id: f.ID.Hex(), Name: f.Name, Version: f.CurrentVersion, ForkBaseVersion: base,
			SourceDevice: f.SourceDevice, UpdatedAt: f.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return s
}

func writeErr(w http.ResponseWriter, status int, err error) {
	httpx.WriteJson(w, status, types.ErrResp{Code: status, Message: err.Error()})
}

func mapErr(err error) int {
	if errors.Is(err, model.ErrNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

var errBadID = errors.New("非法项目 id")
