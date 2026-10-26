# AI 写作器 · 后端开发方案（云同步 / 多端）

> 分支：`feat/backend` · 状态：**方案评审稿（未开发）** · 日期：2026-10-26
> 结论先行：**云端是"可选的第二种存储后端"，本地优先架构零改动**。云存储不影响本地化存储——二者通过既有 `FSAdapter` 抽象层隔离，客户端只新增一个 `RemoteFSAdapter`（远端文件适配器）和一个「从云端打开」入口。

---

## 1. 背景与目标

- 写作系统保持**本地优先**：项目 = 本地文件夹（File System Access），不联网也完整可用
- 云端只做一件事：**保存项目数据**，让同一份资料在手机/电脑/任意浏览器可继续用
- 账号体系：云端需要（多设备/换机），但实施可以后置（先单用户令牌跑通闭环）
- 资料库（总资料库）远期可接 WebDAV / OneDrive 等第三方同步，本期只留扩展位，不实现
- 技术栈：**go-zero**（Go），MySQL 存储（备选 SQLite，见 §8 决策点）

## 2. 现有数据全景（盘点"我们要存什么"）

### 2.1 项目内数据（一个项目 = 一个文件夹）

| 路径 | 内容 | 格式 |
|---|---|---|
| `project.json` | 项目元信息（name/createdAt/schema） | JSON |
| `outline.md` | 剧情大纲（树 = 标题层级） | Markdown |
| `chapters/*.md` | 正文文档 | Markdown |
| `characters/*.md` | 人物卡（姓名/角色/身份/标签 + 描述） | Markdown |
| `worldview/*.md` | 世界观卡（名称/类别/身份/标签 + 描述） | Markdown |
| `notes/*.md` | 随笔、AI 总结笔记、文风样例 | Markdown |
| `worldbuilding/例文原文.md` | 一键仿写的例文存档 | Markdown |
| `worldbuilding/imitate.json` | 仿写状态机（四步解析结果/骨架/进度） | JSON |
| `worldbuilding/*.json` | 结构化世界观（预留） | JSON |

### 2.2 用户级数据（跨项目，目前在浏览器里）

| 数据 | 当前位置 | 内容 |
|---|---|---|
| 总资料库 | 本地文件夹 `files/ + meta.json` | 资料文件（含 PDF/PNG 二进制）+ 标签组/标签/文件-标签映射 |
| AI 会话记录 | IndexedDB `chat` | 多轮会话（含 projectName 关联） |
| AI 供应商配置 | localStorage | Key/baseUrl/model（**只留本地，不上云**） |
| 界面偏好 | localStorage | 字号/行宽/主题/布局/最近项目/会话恢复 |
| 项目目录句柄 | IndexedDB `handles` | File System Access 授权句柄（浏览器特有，无云意义） |
| 浏览器内 Git | IndexedDB `gitfs` | isomorphic-git 对象库（本项目版本管理，云上用文件版本替代，见 §6.6） |

## 3. 存储模式设计：本地 or 云端，互不影响

### 3.1 原则

1. **一切读写走 FSAdapter**（现有纪律，`core/fs.ts`）：本地 = `WebFSAdapter`，演示 = `MemoryFSAdapter`，新增云端 = `RemoteFSAdapter`。三者在客户端代码里完全等价，业务层（项目/大纲/人物/仿写/资料库）零改动。
2. **数据格式完全同构**：云端存的就是同一个"文件夹"（同样的路径、同样的 md/json），随时可打包 zip 下载回本地、或从本地上传。本地 ⇄ 云端可无损往返迁移。
3. **打开方式即存储方式**：项目在「新建项目」时选择"保存到本地文件夹 / 保存到云端"；或从首页分别入口打开。不存在自动双向同步（那是 M6 的大项）。
4. 本地模式不引入任何云依赖、不要求登录；云服务宕机时本地功能 100% 可用。

### 3.2 云存储对本地的影响 = 0 的论证

| 维度 | 影响 |
|---|---|
| 现有本地流程 | 不改一行逻辑，`WebFSAdapter` 原样 |
| 离线可用性 | 本地模式天然离线；云端模式 V1 需在线（离线缓存是 M6） |
| 数据所有权 | 云端任意时刻可整包导出 zip = 本地文件夹结构 |
| 冲突风险 | V1 不做双写，不存在冲突面；同一云端项目多端同时编辑 = 文件级最后写入胜出 + 提示 |

### 3.3 客户端改造点清单（唯一动的地方）

- 新增 `core/remoteFS.ts`：`RemoteFSAdapter implements FSAdapter`（fetch + JWT，含 readBinary/writeBinary）
- `stores/project.ts`：新增 `openFromCloud(projectId)` / `createCloud(name)`（与 openWithHandle/create 并列）
- 首页/新建弹窗：增加"云端"入口与登录态展示（未登录时引导登录）
- `services/session.ts`：恢复会话时区分 local/cloud
- 其余（编辑器、大纲、人物、仿写、资料库、选中 AI）全部零改动——这就是 FSAdapter 抽象的回报

## 4. 总体架构

```
┌─ 浏览器（本地优先，不变） ────────────────────────┐
│  Vue3 应用                                          │
│   ├─ 本地模式: FSAdapter = WebFSAdapter(本地文件夹) │
│   ├─ 演示模式: MemoryFSAdapter                      │
│   └─ 云端模式: RemoteFSAdapter ──HTTPS/JWT──┐       │
└─────────────────────────────────────────────┼──────┘
                                              ▼
                    ┌─ go-zero API 服务 ──────────────┐
                    │  auth │ projects │ fs(文件读写) │
                    │  中间件: JWT / CORS / 日志       │
                    └───────────┬────────────────────-┘
                                ▼
                       MySQL（见 §5 表设计）
                                ▼
                 （远期）资料库 WebDAV / OneDrive 后端
```

go-zero 工程结构（goctl 生成 + 手写 logic）：

```
server/
├── api/aiwrite.api            # 接口 DSL（goctl 生成 handler/types）
├── etc/aiwrite-api.yaml       # 配置（端口/DB/JWT 密钥）
├── internal/
│   ├── config/  handler/  logic/  middleware/  svc/  types/
├── model/                     # goctl model（表访问）
└── main.go
```

## 5. 数据库表设计

### 5.1 设计取向：一切皆文件 + 最小表集

云端复用本地的"项目=文件夹"心智模型：**文件内容全部进 `project_files`（文本列 + 二进制列）**，目录结构用 path 表达。资料库与聊天会话**默认也走文件表**（见 §5.3），因此核心只有 4 张表。

> 备选方案 B（资料库/聊天拆成规范化的标签表、会话表）见 §5.4——除非未来要做服务端标签检索/全文搜索，否则 A 更省、客户端改动最小。

### 5.2 核心表（DDL 草案）

```sql
-- 账号（本期可先单用户令牌，表先建好）
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt
  display_name  VARCHAR(64)  NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1, -- 1正常 0禁用
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 项目（= 云端的一个"文件夹"）
CREATE TABLE projects (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(128) NOT NULL,
  description   VARCHAR(512) NOT NULL DEFAULT '',
  schema_version INT NOT NULL DEFAULT 1,
  file_count    INT NOT NULL DEFAULT 0,          -- 冗余，列表页展示
  total_bytes   BIGINT NOT NULL DEFAULT 0,       -- 冗余
  last_opened_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,                   -- 软删（回收站）
  KEY idx_user (user_id, updated_at)
);

-- 项目文件（FSAdapter 语义 1:1；文本/二进制同表分列）
CREATE TABLE project_files (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id    BIGINT UNSIGNED NOT NULL,
  path          VARCHAR(512) NOT NULL,           -- 'chapters/第一章.md'，根为 ''
  is_dir        TINYINT NOT NULL DEFAULT 0,
  kind          TINYINT NOT NULL DEFAULT 0,      -- 0文本 1二进制
  content_text  MEDIUMTEXT NULL,                 -- utf8mb4
  content_blob  LONGBLOB NULL,                   -- PDF/PNG 等
  size          BIGINT NOT NULL DEFAULT 0,
  sha256        CHAR(64) NOT NULL DEFAULT '',    -- 客户端带 etag 写回可做乐观校验
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  UNIQUE KEY uk_path (project_id, path),
  KEY idx_proj (project_id, updated_at)
);

-- 登录态（JWT 无状态；此表只为"登出全部设备/换密码"，可后置）
CREATE TABLE refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id)
);
```

### 5.3 用户级数据在云端的位置（方案 A）

| 数据 | 云端形态 | 说明 |
|---|---|---|
| 总资料库 | 虚拟项目（`projects.kind='library'` 或保留 id 约定）下的 `files/**` + `meta.json` | 客户端 library store 走同一套 fs API，标签结构原样存 meta.json |
| AI 会话记录 | 同上虚拟项目 `chats/*.json`（可选，M5） | 一个会话一个文件，含 projectName |
| 界面偏好 | `user_settings(user_id, k, v JSON)`（可选，M5） | 远期表，本期不建 |

### 5.4 备选方案 B（记录，暂不采用）

`library_files / library_tag_groups / library_tags / library_file_tags / chat_sessions / chat_messages` 规范化六表。优点：服务端可查标签/检索会话；缺点：客户端两套逻辑、迁移复杂。触发条件：未来要做服务端搜索或资料库多人共享时再迁。

## 6. API 设计（与 FSAdapter 一一对应）

Base：`/api`，鉴权：`Authorization: Bearer <JWT>`

### 6.1 账号

| Method | Path | 说明 |
|---|---|---|
| POST | `/auth/register` | {username, password} 注册 |
| POST | `/auth/login` | → {accessToken, expiresIn} |
| POST | `/auth/logout-all` | 吊销全部 refresh token（登出所有设备） |
| GET | `/me` | 当前用户信息 |

### 6.2 项目

| Method | Path | 说明 |
|---|---|---|
| GET | `/projects` | 列表（name/统计/updated_at，支持搜索） |
| POST | `/projects` | 创建 {name}（服务端生成 project.json/outline.md 初始结构，与本地 create() 一致） |
| PATCH | `/projects/:id` | 改名/描述 |
| DELETE | `/projects/:id` | 软删 |
| GET | `/projects/:id/archive` | 导出 zip（= 本地文件夹结构，可导入回本地） |

### 6.3 文件（FSAdapter 1:1，项目与资料库共用）

| Method | Path | 对应 FSAdapter |
|---|---|---|
| GET | `/projects/:id/fs/list?path=` | listDir |
| HEAD | `/projects/:id/fs/file?path=` | exists |
| GET | `/projects/:id/fs/file?path=` | readFile（text；`?binary=1` → readBinary） |
| PUT | `/projects/:id/fs/file?path=` | writeFile / writeBinary（body 为内容；`If-Match: sha256` 可选乐观锁） |
| POST | `/projects/:id/fs/dir` {path} | createDir |
| DELETE | `/projects/:id/fs/file?path=` | delete（递归） |
| POST | `/projects/:id/fs/move` {from,to} | rename |
| POST | `/projects/:id/fs/upload?path=` | 二进制上传（multipart，导入 PDF 用） |

约束：路径校验（禁 `..`/绝对路径，防穿越）；单文件 ≤ 50MB（资料库 PDF）；请求体上限 64MB。

### 6.4 安全与运维

- CORS 白名单：localhost:5173/4173 及自部署域名
- 速率限制（go-zero 内置中间件）：auth 接口防爆破
- 日志：go-zero 自带；文件写操作留审计行（who/when/path）
- 备份：mysqldump 定时 + `project_files` 每日快照表（或 M6 的 file_versions）

## 7. 功能清单与分期

| 期 | 内容 | 交付物 |
|---|---|---|
| **M0** | 方案评审（本文档） | 定稿 |
| **M1** | go-zero 骨架 | 工程 + /healthz + 配置 + docker-compose（app+mysql）+ CI |
| **M2** | 账号 | 注册/登录/JWT/登出全部（或先单用户令牌，见 §8-2） |
| **M3** | **核心闭环** | 项目 CRUD + 文件 API + 客户端 RemoteFSAdapter + 「云端新建/打开」+ 自动保存走通 |
| **M4** | 资料库上云 + zip 导出/导入 | 虚拟项目挂 library；本地⇄云端迁移闭环 |
| **M5** | 可选增强 | 聊天会话上云、偏好同步 |
| **M6** | 双向同步（大项） | 本地缓存离线编辑 + 变更上传（LWW/冲突副本 `xxx.conflict.md`）+ file_versions 历史 |
| **M7** | 远期 | 资料库 WebDAV/OneDrive 后端（FSAdapter 服务端版）、分享只读链接 |

浏览器内 Git（isomorphic-git）继续服务本地模式；云端模式的历史版本由 M6 的 file_versions 承接，两套不打通。

## 8. 决策点（需要你拍板）

1. **数据库**：MySQL 8（推荐：go-zero 生态原生、账号/扩展稳）还是 SQLite（单文件部署更轻，但 go-zero 需要第三方支持）？
2. **M2 账号做到什么程度**：a) 完整注册登录（推荐，表已设计）；b) 先环境变量单用户令牌跑通 M3，注册后补？
3. **聊天会话是否上云**（M5 做不做）？
4. **部署目标**：本机 / 家里 NAS / 云服务器？影响 HTTPS 与域名方案（手机端要 HTTPS 才有部分能力）。

## 9. 风险记录

- 手机端 File System Access 不可用 → 云端模式恰好是移动端的**主存储方案**（与 V4 手机版天然互补）
- 大文件（PDF）进 LONGBLOB 便于打包备份；若未来量大再外置对象存储（接口不变，仅实现替换）
- 文本用 utf8mb4 防 emoji 丢字
- 多端同编辑 V1 无锁：按文件最后写入胜出，UI 提示"他端有更新"（etag 不匹配时）
