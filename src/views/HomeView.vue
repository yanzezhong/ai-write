<template>
  <div class="home">
    <header class="topbar">
      <div class="brand">
        <AppIcon name="logo" :size="24" class="brand-logo" />
        <span class="brand-name">AI 写作器</span>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" title="帮助" @click="showHelp">
          <AppIcon name="help" :size="18" />
        </button>
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">
          <AppIcon name="settings" :size="18" />
        </button>
      </div>
    </header>

    <main class="main">
      <section class="hero">
        <h1 class="title">落笔之前，<br />万事俱备。</h1>
        <p class="subtitle">以项目为单位的个人 AI 写作器。项目即本地文件夹，打开即授权，数据不出你的电脑。</p>
        <div class="actions">
          <button class="btn imitate-btn" @click="showPick = true">
            <AppIcon name="sparkles" :size="16" />
            ✨ 一键仿写
          </button>
          <button class="btn primary" @click="showDialog = true">
            <AppIcon name="plus" :size="16" />
            新建项目
          </button>
          <button class="btn" :disabled="opening" @click="openFlow()">
            <AppIcon name="folder" :size="16" />
            打开本地项目
          </button>
          <button class="btn" title="跨项目的素材与归档资料" @click="router.push({ name: 'library' })">
            <AppIcon name="layers" :size="16" />
            资料库
          </button>
          <button class="btn" title="打开云端项目 / 管理分叉" @click="showCloud = true">
            <AppIcon name="globe" :size="16" />
            云端项目
          </button>
        </div>
        <p class="imitate-hint">粘贴一篇喜欢的文章，AI 四步拆解世界观 / 人物 / 文风 / 大纲，再一键生成你的仿写文。</p>
        <p class="hint">
          <AppIcon name="lock" :size="13" />
          仅支持 Chrome / Edge · 通过 File System Access API 授权本地文件夹
        </p>
        <p class="demo-row">
          文件夹选择打不开？<button class="demo-link" @click="startDemo">试试演示模式（内存数据，不写磁盘）</button>
        </p>
      </section>

      <section class="recent">
        <p class="recent-head">共 {{ recentProjects.length }} 个项目 · 按最近打开排序</p>
        <div v-if="recentProjects.length" class="recent-list">
          <button v-for="p in recentProjects" :key="p.id" class="card recent-card" @click="openFlow(p)">
            <span class="recent-name">{{ p.name }}</span>
            <span class="recent-meta">
              <template v-if="p.docCount != null || p.wordCount != null">
                {{ p.docCount ?? 0 }} 章<template v-if="p.wordCount != null"> · {{ formatWords(p.wordCount) }}</template>
              </template>
              <span v-if="bindingOf(p)" class="sync-badge" :class="bindingOf(p)?.status">
                <AppIcon :name="bindingOf(p)?.status === 'synced' ? 'check' : 'cloud'" :size="11" />
                v{{ bindingOf(p)?.version }}
              </span>
            </span>
            <span class="recent-time">{{ timeAgo(p.openedAt) }}</span>
            <span v-if="!bindingOf(p)" class="bind-hit" @click.stop="bindAndOpen(p)">绑定到云端</span>
          </button>
        </div>
        <div v-else class="recent-empty card">
          <AppIcon name="doc" :size="22" />
          <p>还没有项目，从「新建项目」开始吧</p>
        </div>
      </section>
    </main>

    <NewProjectDialog v-if="showDialog" @close="showDialog = false" />
    <PickExampleDialog v-if="showPick" @close="showPick = false" />
    <CloudProjectsDialog v-if="showCloud" @close="showCloud = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import NewProjectDialog from '../components/NewProjectDialog.vue'
import PickExampleDialog from '../components/PickExampleDialog.vue'
import CloudProjectsDialog from '../components/CloudProjectsDialog.vue'
import { formatWords, idbGet, lsGet, lsSet, timeAgo } from '../core/storage'
import { pickDirectory } from '../services/picker'
import { useProjectStore } from '../stores/project'
import { useSyncStore, type SyncBindingSummary } from '../stores/sync'
import type { RecentProject } from '../types'

const router = useRouter()
const project = useProjectStore()
const sync = useSyncStore()

const showDialog = ref(false)
const showPick = ref(false)
const showCloud = ref(false)
const opening = ref(false)
const recentProjects = ref<RecentProject[]>(lsGet<RecentProject[]>('recentProjects', []))
const syncBindings = ref<Record<string, SyncBindingSummary>>(lsGet<Record<string, SyncBindingSummary>>('sync.bindings', {}))

function bindingOf(p: RecentProject): SyncBindingSummary | undefined {
  return syncBindings.value[p.dirName]
}

async function bindAndOpen(recent: RecentProject) {
  if (opening.value) return
  opening.value = true
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>('handles', recent.dirName)
    if (!handle) {
      alert('无法获取该项目句柄，请先正常打开一次项目以完成授权。')
      return
    }
    await project.openWithHandle(handle)
    await sync.bindToCloud(project.projectName)
    if (sync.isBound) sync.startPolling()
    syncBindings.value = lsGet<Record<string, SyncBindingSummary>>('sync.bindings', {})
    await router.push({ name: 'workspace' })
  } catch (err) {
    console.error('[绑定并打开]', err)
    alert(err instanceof Error ? err.message : '绑定失败')
  } finally {
    opening.value = false
  }
}

function showHelp() {
  alert('AI 写作器 · 使用说明\n\n· 项目即本地文件夹，数据全部保存在你的电脑上\n· 新建项目：选择父文件夹后会自动创建 大纲 / 正文 / 人物库 / 随笔 目录结构\n· 打开项目：通过 File System Access API 授权文件夹读写权限\n· 若文件夹选择窗口无法出现（如内嵌浏览器），可先用首页的「演示模式」体验\n· 仅支持 Chrome / Edge 浏览器')
}

/** 统一的打开流程：最近卡片复用已存句柄，未授权或句柄缺失时重新选择文件夹 */
async function openFlow(recent?: RecentProject) {
  if (opening.value) return
  opening.value = true
  try {
    if (recent) {
      const handle = await idbGet<FileSystemDirectoryHandle>('handles', recent.dirName)
      if (handle) {
        const h = handle as FileSystemDirectoryHandle & {
          queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
          requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
        }
        let granted = false
        if (typeof h.queryPermission === 'function') {
          granted = (await h.queryPermission({ mode: 'readwrite' })) === 'granted'
        }
        if (!granted && typeof h.requestPermission === 'function') {
          granted = (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
        }
        if (granted) {
          await project.openWithHandle(handle)
          await router.push({ name: 'workspace' })
          return
        }
      }
    }
    const handle = await pickDirectory()
    await project.openWithHandle(handle)
    await router.push({ name: 'workspace' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    if (err instanceof Error && err.name === 'AbortError') return
    console.error('[打开项目]', err)
    alert(err instanceof Error ? err.message : '打开项目失败，请重试。')
  } finally {
    opening.value = false
  }
}

/** 演示模式：内存文件系统，无需系统文件夹选择器 */
async function startDemo() {
  try {
    await project.openDemo()
    await router.push({ name: 'workspace' })
  } catch (err) {
    console.error('[演示模式]', err)
    alert('演示模式启动失败，请重试。')
  }
}
</script>

<style scoped>
.home {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  color: var(--accent);
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 64px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-content: start;
}

.hero {
  padding-top: 24px;
}

.title {
  font-family: var(--font-serif);
  font-size: 40px;
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: 0.02em;
}

.subtitle {
  margin-top: 18px;
  color: var(--text-2);
  font-size: 15px;
  line-height: 1.8;
  max-width: 400px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 18px;
  color: var(--text-3);
  font-size: 13px;
}

.demo-row {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--text-3);
}

.imitate-btn {
  background: #26211b;
  border-color: #26211b;
  color: #fff;
}
.imitate-btn:hover {
  background: #3a332a;
  border-color: #3a332a;
  color: #fff;
}
.imitate-hint {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--text-3);
}

.demo-link {
  color: var(--accent);
  font-size: 12.5px;
  padding: 0;
}
.demo-link:hover {
  text-decoration: underline;
}

.recent-head {
  color: var(--text-3);
  font-size: 13px;
  margin-bottom: 12px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recent-card {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'name meta'
    'name time';
  text-align: left;
  padding: 16px 20px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.recent-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.recent-name {
  grid-area: name;
  font-size: 16px;
  font-weight: 600;
  align-self: center;
}

.recent-meta {
  grid-area: meta;
  color: var(--text-2);
  font-size: 13px;
}

.recent-time {
  grid-area: time;
  color: var(--text-3);
  font-size: 12px;
  margin-top: 4px;
  text-align: right;
}

.recent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 20px;
  color: var(--text-3);
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--bg-deep);
  color: var(--text-2);
}
.sync-badge.synced {
  background: var(--green-soft, rgba(74, 190, 120, 0.15));
  color: var(--green);
}
.sync-badge.dirty,
.sync-badge.diverged,
.sync-badge.forked,
.sync-badge.offline {
  background: var(--accent-soft);
  color: var(--accent);
}
.bind-hit {
  display: none;
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
}
.recent-card:hover .bind-hit,
.recent-card:focus-within .bind-hit {
  display: inline-block;
}
@media (hover: none) and (pointer: coarse) {
  .bind-hit {
    display: inline-block;
  }
}
</style>
