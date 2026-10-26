# AI 写作器 · 云同步简版方案（V1）

> 分支：`feat/backend` · 状态：**方案稿（待确认后开工）** · 日期：2026-10-26
> 上一版"云端作为文件后端 + RemoteFSAdapter"的大方案降级为**远期参考**（见附录 B），本期不做。

---

## 0. 一句话方案

**本地照旧编辑，云端保存项目文本内容的镜像**。手动按「同步」把改动推上云（推一次且内容有变 = 版本号 +1）；每 10 分钟轮询服务器版本号，云端更新且本地干净时自动拉取；**云端更新且本地也有未同步修改时，锁定项目**，标记"落后于其他版本"，只允许手动选择：用云端覆盖本地 / 以本地为准推送为新版本。

## 1. 范围（本期做什么 / 不做什么）

| | 内容 |
|---|---|
| ✅ 同步 | 项目内**全部文本**：project.json、outline.md、chapters/、characters/、worldview/、notes/、worldbuilding/（例文 + imitate.json） |
| ❌ 不同步 | 二进制/多媒体（图片、PDF——本期若出现一律跳过）；总资料库；AI 聊天记录；界面偏好；浏览器内 Git 数据 |
| ❌ 不做 | 自动双向合并、历史版本快照、离线队列、WebDAV/OneDrive、注册登录界面（先用单用户令牌，表已预留） |

冲突策略：**不做合并，以最新提交为准**；无法判定谁最新（分叉）→ 锁定 + 手动二选一。

## 2. 版本与指纹（核心机制）

- **版本号 version**：每个项目在服务端一个自增整数。**只有"点了同步按钮且内容确实有变化"才 +1**；本地编辑不改变版本号，只让本地指纹变脏。
- **指纹 md5**：对项目全部文本文件的确定性摘要。算法：取所有文件按 `path` 字典序排序，拼接 `md5(path + "\0" + content + "\0")`，对拼接串再 md5，得 32 位指纹。文本 only，量小，客户端毫秒级可算。
- 服务端权威记录：`projects.current_version + current_md5`。同一版本号在服务端的指纹不变（不可变）；本地指纹与本地内容实时对应。

### 2.1 同步状态判定（每 10 分钟轮询 + 打开项目时）

| 服务端 | 本地 | 状态 | 动作 |
|---|---|---|---|
| v 相同，md5 相同 | — | ✅ 已同步 | 无 |
| v 更大，本地干净（本地 md5 == 所基于版本的 md5） | 无未同步修改 | 📥 落后 | **自动拉取**覆盖本地，版本对齐 |
| v 更大，本地脏（有未同步修改） | 有未同步修改 | 🔒 **锁定** | 标记"落后于其他版本"，禁编辑，弹横幅 + 手动二选一（§2.2） |
| v 相同，md5 不同（例：云 v4=1212121，本地 v4=9879987） | 本地脏 | ✏️ 待推送 | 正常态：本地有编辑还没同步，同步按钮可推送 |
| v 相同，md5 不同 且本地自认干净 | — | 🔒 异常锁定 | 本地数据与该版本权威指纹不符（如换机/误改文件），同样锁定走手动 |

> 用户示例中的「云 v4 md5 1212121 / 本地 v4 md5 9879987」即最后两行：本地有未同步编辑。若此时云端没动，就是待推送；若轮询发现云端已到 v5，即进入锁定。

### 2.2 锁定的手动二选一

锁定后项目**只读**（编辑器与各应用禁用写入），横幅常驻：

- **「用云端版本覆盖本地」**：拉取全量 → 写回本地文件夹 → 解锁，版本对齐
- **「以本地为准推送」**：本地内容作为新版本（v+1）推送 → 解锁，其他设备随后自动拉取

## 3. 多端使用流程

1. **桌面端首次上云**：打开本地项目 → 顶栏「同步到云端」→ 服务端建项目 → 首次推送（v1）
2. **手机端/其他设备**：首页「从云端打开」→ 列表选择 → 全量拉取到本地工作区（手机 = 内存/OPFS；桌面 = 选择本地文件夹落盘）→ 之后与桌面端等价：编辑、手动推送、10 分钟轮询
3. 绑定关系（cloudProjectId + baseVersion + baseMd5）存于项目目录 `project.json` 旁的 `.sync.json`（随项目走，不进版本内容）

## 4. 服务端设计（go-zero）

### 4.1 表（简版 4 张）

```sql
CREATE TABLE users (            -- 本期单用户令牌即可，表先建好
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  current_version INT NOT NULL DEFAULT 0,      -- 当前版本号（0=未推送过）
  current_md5 CHAR(32) NOT NULL DEFAULT '',    -- 当前版本权威指纹
  file_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_user (user_id, updated_at)
);

CREATE TABLE project_files (   -- 只存文本；本期无二进制列
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  path VARCHAR(512) NOT NULL,                 -- 'chapters/第一章.md'
  content MEDIUMTEXT NOT NULL,                -- utf8mb4
  sha256 CHAR(64) NOT NULL DEFAULT '',        -- 单文件校验/增量比对用
  size INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,                   -- 软删（同步删除语义）
  UNIQUE KEY uk_path (project_id, path)
);

CREATE TABLE project_versions ( -- 版本台账（只记指纹不存快照）
  project_id BIGINT UNSIGNED NOT NULL,
  version INT NOT NULL,
  md5 CHAR(32) NOT NULL,
  file_count INT NOT NULL,
  total_bytes BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, version)
);
```

### 4.2 API

鉴权：`Authorization: Bearer <token>`（本期单用户令牌走环境变量；注册登录接口按 users 表预留 M2）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/projects` | 云端项目列表（version/md5/文件数/更新时间） |
| POST | `/api/projects` | 创建 {name}（version=0，等首次推送） |
| DELETE | `/api/projects/:id` | 删除（软删） |
| GET | `/api/projects/:id/state` | **轮询用**：{version, md5, updatedAt}（轻量） |
| POST | `/api/projects/:id/pull` | 全量拉取：{version, md5, files:[{path, content}]} |
| POST | `/api/projects/:id/push` | 推送：{baseVersion, files:[{path, content, deleted?}]}；服务端校验 baseVersion == current_version，不符 → **409 {serverVersion, serverMd5}**（客户端转锁定）；成功 → version+1、重算 md5、返回 {version, md5} |

推送为**全量文本**（简版不做增量 diff；写作项目文本量级 MB 内，够用）。服务端 push 事务：upsert 全部文件 + 删除标记 + 写台账 + 更新 projects。

### 4.3 部署

- 单二进制 + MySQL；`etc/aiwrite-api.yaml` 配置端口/DB/Token
- docker-compose（app + mysql）一键起；CORS 白名单 5173/4173/自部署域名

## 5. 客户端设计

### 5.1 新增 `stores/sync.ts`（同步状态机）

```
状态：idle（未绑定）/ synced / dirty（本地有未同步修改）/ pulling / pushing / locked / offline
- 绑定：项目打开时读 .sync.json；无绑定则显示「同步到云端」入口
- 轮询：项目打开期间每 10 分钟（页面可见时才计，出错退避 ×2，上限 1h）；打开项目时立即一次
- 拉取：state.version > 本地 baseVersion 且本地干净 → 自动 pull → 全量写回本地 → baseVersion/md5 更新
- 推送：仅手动按钮；409 → locked
- 指纹：本地 md5 按需计算（轮询比对 / 推送前），沿用 §2 算法
```

### 5.2 UI 接入点

- **顶栏**：同步状态图标（✅已同步 v7 / ✏️待同步 / ⏳同步中 / 🔒已锁定 / ⚪未绑定）+「立即同步」按钮
- **锁定横幅**（WorkspaceView 顶部）："本项目在其他设备有新版本（v8），本地有未同步修改，已锁定编辑" + [用云端覆盖本地] [以本地为准推送]
- **首页**：「从云端打开」入口 → 云端项目列表
- `.sync.json`：`{ cloudProjectId, baseVersion, baseMd5 }`，同步引擎读写，不计入指纹

### 5.3 改动文件清单

`core/sync.ts`（指纹/打包/写回）、`stores/sync.ts`、`WorkspaceView`（状态图标+横幅）、`HomeView`（云端列表）、`services/api.ts`（fetch 封装）、设置页（服务端地址 + 令牌）。**编辑器/大纲/人物/仿写等业务层零改动。**

## 6. 边界与约束

- 轮询只拿 `state`（version+md5，几十字节），不拉内容；拉内容只在需要时一次全量
- 推送与拉取期间加进程锁防并发（同一时间仅一个同步动作）
- 文本上限：单文件 2MB、单项目 32MB（超限报错提示，本期不优化）
- 令牌存 localStorage（同 AI Key 待遇，不上云）
- 服务端时钟仅用于展示，先后判定只看版本号（避免时钟漂移）

## 7. 开发顺序（确认方案后）

1. **S1 服务端骨架**：go-zero 工程 + health + 单用户令牌中间件 + docker-compose
2. **S2 项目与同步 API**：projects CRUD + state/pull/push（含 409 语义）
3. **S3 客户端同步引擎**：sync store + 指纹 + 顶栏状态 + 手动推送 + 轮询自动拉取
4. **S4 锁定与多端**：锁定横幅 + 二选一 + 「从云端打开」+ 手机端验证
5. **S5 收尾**：typecheck/build、双端实测（桌面 Chrome + 手机）、文档与提交

## 8. 待确认（回复编号即可）

1. 锁定 = 项目**只读**（禁止一切写入）对吗？还是仅停止自动同步、仍可编辑？
2. 自动拉取仅限"本地干净"时执行——确认？本地脏时永不自动覆盖
3. 首期鉴权用**单用户令牌**（服务端配置文件里写死一个 token），注册登录放 S6 之后——OK？
4. 数据库用 MySQL（需本机/服务器跑个 MySQL，docker-compose 已含）——OK？

---

## 附录 A：与既有架构的关系

- 本地优先不动：本地模式一切照旧，同步是**加在本地之上的镜像层**，不替换 FSAdapter
- 浏览器内 Git（版本历史）继续服务本地；云端只有"最新版 + 台账"，不做历史快照
- 手机端（V4）从云端打开后以内存/OPFS 为工作区，同样走同步引擎

## 附录 B：远期（本期不做，留档）

- 增量同步（按 sha256 diff 只传变化文件）、二进制/资料库上云、历史版本快照与回滚
- 注册登录与多用户、WebDAV/OneDrive 资料库后端、离线编辑队列、分享只读链接
