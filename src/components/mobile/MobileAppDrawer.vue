<template>
  <Teleport to="body">
    <div class="mask" @click.self="emit('close')">
      <div class="drawer" role="dialog" aria-label="应用抽屉">
        <div class="grabber"></div>
        <nav class="tabs">
          <button v-for="t in tabs" :key="t.id" class="tab" :class="{ active: tab === t.id }" @click="switchTab(t.id)">
            {{ t.label }}
          </button>
        </nav>

        <!-- 文档：切换当前文档 -->
        <div v-if="tab === 'docs'" class="pane">
          <button
            v-for="d in project.docs"
            :key="d.path"
            class="doc-row"
            :class="{ current: d.path === currentPath }"
            @click="pickDoc(d)"
          >
            <AppIcon name="doc" :size="16" />
            <span class="doc-name">{{ d.name }}</span>
            <span v-if="d.path === currentPath" class="doc-here">当前</span>
            <span v-else class="doc-meta">{{ formatWords(d.wordCount) }}</span>
          </button>
          <p v-if="!project.docs.length" class="empty">项目中还没有文档</p>
        </div>

        <!-- 大纲：只读 -->
        <div v-else-if="tab === 'outline'" class="pane readonly">
          <div v-if="outlineText" class="md" v-html="renderMd(outlineText)"></div>
          <p v-else class="empty">还没有大纲（outline.md）</p>
        </div>

        <!-- 人物：只读卡片 -->
        <div v-else-if="tab === 'people'" class="pane">
          <p v-if="!project.characters.length" class="empty">还没有人物卡片</p>
          <article v-for="c in project.characters" :key="c.filePath" class="p-card">
            <div class="p-head">
              <span class="p-avatar">{{ c.name.slice(0, 1) }}</span>
              <strong>{{ c.name }}</strong>
              <span class="pill">{{ c.role }}</span>
            </div>
            <p v-if="c.identity" class="p-identity">{{ c.identity }}</p>
            <div v-if="c.tags.length" class="p-tags">
              <span v-for="t in c.tags" :key="t" class="tag">{{ t }}</span>
            </div>
            <p class="p-desc">{{ c.description }}</p>
          </article>
        </div>

        <!-- AI 聊天：围绕当前文档 -->
        <div v-else class="pane chat-pane">
          <div ref="msgsEl" class="chat-msgs">
            <div v-for="(m, i) in chat" :key="i" class="msg" :class="m.role">
              <div class="bubble">{{ m.content }}</div>
            </div>
            <div v-if="chatGen" class="msg assistant">
              <div class="bubble typing">AI 正在回复…</div>
            </div>
            <p v-if="chatError" class="chat-err">⚠ {{ chatError }}</p>
            <p v-if="!chat.length && !chatGen" class="chat-hint">
              围绕《{{ docName }}》向 AI 提问，例如「这一章的节奏怎么样？」
            </p>
          </div>
          <div class="chat-input">
            <input
              v-model="chatInput"
              class="input"
              placeholder="向 AI 提问…"
              :disabled="chatGen"
              @keydown.enter="sendChat"
            />
            <button class="send" :disabled="chatGen || !chatInput.trim()" aria-label="发送" @click="sendChat">➤</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import { getFS } from '../../core/fs'
import { formatWords } from '../../core/storage'
import { renderMd } from '../../services/md'
import { streamChat, useAIStore } from '../../stores/ai'
import { useProjectStore } from '../../stores/project'
import type { DocEntry } from '../../types'

const props = defineProps<{
  currentPath: string
  outlineText: string
  initialTab?: string
}>()
const emit = defineEmits<{ close: []; 'switch-doc': [d: DocEntry] }>()

const project = useProjectStore()
const ai = useAIStore()

const tabs = [
  { id: 'docs', label: '文档' },
  { id: 'outline', label: '大纲' },
  { id: 'people', label: '人物' },
  { id: 'chat', label: 'AI 聊天' },
] as const
type TabId = (typeof tabs)[number]['id']
const tab = ref<TabId>(
  props.initialTab && tabs.some((t) => t.id === props.initialTab) ? (props.initialTab as TabId) : 'docs',
)

const chat = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const chatInput = ref('')
const chatGen = ref(false)
const chatError = ref('')
const msgsEl = ref<HTMLDivElement | null>(null)
let docText = ''
let abort: AbortController | null = null

const docName = props.currentPath.split('/').pop() ?? props.currentPath

function switchTab(t: TabId) {
  tab.value = t
  if (t === 'chat') void loadDocText()
}

async function loadDocText() {
  if (docText) return
  docText = await getFS().readFile(props.currentPath).catch(() => '')
}

async function pickDoc(d: DocEntry) {
  if (d.path === props.currentPath) {
    emit('close')
    return
  }
  emit('switch-doc', d)
}

async function sendChat() {
  const q = chatInput.value.trim()
  if (!q || chatGen.value) return
  chatInput.value = ''
  chatError.value = ''
  await loadDocText()
  const provider = ai.activeProvider
  if (!provider?.apiKey) {
    chatError.value = '请先在设置中配置 API Key'
    return
  }
  chat.value.push({ role: 'user', content: q })
  scrollBottom()
  chatGen.value = true
  abort = new AbortController()
  let acc = ''
  try {
    await streamChat(provider, {
      messages: [
        {
          role: 'system',
          content: `你是驻场在写作项目《${project.projectName}》里的写作助手。当前文档为《${docName}》，全文如下：\n\n${docText.slice(0, 8000)}\n\n请基于文档内容回答作者的问题，回答使用中文。`,
        },
        ...chat.value.map((m) => ({ role: m.role, content: m.content })),
      ],
      signal: abort.signal,
      onDelta: (full) => {
        acc = full
      },
    })
    chat.value.push({ role: 'assistant', content: acc || '（空回复）' })
  } catch (err) {
    if (!abort.signal.aborted) chatError.value = err instanceof Error ? err.message : String(err)
  } finally {
    chatGen.value = false
    scrollBottom()
  }
}

function scrollBottom() {
  void nextTick(() => {
    const el = msgsEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

onMounted(() => {
  void project.refresh()
})

watch(tab, (t) => {
  if (t === 'chat') scrollBottom()
})
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 80;
}
.drawer {
  width: 100%;
  max-width: 560px;
  height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: 18px 18px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.grabber {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-strong);
  margin: 8px auto 4px;
}
.tabs {
  flex: none;
  display: flex;
  gap: 6px;
  padding: 4px 14px 10px;
  border-bottom: 1px solid var(--border);
}
.tab {
  flex: 1;
  min-height: 44px;
  border-radius: 999px;
  font-size: 13.5px;
  color: var(--text-2);
  background: var(--panel-2);
}
.tab.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
  padding: 30px 0;
}

.doc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 14px;
  text-align: left;
  color: var(--text);
}
.doc-row.current {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.doc-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-here {
  font-size: 11px;
  color: var(--accent);
  flex: none;
}
.doc-meta {
  font-size: 12px;
  color: var(--text-3);
  flex: none;
}

.readonly {
  line-height: 1.8;
}

.p-card {
  padding: 12px 14px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
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
.pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}
.p-identity {
  margin: 6px 0 2px;
  font-size: 13px;
  color: var(--text-2);
}
.p-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}
.tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-2);
}
.p-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* ---------- AI 聊天 ---------- */
.chat-pane {
  gap: 10px;
}
.chat-msgs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  display: flex;
}
.msg.user {
  justify-content: flex-end;
}
.bubble {
  max-width: 88%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.assistant .bubble {
  background: var(--purple-soft);
  border-radius: 12px 12px 12px 4px;
}
.msg.user .bubble {
  background: var(--accent-soft-2);
  border-radius: 12px 12px 4px 12px;
}
.typing {
  color: var(--purple);
}
.chat-err {
  color: var(--accent);
  font-size: 12.5px;
}
.chat-hint {
  margin: auto;
  max-width: 260px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.8;
}
.chat-input {
  flex: none;
  display: flex;
  gap: 8px;
}
.chat-input .input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  border-radius: 999px;
  padding: 0 16px;
}
.send {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  background: var(--purple);
  color: #fff;
  font-size: 16px;
}
.send:disabled {
  opacity: 0.4;
}
</style>
