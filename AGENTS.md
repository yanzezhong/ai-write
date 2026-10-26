# Agent 交接笔记

## 仓库状态

- 分支：`feat/backend`
- 最新提交：`9864d15 docs: 更新 AGENTS.md 提交号与进度`
- 工作目录：`/Users/gongzuozhanghu/Desktop/code/agent-write/front-end`
- dev server：`npm run dev` 已在 `http://localhost:5173/` 运行
- 构建：`npm run build` 通过（仅 chunk 体积警告）

## V3「一键仿写」进度

已完成并写入当前工作树：

- `src/ai/imitatePrompts.ts`：全部 Prompt + JSON 提取工具。
- `src/stores/imitate.ts`：状态机、持久化、锁定/批量/生成逻辑。
- `src/services/imitateSetup.ts`：从例文创建项目（演示/真实/手机端）并启动解析。
- `src/views/ImitateView.vue` / `MobileImitateView.vue`：解析、生成、完成页。
- `src/components/imitate/SkeletonStage.vue` / `SegmentStage.vue`：骨架编辑与逐段生成。
- `src/components/mobile/imitate/MobileSkeletonStage.vue` / `MobileSegmentStage.vue`：移动端对应页面。
- `src/components/PickExampleDialog.vue`：例文选择弹窗。
- `src/views/HomeView.vue`：首页「一键仿写」入口。
- `src/views/WorkspaceView.vue`：顶栏「继续仿写」入口。

## 本次修复

- 补齐 `SkeletonStage` 与 `MobileSkeletonStage` 中场景编辑的 `dirty` 标记，使「✨ AI 优化」符合「只有用户手动改动后才可用」的规则。

## 已知问题

- 浏览器访问本地 dev server 时偶发拒绝连接（已记录为 bug，暂不修复）。
- 演示模式下取消仿写只关闭项目，不会删除真实文件夹（符合当前 demo 逻辑）。
- 一次性/逐段生成需要用户在「设置」配置 API Key，否则会在 UI 中提示「请先在设置中配置 API Key」。

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 生产构建
```

## 后端（云同步）进度

- S1 ✅ go-zero 骨架 + 单用户令牌 + CORS + docker-compose
- S2 ✅ 项目 CRUD + state/pull/push（CAS 基线校验 + 自动分叉）+ 设备上报
  - 关键文件：`server/internal/logic/*.go`、`server/internal/model/*.go`、`server/internal/sync/fingerprint.go`
  - 已实测：创建 → push v1 → state/pull → 并发 push 触发自动分叉 → promote 分叉为主线 v3
  - 运行：`cd server && go run . -f etc/aiwrite-api.yaml`（默认连接本地 MongoDB `:27017`）
  - Docker 部署：`cd server && docker compose up -d --build`

## 常用命令

```bash
# 前端
npm run dev      # 启动开发服务器
npm run build    # 类型检查 + 生产构建

# 后端
cd server && go run . -f etc/aiwrite-api.yaml
cd server && docker compose up -d --build
```

## 下一步建议

1. 在浏览器实测「粘贴例文 → 解析四步 → 骨架编辑 → 生成文章」完整链路。
2. 前端接入后端同步引擎（`stores/sync.ts` / `services/api.ts` / `WorkspaceView` 状态横幅）。
3. 处理已记录的浏览器拒绝访问 bug。
