<template>
  <div class="m-home">
    <header class="topbar">
      <span class="brand">AI 写作器</span>
      <div class="top-actions">
        <button class="icon-btn" title="导出全部备份" @click="backupAll">
          <AppIcon name="history" :size="18" />
        </button>
        <button class="icon-btn" title="导入项目 (zip)" @click="pickZip">
          <AppIcon name="download" :size="18" />
        </button>
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">
          <AppIcon name="settings" :size="18" />
        </button>
      </div>
    </header>

    <!-- 新建项目内联输入 -->
    <div v-if="creating" class="create-bar">
      <input v-model="newName" class="input" placeholder="项目名称" @keydown.enter="submitCreate" />
      <button class="btn primary" :disabled="busy" @click="submitCreate">创建</button>
      <button class="btn ghost" @click="creating = false">取消</button>
    </div>

    <main class="list">
      <p class="list-head">
        共 {{ projects.length }} 个项目 · 按最近打开排序
        <span v-if="lastBackup" class="backup-tip">上次备份 {{ timeAgo(lastBackup) }}</span>
        <span v-else class="backup-tip warn">尚未备份，建议点右上角 🕐 导出备份</span>
      </p>
      <button
        v-for="p in projects"
        :key="p.id"
        class="card proj-card"
        @click="open(p.id)"
        @contextmenu.prevent="startLongPress(p.id, $event)"
        @touchstart.passive="onTouchStart(p.id)"
        @touchend="onTouchEnd"
        @touchmove="onTouchEnd"
      >
        <span class="proj-icon">{{ p.name.slice(0, 1) }}</span>
        <span class="proj-main">
          <strong class="proj-name">{{ p.name }}</strong>
          <span class="proj-meta">
            <template v-if="p.docCount != null">{{ p.docCount }} 篇</template>
            <template v-if="p.wordCount != null"> · {{ formatWords(p.wordCount) }}</template>
          </span>
        </span>
        <span class="proj-time">{{ timeAgo(p.updatedAt) }}</span>
      </button>
      <div v-if="!projects.length" class="empty card">
        <p>还没有项目</p>
        <p class="empty-sub">点右上角导入 zip，或点下方「+ 新建项目」</p>
      </div>
    </main>

    <footer class="dock">
      <button class="btn" @click="creating = true">
        <AppIcon name="plus" :size="16" /> 新建项目
      </button>
      <button class="btn primary imitate" @click="showPick = true">
        <AppIcon name="sparkles" :size="16" /> 一键仿写
      </button>
    </footer>

    <!-- 长按操作弹层 -->
    <Teleport to="body">
      <div v-if="menuFor" class="mask" @click.self="menuFor = null">
        <div class="sheet">
          <p class="sheet-title">{{ menuProject?.name }}</p>
          <button class="sheet-btn" @click="doRename">重命名</button>
          <button class="sheet-btn" @click="doExport">导出 zip</button>
          <button class="sheet-btn danger" @click="doDelete">删除项目</button>
          <button class="sheet-btn ghost" @click="menuFor = null">取消</button>
        </div>
      </div>
    </Teleport>

    <input ref="zipInput" type="file" accept=".zip" class="hidden" @change="onZipChosen" />
    <MobilePickExampleSheet v-if="showPick" @close="showPick = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import MobilePickExampleSheet from '../components/mobile/MobilePickExampleSheet.vue'
import {
  deleteMobileProject,
  listMobileProjects,
  openMobileProject,
  renameMobileProject,
  type MobileProjectMeta,
} from '../core/mobileFS'
import { exportProjectZip, exportAllProjectsZip, getLastBackupAt, importProjectZip } from '../core/zipTransfer'
import { formatWords, timeAgo } from '../core/storage'
import { useProjectStore } from '../stores/project'

const router = useRouter()
const project = useProjectStore()

const projects = ref<MobileProjectMeta[]>(listMobileProjects())
const creating = ref(false)
const newName = ref('')
const busy = ref(false)
const showPick = ref(false)
const menuFor = ref<string | null>(null)
const zipInput = ref<HTMLInputElement | null>(null)
const lastBackup = ref<number | null>(getLastBackupAt())

/** 导出全部项目备份（OPFS 有被浏览器清理的风险，PRD §2.3） */
async function backupAll() {
  if (busy.value) return
  busy.value = true
  try {
    const fileName = await exportAllProjectsZip()
    lastBackup.value = getLastBackupAt()
    alert(`已导出备份：${fileName}`)
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

const menuProject = computed(() => projects.value.find((p) => p.id === menuFor.value) ?? null)

function refresh(): void {
  projects.value = listMobileProjects()
}

/* ---------- 打开 / 新建 ---------- */

async function open(id: string) {
  if (busy.value) return
  busy.value = true
  try {
    await project.openMobile(id)
    await router.push({ name: 'workspace' })
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function submitCreate() {
  if (!newName.value.trim() || busy.value) return
  busy.value = true
  try {
    await project.createMobile(newName.value)
    creating.value = false
    newName.value = ''
    refresh()
    await router.push({ name: 'workspace' })
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

/* ---------- 导入 / 导出 ---------- */

function pickZip() {
  zipInput.value?.click()
}

async function onZipChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  busy.value = true
  try {
    await importProjectZip(file, file.name.replace(/\.zip$/i, ''))
    refresh()
  } catch (err) {
    alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    busy.value = false
  }
}

async function doExport() {
  const meta = menuProject.value
  if (!meta) return
  const fs = await openMobileProject(meta.id)
  if (!fs) {
    alert('项目目录不存在，无法导出')
    return
  }
  await exportProjectZip(fs, meta.name)
  menuFor.value = null
}

/* ---------- 长按操作 ---------- */

let pressTimer: ReturnType<typeof setTimeout> | null = null

function startLongPress(id: string, _e: MouseEvent) {
  menuFor.value = id
}

function onTouchStart(id: string) {
  pressTimer = setTimeout(() => {
    menuFor.value = id
  }, 500)
}

function onTouchEnd() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function doRename() {
  const meta = menuProject.value
  if (!meta) return
  const name = window.prompt('新的项目名称', meta.name)?.trim()
  if (!name) {
    menuFor.value = null
    return
  }
  renameMobileProject(meta.id, name)
  // 同步 project.json 里的名称
  void openMobileProject(meta.id).then(async (fs) => {
    if (!fs) return
    try {
      const pj = JSON.parse(await fs.readFile('project.json')) as { name?: string }
      pj.name = name
      await fs.writeFile('project.json', JSON.stringify(pj, null, 2))
    } catch {
      /* 无 project.json 时仅改登记名 */
    }
  })
  refresh()
  menuFor.value = null
}

function doDelete() {
  const meta = menuProject.value
  if (!meta) return
  if (window.confirm(`确定删除「${meta.name}」？\n项目文件将从本机移除，且无法恢复。`)) {
    void deleteMobileProject(meta.id).then(refresh)
  }
  menuFor.value = null
}
</script>

<style scoped>
.m-home {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.brand {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}
.top-actions {
  display: flex;
  gap: 8px;
}

.create-bar {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}
.create-bar .input {
  flex: 1;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 96px;
}
.list-head {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.backup-tip {
  margin-left: 8px;
}
.backup-tip.warn {
  color: var(--accent);
}

.proj-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  margin-bottom: 10px;
  padding: 10px 14px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.proj-icon {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 18px;
}
.proj-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.proj-name {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-meta {
  font-size: 12px;
  color: var(--muted);
}
.proj-time {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}

.empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--muted);
}
.empty-sub {
  font-size: 12px;
}

.dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
}
.dock .btn {
  flex: 1;
  min-height: 48px;
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}
.sheet {
  width: 100%;
  background: var(--card);
  border-radius: 16px 16px 0 0;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-title {
  margin: 0 0 4px;
  text-align: center;
  font-weight: 600;
}
.sheet-btn {
  min-height: 48px;
  border: none;
  border-radius: 10px;
  background: var(--bg-deep);
  font-size: 15px;
}
.sheet-btn.danger {
  color: #c0392b;
}
.sheet-btn.ghost {
  background: transparent;
  color: var(--muted);
}

.hidden {
  display: none;
}
</style>
