<template>
  <div class="m-ws">
    <!-- 顶栏 -->
    <header class="topbar">
      <button class="icon-btn" title="返回首页" @click="goHome"><AppIcon name="back" :size="18" /></button>
      <span class="ws-title">{{ project.projectName }}</span>
      <span class="ws-words">{{ formatWords(project.stats.wordCount) }}</span>
    </header>

    <!-- 子页：文档列表 -->
    <template v-if="page === 'docs'">
      <nav class="tabs">
        <button class="tab" :class="{ active: true }">文档</button>
        <button class="tab" @click="page = 'outline'">大纲</button>
        <button class="tab" @click="page = 'people'">人物</button>
      </nav>
      <main class="doc-list">
        <!-- 剧情大纲 -->
        <section v-if="hasOutline" class="group">
          <p class="group-head">剧情大纲</p>
          <button class="doc-row" @click="page = 'outline'">
            <AppIcon name="outline" :size="16" />
            <span class="doc-name">outline.md</span>
            <AppIcon name="chevron-right" :size="14" class="doc-arrow" />
          </button>
        </section>
        <!-- 正文 -->
        <section class="group">
          <p class="group-head">正文</p>
          <p v-if="!chapters.length" class="group-empty">还没有章节</p>
          <button
            v-for="d in chapters"
            :key="d.path"
            class="doc-row"
            @click="openDoc(d)"
            @contextmenu.prevent="docMenu = d"
            @touchstart.passive="startPress(d)"
            @touchend="endPress"
            @touchmove="endPress"
          >
            <AppIcon name="doc" :size="16" />
            <span class="doc-name">{{ d.name }}</span>
            <span class="doc-meta">{{ formatWords(d.wordCount) }}</span>
          </button>
        </section>
        <!-- 笔记 -->
        <section v-if="notes.length" class="group">
          <p class="group-head">笔记</p>
          <button
            v-for="d in notes"
            :key="d.path"
            class="doc-row"
            @click="openDoc(d)"
            @contextmenu.prevent="docMenu = d"
            @touchstart.passive="startPress(d)"
            @touchend="endPress"
            @touchmove="endPress"
          >
            <AppIcon name="doc" :size="16" />
            <span class="doc-name">{{ d.name }}</span>
            <span class="doc-meta">{{ formatWords(d.wordCount) }}</span>
          </button>
        </section>
      </main>
    </template>

    <!-- 子页：只读大纲 -->
    <template v-else-if="page === 'outline'">
      <header class="sub-bar">
        <button class="icon-btn" @click="page = 'docs'"><AppIcon name="back" :size="17" /></button>
        <strong>剧情大纲</strong>
        <span class="sub-tip">只读 · 编辑请回桌面端</span>
      </header>
      <main class="readonly"><div class="md" v-html="renderMd(outlineText)"></div></main>
    </template>

    <!-- 子页：只读人物库 -->
    <template v-else-if="page === 'people'">
      <header class="sub-bar">
        <button class="icon-btn" @click="page = 'docs'"><AppIcon name="back" :size="17" /></button>
        <strong>人物库</strong>
        <span class="sub-tip">只读 · 共 {{ project.characters.length }} 位</span>
      </header>
      <main class="people">
        <p v-if="!project.characters.length" class="group-empty">还没有人物卡片</p>
        <article v-for="c in project.characters" :key="c.filePath" class="p-card">
          <div class="p-head">
            <span class="p-avatar">{{ c.name.slice(0, 1) }}</span>
            <strong>{{ c.name }}</strong>
            <span class="pill">{{ c.role }}</span>
          </div>
          <p class="p-identity">{{ c.identity }}</p>
          <div v-if="c.tags.length" class="p-tags">
            <span v-for="t in c.tags" :key="t" class="tag">{{ t }}</span>
          </div>
          <p class="p-desc">{{ c.description }}</p>
        </article>
      </main>
    </template>

    <!-- 子页：编辑器（基础版，阶段 2 升级为所见即所得） -->
    <template v-else-if="page === 'edit' && editing">
      <header class="sub-bar">
        <button class="icon-btn" @click="closeEditor"><AppIcon name="back" :size="17" /></button>
        <strong class="edit-name">{{ editing.name }}</strong>
        <span class="sub-tip">{{ text.length }} 字 · 自动保存</span>
      </header>
      <textarea v-model="text" class="edit-area" :placeholder="editing.path.startsWith('chapters') ? '开始写作…' : '记录点什么…'"></textarea>
    </template>

    <!-- 文档长按操作弹层 -->
    <Teleport to="body">
      <div v-if="docMenu" class="mask" @click.self="docMenu = null">
        <div class="sheet">
          <p class="sheet-title">{{ docMenu.name }}</p>
          <button class="sheet-btn" @click="renameDoc">重命名</button>
          <button class="sheet-btn danger" @click="deleteDoc">删除</button>
          <button class="sheet-btn ghost" @click="docMenu = null">取消</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { getFS } from '../core/fs'
import { formatWords } from '../core/storage'
import { renderMd } from '../services/md'
import { useProjectStore } from '../stores/project'
import type { DocEntry } from '../types'

const router = useRouter()
const project = useProjectStore()

type Page = 'docs' | 'outline' | 'people' | 'edit'
const page = ref<Page>('docs')
const outlineText = ref('')
const hasOutline = ref(false)
const editing = ref<DocEntry | null>(null)
const text = ref('')
const docMenu = ref<DocEntry | null>(null)

const chapters = computed(() => project.docs.filter((d) => d.path.startsWith('chapters/')))
const notes = computed(() => project.docs.filter((d) => d.path.startsWith('notes/')))

let saveTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  const fs = getFS()
  hasOutline.value = await fs.exists('outline.md')
  outlineText.value = hasOutline.value ? await fs.readFile('outline.md').catch(() => '') : ''
})

async function goHome() {
  await router.push({ name: 'home' })
}

/* ---------- 编辑器 ---------- */

async function openDoc(d: DocEntry) {
  const fs = getFS()
  editing.value = d
  text.value = await fs.readFile(d.path).catch(() => '')
  page.value = 'edit'
}

function closeEditor() {
  flushSave()
  editing.value = null
  page.value = 'docs'
  void project.refresh()
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const d = editing.value
  if (!d) return
  void getFS()
    .writeFile(d.path, text.value)
    .catch((err) => console.error('[自动保存]', err))
}

// 防抖自动保存（编辑即保存，PRD §4.2）
watch(text, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 600)
})

/* ---------- 长按操作 ---------- */

let pressTimer: ReturnType<typeof setTimeout> | null = null
function startPress(d: DocEntry) {
  pressTimer = setTimeout(() => {
    docMenu.value = d
  }, 500)
}
function endPress() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

async function renameDoc() {
  const d = docMenu.value
  if (!d) return
  const name = window.prompt('新的文件名（保留 .md 后缀）', d.name)?.trim()
  if (!name || name === d.name) {
    docMenu.value = null
    return
  }
  const fs = getFS()
  const content = await fs.readFile(d.path)
  const target = `${d.path.slice(0, d.path.lastIndexOf('/') + 1)}${name}`
  await fs.writeFile(target, content)
  await fs.delete(d.path)
  docMenu.value = null
  await project.refresh()
}

async function deleteDoc() {
  const d = docMenu.value
  if (!d) return
  if (window.confirm(`确定删除「${d.name}」？此操作不可恢复。`)) {
    await getFS().delete(d.path)
    await project.refresh()
  }
  docMenu.value = null
}
</script>

<style scoped>
.m-ws {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.ws-title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-words {
  font-size: 12px;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
}
.tab {
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-size: 14px;
  color: var(--muted);
}
.tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.doc-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 24px;
}
.group {
  margin-bottom: 16px;
}
.group-head {
  margin: 8px 0 6px;
  font-size: 12px;
  color: var(--muted);
}
.group-empty {
  margin: 4px 0;
  font-size: 13px;
  color: var(--muted);
}
.doc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  margin-bottom: 6px;
  padding: 8px 12px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.doc-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-meta {
  font-size: 12px;
  color: var(--muted);
}
.doc-arrow {
  color: var(--muted);
}

.sub-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}
.sub-tip {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.edit-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readonly {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.people {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.p-card {
  padding: 14px;
}
.p-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.p-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 16px;
}
.p-identity {
  margin: 6px 0 4px;
  font-size: 13px;
  color: var(--muted);
}
.p-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.p-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.edit-area {
  flex: 1;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px;
  background: var(--card);
  font-size: 16px;
  line-height: 1.8;
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
</style>
