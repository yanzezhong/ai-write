<template>
  <div class="chat-app">
    <div class="head-row">
      <input
        v-if="session"
        v-model="session.title"
        class="title-input"
        @change="ai.saveSession(session)"
      />
      <span v-else class="title-placeholder">AI 聊天</span>
      <div class="head-actions">
        <button class="icon-btn" title="多选对话，总结成 note" @click="selectMode = !selectMode; clearSel()">
          <AppIcon name="layers" :size="16" />
        </button>
        <button class="icon-btn" title="历史会话" @click="historyOpen = !historyOpen">
          <AppIcon name="history" :size="16" />
        </button>
        <button class="icon-btn" title="新建会话" @click="ai.newSession(); historyOpen = false">
          <AppIcon name="plus" :size="16" />
        </button>
        <button v-if="!embedded" class="icon-btn" title="切换为浮动窗口" @click="layout.floatChat()">
          <AppIcon name="move" :size="16" />
        </button>
      </div>
    </div>

    <!-- 多选总结操作条 -->
    <div v-if="selectMode" class="sel-bar">
      <span>已选 {{ selected.size }} 条消息</span>
      <span class="sel-actions">
        <button class="btn ghost" @click="clearSel()">清空</button>
        <button class="btn purple" :disabled="!selected.size" @click="openSummarize">总结成 note</button>
        <button class="btn ghost" @click="selectMode = false; clearSel()">退出多选</button>
      </span>
    </div>

    <div v-if="historyOpen" class="history-panel">
      <div v-if="!ai.sessions.length" class="history-empty">暂无历史会话</div>
      <div
        v-for="s in ai.sessions"
        :key="s.id"
        class="history-item"
        :class="{ active: s.id === ai.currentSessionId }"
        @click="ai.switchSession(s.id); historyOpen = false"
      >
        <span class="history-title">{{ s.title }}</span>
        <button
          class="icon-btn history-del"
          title="删除"
          @click.stop="ai.deleteSession(s.id)"
        >
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
    </div>

    <div class="ctx-block">
      <div class="ctx-title">携带上下文</div>
      <div class="ctx-options">
        <label class="ctx-check">
          <input type="checkbox" v-model="ai.ctx.currentDoc" :disabled="!editor.doc" />
          <span>当前文档{{ editor.doc ? `（${editor.doc.name}）` : '' }}</span>
        </label>
        <label class="ctx-check">
          <input type="checkbox" v-model="ai.ctx.outline" />
          <span>剧情大纲</span>
        </label>
        <label class="ctx-check">
          <input type="checkbox" v-model="ai.ctx.characters" />
          <span>人物库</span>
        </label>
        <label class="ctx-check">
          <input type="checkbox" v-model="ai.ctx.libraryDocs" :disabled="!viewer.tabs.length" />
          <span>当前打开的资料{{ viewer.tabs.length ? `（${viewer.tabs.length} 份）` : '' }}</span>
        </label>
        <button class="ctx-more" @click="docsPanelOpen = !docsPanelOpen">
          其他指定文档…
          <AppIcon name="chevron-down" :size="12" />
        </button>
      </div>
      <div v-if="docsPanelOpen" class="docs-panel">
        <div v-if="!project.docs.length" class="docs-empty">项目中暂无文档</div>
        <label v-for="d in project.docs" :key="d.path" class="doc-check">
          <input
            type="checkbox"
            :checked="ai.ctx.extraDocs.includes(d.path)"
            @change="toggleExtraDoc(d.path)"
          />
          <span>{{ d.path }}</span>
        </label>
      </div>
    </div>

    <div ref="msgList" class="messages">
      <div v-if="!session || !session.messages.length" class="msg-empty">
        <AppIcon name="sparkles" :size="28" />
        <p>开始对话，AI 会结合你勾选的项目上下文作答</p>
      </div>
      <div
        v-for="(msg, idx) in session?.messages ?? []"
        :key="idx"
        class="msg"
        :class="[msg.role, { selecting: selectMode }]"
        @click="selectMode && toggleSelect(idx)"
      >
        <label v-if="selectMode" class="sel-check" @click.stop>
          <input type="checkbox" :checked="selected.has(idx)" @change="toggleSelect(idx)" />
        </label>
        <div v-if="msg.role === 'assistant'" class="bot-avatar">
          <AppIcon name="sparkles" :size="14" />
        </div>
        <div class="bubble">
          <div
            class="md"
            :class="{ streaming: msg.streaming }"
            v-html="renderMd(msg.content)"
            @click="onMdClick"
          ></div>
          <span v-if="msg.streaming" class="cursor">▍</span>
          <div v-if="msg.role === 'assistant' && !msg.streaming" class="msg-actions">
            <button class="mini-btn" title="复制全文" @click="copyText(msg.content)">
              <AppIcon name="copy" :size="13" />
            </button>
            <button class="mini-btn" title="重新生成" @click="regenerate(idx)">
              <AppIcon name="refresh" :size="13" />
            </button>
            <button class="mini-btn" title="插入到文档末尾" @click="insertToDoc(msg.content)">
              <AppIcon name="file" :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="provider && !provider.apiKey" class="key-warning">
      请先在设置中配置 API Key
    </div>

    <div class="input-area">
      <textarea
        ref="textarea"
        v-model="input"
        class="chat-input"
        rows="1"
        placeholder="继续追问，或描述你要的改动…（支持 Markdown）"
        :disabled="selectMode"
        @input="autogrow"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button
        v-if="ai.generating"
        class="send-btn stop"
        title="停止生成"
        @click="abort"
      >
        <AppIcon name="stop" :size="16" />
      </button>
      <button v-else class="send-btn" title="发送" :disabled="!input.trim() || selectMode" @click="send">
        <AppIcon name="send" :size="16" />
      </button>
    </div>

    <SummarizeDialog v-if="summarizeOpen" :messages="summarizeMessages" @close="summarizeOpen = false" />
  </div>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import SummarizeDialog from '../components/SummarizeDialog.vue'
import { buildUserMessage } from '../ai/context'
import { registry } from '../core/pluginRegistry'
import { streamChat, useAIStore } from '../stores/ai'
import { useEditorStore } from '../stores/editor'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'
import type { ChatMessage, SelectionContext } from '../types'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

interface EditorService {
  getSelection(): SelectionContext | null
  replaceRange(start: number, end: number, text: string): void
  insertAfter(pos: number, text: string): void
  focus(): void
}

const ai = useAIStore()
const editor = useEditorStore()
const project = useProjectStore()
const layout = useLayoutStore()
const viewer = useViewerStore()

const input = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const msgList = ref<HTMLDivElement | null>(null)
const historyOpen = ref(false)
const docsPanelOpen = ref(false)
const abortCtrl = ref<AbortController | null>(null)
/** 多选总结 */
const selectMode = ref(false)
const selected = ref<Set<number>>(new Set())
const summarizeOpen = ref(false)
const summarizeMessages = ref<ChatMessage[]>([])

function toggleSelect(idx: number) {
  const s = new Set(selected.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  selected.value = s
}

function clearSel() {
  selected.value = new Set()
}

function openSummarize() {
  const msgs = session.value?.messages ?? []
  summarizeMessages.value = [...selected.value].sort((a, b) => a - b).map((i) => msgs[i]).filter(Boolean)
  if (!summarizeMessages.value.length) return
  summarizeOpen.value = true
  selectMode.value = false
  clearSel()
}

const session = computed(() => ai.currentSession)
const provider = computed(() => ai.activeProvider)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code: string): string {
    const escaped = md.utils.escapeHtml(code)
    const encoded = encodeURIComponent(code)
    return `<div class="code-block"><button class="code-copy" data-code="${encoded}">复制</button><pre><code>${escaped}</code></pre></div>`
  },
})

function renderMd(content: string): string {
  return md.render(content || ' ')
}

function scrollBottom() {
  void nextTick(() => {
    const el = msgList.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function autogrow() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function toggleExtraDoc(path: string) {
  const list = ai.ctx.extraDocs
  const i = list.indexOf(path)
  if (i >= 0) list.splice(i, 1)
  else list.push(path)
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {})
}

function onMdClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.code-copy') as HTMLElement | null
  if (!btn) return
  const code = decodeURIComponent(btn.dataset.code ?? '')
  void navigator.clipboard.writeText(code).catch(() => {})
  btn.textContent = '已复制'
  setTimeout(() => (btn.textContent = '复制'), 1200)
}

function insertToDoc(content: string) {
  const svc = registry.get<EditorService>('editor')
  if (!svc) return
  const sel = svc.getSelection()
  const pos = sel ? sel.end : (editor.doc?.content.length ?? 0)
  svc.insertAfter(pos, `\n\n${content}`)
  svc.focus()
}

async function send() {
  const text = input.value.trim()
  if (!text || ai.generating) return
  let s = session.value
  if (!s) s = ai.newSession()
  input.value = ''
  autogrow()
  ai.addMessage(s, { role: 'user', content: text })
  ai.addMessage(s, { role: 'assistant', content: '', streaming: true })
  scrollBottom()
  await runStream(s.id, text)
}

async function regenerate(assistantIdx: number) {
  const s = session.value
  if (!s || ai.generating) return
  const prevUser = s.messages.slice(0, assistantIdx).reverse().find((m) => m.role === 'user')
  if (!prevUser) return
  s.messages.splice(assistantIdx)
  ai.saveSession(s)
  ai.addMessage(s, { role: 'assistant', content: '', streaming: true })
  scrollBottom()
  await runStream(s.id, prevUser.content)
}

async function runStream(sessionId: string, latestInput: string) {
  const p = provider.value
  const s = ai.sessions.find((x) => x.id === sessionId)
  if (!p || !s) return
  ai.generating = true
  abortCtrl.value = new AbortController()
  try {
    const history = s.messages.slice(-20)
    const withCtx = await buildUserMessage(latestInput)
    const full = await streamChat(p, {
      messages: [...history, ...withCtx],
      signal: abortCtrl.value.signal,
      onDelta: () => scrollBottom(),
    })
    const cur = ai.sessions.find((x) => x.id === sessionId)
    if (cur) ai.updateLastMessage(cur, { content: full, streaming: false })
  } catch (err) {
    const cur = ai.sessions.find((x) => x.id === sessionId)
    if (cur) {
      const message = err instanceof Error ? err.message : String(err)
      ai.updateLastMessage(cur, {
        content: message.includes('abort') ? '' : `⚠ ${message}`,
        streaming: false,
      })
    }
  } finally {
    ai.generating = false
    abortCtrl.value = null
    scrollBottom()
  }
}

function abort() {
  abortCtrl.value?.abort()
}

onMounted(() => {
  void ai.loadSessions()
})
</script>

<style scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.title-placeholder {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-3);
}
.head-actions {
  display: flex;
  gap: 2px;
}

.history-panel {
  position: absolute;
  top: 44px;
  right: 10px;
  width: 220px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 20;
  padding: 6px;
}
.history-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
}
.history-item:hover {
  background: var(--panel-2);
}
.history-item.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.history-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-del {
  width: 24px;
  height: 24px;
  opacity: 0;
}
.history-item:hover .history-del {
  opacity: 1;
}
.history-del:hover {
  color: var(--accent);
}

.ctx-block {
  margin: 8px 12px 0;
  padding: 8px 10px;
  background: var(--purple-soft);
  border-radius: var(--radius);
}
.ctx-title {
  font-size: 12px;
  color: var(--purple);
  font-weight: 600;
  margin-bottom: 6px;
}
.ctx-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.ctx-check,
.doc-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.ctx-check input,
.doc-check input {
  accent-color: var(--purple);
}
.ctx-more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--purple);
}
.ctx-more:hover {
  text-decoration: underline;
}
.docs-panel {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(111, 91, 216, 0.2);
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 140px;
  overflow-y: auto;
}
.docs-empty {
  font-size: 12px;
  color: var(--text-3);
}
.doc-check span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.msg-empty {
  margin: auto;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.msg {
  display: flex;
  gap: 8px;
  max-width: 100%;
}
.msg.user {
  justify-content: flex-end;
}
.bot-avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--purple);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}
.bubble {
  max-width: 85%;
  min-width: 0;
  position: relative;
}
.msg.user .bubble {
  background: var(--accent-soft-2);
  border-radius: 12px 12px 4px 12px;
  padding: 9px 12px;
}
.msg.assistant .bubble {
  background: var(--purple-soft);
  border-radius: 12px 12px 12px 4px;
  padding: 9px 12px;
}

.cursor {
  display: inline-block;
  color: var(--purple);
  animation: blink 0.9s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

.msg-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px solid rgba(111, 91, 216, 0.15);
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-3);
}
.mini-btn:hover {
  background: rgba(111, 91, 216, 0.12);
  color: var(--purple);
}

.key-warning {
  margin: 8px 12px 0;
  padding: 7px 10px;
  background: #fdf3dd;
  border: 1px solid #ecd9a0;
  border-radius: var(--radius);
  font-size: 12px;
  color: #9a7418;
}

.input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: var(--panel);
}
.chat-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel-2);
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  max-height: 160px;
}
.chat-input:focus {
  border-color: var(--purple);
}
.chat-input::placeholder {
  color: var(--text-3);
}
.send-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--purple);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.15s;
}
.send-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.send-btn.stop {
  background: var(--accent);
}

.md {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text);
  word-break: break-word;
}
.md :deep(p) {
  margin: 0 0 6px;
}
.md :deep(p:last-child) {
  margin-bottom: 0;
}
.md :deep(pre) {
  margin: 6px 0;
  padding: 10px 12px;
  background: #26211b;
  color: #e8e0d2;
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}
.md :deep(.code-block) {
  position: relative;
  margin: 6px 0;
}
.md :deep(.code-block pre) {
  margin: 0;
}
.md :deep(.code-copy) {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.12);
  color: #cfc6b4;
  cursor: pointer;
}
.md :deep(.code-copy:hover) {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}
.md :deep(code) {
  font-family: var(--font-mono);
}
.md :deep(a) {
  color: var(--purple);
}
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.md :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--purple);
  color: var(--text-2);
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  font-size: 14px;
  margin: 8px 0 4px;
}

/* ---------- 多选总结 ---------- */

.sel-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: var(--purple-soft);
  color: var(--purple);
  font-size: 12.5px;
  font-weight: 600;
}
.sel-actions {
  display: inline-flex;
  gap: 6px;
}
.sel-actions .btn {
  padding: 4px 10px;
  font-size: 12px;
}
.msg.selecting {
  cursor: pointer;
  border-radius: 8px;
  padding: 2px 4px;
}
.msg.selecting:hover {
  background: var(--purple-soft);
}
.sel-check {
  flex: none;
  display: inline-flex;
  align-items: flex-start;
  padding-top: 6px;
}
.sel-check input {
  accent-color: var(--purple);
}
</style>
