-- AI 写作器 · 云同步服务表结构（方案 docs/backend-plan.md §5.1）
-- utf8mb4 防表情符号丢字；全部 InnoDB。
CREATE DATABASE IF NOT EXISTS aiwrite DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aiwrite;

-- 账号（首期单用户令牌，表先建好备 M2）
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1正常 0禁用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- 项目（主项目与分叉同表；分叉 parent_id 指向主项目）
CREATE TABLE IF NOT EXISTS projects (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL DEFAULT 1,
  parent_id        BIGINT UNSIGNED NULL COMMENT 'NULL=主项目；非空=分叉',
  fork_base_version INT           NULL COMMENT '分叉产生时的主线版本',
  source_device    VARCHAR(64)    NOT NULL DEFAULT '' COMMENT '创建/最后推送设备',
  name             VARCHAR(160)   NOT NULL,
  current_version  INT            NOT NULL DEFAULT 0,
  current_md5      CHAR(32)       NOT NULL DEFAULT '',
  file_count       INT            NOT NULL DEFAULT 0,
  total_bytes      BIGINT         NOT NULL DEFAULT 0,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME       NULL,
  KEY idx_user (user_id, updated_at),
  KEY idx_parent (parent_id)
) ENGINE = InnoDB;

-- 项目文件（纯文本；分叉拥有独立全量文件集）
CREATE TABLE IF NOT EXISTS project_files (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  path       VARCHAR(512)   NOT NULL COMMENT 'chapters/第一章.md；根为空串',
  content    MEDIUMTEXT     NOT NULL,
  sha256     CHAR(64)       NOT NULL DEFAULT '',
  size       INT            NOT NULL DEFAULT 0,
  updated_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME       NULL,
  UNIQUE KEY uk_path (project_id, path)
) ENGINE = InnoDB;

-- 版本台账（内容不可变凭证；同版本指纹不可变）
CREATE TABLE IF NOT EXISTS project_versions (
  project_id  BIGINT UNSIGNED NOT NULL,
  version     INT             NOT NULL,
  md5         CHAR(32)        NOT NULL,
  file_count  INT             NOT NULL,
  total_bytes BIGINT          NOT NULL,
  device      VARCHAR(64)     NOT NULL DEFAULT '',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, version)
) ENGINE = InnoDB;

-- 设备登记（分叉命名 / 台账展示用）
CREATE TABLE IF NOT EXISTS devices (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL DEFAULT 1,
  device_key   VARCHAR(64)     NOT NULL COMMENT '客户端生成的随机 id',
  name         VARCHAR(64)     NOT NULL,
  last_seen_at DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_key (user_id, device_key)
) ENGINE = InnoDB;
