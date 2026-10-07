<template>
  <div class="library-page">
    <header class="topbar">
      <div class="tb-left">
        <button class="icon-btn" title="返回工作区" @click="router.push({ name: 'workspace' })">
          <AppIcon name="back" :size="17" />
        </button>
        <span class="logo"><AppIcon name="logo" :size="22" /></span>
        <span class="crumb-project">{{ project.projectName }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-path">资料库</span>
      </div>
      <div class="tb-right">
        <span class="readonly-note">资料库文件全部只读 · 可删除 / 替换，不可编辑内容</span>
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">
          <AppIcon name="settings" :size="17" />
        </button>
      </div>
    </header>

    <!-- 首次设置 -->
    <div v-if="!library.ready && !library.setupDone" class="setup">
      <AppIcon name="folder" :size="36" class="setup-icon" />
      <p class="setup-title">设置总资料库</p>
      <p class="setup-desc">
        总资料库是跨项目沉淀资料的全局文件夹（内含 files/ 与 meta.json，可整体迁移）。
        首次使用请选择一个文件夹，之后归档的 note 与导入的资料都会存到这里。
      </p>
      <div class="setup-actions">
        <button class="btn primary" :disabled="busy" @click="chooseFolder">选择文件夹…</button>
        <button v-if="project.isDemo" class="btn" :disabled="busy" @click="useDemo">使用演示资料库</button>
      </div>
      <p v-if="error" class="error">⚠ {{ error }}</p>
    </div>

    <div v-else-if="!library.ready" class="setup">
      <p class="setup-desc">正在打开总资料库…</p>
    </div>

    <div v-else class="body">
      <!-- 左：文件列表 -->
      <aside class="side">
        <div class="side-head">
          <span class="side-title">资料库</span>
          <button class="icon-btn" title="导入文件" :disabled="busy" @click="pickImport()">
            <AppIcon name="plus" :size="16" />
          </button>
        </div>

        <div class="view-bar">
          <label class="view-label">标签组视图</label>
          <select v-model="library.viewGroupId" class="input view-select">
            <option value="all">全部（平铺）</option>
            <option v-for="g in library.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <button class="btn ghost manage-btn" @click="manageGroups = true">管理标签组</button>
        </div>

        <div class="file-tree">
          <template v-if="library.viewGroupId === 'all'">
            <div
              v-for="f in library.files"
              :key="f"
              class="file-row"
              :class="{ active: library.previewFile === f }"
              @click="library.previewFile = f"
            >
              <span class="file-name" :title="f">{{ f }}</span>
              <span v-for="t in chipsOf(f)" :key="t" class="mini-chip">{{ t }}</span>
              <AppIcon name="lock" :size="12" class="lock" />
            </div>
          </template>
          <template v-else>
            <div v-for="row in library.viewRows" :key="row.tag?.id ?? '__untagged'" class="group-block">
              <div class="group-head">
                <AppIcon name="chevron-down" :size="13" />
                <span class="group-name">{{ row.tag ? row.tag.name : '未分组' }}</span>
                <span class="group-count">{{ row.files.length }}</span>
              </div>
              <div
                v-for="f in row.files"
                :key="f"
                class="file-row indent"
                :class="{ active: library.previewFile === f }"
                @click="library.previewFile = f"
              >
                <span class="file-name" :title="f">{{ f }}</span>
                <span v-for="t in chipsOf(f)" :key="t" class="mini-chip">{{ t }}</span>
                <AppIcon name="lock" :size="12" class="lock" />
              </div>
              <p v-if="!row.files.length" class="group-empty indent">（空）</p>
            </div>
          </template>
          <p v-if="!library.files.length" class="tree-empty">还没有资料，点右上角 + 导入，或在笔记上点「归档」</p>
        </div>

        <p class="side-hint">
          同一批文件，切换标签组即换一种归类视角。排他组内每文件至多 1 个标签。
        </p>

        <!-- 隐藏的文件选择 input：导入 / 替换共用 -->
        <input ref="fileInput" type="file" multiple class="hidden-input" @change="onFilesPicked" />
      </aside>

      <!-- 右：预览 -->
      <section class="preview">
        <div v-if="!library.previewFile" class="preview-empty">
          <AppIcon name="file" :size="30" />
          <p>从左侧选择一份资料查看</p>
        </div>
        <template v-else>
          <div class="pv-head">
            <div class="pv-title-row">
              <span class="pv-name">{{ library.previewFile }}</span>
              <span class="badge readonly"><AppIcon name="lock" :size="11" /> 只读</span>
              <span v-if="!library.isText(library.previewFile)" class="badge type">{{
                extOf(library.previewFile).toUpperCase()
              }}</span>
              <div class="pv-actions">
                <button class="btn" @click="openInViewer">与编辑器并列打开</button>
                <button class="btn ghost" :disabled="busy" @click="replaceCurrent">替换</button>
                <button class="btn ghost danger" :disabled="busy" @click="removeCurrent">删除</button>
              </div>
            </div>
            <div class="pv-tags">
              <span class="pv-tags-label">标签：</span>
              <span v-for="t in library.tagNamesOf(library.previewFile)" :key="t" class="tag-chip">{{ t }}</span>
              <button class="btn ghost tag-btn" @click="tagPanel = !tagPanel">
                <AppIcon name="edit" :size="12" /> 打标签
              </button>
            </div>

            <!-- 打标签面板 -->
            <div v-if="tagPanel" class="tag-panel">
              <div class="tp-row">
                <select v-model="tagGroupId" class="input tp-select">
                  <option v-for="g in library.groups" :key="g.id" :value="g.id">
                    {{ g.name }}（{{ g.type === 'exclusive' ? '排他' : '普通' }}）
                  </option>
                </select>
                <input
                  v-if="tagGroupId"
                  v-model="newTagName"
                  class="input tp-new"
                  :placeholder="`在「${groupName(tagGroupId)}」下新建标签，回车`"
                  @keydown.enter="createTag"
                />
              </div>
              <div class="tp-tags">
                <span v-if="!tagsOfGroup(tagGroupId).length" class="tp-empty">该组还没有标签</span>
                <button
                  v-for="t in tagsOfGroup(tagGroupId)"
                  :key="t.id"
                  class="tp-tag"
                  :class="{ on: currentDocTagIds.has(t.id) }"
                  @click="toggleTag(t)"
                >
                  {{ t.name }}
                </button>
              </div>
            </div>
          </div>

          <div class="pv-body" data-viewer-root>
            <div v-if="binary" class="binary-box">
              <AppIcon name="file" :size="30" />
              <p>「{{ library.previewFile }}」是 {{ extOf(library.previewFile).toUpperCase() }} 文件，不支持在线预览</p>
              <p class="binary-sub">可复制文件名后到本地打开；如需更新内容，使用「替换」重新导入同名文件。</p>
            </div>
            <div v-else-if="previewText" class="md" v-html="renderMd(previewText)"></div>
            <p v-else class="loading">读取中…</p>
          </div>

          <p class="pv-foot">
            此文件内容不可修改；如需更新，使用「替换」重新导入同名文件。{{ archivedAtOf }}
          </p>
        </template>
      </section>
    </div>

    <!-- 管理标签组弹窗 -->
    <Teleport to="body">
      <div v-if="manageGroups" class="modal-mask" @click.self="manageGroups = false">
        <div class="modal">
          <div class="modal-head">
            <span class="modal-title">管理标签组</span>
            <button class="icon-btn" @click="manageGroups = false"><AppIcon name="close" :size="16" /></button>
          </div>
          <div class="modal-body">
            <div v-for="g in library.groups" :key="g.id" class="mg-row">
              <input v-model="g.name" class="input mg-name" :disabled="busy" @change="library.renameGroup(g.id, g.name)" />
              <span class="mg-type">{{ g.type === 'exclusive' ? '排他组' : '普通组' }}</span>
              <span v-if="g.builtin" class="mg-builtin">预置</span>
              <button
                v-else
                class="icon-btn danger"
                title="删除标签组（组内标签与文件关联一并移除）"
                :disabled="busy"
                @click="removeGroup(g.id)"
              >
                <AppIcon name="trash" :size="15" />
              </button>
            </div>
            <div class="mg-add">
              <input v-model="newGroupName" class="input" placeholder="新标签组名称" />
              <select v-model="newGroupType" class="input mg-type-select">
                <option value="normal">普通组（可多标签）</option>
                <option value="exclusive">排他组（至多一个标签）</option>
              </select>
              <button class="btn" :disabled="!newGroupName.trim() || busy" @click="addGroup">添加</button>
            </div>
            <p class="mg-note">「未整理」为预置默认组，不可删除。删除标签组会同时移除组内标签及文件上的关联。</p>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 只读预览中的选中 AI（仅复制；插入/替换对只读资料不可用） -->
    <SelectionToolbar @action="openAIDialog" />
    <AIDialog v-if="aiDialog" :action-id="aiDialog.actionId" read-only @close="aiDialog = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SelectionToolbar from '../components/SelectionToolbar.vue'
import AIDialog from '../components/AIDialog.vue'
import { renderMd } from '../services/md'
import { pickDirectory } from '../services/picker'
import { useLibraryStore } from '../stores/library'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'
import type { LibraryTag } from '../core/globalLibrary'

const router = useRouter()
const project = useProjectStore()
const library = useLibraryStore()
const viewer = useViewerStore()

const aiDialog = ref<{ actionId: string | null } | null>(null)

function openAIDialog(payload: { actionId: string; source: 'editor' | 'viewer' }) {
  aiDialog.value = { actionId: payload.actionId }
}

const busy = ref(false)
const error = ref('')
const tagPanel = ref(false)
const tagGroupId = ref('g_default')
const newTagName = ref('')
const manageGroups = ref(false)
const newGroupName = ref('')
const newGroupType = ref<'normal' | 'exclusive'>('normal')
const previewText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let replaceTarget: string | null = null

const binary = computed(
  () => !!library.previewFile && !library.isText(library.previewFile),
)

const currentDocTagIds = computed(() => {
  const doc = library.previewFile ? library.docOf(library.previewFile) : undefined
  return new Set(doc?.tagIds ?? [])
})

const archivedAtOf = computed(() => {
  const doc = library.previewFile ? library.docOf(library.previewFile) : undefined
  return doc?.archivedAt ? `归档于 ${doc.archivedAt}。` : ''
})

onMounted(async () => {
  const ok = await library.init()
  if (!ok && library.error) error.value = library.error
  if (!ok && project.isDemo && !library.setupDone) {
    // 演示模式下静默启用演示资料库？不自动，留给用户点按钮，避免意外状态
  }
})

// 预览内容加载
import { watch } from 'vue'
watch(
  () => library.previewFile,
  async (f) => {
    previewText.value = ''
    if (!f || !library.isText(f)) return
    previewText.value = await library.readFileText(f).catch(() => '*读取失败*')
  },
  { immediate: true },
)

function chipsOf(file: string): string[] {
  // 列表里的小标签只显示「来源项目」组
  const doc = library.docOf(file)
  if (!doc || !library.meta) return []
  return doc.tagIds
    .map((id) => library.meta!.tags.find((t) => t.id === id))
    .filter((t): t is LibraryTag => !!t && t.groupId === 'g_source')
    .map((t) => `来源 · ${t.name}`)
}

function extOf(name: string): string {
  return name.split('.').pop() ?? ''
}

function groupName(id: string): string {
  return library.groups.find((g) => g.id === id)?.name ?? ''
}

function tagsOfGroup(groupId: string): LibraryTag[] {
  return library.tags.filter((t) => t.groupId === groupId)
}

// ---------- 导入 / 替换 / 删除 ----------

function pickImport(target: string | null = null) {
  replaceTarget = target
  fileInput.value?.click()
}

async function onFilesPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  busy.value = true
  error.value = ''
  try {
    for (const f of files) {
      const data = new Uint8Array(await f.arrayBuffer())
      await library.importData(f.name, data)
    }
    if (replaceTarget && library.previewFile === replaceTarget) {
      previewText.value = library.isText(replaceTarget)
        ? await library.readFileText(replaceTarget).catch(() => previewText.value)
        : ''
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
    replaceTarget = null
  }
}

function replaceCurrent() {
  if (library.previewFile) pickImport(library.previewFile)
}

async function removeCurrent() {
  if (!library.previewFile) return
  if (!window.confirm(`删除资料「${library.previewFile}」？此操作不可撤销。`)) return
  busy.value = true
  try {
    await library.removeFile(library.previewFile)
  } finally {
    busy.value = false
  }
}

// ---------- 标签 ----------

async function toggleTag(tag: LibraryTag) {
  if (!library.previewFile) return
  await library.toggleTag(library.previewFile, tag, true)
}

async function createTag() {
  const name = newTagName.value.trim()
  if (!name || !tagGroupId.value) return
  const tag = await library.addTag(tagGroupId.value, name)
  newTagName.value = ''
  if (library.previewFile) await library.toggleTag(library.previewFile, tag)
}

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  await library.addGroup(name, newGroupType.value)
  newGroupName.value = ''
}

async function removeGroup(id: string) {
  if (!window.confirm('删除该标签组？组内标签及文件上的关联会一并移除。')) return
  await library.removeGroup(id)
}

// ---------- 其他 ----------

async function chooseFolder() {
  busy.value = true
  error.value = ''
  try {
    const handle = await pickDirectory()
    await library.setup(handle)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function useDemo() {
  busy.value = true
  try {
    await library.setup(null, true)
  } finally {
    busy.value = false
  }
}

function openInViewer() {
  if (!library.previewFile) return
  viewer.openLibraryFile(library.previewFile)
  void router.push({ name: 'workspace' })
}
</script>

<style scoped>
.library-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.topbar {
  height: 50px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.tb-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.logo {
  display: flex;
  color: var(--accent);
}
.crumb-project {
  font-weight: 700;
}
.crumb-sep {
  color: var(--text-3);
}
.crumb-path {
  color: var(--text-2);
}
.tb-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.readonly-note {
  font-size: 12px;
  color: var(--text-3);
}

/* ---------- 首次设置 ---------- */

.setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 32px;
  text-align: center;
}
.setup-icon {
  color: var(--text-3);
}
.setup-title {
  font-size: 18px;
  font-weight: 700;
}
.setup-desc {
  max-width: 460px;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.8;
}
.setup-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.error {
  color: var(--accent);
  font-size: 13px;
}

/* ---------- 主体 ---------- */

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.side {
  width: 320px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--border);
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}
.side-title {
  font-size: 15px;
  font-weight: 700;
}
.side-title::after {
  content: '';
  display: block;
  width: 22px;
  height: 2px;
  background: var(--accent);
  margin-top: 4px;
  border-radius: 1px;
}

.view-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}
.view-label {
  font-size: 12px;
  color: var(--text-3);
  flex: none;
}
.view-select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  font-size: 12.5px;
}
.manage-btn {
  flex: none;
  padding: 5px 8px;
  font-size: 12px;
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.group-block {
  margin-bottom: 4px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 6px 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  font-weight: 400;
}
.group-empty {
  font-size: 12px;
  color: var(--text-3);
  padding: 2px 0 4px 26px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.file-row.indent {
  margin-left: 16px;
}
.file-row:hover {
  background: var(--panel-2);
}
.file-row.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.mini-chip {
  flex: none;
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-deep);
  padding: 1px 7px;
  border-radius: 999px;
}
.lock {
  flex: none;
  color: var(--text-3);
}
.tree-empty {
  padding: 24px 12px;
  font-size: 12.5px;
  color: var(--text-3);
  text-align: center;
  line-height: 1.7;
}
.side-hint {
  padding: 10px 14px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
  border-top: 1px solid var(--border);
}
.hidden-input {
  display: none;
}

/* ---------- 预览 ---------- */

.preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.preview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
}

.pv-head {
  flex: none;
  padding: 14px 22px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.pv-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pv-name {
  font-size: 17px;
  font-weight: 700;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
}
.badge.readonly {
  background: var(--accent-soft);
  color: var(--accent);
}
.badge.type {
  background: var(--purple-soft);
  color: var(--purple);
}
.pv-actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.pv-actions .btn {
  padding: 5px 12px;
  font-size: 12.5px;
}
.btn.danger:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.pv-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.pv-tags-label {
  font-size: 12.5px;
  color: var(--text-3);
}
.tag-chip {
  font-size: 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--text-2);
}
.tag-btn {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
}

.tag-panel {
  margin-top: 10px;
  padding: 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.tp-row {
  display: flex;
  gap: 8px;
}
.tp-select {
  width: 180px;
  padding: 6px 8px;
  font-size: 12.5px;
}
.tp-new {
  flex: 1;
  padding: 6px 10px;
  font-size: 12.5px;
}
.tp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.tp-empty {
  font-size: 12px;
  color: var(--text-3);
}
.tp-tag {
  font-size: 12.5px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
}
.tp-tag.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.pv-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 26px;
  background: var(--panel);
}
.md {
  max-width: 720px;
  font-size: 14px;
  line-height: 2;
  color: var(--text);
  word-break: break-word;
}
.md :deep(p) {
  margin: 0 0 10px;
}
.loading {
  color: var(--text-3);
}
.binary-box {
  max-width: 480px;
  margin: 60px auto;
  text-align: center;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.binary-sub {
  font-size: 12px;
  color: var(--text-3);
}

.pv-foot {
  flex: none;
  padding: 8px 22px;
  font-size: 12px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
  background: var(--panel);
}

/* ---------- 弹窗 ---------- */

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
}
.modal {
  width: 520px;
  max-width: calc(100vw - 48px);
  max-height: 80vh;
  overflow-y: auto;
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px 18px;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.modal-title {
  font-size: 15px;
  font-weight: 700;
}
.mg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.mg-name {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
}
.mg-type {
  flex: none;
  font-size: 12px;
  color: var(--text-3);
}
.mg-builtin {
  flex: none;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 8px;
  border-radius: 999px;
}
.mg-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.mg-add .input {
  padding: 6px 10px;
  font-size: 13px;
}
.mg-type-select {
  width: 160px;
}
.mg-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}
.icon-btn.danger:hover {
  color: var(--accent);
}
</style>
