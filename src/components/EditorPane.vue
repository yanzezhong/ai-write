<template>
  <div class="editor-pane" data-editor-root :style="cssVars">
    <template v-if="editor.doc">
      <div v-show="editor.mode === 'wysiwyg'" ref="milkHost" class="milk-host"></div>
      <div v-show="editor.mode === 'source'" ref="cmHost" class="cm-host"></div>
    </template>
    <div v-else class="empty">
      <AppIcon name="edit" :size="30" />
      <p class="empty-title">尚未打开文档</p>
      <p class="empty-desc">从侧边栏「文档」中选择一篇，或新建文档开始写作</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import type { Ctx } from '@milkdown/ctx'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import AppIcon from './AppIcon.vue'
import { getFS, hasFS } from '../core/fs'
import { registry } from '../core/pluginRegistry'
import { useEditorStore } from '../stores/editor'
import { usePrefsStore } from '../stores/prefs'
import { useProjectStore } from '../stores/project'
import type { SelectionContext } from '../types'

// ---------- ProseMirror 类型提取（不直接依赖 @milkdown/prose 包） ----------
function viewOf(ctx: Ctx) {
  return ctx.get(editorViewCtx)
}
type PMView = ReturnType<typeof viewOf>
type PMNode = PMView['state']['doc']

const editor = useEditorStore()
const project = useProjectStore()
const prefs = usePrefsStore()

const milkHost = ref<HTMLDivElement | null>(null)
const cmHost = ref<HTMLDivElement | null>(null)

let milkEditor: Editor | null = null
let cm: EditorView | null = null
let buildToken = 0
let lastRange: { pmFrom: number; pmTo: number; start: number; end: number } | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

// ---------- 编辑器实例管理（同一时刻只保留当前模式的实例，杜绝内容串模式） ----------

async function rebuild() {
  const token = ++buildToken
  await destroyMilk()
  destroyCm()
  lastRange = null
  if (!editor.doc) {
    editor.cursor = null
    return
  }
  if (token !== buildToken) return
  if (editor.mode === 'wysiwyg') await createMilk(token)
  else createCm(token)
}

async function createMilk(token: number) {
  const host = milkHost.value
  const content = editor.doc?.content
  if (!host || content == null) return
  const instance = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host)
      ctx.set(defaultValueCtx, content)
      ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
        if (token === buildToken) onEdit(md)
      })
    })
    .use(commonmark)
    .use(listener)
  try {
    await instance.create()
  } catch (err) {
    console.error('所见即所得编辑器初始化失败', err)
    return
  }
  if (token !== buildToken) {
    void instance.destroy().catch(() => {})
    return
  }
  milkEditor = instance
  if (!editor.cursor) editor.cursor = { line: 1, col: 1 }
}

async function destroyMilk() {
  const inst = milkEditor
  milkEditor = null
  if (inst) {
    try {
      await inst.destroy()
    } catch {
      /* 已销毁 */
    }
  }
  if (milkHost.value) milkHost.value.innerHTML = ''
}

function createCm(token: number) {
  const host = cmHost.value
  const content = editor.doc?.content
  if (!host || content == null) return
  const view = new EditorView({
    state: EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.theme({
          '&': { height: '100%', fontSize: `${prefs.fontSize}px`, background: 'var(--bg)' },
          '&.cm-focused': { outline: 'none' },
          '.cm-scroller': {
            overflowY: 'auto',
            fontFamily: 'var(--font-serif)',
          },
          '.cm-content': {
            maxWidth: `${prefs.lineWidthEm}em`,
            margin: '0 auto',
            padding: '44px 48px 140px',
            lineHeight: 1.9,
            color: 'var(--text)',
            caretColor: 'var(--accent)',
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onEdit(u.state.doc.toString())
          if (u.docChanged || u.selectionSet) updateCmCursor(u.view)
        }),
      ],
    }),
    parent: host,
  })
  if (token !== buildToken) {
    view.destroy()
    return
  }
  cm = view
  updateCmCursor(view)
}

function destroyCm() {
  cm?.destroy()
  cm = null
  if (cmHost.value) cmHost.value.innerHTML = ''
}

// ---------- 内容更新 → 防抖自动保存 ----------

function onEdit(content: string) {
  if (!editor.doc || content === editor.doc.content) return
  editor.updateContent(content)
  if (prefs.autoSave) scheduleSave()
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushSave()
  }, 800)
}

async function flushSave() {
  const doc = editor.doc
  if (!doc || !editor.dirty || !hasFS()) return
  editor.saving = true
  try {
    await getFS().writeFile(doc.path, doc.content)
    editor.markSaved()
    const entry = project.docs.find((d) => d.path === doc.path)
    if (entry) entry.wordCount = doc.wordCount
  } catch (err) {
    console.error('保存失败', err)
  } finally {
    editor.saving = false
  }
}

// ---------- 光标 / 选区 ----------

function updateCmCursor(view: EditorView) {
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  editor.cursor = { line: line.number, col: head - line.from + 1 }
}

let selRaf = 0
function onDocSelectionChange() {
  if (editor.mode !== 'wysiwyg' || !milkEditor) return
  cancelAnimationFrame(selRaf)
  selRaf = requestAnimationFrame(() => {
    withView((view) => {
      const head = view.state.selection.head
      const before = view.state.doc.textBetween(0, head, '\n', ' ')
      const lines = before.split('\n')
      editor.cursor = { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 }
    })
  })
}

function withView(fn: (view: PMView) => void): void {
  const view = getView()
  if (view) fn(view)
}

function getView(): PMView | null {
  if (!milkEditor) return null
  try {
    return milkEditor.action((ctx) => ctx.get(editorViewCtx))
  } catch {
    return null
  }
}

/** 所见即所得模式下整篇文档的投影文本（段落间空行），与选区偏移同坐标系 */
function docText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n\n', ' ')
}

/** 把投影文本偏移近似映射回 ProseMirror 位置（正常路径走 lastRange，不需此函数） */
function approxPos(doc: PMNode, target: number): number {
  let acc = 0
  let prevWasBlock = false
  let fallback = 0
  let result: number | null = null
  doc.descendants((node, pos) => {
    if (result !== null) return false
    if (node.isText) {
      const len = node.text?.length ?? 0
      if (acc + len >= target) {
        result = pos + (target - acc)
        return false
      }
      acc += len
      fallback = pos + len
    } else if (node.isTextblock) {
      if (prevWasBlock) {
        acc += 2 // 段落间 '\n\n'
        if (acc >= target) {
          result = pos
          return false
        }
      }
      prevWasBlock = true
    }
    return true
  })
  return result ?? (fallback || doc.content.size)
}

// ---------- 编辑器桥接（注册到 editor store 与 ServiceRegistry，供 AI 层调用） ----------

function bridgeGetSelection(): SelectionContext | null {
  if (!editor.doc) return null
  if (editor.mode === 'source' && cm) {
    const sel = cm.state.selection.main
    if (sel.empty) return null
    lastRange = { pmFrom: sel.from, pmTo: sel.to, start: sel.from, end: sel.to }
    return {
      text: cm.state.sliceDoc(sel.from, sel.to),
      start: sel.from,
      end: sel.to,
      fullText: cm.state.doc.toString(),
    }
  }
  const view = getView()
  if (!view) return null
  const { from, to } = view.state.selection
  if (from === to) return null
  const start = view.state.doc.textBetween(0, from, '\n\n', ' ').length
  const text = view.state.doc.textBetween(from, to, '\n\n', ' ')
  lastRange = { pmFrom: from, pmTo: to, start, end: start + text.length }
  return { text, start, end: start + text.length, fullText: docText(view.state.doc) }
}

function bridgeReplaceRange(start: number, end: number, text: string) {
  if (editor.mode === 'source' && cm) {
    cm.dispatch({ changes: { from: start, to: end, insert: text } })
    return
  }
  withView((view) => {
    const r = lastRange
    if (r && r.start === start && r.end === end) {
      view.dispatch(view.state.tr.insertText(text, r.pmFrom, r.pmTo))
    } else {
      const from = approxPos(view.state.doc, start)
      const to = Math.max(from, approxPos(view.state.doc, end))
      view.dispatch(view.state.tr.insertText(text, from, to))
    }
  })
  lastRange = null
}

function bridgeInsertAfter(pos: number, text: string) {
  if (editor.mode === 'source' && cm) {
    cm.dispatch({ changes: { from: pos, to: pos, insert: text } })
    return
  }
  withView((view) => {
    const r = lastRange
    const at = r && r.end === pos ? r.pmTo : approxPos(view.state.doc, pos)
    view.dispatch(view.state.tr.insertText(text, at, at))
  })
  lastRange = null
}

function bridgeFocus() {
  if (editor.mode === 'source') cm?.focus()
  else getView()?.focus()
}

async function bridgeFlush() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await flushSave()
}

// ---------- 生命周期 ----------

onMounted(() => {
  if (!editor.doc) editor.setMode(prefs.defaultMode)
  const bridge = {
    getSelection: bridgeGetSelection,
    replaceRange: bridgeReplaceRange,
    insertAfter: bridgeInsertAfter,
    focus: bridgeFocus,
    flush: bridgeFlush,
  }
  editor.registerBridge(bridge)
  registry.register('editor', bridge)
  document.addEventListener('selectionchange', onDocSelectionChange)
  window.addEventListener('beforeunload', onBeforeUnload)
  void rebuild()
})

function onBeforeUnload() {
  void bridgeFlush()
}

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onDocSelectionChange)
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (saveTimer) clearTimeout(saveTimer)
  void bridgeFlush()
  editor.clearBridge()
  registry.unregister('editor')
  buildToken++ // 使进行中的异步构建失效
  void destroyMilk()
  destroyCm()
})

// 文档切换 / 模式切换 / 编辑器偏好变化 → 重建当前实例
watch(
  () => [editor.doc?.path ?? null, editor.mode, prefs.fontSize, prefs.lineWidth],
  () => {
    void rebuild()
  },
  { flush: 'post' },
)

const cssVars = computed(() => ({
  '--ed-font-size': `${prefs.fontSize}px`,
  '--ed-line-width': String(prefs.lineWidthEm),
  '--ed-para-gap': `${prefs.paragraphGapEm}em`,
  '--ed-heading-font': prefs.headingFontFamily,
}))
</script>

<style scoped>
.editor-pane {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.milk-host {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cm-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.cm-host :deep(.cm-editor) {
  height: 100%;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-2);
}
.empty-desc {
  font-size: 13px;
}
</style>

<style>
/* —— 所见即所得排版（全局样式，便于覆盖 milkdown 生成的节点） —— */
.milk-host .ProseMirror {
  outline: none;
  max-width: calc(var(--ed-line-width, 44) * 1em);
  margin: 0 auto;
  padding: 44px 48px 140px;
  font-family: var(--font-serif);
  font-size: var(--ed-font-size, 16px);
  line-height: 1.9;
  color: var(--text);
  caret-color: var(--accent);
  word-break: break-word;
}
.milk-host .ProseMirror > * + * {
  margin-top: var(--ed-para-gap, 1em);
}
.milk-host .ProseMirror h1,
.milk-host .ProseMirror h2,
.milk-host .ProseMirror h3,
.milk-host .ProseMirror h4 {
  font-family: var(--ed-heading-font, var(--font-serif));
  font-weight: 700;
  line-height: 1.4;
  margin-top: 1.6em;
}
.milk-host .ProseMirror > * + h1,
.milk-host .ProseMirror > * + h2,
.milk-host .ProseMirror > * + h3 {
  margin-top: 1.6em;
}
.milk-host .ProseMirror h1 {
  font-size: 1.85em;
}
.milk-host .ProseMirror h2 {
  font-size: 1.45em;
}
.milk-host .ProseMirror h3 {
  font-size: 1.2em;
}
.milk-host .ProseMirror h4 {
  font-size: 1.05em;
}
.milk-host .ProseMirror blockquote {
  margin: var(--ed-para-gap, 1em) 0;
  padding: 2px 16px;
  border-left: 3px solid var(--border-strong);
  color: var(--text-2);
}
.milk-host .ProseMirror ul,
.milk-host .ProseMirror ol {
  padding-left: 1.6em;
}
.milk-host .ProseMirror li {
  margin: 0.3em 0;
}
.milk-host .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--border-strong);
  margin: 2em auto;
  width: 30%;
}
.milk-host .ProseMirror code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--bg-deep);
  border-radius: 5px;
  padding: 2px 6px;
}
.milk-host .ProseMirror pre {
  background: #26211b;
  color: #e8e0d2;
  border-radius: 10px;
  padding: 14px 18px;
  overflow-x: auto;
}
.milk-host .ProseMirror pre code {
  background: none;
  color: inherit;
  padding: 0;
  font-size: 13px;
  line-height: 1.7;
}
.milk-host .ProseMirror img {
  max-width: 100%;
  border-radius: 8px;
}
.milk-host .ProseMirror a {
  color: var(--accent);
}
.milk-host .ProseMirror ::selection {
  background: var(--accent-soft-2);
}
</style>
