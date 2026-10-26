# ai-write server（云同步服务）

技术栈：**go-zero** + MySQL。方案文档：仓库 `docs/backend-plan.md`（V1.1 自动分叉模型）。

## 本地开发

```bash
cd server
go mod tidy
go run . -f etc/aiwrite-api.yaml     # 默认 :8787，配置在 etc/aiwrite-api.yaml
```

健康检查（免鉴权）：

```bash
curl http://localhost:8787/api/health
```

令牌探针（S1 鉴权验证；令牌在 etc/aiwrite-api.yaml 的 Token）：

```bash
curl -H "Authorization: Bearer aiwrite-dev-token" http://localhost:8787/api/me
```

## Docker 一键起（app + MySQL，S2 起需要）

```bash
docker compose up -d --build     # MySQL 自动执行 sql/schema.sql 建表
```

## 结构

```
main.go                     入口（rest server + 全局中间件）
etc/aiwrite-api.yaml        配置（端口/令牌/CORS/DSN）
api/aiwrite.api             接口 DSL（路由的权威描述，S2 起与代码同步维护）
internal/
  config/ svc/ handler/ logic/ types/ middleware/
sql/schema.sql              建表（5 张：users/projects/project_files/project_versions/devices）
```

## 路线（见方案 §8）

- S1 ✅ 骨架 + 单用户令牌 + health/me + CORS + docker-compose
- S2 ✅ 项目 CRUD + state/pull/push（CAS 基线校验 + 自动分叉）
- S3 客户端同步引擎（front-end：sync store / 轮询 / 自动拉取 / 手动推送）
- S4 分叉解决 UI + 首页云端列表 + 多端实测
- S5 异常路径与收尾
