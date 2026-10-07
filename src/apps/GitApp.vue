<template>
  <div class="git-app">
    <!-- 未初始化 -->
    <div v-if="!inited" class="empty-state">
      <AppIcon name="history" :size="32" class="empty-icon" />
      <p class="empty-title">还没有版本仓库</p>
      <p class="empty-desc">
        初始化后可以为项目创建提交、查看历史、随时回滚到任意版本。
        版本数据保存在浏览器 IndexedDB，项目文件夹内不会出现 .git 目录。
      </p>
      <button class="btn primary" :disabled="busy" @click="init">
        {{ busy ? '初始化中…' : '初始化 Git 仓库' }}
      </button>
      <p v-if="error" class="err">⚠ {{ error }}</p>
    </div>

    <template v-else>
      <!-- 提交区 -->
      <section class="section">
        <div class="sec-head">
          <span class="branch"><AppIcon name="outline" :size="13" /> {{ branch }}</span>
          <button class="icon-btn" title="刷新状态" :disabled="busy" @click="refresh">
            <AppIcon name="refresh" :size="15" />
          </button>
        </div>

        <div v-if="statusList.length" class="status-list">
          <div v-for="s in statusList" :key="s.path" class="status-row">
            <span class="status-tag" :class="tagClass(s.status)">{{ s.status }}</span>
            <span class="status-path" :title="s.path">{{ s.path }}</span>
          </div>
        </div>
        <p v-else class="clean">工作区干净，没有未提交的更改</p>

        <div class="author-row">
          <input v-model="authorName" class="input" placeholder="作者名" @change="saveAuthor" />
        </div>
        <textarea
          v-model="message"
          class="input msg"
          rows="2"
          placeholder="提交说明，如：第二章初稿"
          :disabled="busy || !statusList.length"
        ></textarea>
        <button
          class="btn primary commit-btn"
          :disabled="busy || !statusList.length || !message.trim()"
          @click="commit"
        >
          {{ busy ? '提交中…' : `提交全部更改（${statusList.length}）` }}
        </button>
        <p v-if="error" class="err">⚠ {{ error }}</p>
      </section>

      <!-- 历史区 -->
      <section class="section">
        <div class="sec-head"><span class="sec-title">历史记录</span></div>
        <p v-if="!history.length" class="clean">还没有提交</p>
        <div v-for="(c, i) in history" :key="c.oid" class="commit-row">
          <div class="commit-dot" :class="{ head: i === 0 }"></div>
          <div class="commit-main">
            <div class="commit-msg" :title="c.message">{{ c.message }}</div>
            <div class="commit-meta">
              {{ c.author }} · {{ timeAgo(c.date) }} · {{ c.oid.slice(0, 7) }}
            </div>
          </div>
          <button
            v-if="i !== 0"
            class="restore-btn"
            :disabled="busy"
            :title="`把工作区恢复到该版本（会覆盖未提交的修改）`"
            @click="restore(c)"
          >
            恢复
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import {
  gitBranch,
  gitCommitAll,
  gitInit,
  gitLog,
  gitRestore,
  gitStatus,
  isGitRepo,
  type GitCommitEntry,
  type GitStatusEntry,
} from '../core/git'
import { lsGet, lsSet, timeAgo } from '../core/storage'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'
import { openDocInEditor } from '../services/docService'

const project = useProjectStore()
const editor = useEditorStore()

const inited = ref(false)
const busy = ref(false)
const error = ref('')
const branch = ref('main')
const statusList = ref<GitStatusEntry[]>([])
const history = ref<GitCommitEntry[]>([])
const message = ref('')
const authorName = ref(lsGet<string>('gitAuthor', '本地写作者'))

onMounted(async () => {
  await refreshAll()
})

async function refreshAll() {
  busy.value = true
  error.value = ''
  try {
    inited.value = await isGitRepo()
    if (inited.value) {
      branch.value = await gitBranch()
      statusList.value = await gitStatus()
      history.value = await gitLog()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function refresh() {
  void refreshAll()
}

function saveAuthor() {
  const name = authorName.value.trim()
  if (name) lsSet('gitAuthor', name)
}

async function init() {
  busy.value = true
  error.value = ''
  try {
    await gitInit()
    await refreshAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function commit() {
  busy.value = true
  error.value = ''
  try {
    const name = authorName.value.trim() || '本地写作者'
    lsSet('gitAuthor', name)
    await gitCommitAll(message.value.trim(), { name, email: `${name}@local.writer` })
    message.value = ''
    await refreshAll()
    await project.refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function restore(c: GitCommitEntry) {
  if (!window.confirm(`把工作区恢复到「${c.message || c.oid.slice(0, 7)}」？\n当前未提交的修改会被覆盖。`)) return
  busy.value = true
  error.value = ''
  try {
    await gitRestore(c.oid)
    await refreshAll()
    await project.refresh()
    // 当前打开的文档内容可能已变化，重新载入
    if (editor.doc) await openDocInEditor(editor.doc.path)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function tagClass(status: string) {
  return status === '新增' ? 'tag-add' : status === '删除' ? 'tag-del' : 'tag-mod'
}
</script>

<style scoped>
.git-app {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-state {
  margin-top: 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
}
.empty-icon {
  color: var(--text-3);
}
.empty-title {
  font-weight: 600;
}
.empty-desc {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.7;
}

.section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sec-title {
  font-size: 13px;
  font-weight: 600;
}
.branch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 600;
}

.status-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 3px 4px;
  border-radius: 6px;
}
.status-row:hover {
  background: var(--panel-2);
}
.status-tag {
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
}
.tag-add {
  background: var(--accent-soft);
  color: var(--accent);
}
.tag-mod {
  background: var(--purple-soft);
  color: var(--purple);
}
.tag-del {
  background: var(--bg-deep);
  color: var(--text-3);
}
.status-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}
.clean {
  font-size: 12.5px;
  color: var(--text-3);
  padding: 4px 0;
}

.author-row .input {
  padding: 6px 10px;
  font-size: 12.5px;
}
.msg {
  resize: vertical;
  font-size: 13px;
  line-height: 1.6;
}
.commit-btn {
  align-self: stretch;
}
.err {
  color: var(--accent);
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-all;
}

.commit-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 2px;
  border-top: 1px dashed var(--border);
}
.commit-row:first-of-type {
  border-top: none;
}
.commit-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
  margin-top: 5px;
}
.commit-dot.head {
  background: var(--accent);
}
.commit-main {
  flex: 1;
  min-width: 0;
}
.commit-msg {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 2px;
}
.restore-btn {
  flex: none;
  font-size: 12px;
  color: var(--text-2);
  padding: 3px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  transition: all 0.12s;
}
.restore-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.restore-btn:disabled {
  opacity: 0.5;
}
</style>
