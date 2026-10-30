<template>
  <Teleport to="body">
    <div class="mask" @click.self="emit('close')">
      <div class="dlg">
        <div class="dlg-head">
          <span class="dlg-title">☁️ 云端项目</span>
          <button class="icon-btn" @click="emit('close')"><AppIcon name="close" :size="16" /></button>
        </div>

        <!-- 未配置 -->
        <div v-if="!configured" class="setup">
          <p>先在设置 → 云同步里填写服务端地址与访问令牌。</p>
          <button class="btn primary" @click="goSettings">去设置</button>
        </div>

        <template v-else>
          <p v-if="error" class="error">⚠ {{ error }}</p>

          <div class="list">
            <p v-if="!loading && !projects.length" class="empty">云端还没有项目。在本地项目卡片上点「同步到云端」即可绑定。</p>
            <div v-for="p in projects" :key="p.id" class="proj">
              <div class="proj-row">
                <span class="proj-name" :title="p.name">{{ p.name }}</span>
                <span class="proj-meta">v{{ p.version }} · {{ p.fileCount }} 文件 · {{ deviceLabel(p.sourceDevice) }} · {{ timeAgo(new Date(p.updatedAt).getTime()) }}</span>
                <span class="proj-actions">
                  <button class="mini" title="以演示副本打开（内存数据）" :disabled="busy" @click="openProject(p, 'demo')">打开副本</button>
                  <button class="mini" title="下载到本地文件夹继续编辑" :disabled="busy" @click="openProject(p, 'local')">存到本地…</button>
                  <button class="mini danger" title="删除云端项目（含分叉）" :disabled="busy" @click="removeProject(p)">删</button>
                </span>
              </div>
              <div v-for="f in p.forks" :key="f.id" class="fork-row">
                <span class="fork-tag">⎇</span>
                <span class="fork-name" :title="f.name">{{ f.name }}</span>
                <span class="fork-meta">基于 v{{ f.forkBaseVersion }} · v{{ f.version }}</span>
                <span class="proj-actions">
                  <button class="mini primary" title="分叉内容整体成为主项目新版本" :disabled="busy" @click="resolveFork(p, f, 'promote')">采用为新版本</button>
                  <button class="mini danger" title="丢弃此分叉" :disabled="busy" @click="resolveFork(p, f, 'discard')">删除</button>
                </span>
              </div>
            </div>
            <p v-if="loading" class="empty">加载中…</p>
          </div>

          <p v-if="statusNote" class="note">{{ statusNote }}</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { api, getSyncConfig, type ForkSummary, type ProjectSummary } from '../services/api'
import { timeAgo } from '../core/storage'
import { useSyncStore } from '../stores/sync'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const sync = useSyncStore()

const configured = computed(() => {
  const cfg = getSyncConfig()
  return !!cfg.token && !!cfg.serverUrl
})

const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const statusNote = ref('')

onMounted(() => {
  if (configured.value) void load()
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listProjects()
    projects.value = res.projects ?? []
  } catch (err) {
    error.value = (err as { message?: string })?.message ?? '无法连接服务器'
  } finally {
    loading.value = false
  }
}

function deviceLabel(d: string): string {
  return d || '—'
}

function goSettings() {
  emit('close')
  void router.push({ name: 'settings' })
}

async function openProject(p: ProjectSummary, mode: 'demo' | 'local') {
  error.value = ''
  statusNote.value = ''
  busy.value = true
  try {
    await sync.openFromCloud(p.id, p.name, mode)
    emit('close')
    await router.push({ name: 'workspace' })
  } catch (err) {
    error.value = (err as { message?: string })?.message ?? String(err)
  } finally {
    busy.value = false
  }
}

async function removeProject(p: ProjectSummary) {
  if (!window.confirm(`删除云端项目「${p.name}」（含 ${p.forks.length} 个分叉）？\n本地数据不受影响。`)) return
  busy.value = true
  try {
    await api.deleteProject(p.id)
    await load()
  } catch (err) {
    error.value = (err as { message?: string })?.message ?? String(err)
  } finally {
    busy.value = false
  }
}

async function resolveFork(main: ProjectSummary, fork: ForkSummary, action: 'promote' | 'discard') {
  const verb = action === 'promote' ? `采用「${fork.name}」为新版本（覆盖主项目当前内容）` : `删除分叉「${fork.name}」`
  if (!window.confirm(`${verb}？`)) return
  busy.value = true
  error.value = ''
  try {
    await api.resolveFork(main.id, { forkId: fork.id, action })
    // 当前窗口若正工作在该分叉/主项目上：切回主项目并拉取
    if (action === 'promote' && sync.isBound) {
      const boundMain = sync.mainProjectId ?? sync.cloudProjectId
      if (boundMain === main.id || sync.cloudProjectId === fork.id) {
        await sync.rebindTo(main.id)
        statusNote.value = '已切回主项目并拉取最新版本'
      }
    }
    await load()
  } catch (err) {
    error.value = (err as { message?: string })?.message ?? String(err)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}
.dlg {
  width: 640px;
  max-width: calc(100vw - 48px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 14px 16px;
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.dlg-title {
  font-size: 16px;
  font-weight: 700;
}
.setup {
  padding: 28px 8px;
  text-align: center;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.error {
  color: var(--accent);
  font-size: 12.5px;
  padding: 4px 2px;
}
.note {
  color: var(--green);
  font-size: 12.5px;
  padding: 4px 2px;
}
.list {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  padding: 30px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
.proj {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.proj-row,
.fork-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.proj-name {
  font-weight: 600;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-meta {
  flex: 1;
  min-width: 0;
  color: var(--text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-actions {
  display: inline-flex;
  gap: 4px;
  flex: none;
}
.mini {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
  white-space: nowrap;
}
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini.primary {
  border-color: var(--green);
  color: var(--green);
}
.mini.primary:hover:not(:disabled) {
  background: rgba(74, 140, 95, 0.1);
}
.mini.danger:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.5;
}
.fork-row {
  padding: 4px 6px;
  border-top: 1px dashed var(--border);
  background: var(--panel-2);
  border-radius: 6px;
}
.fork-tag {
  color: var(--orange);
  flex: none;
}
.fork-name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}
.fork-meta {
  flex: 1;
  min-width: 0;
  color: var(--text-3);
  font-size: 11.5px;
}
</style>
