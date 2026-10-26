package logic

import (
	"errors"
	"net/http"

	"github.com/zeromicro/go-zero/rest/httpx"

	"github.com/yanzezhong/ai-write/server/internal/model"
	"github.com/yanzezhong/ai-write/server/internal/svc"
	"github.com/yanzezhong/ai-write/server/internal/sync"
	"github.com/yanzezhong/ai-write/server/internal/types"
)

// ---------- state：轮询（轻量，不含内容） ----------

func GetState(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		p, err := ctx.Store.GetProject(r.Context(), id)
		if err != nil {
			writeErr(w, mapErr(err), err)
			return
		}
		forks, _ := ctx.Store.ListProjectsWithForks(r.Context(), svc.SingleUserID)
		n := 0
		if p.ParentID == nil {
			for _, m := range forks {
				if m.ID == id {
					n = len(m.Forks)
					break
				}
			}
		}
		httpx.OkJson(w, types.StateResp{
			Version: p.CurrentVersion, Md5: p.CurrentMd5,
			UpdatedAt: p.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"), Forks: n,
		})
	}
}

// ---------- pull：全量文本拉取 ----------

func Pull(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		p, err := ctx.Store.GetProject(r.Context(), id)
		if err != nil {
			writeErr(w, mapErr(err), err)
			return
		}
		files := make([]types.FilePayload, 0, len(p.Files))
		for _, f := range p.Files {
			files = append(files, types.FilePayload{Path: f.Path, Content: f.Content})
		}
		httpx.OkJson(w, types.PullResp{Version: p.CurrentVersion, Md5: p.CurrentMd5, Files: files})
	}
}

// ---------- push：CAS 快进 / 自动分叉 ----------

func Push(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		var req types.PushReq
		if err := httpx.ParseJsonBody(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		files, md5, total, err := normalizeFiles(req.Files)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}

		target, err := ctx.Store.GetProject(r.Context(), id)
		if err != nil {
			writeErr(w, mapErr(err), err)
			return
		}

		// 无变化：内容与当前版本指纹一致（且基线吻合）→ 不涨号
		if req.BaseVersion == target.CurrentVersion && md5 == target.CurrentMd5 {
			httpx.OkJson(w, types.PushResp{Status: "noop", Version: target.CurrentVersion, Md5: target.CurrentMd5})
			return
		}

		// 快进：基线吻合才允许
		ok, updated, err := ctx.Store.PushFastForward(r.Context(), id, req.BaseVersion, req.BaseMd5, req.Device, files, md5, len(files), total)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		if ok {
			_ = ctx.Store.AddVersion(r.Context(), model.VersionEntry{
				ProjectID: id, Version: updated.CurrentVersion, Md5: md5,
				FileCount: len(files), TotalBytes: total, Device: req.Device,
			})
			httpx.OkJson(w, types.PushResp{Status: "ok", Version: updated.CurrentVersion, Md5: md5})
			return
		}

		// 基线落后 → 自动分叉（绝不覆盖主线）
		fork, err := ctx.Store.CreateFork(r.Context(), target, req.BaseVersion,
			model.ForkName(target.Name, req.Device, now()), req.Device, files, md5, len(files), total)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		_ = ctx.Store.AddVersion(r.Context(), model.VersionEntry{
			ProjectID: fork.ID, Version: 1, Md5: md5,
			FileCount: len(files), TotalBytes: total, Device: req.Device,
		})
		fresh, _ := ctx.Store.GetProject(r.Context(), id)
		base := 0
		if fork.ForkBaseVersion != nil {
			base = *fork.ForkBaseVersion
		}
		httpx.OkJson(w, types.PushResp{
			Status: "forked",
			Fork: &types.ForkSummary{
				Id: fork.ID.Hex(), Name: fork.Name, Version: 1, ForkBaseVersion: base,
				SourceDevice: req.Device, UpdatedAt: fork.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			},
			Main: projectToSummaryPtr(fresh),
		})
	}
}

// ---------- resolve：分叉解决 ----------

func Resolve(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := pathID(r)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		var req types.ResolveReq
		if err := httpx.ParseJsonBody(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		forkId, err := primitiveFromHex(req.ForkId)
		if err != nil {
			writeErr(w, http.StatusBadRequest, errBadID)
			return
		}
		switch req.Action {
		case "promote":
			main, err := ctx.Store.PromoteFork(r.Context(), id, forkId)
			if err != nil {
				writeErr(w, mapErr(err), err)
				return
			}
			_ = ctx.Store.AddVersion(r.Context(), model.VersionEntry{
				ProjectID: id, Version: main.CurrentVersion, Md5: main.CurrentMd5,
				FileCount: main.FileCount, TotalBytes: main.TotalBytes, Device: "resolve:promote",
			})
			httpx.OkJson(w, types.ResolveResp{Version: main.CurrentVersion, Md5: main.CurrentMd5})
		case "discard":
			if err := ctx.Store.SoftDelete(r.Context(), forkId); err != nil {
				writeErr(w, mapErr(err), err)
				return
			}
			main, _ := ctx.Store.GetProject(r.Context(), id)
			if main != nil {
				httpx.OkJson(w, types.ResolveResp{Version: main.CurrentVersion, Md5: main.CurrentMd5})
			} else {
				httpx.OkJson(w, types.ResolveResp{})
			}
		default:
			writeErr(w, http.StatusBadRequest, errors.New("action 必须是 promote 或 discard"))
		}
	}
}

// ---------- devices ----------

func ReportDevice(ctx *svc.ServiceContext) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var req types.DeviceReq
		if err := httpx.ParseJsonBody(r, &req); err != nil {
			writeErr(w, http.StatusBadRequest, err)
			return
		}
		if req.DeviceKey == "" || len(req.DeviceKey) > 64 || req.Name == "" || len(req.Name) > 64 {
			writeErr(w, http.StatusBadRequest, errors.New("deviceKey/name 不合法"))
			return
		}
		if err := ctx.Store.UpsertDevice(r.Context(), svc.SingleUserID, req.DeviceKey, req.Name); err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		httpx.OkJson(w, map[string]bool{"ok": true})
	}
}

// ---------- 内部 ----------

// normalizeFiles：校验 + 去重 + 计算指纹与体积
func normalizeFiles(payload []types.FilePayload) ([]model.FileEntry, string, int64, error) {
	if len(payload) > sync.MaxFileCount {
		return nil, "", 0, sync.ErrTooManyFiles
	}
	seen := make(map[string]struct{}, len(payload))
	content := make(map[string]string, len(payload))
	var total int64
	for _, f := range payload {
		if !sync.ValidPath(f.Path) {
			return nil, "", 0, sync.ErrBadPath
		}
		if _, dup := seen[f.Path]; dup {
			return nil, "", 0, errors.New("文件路径重复：" + f.Path)
		}
		size := int64(len(f.Content))
		if size > sync.MaxFileBytes {
			return nil, "", 0, sync.ErrFileTooLarge
		}
		seen[f.Path] = struct{}{}
		content[f.Path] = f.Content
		total += size
	}
	if total > sync.MaxProjectBytes {
		return nil, "", 0, sync.ErrTooLarge
	}
	entries := make([]model.FileEntry, 0, len(payload))
	for _, f := range payload {
		entries = append(entries, model.FileEntry{
			Path: f.Path, Content: f.Content, Sha256: sync.Sha256(f.Content), Size: len(f.Content),
		})
	}
	return entries, sync.FingerPrint(content), total, nil
}
