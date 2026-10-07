<template>
  <Teleport to="body">
    <div class="sum-dialog" role="dialog" aria-label="总结成 note">
      <header class="head">
        <span class="head-icon"><AppIcon name="sparkles" :size="15" /></span>
        <span class="head-title">总结成 note</span>
        <span class="head-pill">已选 {{ messages.length }} 条对话</span>
        <button class="icon-btn head-close" title="关闭" @click="emit('close')">
          <AppIcon name="close" :size="15" />
        </button>
      </header>

      <div class="carry-note">
        <AppIcon name="layers" :size="12" />
        <span>选定的对话已自动作为上下文，可在下方对总结的格式 / 方式提出要求</span>
      </div>

      <input
        v-model="instruction"
        class="input"
        placeholder="格式要求（可选），如：按时间线整理 / 提炼成设定条目"
        :disabled="running"
        @keydown.enter="run()"
      />

      <div class="result" @click="onResultClick">
        <template v-if="error"><div class="error">⚠ {{ error }}</div></template>
        <template v-else-if="result">
          <div class="md" v-html="renderMd(result)"></div>
          <span v-if="running" class="cursor">▍</span>
        </template>
        <div v-else class="result-empty">
          <template v-if="running">正在生成…</template>
          <template v-else>点「生成总结」开始，可多次追问调整</template>
        </div>
        <button v-if="running" class="stop-btn" @click="abort"><AppIcon name="stop" :size="11" /> 停止</button>
      </div>

      <footer class="foot">
        <input
          v-model="follow"
          class="input follow"
          placeholder="追问或调整结果…"
          :disabled="running || !result"
          @keydown.enter="run(follow)"
        />
        <div class="foot-actions">
          <button class="btn" :disabled="running" @click="run()">
            {{ result ? '重新生成' : '生成总结' }}
          </button>
          <button class="btn purple" :disabled="!canSave" @click="saveNote">保存为 note</button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { renderMd, handleMdClick } from '../services/md'
import { streamChat, useAIStore } from '../stores/ai'
import { useProjectStore } from '../stores/project'
import { openDocInEditor } from '../services/docService'
import type { ChatMessage } from '../types'

const props = defineProps<{ messages: ChatMessage[] }>()
const emit = defineEmits<{ close: [] }>()

const ai = useAIStore()
const project = useProjectStore()

const instruction = ref('')
const follow = ref('')
const result = ref('')
const error = ref('')
const running = ref(false)
const saved = ref(false)
let history: ChatMessage[] = []
let abortCtrl: AbortController | null = null

const canSave = computed(() => !running.value && !!result.value.trim() && !saved.value)

function onResultClick(e: MouseEvent) {
  handleMdClick(e)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  abortCtrl?.abort()
})

function buildPrompt(extra?: string): string {
  const transcript = props.messages
    .map((m) => `【${m.role === 'user' ? '我' : 'AI'}】\n${m.content}`)
    .join('\n\n')
  let p = `请把以下对话总结成一篇结构清晰的中文笔记（只输出笔记正文，用 Markdown 格式）：\n\n${transcript}`
  const ins = (extra ?? instruction.value).trim()
  if (ins) p += `\n\n总结要求：${ins}`
  return p
}

async function run(extra?: string) {
  const provider = ai.activeProvider
  if (!provider?.apiKey) {
    error.value = '请先在设置中配置 API Key'
    return
  }
  if (running.value) return
  error.value = ''
  running.value = true
  abortCtrl = new AbortController()

  const userMsg: ChatMessage = { role: 'user', content: buildPrompt(extra) }
  // 追问时保留上一轮历史；重新生成时从头来
  history = extra ? [...history, userMsg].slice(-10) : [userMsg]
  if (extra) follow.value = ''

  try {
    const full = await streamChat(provider, {
      messages: [{ role: 'system', content: '你是中文写作助手，只输出总结笔记正文，不要解释。' }, ...history],
      signal: abortCtrl.signal,
      onDelta: (text) => {
        result.value = text
      },
    })
    result.value = full
    history.push({ role: 'assistant', content: full })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('abort')) error.value = msg
  } finally {
    running.value = false
    abortCtrl = null
  }
}

function abort() {
  abortCtrl?.abort()
}

async function saveNote() {
  if (!canSave.value) return
  const fs = (await import('../core/fs')).getFS()
  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const base = instruction.value.trim() ? sanitize(instruction.value.trim()).slice(0, 20) : 'AI总结'
  const path = `notes/总结-${base}-${stamp}.md`
  const body = `${result.value.trim()}\n\n—— 由 ${props.messages.length} 段 AI 会话总结生成（${stamp}），可继续编辑；归档后转为只读资料。\n`
  await fs.writeFile(path, body)
  await project.refresh()
  await openDocInEditor(path)
  saved.value = true
  emit('close')
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '')
}
</script>

<style scoped>
.sum-dialog {
  position: fixed;
  right: 24px;
  top: 80px;
  z-index: 75;
  width: 540px;
  max-width: calc(100vw - 48px);
  max-height: min(78vh, 700px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px 18px;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--purple-soft);
  color: var(--purple);
}
.head-title {
  font-size: 15px;
  font-weight: 700;
}
.head-pill {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--purple-soft);
  color: var(--purple);
  font-size: 12px;
}
.head-close {
  margin-left: auto;
}
.carry-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.result {
  flex: 1;
  min-height: 140px;
  position: relative;
  overflow-y: auto;
  background: var(--purple-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.result-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 13px;
}
.error {
  color: var(--accent);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
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
.stop-btn {
  position: sticky;
  bottom: 0;
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
}
.md {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text);
  word-break: break-word;
}
.md :deep(p) {
  margin: 0 0 8px;
}
.foot {
  display: flex;
  gap: 10px;
  align-items: center;
}
.follow {
  flex: 1;
  min-width: 0;
}
.foot-actions {
  display: flex;
  gap: 6px;
  flex: none;
}
.foot-actions .btn {
  padding: 7px 12px;
  font-size: 13px;
}
</style>
