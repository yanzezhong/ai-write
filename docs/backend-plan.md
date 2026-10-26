# AI 写作器 · 多端同步方案 V1.1（自动分叉模型）

> 分支：`feat/backend` · 状态：**方案稿** · 日期：2026-10-26 · 替代 V1.0（锁定+二选一方案作废）
> 一句话：**服务端统一发版本号，推送带基线校验；检测到并发修改不覆盖、不锁定，自动把后到的一方生成为「分叉项目」挂在原项目下面，由用户择一保留（采用为新版本 / 删除）**。

---

## 1. 范围（不变）

- 同步：项目内**全部文本**（project.json / outline / chapters / characters / worldview / notes / worldbuilding）
- 不同步：二进制、总资料库、聊天记录、偏好、浏览器 Git
- 不做：自动合并、逐文件挑选（远期）、历史快照
- 鉴权：首期单用户令牌；账号系统表预留

## 2. 版本模型（先回答"什么算分叉"）

### 2.1 三个关键量

| 量 | 归属 | 含义 |
|---|---|---|
| `version` + `md5` | 服务端 | 每次成功推送（内容有变化）版本 +1；**同一版本的内容不可变**（服务端统一发号，杜绝两个"v4"） |
| `baseVersion` / `baseMd5` | 客户端 | 我上次与云端对齐时的版本指纹（拉取或推送成功后更新） |
| `localHash` | 客户端 | 本地当前内容的指纹（编辑即变，随时可算） |

> **为什么你的例子（云 v4/1212121 vs 本地 v4/9879987）在旧方案里危险**：旧表把它判成"本地有编辑待推送"，若此时云端其实也动过，一次推送就把云端内容静默盖掉。新模型里这种"两个 v4"不可能由服务端产生（发号统一），但等价的并发场景一定会发生——两台设备都基于 v3 各自修改、先后推送。**识别规则从"版本号比对"改为"推送时的基线校验（CAS）"**，见 §3。

### 2.2 分叉的定义

**分叉 = 多个设备基于同一个旧版本，各自产生了新修改。** 判定只发生在推送时刻：

```
push {baseVersion, baseMd5, files} 到服务端：
├─ baseVersion == 服务端 current_version（且指纹吻合）
│    → 快进：写入内容，version+1。两台设备永远只有一台走到这里（先到者）
└─ baseVersion < 服务端 current_version（说明自己是"后到的并发方"）
     → 自动分叉：推送内容另立为「分叉项目」，挂在原项目下，绝不覆盖主线
```

## 3. 同步判定表（重写）

轮询（10 分钟）拉 `state = {version, md5, updatedAt}`，与本地比对：

| 云端 vs 本地 base | 本地 localHash | 含义 | 动作 |
|---|---|---|---|
| 相同版本、指纹一致 | == base 指纹 | ✅ 完全同步 | 无 |
| 相同版本 | ≠ base 指纹（有编辑） | ✏️ 本地领先 | 无自动动作；**推送按钮可用**（推上即成 v+1） |
| 云端版本更大 | == base 指纹（本地干净） | 📥 云端领先 | **自动拉取**全量覆盖本地，base 对齐 |
| 云端版本更大 | ≠ base 指纹（本地也改过） | ⎇ **分叉前兆** | 不自动做任何事；横幅提示"云端已有 v7，你的修改与之分叉，同步后将生成分叉项目"；**用户按同步 → 自动分叉** |
| 云端版本相同但指纹 ≠ base 指纹 | — | 🧪 异常（换机拷贝/外部改文件/数据恢复） | 同样走推送 → 服务端按分叉处理（保守，绝不覆盖） |

**原则：本地有未同步修改时，永远不被自动覆盖；云端已前进时，后到的推送自动降级为分叉。零静默覆盖、零数据丢失。**

## 4. 分叉机制

### 4.1 形态：分叉 = 原项目下的子项目

```
项目列表                          云端数据结构
星海纪元  v7  ⎇2                 projects 表
├─ 星海纪元 · 分叉 10-26 15:32（MacBook）     ← parent_id = 主项目
└─ 星海纪元 · 分叉 10-26 18:04（iPhone）
```

- 分叉是**完整独立的项目**（自己的 files / versions / 绑定），`parent_id` 指向主项目，`fork_base_version` 记录分叉点
- 命名：`{项目名} · 分叉 {MM-dd HH:mm}（{设备名}）`；设备名取自客户端设置（默认 UA 简写，可在设置里改）
- 生成分叉后，**发起推送的设备自动跟随分叉继续工作**（.sync.json 绑定切到分叉 id），可继续编辑推送分叉；横幅常驻提醒"当前工作在分叉上，请择一解决"

### 4.2 分叉解决（用户择一）

在项目列表的分叉区 / 项目内「分叉管理」：

| 操作 | 效果 |
|---|---|
| **采用此分叉为新版本** | 分叉全部内容整体推送为主项目 v+1（全量覆盖语义，版本照常自增，其他设备随后自动拉取）；该分叉删除 |
| **删除此分叉** | 丢弃（软删，可进回收站暂存） |

多分叉逐个处理，处理完 ⎇ 角标消失。不做逐文件合并/挑选（远期可加"从分叉挑文件"）。

## 5. 服务端设计（go-zero）

### 5.1 表（5 张）

```sql
CREATE TABLE users (            -- 首期单用户令牌，表先建好
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE projects (         -- 主项目与分叉同表
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,            -- NULL=主项目；指向主项目=分叉
  fork_base_version INT NULL,                -- 分叉产生时的主线版本
  source_device VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(160) NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  current_md5 CHAR(32) NOT NULL DEFAULT '',
  file_count INT NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_user (user_id, updated_at),
  KEY idx_parent (parent_id)
);

CREATE TABLE project_files (   -- 纯文本
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  path VARCHAR(512) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  sha256 CHAR(64) NOT NULL DEFAULT '',
  size INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uk_path (project_id, path)
);

CREATE TABLE project_versions ( -- 版本台账（内容不可变凭证）
  project_id BIGINT UNSIGNED NOT NULL,
  version INT NOT NULL,
  md5 CHAR(32) NOT NULL,
  file_count INT NOT NULL,
  total_bytes BIGINT NOT NULL,
  device VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, version)
);

CREATE TABLE devices (          -- 设备名登记（分叉命名/台账展示用）
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  device_key VARCHAR(64) NOT NULL,           -- 客户端生成的随机 id
  name VARCHAR(64) NOT NULL,
  last_seen_at DATETIME NULL,
  UNIQUE KEY uk_user_key (user_id, device_key)
);
```

### 5.2 API

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/projects` | 列表（主项目 + 各自 forks 概要：id/name/version/updatedAt） |
| POST | `/api/projects` | 创建 {name, device}（v0 待首推） |
| DELETE | `/api/projects/:id` | 软删（分叉可直接删） |
| GET | `/api/projects/:id/state` | 轮询：{version, md5, updatedAt, forks:N} |
| POST | `/api/projects/:id/pull` | 全量文本 {version, md5, files} |
| POST | `/api/projects/:id/push` | {baseVersion, baseMd5, device, files:[{path,content,deleted?}]}<br>基线吻合 → 快进 `{version, md5}`；内容无变化 → 原样返回不涨号；**基线落后 → 自动建分叉** `{forked:true, fork:{id,name,version}}`（分叉内容=本次推送，v1 起算） |
| POST | `/api/projects/:id/resolve` | {forkId, action:'promote'} 分叉内容整体成为主项目 v+1，分叉删除；{action:'discard'} 仅删分叉 |
| POST | `/api/devices` | 上报/改名设备 |

push 事务：校验基线 → upsert files（或建分叉及其 files）→ 写台账 → 更新 projects。内容一致性以服务端重算 md5 为准。

### 5.3 部署

单二进制 + MySQL（docker-compose 含 app+db）；CORS 白名单；限流防爆破。

## 6. 客户端设计

### 6.1 `stores/sync.ts` 状态机

```
idle(未绑定) / synced / dirty(本地领先) / diverged(分叉前兆：云进+本地脏) /
pulling / pushing / forked(正工作在分叉上) / offline
- 绑定：.sync.json { cloudProjectId, baseVersion, baseMd5, deviceKey }（项目目录内，不参与指纹）
- 轮询：项目打开期间每 10 分钟（页面可见；出错退避）；打开项目立即一次
- 自动拉取：仅 synced 状态且云端版本更大
- 推送：手动按钮；diverged 推送 → 收到 {forked} → 绑定切分叉 + toast + 横幅
- 指纹：与服务端同算法（路径字典序拼接内容二次 md5），毫秒级
```

### 6.2 UI 接入点

- **顶栏**：状态图标（✅v7 / ✏️待同步 / ⎇已分叉 / ⏳同步中 / ⚪未绑定）+「立即同步」+ 分叉角标
- **分叉横幅**：「云端已有 v7，你的修改与之分叉；同步后将生成分叉项目」/「你正在分叉上工作，请到分叉管理择一解决」
- **首页**：云端项目列表（分组显示主项目与其分叉）、「同步到云端」绑定入口
- **分叉管理**（项目列表内联即可）：每分叉 [采用为新版本] [删除]
- **设置**：服务端地址、令牌、设备名

### 6.3 改动清单

`core/sync.ts`（指纹/打包/写回）、`stores/sync.ts`、`services/api.ts`、`WorkspaceView`（状态+横幅）、`HomeView`（云端列表+分叉管理+绑定）。业务层（编辑器/大纲/人物/仿写）零改动。

## 7. 边界与约束

- 轮询只取 state（几十字节）；内容全量拉/推（文本 MB 级，够用；增量 diff 远期）
- 同一时刻仅允许一个同步动作（进程内互斥）
- 单文件 ≤ 2MB、单项目 ≤ 32MB 文本
- 推送中云端再前进：CAS 天然兜底（基线落后→分叉），无竞态窗口
- 分叉数量不设上限，但 UI 提醒尽快解决；分叉也是完整项目，可直接打开查看内容再决定

## 8. 开发顺序

1. **S1** go-zero 骨架：health + 单用户令牌中间件 + docker-compose + 表初始化
2. **S2** 项目 CRUD + state/pull/push（含 CAS 与自动分叉）
3. **S3** 客户端同步引擎：绑定、轮询、自动拉取、手动推送、分叉跟随
4. **S4** 分叉解决 UI（采用/删除）+ 首页云端列表 + 多端实测（桌面 Chrome + 手机）
5. **S5** 收尾：异常路径（离线/超限/异常指纹）、typecheck/build、文档、提交

## 9. 待确认（回复编号即可）

1. **分叉后设备自动跟随分叉继续编辑**（而不是切回主线只读）——OK？ok
2. 「采用此分叉为新版本」= 分叉内容**整体覆盖**主项目当前版本（不做逐文件挑选，挑选放远期）——OK？ok
3. 首期**单用户令牌**（配置文件写死），注册登录后置——OK？ok
4. 数据库 MySQL（docker-compose 自带）——OK？sqlite 。
我们先模拟验证一下云端方案，跑通后再更换。
