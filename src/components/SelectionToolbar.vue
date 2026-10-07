<template>
  <Teleport to="body">
    <div
      v-if="pos"
      ref="toolbar"
      class="sel-toolbar"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @mousedown.prevent
    >
      <span class="brand">
        <AppIcon name="sparkles" :size="14" />
      </span>
      <button v-for="a in actions" :key="a.id" class="action" @click="run(a.id)">
        {{ a.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { PRESET_ACTIONS } from '../ai/presets'
import { useEditorStore } from '../stores/editor'

const emit = defineEmits<{ action: [{ actionId: string; source: 'editor' | 'viewer' }] }>()

const editor = useEditorStore()
const actions = PRESET_ACTIONS

const pos = ref<{ x: number; y: number } | null>(null)
const toolbar = ref<HTMLDivElement | null>(null)
/** 当前选区宿主：编辑区（结果可落回）或资料库阅读窗格（只读） */
let source: 'editor' | 'viewer' = 'editor'

const TOOLBAR_GAP = 10
const TOOLBAR_H = 40
const TOOLBAR_W_ESTIMATE = 430

function hostOf(node: Node | null): 'editor' | 'viewer' | null {
  // 选区锚点通常是文本节点，向上取元素再匹配宿主
  const el = node instanceof Element ? node : node?.parentElement
  if (!el) return null
  if (el.closest('[data-viewer-root]')) return 'viewer'
  if (el.closest('[data-editor-root]')) return 'editor'
  return null
}

/** 由 DOM 选区定位工具条（编辑区的精确取词/落回走 editor 桥接） */
function syncFromDomSelection() {
  const sel = window.getSelection()
  const host = sel && sel.anchorNode ? hostOf(sel.anchorNode) : null
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !host) {
    hide()
    return
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    hide()
    return
  }
  source = host
  editor.setSelSource(host)
  editor.setSelBox({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  placeAbove(rect.x, rect.y, rect.width)
}

function placeAbove(x: number, y: number, width: number) {
  const vw = window.innerWidth
  const left = Math.min(Math.max(8, x + width / 2 - TOOLBAR_W_ESTIMATE / 2), vw - TOOLBAR_W_ESTIMATE - 8)
  const top = y - TOOLBAR_H - TOOLBAR_GAP
  pos.value = { x: left, y: top >= 8 ? top : y + 24 + TOOLBAR_GAP }
}

function hide() {
  pos.value = null
  editor.setSelBox(null)
  editor.setSelSource(null)
}

/** 右键：有选区时唤起工具条（阻止默认菜单）。资料库窗格没有编辑器桥接，看 DOM 选区 */
function onContextMenu(e: MouseEvent) {
  const host = hostOf(e.target as Node)
  if (!host) return
  if (host === 'editor') {
    if (!editor.getSelection()) return
  } else if (!window.getSelection()?.toString()) {
    return
  }
  e.preventDefault()
  source = host
  editor.setSelSource(host)
  placeAbove(e.clientX - 60, e.clientY - TOOLBAR_H - 4, 120)
}

function onScroll() {
  if (pos.value) hide()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && pos.value) hide()
}

function run(actionId: string) {
  hide()
  emit('action', { actionId, source })
}

onMounted(() => {
  document.addEventListener('selectionchange', onSelChange)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('keydown', onKeydown)
})

let selRaf = 0
function onSelChange() {
  cancelAnimationFrame(selRaf)
  selRaf = requestAnimationFrame(syncFromDomSelection)
}

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelChange)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('keydown', onKeydown)
  hide()
})
</script>

<style scoped>
.sel-toolbar {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  background: #26211b;
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: #e8b04a;
}

.action {
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #d8d0c2;
  transition: all 0.12s;
  white-space: nowrap;
}
.action:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
</style>
