<template>
  <div class="m-editor">
    <div ref="host" class="milk-host"></div>

    <!-- 选中文字浮动 AI 工具条（M4） -->
    <Teleport to="body">
      <div v-if="sel && !sheet" class="sel-bar" :style="{ top: selPos.top + 'px', left: selPos.left + 'px' }">
        <button class="sel-act" @click="openSheet('imitate')">仿写</button>
        <button class="sel-act" @click="openSheet('continue')">续写</button>
        <button class="sel-act" @click="openSheet('polish')">润色</button>
        <button class="sel-act" @click="openSheet('expand')">扩写</button>
        <button class="sel-act" @click="openSheet('shorten')">缩写</button>
        <button class="sel-act" @click="openSheet('more')">⋯</button>
      </div>

      <!-- AI 操作半屏 Sheet（M5） -->
      <div v-if="sheet" class="mask" @click.self="tryCloseSheet">
        <div class="sheet" :class="{ full: sheetFull }">
          <div class="sheet-head">
            <strong>{{ sheetTitle }}</strong>
            <span class="sheet-grow"></span>
            <button class="icon-btn" @click="tryCloseSheet"><AppIcon name="close" :size="16" /></button>
          </div>

          <!-- 上半部：选中文本摘要 + 动作说明 -->
          <div class="sheet-src">
            <p class="sheet-src-label">选中原文</p>
            <p class="sheet-src-text">{{ sel?.text.slice(0, 120) }}{{ (sel?.text.length ?? 0) > 120 ? '…' : '' }}</p>
          </div>

          <!-- 中部：流式输出 -->
          <div class="sheet-out" :class="{ full: sheetFull }">
            <div v-if="!sheetOut && generating" class="sheet-wait">AI 正在生成…</div>
            <div v-else-if="!sheetOut && sheetError" class="sheet-err">⚠ {{ sheetError }}</div>
            <div v-else class="md" v-html="renderMd(sheetOut || '（结果将在这里显示）')"></div>
          </div>

          <!-- 停止 / 重新生成 -->
          <div v-if="generating || sheetOut" class="sheet-ctrl">
            <button v-if="generating" class="btn ghost" @click="stopGen">■ 停止</button>
            <button v-else class="btn ghost" @click="regen">↻ 重新生成</button>
            <button v-if="sheetOut" class="btn ghost" @click="sheetFull = !sheetFull">
              {{ sheetFull ? '半屏' : '全屏' }}
            </button>
          </div>

          <!-- 追问 -->
          <div class="sheet-follow">
            <input
              v-model="followUp"
              class="input"
              placeholder="继续提要求，如：把对话再压缩一半"
              :disabled="generating || !sheetOut"
              @keydown.enter="sendFollowUp"
            />
            <button class="btn" :disabled="generating || !sheetOut || !followUp.trim()" @click="sendFollowUp">
              发送
            </button>
          </div>

          <!-- 底部：结果落回（M5 三选一） -->
          <div class="sheet-apply">
            <button class="btn apply" :disabled="!sheetOut" @click="applyResult('replace')">替换原文</button>
            <button class="btn apply" :disabled="!sheetOut" @click="applyResult('append')">插入其后</button>
            <button class="btn apply ghost" :disabled="!sheetOut" @click="applyResult('copy')">仅复制</button>
          </div>
        </div>
      </div>
    </Teleport>

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
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx, parserCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import type { Ctx } from '@milkdown/ctx'
import { toggleMark, setBlockType, wrapIn } from '@milkdown/prose/commands'
import { wrapInList } from '@milkdown/prose/schema-list'
import type { Command } from '@milkdown/prose/state'
import AppIcon from '../AppIcon.vue'
import { getPreset } from '../../ai/presets'
import { getFS } from '../../core/fs'
import { renderMd } from '../../services/md'
import { streamChat, useAIStore } from '../../stores/ai'

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
const ai = useAIStore()

/* ---------- 编辑器实例 ---------- */

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
  // 选中态监听：鼠标/触摸/键盘选择后更新浮动工具条
  document.addEventListener('selectionchange', onSelectionChange)
  el.addEventListener('touchend', onSelectionChange)
  el.addEventListener('mouseup', onSelectionChange)
})

onBeforeUnmount(async () => {
  flushSave()
  document.removeEventListener('selectionchange', onSelectionChange)
  if (host.value) {
    host.value.removeEventListener('touchend', onSelectionChange)
    host.value.removeEventListener('mouseup', onSelectionChange)
  }
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

/* ---------- 选中文字 → 浮动工具条（M4） ---------- */

const sel = ref<{ from: number; to: number; text: string } | null>(null)
const selPos = reactive({ top: 0, left: 0 })

function onSelectionChange(): void {
  // 等 selectionchange 后 DOM 再取一次
  setTimeout(readSelection, 0)
}

function readSelection(): void {
  if (!editorCtx || sheet.value) return
  withCtx((ctx) => {
    const view = pmView(ctx)
    const { state } = view
    const { from, to, empty } = state.selection
    if (empty) {
      sel.value = null
      return
    }
    const text = state.doc.textBetween(from, to, '\n')
    if (!text.trim()) {
      sel.value = null
      return
    }
    sel.value = { from, to, text }
    // 工具条定位在选区上方
    try {
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      selPos.top = Math.max(8, start.top - 46)
      selPos.left = Math.min(Math.max(8, (start.left + end.left) / 2 - 150), window.innerWidth - 308)
    } catch {
      selPos.top = 80
      selPos.left = 8
    }
  })
}

/* ---------- AI 半屏 Sheet（M5） ---------- */

type SheetMode = 'action' | 'more'

const sheet = ref<SheetMode | null>(null)
const sheetAction = ref('')
const sheetFull = ref(false)
const sheetOut = ref('')
const sheetError = ref('')
const followUp = ref('')
const generating = ref(false)
let abortCtrl: AbortController | null = null
let lastPrompt = ''

const sheetTitle = computed(() => {
  if (!sheet.value) return ''
  if (sheet.value === 'more') return '更多 AI 操作'
  return getPreset(sheetAction.value).label
})

function openSheet(action: string): void {
  if (!sel.value) return
  if (action === 'more') {
    sheet.value = 'more'
    // 「更多」直接列出翻译/自定义入口
    sheetAction.value = 'translate'
    void startGen(getPreset('translate').buildPrompt(sel.value.text))
    return
  }
  sheet.value = 'action'
  sheetAction.value = action
  void startGen(getPreset(action).buildPrompt(sel.value.text))
}

async function startGen(prompt: string): Promise<void> {
  const provider = ai.activeProvider
  if (!provider?.apiKey) {
    sheetError.value = '请先到「设置 → AI 供应商」填写 API Key'
    return
  }
  abortCtrl?.abort()
  abortCtrl = new AbortController()
  generating.value = true
  sheetError.value = ''
  sheetOut.value = ''
  lastPrompt = prompt
  try {
    await streamChat(provider, {
      messages: [{ role: 'user', content: prompt }],
      signal: abortCtrl.signal,
      onDelta: (full) => {
        sheetOut.value = full
      },
    })
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      sheetError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    generating.value = false
  }
}

function stopGen(): void {
  abortCtrl?.abort()
  generating.value = false
}

function regen(): void {
  if (lastPrompt) void startGen(lastPrompt)
}

function sendFollowUp(): void {
  const op = followUp.value.trim()
  if (!op || !sel.value || generating.value) return
  followUp.value = ''
  const prompt = `${op}\n\n——以下是你当前生成的版本，请在此基础上调整，只输出调整后的完整文字：\n\n${sheetOut.value}`
  void startGen(prompt)
}

/** 结果未落回时关闭需二次确认（PRD M5） */
function tryCloseSheet(): void {
  if (sheetOut.value && !window.confirm('放弃当前 AI 结果？')) return
  closeSheet()
}

function closeSheet(): void {
  abortCtrl?.abort()
  sheet.value = null
  sheetOut.value = ''
  sheetError.value = ''
  followUp.value = ''
  sheetFull.value = false
  readSelection()
}

/** 把 Markdown 结果写回编辑器：replace=替换选区 / append=插到选区之后 */
function applyResult(mode: 'replace' | 'append' | 'copy'): void {
  const result = sheetOut.value.trim()
  if (!result) return
  if (mode === 'copy') {
    void navigator.clipboard?.writeText(result)
    closeSheet()
    return
  }
  withCtx((ctx) => {
    const view = pmView(ctx)
    const { state, dispatch } = view
    let from = sel?.value?.from ?? state.selection.from
    let to = sel?.value?.to ?? state.selection.to
    if (mode === 'append') {
      from = to
    }
    try {
      const parse = ctx.get(parserCtx)
      const node = parse(result)
      const tr = state.tr.replace(from, to, node.slice(0)).scrollIntoView()
      dispatch(tr)
      view.focus()
      closeSheet()
    } catch (err) {
      console.error('[AI 结果写回]', err)
      sheetError.value = '结果写回失败，可改用「仅复制」后手动粘贴'
    }
  })
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

/* ---------- 选中文字浮动工具条（M4） ---------- */
.sel-bar {
  position: fixed;
  z-index: 60;
  display: flex;
  background: #2a2622;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.sel-act {
  min-width: 48px;
  min-height: 36px;
  border: none;
  background: transparent;
  color: #f5f0e8;
  font-size: 14px;
  border-radius: 7px;
}
.sel-act:active {
  background: rgba(255, 255, 255, 0.15);
}

/* ---------- AI 半屏 Sheet（M5） ---------- */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 70;
}
.sheet {
  width: 100%;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-radius: 16px 16px 0 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
}
.sheet.full {
  max-height: 94vh;
  height: 94vh;
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet-grow {
  flex: 1;
}
.sheet-src {
  margin: 10px 0;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: 10px;
}
.sheet-src-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--muted);
}
.sheet-src-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sheet-out {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 4px 2px;
  font-size: 15px;
  line-height: 1.8;
}
.sheet-wait {
  color: var(--muted);
  font-size: 14px;
}
.sheet-err {
  color: #c0392b;
  font-size: 13px;
}
.sheet-ctrl {
  display: flex;
  gap: 8px;
  padding: 8px 0;
}
.sheet-follow {
  display: flex;
  gap: 8px;
  padding: 6px 0;
}
.sheet-follow .input {
  flex: 1;
}
.sheet-apply {
  display: flex;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.apply {
  flex: 1;
  min-height: 46px;
}
</style>
