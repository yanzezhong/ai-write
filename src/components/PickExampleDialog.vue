<template>
  <Teleport to="body">
    <div class="mask" @click.self="emit('close')">
      <div class="dlg">
        <div class="dlg-head">
          <span class="dlg-title">选择例文</span>
          <button class="icon-btn" @click="emit('close')"><AppIcon name="close" :size="16" /></button>
        </div>

        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'library' }" @click="tab = 'library'">📚 从资料库选择</button>
          <button class="tab" :class="{ active: tab === 'paste' }" @click="tab = 'paste'">📝 粘贴例文</button>
        </div>

        <!-- 从资料库选择 -->
        <div v-if="tab === 'library'" class="lib-pane">
          <template v-if="library.ready">
            <div class="filters">
              <select v-model="viewGroup" class="input fg-select">
                <option value="all">全部标签组</option>
                <option v-for="g in library.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
              <input v-model="keyword" class="input fg-search" placeholder="搜索资料库…" />
            </div>
            <div class="file-list">
              <label v-for="f in filteredFiles" :key="f" class="file-row" :class="{ off: !library.isText(f) }">
                <input
                  type="radio"
                  name="example"
                  :disabled="!library.isText(f)"
                  :checked="picked === f"
                  @change="picked = f"
                />
                <span class="file-icon"><AppIcon :name="library.isText(f) ? 'doc' : 'file'" :size="15" /></span>
                <span class="file-name">{{ f }}</span>
                <span v-for="t in chips(f)" :key="t" class="mini-chip">{{ t }}</span>
                <span v-if="!library.isText(f)" class="not-text">不支持解析</span>
              </label>
              <p v-if="!filteredFiles.length" class="list-empty">没有匹配的资料文件</p>
            </div>
          </template>
          <template v-else-if="!library.setupDone">
            <div class="setup-mini">
              <p>总资料库尚未设置。选择例文需要先从资料库读取文件。</p>
              <div class="setup-actions">
                <button class="btn primary" :disabled="busy" @click="chooseLib">选择资料库文件夹…</button>
                <button class="btn" :disabled="busy" @click="useDemoLib">使用演示资料库</button>
              </div>
            </div>
          </template>
          <template v-else><p class="list-empty">正在打开资料库…</p></template>
        </div>

        <!-- 粘贴例文 -->
        <div v-else class="paste-pane">
          <input v-model="pasteName" class="input" placeholder="例文标题，如：星海纪元 第一章" />
          <textarea
            v-model="pasteText"
            class="input paste-area"
            rows="10"
            placeholder="把例文全文粘贴到这里（建议 1000 字以上，100 字以下无法解析）"
          ></textarea>
          <p class="paste-count">已粘贴 {{ pasteText.length }} 字</p>
        </div>

        <p v-if="error" class="error">⚠ {{ error }}</p>

        <div class="dlg-foot">
          <button class="btn" @click="emit('close')">取消</button>
          <button class="btn primary" :disabled="!canStart || busy" @click="start">
            {{ busy ? '解析例文中…' : '开始解析' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useLibraryStore } from '../stores/library'
import { pickDirectory } from '../services/picker'
import type { LibraryTag } from '../core/globalLibrary'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const library = useLibraryStore()

const tab = ref<'library' | 'paste'>('library')
const viewGroup = ref('all')
const keyword = ref('')
const picked = ref<string | null>(null)
const pasteName = ref('')
const pasteText = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  if (!library.ready) await library.init()
})

const filteredFiles = computed(() => {
  let list = library.files
  if (viewGroup.value !== 'all') {
    const tagIds = new Set(library.tags.filter((t) => t.groupId === viewGroup.value).map((t) => t.id))
    list = list.filter((f) => library.docOf(f)?.tagIds.some((id) => tagIds.has(id)))
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) list = list.filter((f) => f.toLowerCase().includes(kw))
  return list
})

const canStart = computed(() => {
  if (tab.value === 'library') return !!picked.value
  return pasteText.value.trim().length > 0
})

function chips(file: string): string[] {
  const doc = library.docOf(file)
  if (!doc || !library.meta) return []
  return doc.tagIds
    .map((id) => library.meta!.tags.find((t) => t.id === id))
    .filter((t): t is LibraryTag => !!t && t.groupId === 'g_source')
    .map((t) => `来源 · ${t.name}`)
}

async function chooseLib() {
  busy.value = true
  error.value = ''
  try {
    await library.setup(await pickDirectory())
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function useDemoLib() {
  busy.value = true
  try {
    await library.setup(null, true)
  } finally {
    busy.value = false
  }
}

async function readPicked(): Promise<{ name: string; text: string }> {
  if (tab.value === 'library') {
    const f = picked.value!
    return { name: f.replace(/\.(md|txt)$/i, ''), text: await library.readFileText(f) }
  }
  const name = pasteName.value.trim() || '粘贴例文'
  return { name, text: pasteText.value }
}

async function start() {
  busy.value = true
  error.value = ''
  try {
    const { name, text } = await readPicked()
    if (text.trim().length < 100) {
      error.value = '例文过短，建议提供 1000 字以上文章以获得更好效果'
      return
    }
    const { setupImitateProject } = await import('../services/imitateSetup')
    await setupImitateProject(name, text)
    emit('close')
    await router.push({ name: 'imitate' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
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
  width: 560px;
  max-width: calc(100vw - 48px);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
}
.dlg-title {
  font-size: 16px;
  font-weight: 700;
}
.tabs {
  display: flex;
  gap: 6px;
  padding: 0 18px 10px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-2);
  background: var(--panel-2);
}
.tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.lib-pane,
.paste-pane {
  padding: 12px 18px;
  overflow-y: auto;
  min-height: 260px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.fg-select {
  width: 150px;
  padding: 6px 8px;
  font-size: 12.5px;
}
.fg-search {
  flex: 1;
  padding: 6px 10px;
  font-size: 12.5px;
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
}
.file-row:hover {
  border-color: var(--border-strong);
}
.file-row.off {
  opacity: 0.55;
  cursor: not-allowed;
}
.file-row input {
  accent-color: var(--accent);
}
.file-icon {
  color: var(--text-3);
  display: inline-flex;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-chip {
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-deep);
  padding: 1px 7px;
  border-radius: 999px;
  flex: none;
}
.not-text {
  font-size: 11px;
  color: var(--accent);
  flex: none;
}
.list-empty {
  padding: 30px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
.setup-mini {
  padding: 24px 8px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.8;
}
.setup-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 10px;
}
.paste-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.paste-area {
  resize: vertical;
  font-size: 13px;
  line-height: 1.7;
}
.paste-count {
  font-size: 12px;
  color: var(--text-3);
  text-align: right;
}
.error {
  padding: 0 18px;
  color: var(--accent);
  font-size: 12.5px;
}
.dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}
</style>
