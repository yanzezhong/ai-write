<template>
  <div class="m-editor">
    <div ref="host" class="milk-host"></div>

    <!-- 底部格式条：七项高频操作，无二级菜单（PRD §4.2） -->
    <div class="format-bar">
      <button class="fmt" :class="{ on: markOn('strong') }" @click="run(toggleStrong)"><strong>B</strong></button>
      <button class="fmt" :class="{ on: markOn('em') }" @click="run(toggleEm)"><em>I</em></button>
      <button class="fmt" :class="{ on: nodeOn('heading') }" @click="cycleHeading">H</button>
      <button class="fmt" :class="{ on: nodeOn('blockquote') }" @click="run(toggleBlockquote)" title="引用">
        <span class="fmt-quote">”</span>
      </button>
      <button class="fmt" @click="run(toggleBulletList)" title="无序列表">•≡</button>
      <button class="fmt" @click="run(toggleOrderedList)" title="有序列表">1≡</button>
      <button class="fmt" @click="insertHr" title="分割线">―</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import type { Ctx } from '@milkdown/ctx'
import { toggleMark, setBlockType, wrapIn } from '@milkdown/prose/commands'
import { wrapInList } from '@milkdown/prose/schema-list'
import type { Command } from '@milkdown/prose/state'
import { getFS } from '../../core/fs'
const props = defineProps<{
  path: string
  initial: string
}>()

const emit = defineEmits<{ saved: [length: number] }>()

const host = ref<HTMLDivElement | null>(null)
let milk: Editor | null = null
let editorCtx: Ctx | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let currentMd = props.initial

onMounted(async () => {
  const el = host.value
  if (!el) return
  const instance = Editor.make()
    .config((ctx) => {
      editorCtx = ctx
      ctx.set(rootCtx, el)
      ctx.set(defaultValueCtx, props.initial)
      ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
        currentMd = md
        scheduleSave()
      })
    })
    .use(commonmark)
    .use(listener)
  try {
    await instance.create()
    milk = instance
  } catch (err) {
    console.error('[移动端编辑器] 初始化失败', err)
  }
})

onBeforeUnmount(async () => {
  flushSave()
  if (milk) {
    try {
      await milk.destroy()
    } catch {
      /* 已销毁 */
    }
    milk = null
  }
})

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 600)
}

function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  void getFS()
    .writeFile(props.path, currentMd)
    .then(() => emit('saved', currentMd.replace(/\s/g, '').length))
    .catch((err) => console.error('[移动端自动保存]', err))
}

/* ---------- 格式条命令 ---------- */

function withCtx(fn: (ctx: Ctx) => void): void {
  if (editorCtx) fn(editorCtx)
}

/** 取当前 ProseMirror view（editorViewCtx） */
function pmView(ctx: Ctx) {
  return ctx.get(editorViewCtx)
}

function run(cmd: Command): void {
  withCtx((ctx) => {
    const view = pmView(ctx)
    cmd(view.state, view.dispatch.bind(view))
    view.focus()
  })
}

const toggleStrong: Command = (state, dispatch) => toggleMark(state.schema.marks.strong)(state, dispatch)
const toggleEm: Command = (state, dispatch) => toggleMark(state.schema.marks.em)(state, dispatch)
const toggleBlockquote: Command = (state, dispatch) => wrapIn(state.schema.nodes.blockquote)(state, dispatch)
const toggleBulletList: Command = (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch)
const toggleOrderedList: Command = (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch)

function cycleHeading(): void {
  withCtx((ctx) => {
    const view = pmView(ctx)
    const { state, dispatch } = view
    const { $from } = state.selection
    const current = $from.parent.type === state.schema.nodes.heading ? ($from.parent.attrs.level as number) : 0
    const next = current >= 3 ? 0 : current + 1
    const ok =
      next === 0
        ? setBlockType(state.schema.nodes.paragraph)(state, dispatch)
        : setBlockType(state.schema.nodes.heading, { level: next })(state, dispatch)
    if (ok) view.focus()
  })
}

function insertHr(): void {
  withCtx((ctx) => {
    const view = pmView(ctx)
    const { state, dispatch } = view
    const hr = state.schema.nodes.hr
    if (!hr) return
    const tr = state.tr.replaceSelectionWith(hr.create())
    dispatch(tr.scrollIntoView())
    view.focus()
  })
}

/* ---------- 按钮高亮状态 ---------- */

function markOn(name: string): boolean {
  if (!editorCtx) return false
  let on = false
  withCtx((ctx) => {
    const { state } = pmView(ctx)
    const { from, to, empty } = state.selection
    if (empty) {
      on = !!state.storedMarks?.some((m) => m.type.name === name) || !!state.doc.rangeHasMark(from, from + 1, state.schema.marks[name])
    } else {
      on = state.doc.rangeHasMark(from, to, state.schema.marks[name])
    }
  })
  return on
}

function nodeOn(name: string): boolean {
  if (!editorCtx) return false
  let on = false
  withCtx((ctx) => {
    const { state } = pmView(ctx)
    on = state.selection.$from.parent.type === state.schema.nodes[name]
  })
  return on
}
</script>

<style scoped>
.m-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--card);
}

.milk-host {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

/* Milkdown 基础排版（移动端） */
.milk-host :deep(.editor) {
  outline: none;
  min-height: 100%;
  font-size: 16px;
  line-height: 1.9;
}
.milk-host :deep(h1) { font-family: var(--font-serif); font-size: 22px; margin: 18px 0 10px; }
.milk-host :deep(h2) { font-family: var(--font-serif); font-size: 20px; margin: 16px 0 8px; }
.milk-host :deep(h3) { font-family: var(--font-serif); font-size: 18px; margin: 14px 0 8px; }
.milk-host :deep(p) { margin: 0 0 12px; }
.milk-host :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 14px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
  background: var(--bg);
  border-radius: 0 8px 8px 0;
}
.milk-host :deep(hr) { border: none; border-top: 1px solid var(--line); margin: 18px 0; }
.milk-host :deep(ul), .milk-host :deep(ol) { margin: 0 0 12px; padding-left: 22px; }
.milk-host :deep(code) {
  background: var(--bg-deep);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.9em;
}

.format-bar {
  flex: none;
  display: flex;
  justify-content: space-around;
  gap: 2px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: var(--bg);
}
.fmt {
  min-width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 15px;
  color: var(--ink);
}
.fmt.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.fmt-quote {
  font-size: 24px;
  font-family: var(--font-serif);
  line-height: 1;
}
</style>
