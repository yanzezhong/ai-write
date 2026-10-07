<template>
  <div class="outline-app">
    <div class="sync-banner" @click="refresh">
      <AppIcon name="refresh" :size="14" />
      与 outline.md 双向同步
    </div>

    <div class="tree">
      <div v-if="!rows.length" class="empty">outline.md 中暂无标题</div>
      <template v-for="row in rows" :key="row.line">
        <div
          v-if="row.level === 1"
          class="row h1-row"
          @click="openAt(row)"
        >
          <span class="h1-title">{{ row.title }}</span>
        </div>
        <div v-else-if="row.level === 2" class="row h2-row" @click="toggle(row)">
          <AppIcon :name="isOpen(row) ? 'chevron-down' : 'chevron-right'" :size="13" class="twisty" />
          <span class="h2-title" @click.stop="openAt(row)">{{ row.title }}</span>
          <span v-if="wordCountOf(row) !== null" class="h2-words">{{ formatWords(wordCountOf(row)!) }}</span>
          <span v-else class="h2-words none">未建文档</span>
        </div>
        <div
          v-else-if="isVisible(row)"
          class="row h3-row"
          :style="{ paddingLeft: `${24 + (row.level - 2) * 16}px` }"
          @click="openAt(row)"
        >
          <span class="dot" :class="dotClass(row)"></span>
          <span class="h3-title">{{ row.title }}</span>
        </div>
      </template>
    </div>

    <div class="footer">
      <div class="legend">
        <span><i class="dot green"></i>已完成</span>
        <span><i class="dot orange"></i>写作中</span>
        <span><i class="dot gray"></i>未开始</span>
      </div>
      <div v-if="adding" class="add-inline">
        <select v-model="addLevel" class="level-select">
          <option :value="2">##</option>
          <option :value="3">###</option>
        </select>
        <input
          ref="addInput"
          v-model="addTitle"
          class="input add-input"
          placeholder="新节点标题，回车添加"
          @keydown.enter="submitAdd"
          @keydown.esc="adding = false"
        />
      </div>
      <button v-else class="add-btn" @click="startAdd">
        <AppIcon name="plus" :size="15" />
        添加节点
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { registry } from '../core/pluginRegistry'
import { formatWords } from '../core/storage'
import { openDocInEditor } from '../services/docService'
import { useProjectStore } from '../stores/project'
import type { OutlineNode } from '../types'

interface EditorService {
  getSelection(): { text: string; start: number; end: number; fullText: string } | null
  replaceRange(start: number, end: number, text: string): void
  insertAfter(pos: number, text: string): void
  focus(): void
}

interface Row extends OutlineNode {
  parentLine: number | null
}

const project = useProjectStore()

const rows = ref<Row[]>([])
const collapsed = ref<Set<number>>(new Set())
const adding = ref(false)
const addTitle = ref('')
const addLevel = ref(2)
const addInput = ref<HTMLInputElement | null>(null)

function parseOutline(content: string): Row[] {
  const lines = content.split('\n')
  const result: Row[] = []
  let inFence = false
  let parentLine: number | null = null
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/)
    if (!m) return
    const level = m[1].length
    const row: Row = { level, title: m[2], line: i, children: [], parentLine: null }
    if (level === 1) {
      parentLine = i
      row.parentLine = null
    } else {
      row.parentLine = parentLine
    }
    result.push(row)
  })
  return result
}

async function refresh() {
  const content = await project.readOutline()
  rows.value = parseOutline(content)
}

function isOpen(row: Row): boolean {
  return !collapsed.value.has(row.line)
}
function toggle(row: Row) {
  const next = new Set(collapsed.value)
  if (next.has(row.line)) next.delete(row.line)
  else next.add(row.line)
  collapsed.value = next
}
function isVisible(row: Row): boolean {
  if (row.level <= 2) return true
  return row.parentLine === null || !collapsed.value.has(row.parentLine)
}

/** 标题 → 章节文档：文档名去扩展名后与标题做包含匹配 */
function findDoc(row: Row) {
  const title = row.title.trim()
  if (!title) return null
  return (
    project.docs.find((d) => {
      const base = d.name.replace(/\.[^.]+$/, '').trim()
      if (!base) return false
      return title.includes(base) || base.includes(title)
    }) ?? null
  )
}

function wordCountOf(row: Row): number | null {
  return findDoc(row)?.wordCount ?? null
}

function dotClass(row: Row): string {
  const wc = wordCountOf(row)
  if (wc !== null && wc >= 2000) return 'green'
  if (wc !== null && wc > 0) return 'orange'
  return 'gray'
}

async function openAt(_row: Row) {
  await openDocInEditor(project.outlinePath)
  registry.get<EditorService>('editor')?.focus()
}

function startAdd() {
  adding.value = true
  addTitle.value = ''
  void nextTick(() => addInput.value?.focus())
}

async function submitAdd() {
  const title = addTitle.value.trim()
  if (!title) return
  const content = await project.readOutline()
  const prefix = content.trimEnd().length ? `${content.trimEnd()}\n\n` : ''
  await project.writeOutline(`${prefix}${'#'.repeat(addLevel.value)} ${title}\n`)
  adding.value = false
  await refresh()
}

onMounted(refresh)
</script>

<style scoped>
.outline-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sync-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 6px;
  padding: 8px 12px;
  background: var(--accent-soft);
  border-radius: var(--radius);
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}
.sync-banner:hover {
  background: var(--accent-soft-2);
}

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
}
.empty {
  padding: 16px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
}
.row:hover {
  background: var(--panel-2);
  color: var(--text);
}
.h1-row {
  font-weight: 600;
  color: var(--text);
}
.h1-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h2-row {
  font-weight: 600;
  color: var(--text);
}
.twisty {
  flex-shrink: 0;
  color: var(--text-3);
  display: inline-flex;
}
.h2-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.h2-words {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}
.h2-words.none {
  color: var(--text-3);
  opacity: 0.75;
}
.h3-row {
  font-size: 12px;
}
.h3-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
}
.dot.green {
  background: var(--green);
}
.dot.orange {
  background: var(--orange);
}
.dot.gray {
  background: var(--text-3);
  opacity: 0.5;
}

.footer {
  position: sticky;
  bottom: 0;
  padding: 8px 12px 10px;
  background: var(--panel);
}
.legend {
  display: flex;
  gap: 12px;
  padding: 0 2px 8px;
  font-size: 11px;
  color: var(--text-3);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend .dot {
  width: 7px;
  height: 7px;
}
.add-inline {
  display: flex;
  gap: 6px;
}
.level-select {
  width: 58px;
  padding: 7px 4px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  font-size: 12px;
  outline: none;
}
.add-input {
  flex: 1;
  font-size: 13px;
  padding: 7px 10px;
}
.add-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 13px;
  transition: all 0.15s;
}
.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
