<template>
  <Teleport to="body">
    <div class="ai-dialog" role="dialog" aria-label="AI 助手">
      <header class="head">
        <span class="head-icon"><AppIcon name="sparkles" :size="16" /></span>
        <span class="head-title">AI 助手</span>
        <span v-if="activeAction" class="action-pill">{{ getPreset(activeAction).label }}</span>
        <button class="icon-btn head-close" title="关闭" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </header>

      <div class="carry-note">
        <AppIcon name="layers" :size="13" />
        <span>
          已自动携带：选中段落及其前后文（{{ selectedWords }} 字）
          <template v-if="readOnly"> · 来源：资料库（只读）</template>
        </span>
      </div>

      <div class="chips">
        <button
          v-for="a in actions"
          :key="a.id"
          class="chip"
          :class="{ active: activeAction === a.id }"
          :disabled="running"
          @click="onChipClick(a.id)"
        >
          {{ a.label }}
        </button>
      </div>

      <textarea
        v-if="activeAction === 'imitate'"
        v-model="reference"
        class="input reference"
        rows="3"
        placeholder="粘贴要模仿的参考段落（比如另一篇文章的段落）。将模仿它的文风，结合选中段的情节另写一段；留空则以选中段本身为仿写对象"
        :disabled="running"
      ></textarea>
      <button
        v-if="activeAction === 'imitate'"
        class="btn purple gen-btn"
        :disabled="running"
        @click="run('imitate')"
      >
        生成
      </button>

      <input
        v-model="instruction"
        class="input instruction"
        :placeholder="activeAction === 'custom' ? '输入你的指令，如：改成第一人称视角' : '补充要求（可选），如：让语气更冷峻、多用短句'"
        :disabled="running"
        @keydown.enter="rerunWithInstruction"
      />

      <div class="result" @click="onResultClick">
        <template v-if="error">
          <div class="error">⚠ {{ error }}</div>
        </template>
        <template v-else-if="result">
          <div class="md" v-html="renderMd(result)"></div>
          <span v-if="running" class="cursor">▍</span>
        </template>
        <div v-else class="result-empty">
          <template v-if="running">正在生成…</template>
          <template v-else>选择上方动作，或直接输入指令开始</template>
        </div>

        <button v-if="running" class="stop-btn" title="停止生成" @click="abort">
          <AppIcon name="stop" :size="12" />
          停止
        </button>
      </div>

      <footer class="foot">
        <input
          v-model="followInput"
          class="input follow"
          placeholder="追问或调整结果…"
          :disabled="running || !result"
          @keydown.enter="sendFollowUp"
        />
        <div class="foot-actions">
          <button class="btn" :disabled="!canApply" @click="copyOnly">仅复制</button>
          <button
            class="btn"
            :disabled="readOnly || !canApply"
            :title="readOnly ? '资料库内容只读，无法插入' : ''"
            @click="insertAfterSel"
          >
            插入其后
          </button>
          <button
            class="btn purple"
            :disabled="readOnly || !canApply"
            :title="readOnly ? '资料库内容只读，无法替换' : ''"
            @click="replaceSel"
          >
            替换原文
          </button>
        </div>
      </footer>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { PRESET_ACTIONS, getPreset } from '../ai/presets'
import { renderMd, handleMdClick } from '../services/md'
import { countWords } from '../core/storage'
import { streamChat, useAIStore } from '../stores/ai'
import { useEditorStore } from '../stores/editor'
import type { ChatMessage, SelectionContext } from '../types'

const props = defineProps<{ actionId: string | null; readOnly?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const ai = useAIStore()
const editor = useEditorStore()
const actions = PRESET_ACTIONS

const sel = ref<SelectionContext | null>(null)
const activeAction = ref<string | null>(null)
const instruction = ref('')
/** 仿写素材：用户粘贴的参考段落（文章 B） */
const reference = ref('')
const followInput = ref('')
const result = ref('')
const error = ref('')
const running = ref(false)

/** 发送给模型的对话历史（不含展示层） */
let history: ChatMessage[] = []
let abortCtrl: AbortController | null = null

const selectedWords = computed(() => (sel.value ? countWords(sel.value.text) : 0))
const canApply = computed(() => !running.value && !!result.value.trim())

/** 只读来源（资料库阅读窗格）：从 DOM 选区取词，全文取窗格文本 */
function readViewerSelection(): SelectionContext | null {
  const dom = window.getSelection()
  const text = dom?.toString() ?? ''
  if (!text.trim()) return null
  const host = document.querySelector('[data-viewer-root]')
  const fullText = (host?.textContent ?? '').replace(/\s+\n/g, '\n')
  const start = Math.max(0, fullText.indexOf(text))
  return { text, start, end: start + text.length, fullText }
}

onMounted(() => {
  sel.value = props.readOnly ? readViewerSelection() : editor.getSelection()
  if (!sel.value) {
    error.value = props.readOnly ? '未获取到选区，请先在资料窗格中选中文字' : '未获取到选区，请先在编辑区选中文字'
    return
  }
  document.addEventListener('keydown', onKeydown)
  // 仿写需要用户先粘贴参考段落，打开时只选中动作、不自动执行
  if (props.actionId === 'imitate') {
    activeAction.value = 'imitate'
  } else if (props.actionId) {
    run(props.actionId)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  abortCtrl?.abort()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onResultClick(e: MouseEvent) {
  handleMdClick(e)
}

/** 组装携带前后文的用户消息（选中段本身已包含在预设指令里，避免重复） */
function buildUserContent(prompt: string): string {
  const full = sel.value!.fullText
  const before = full.slice(Math.max(0, sel.value!.start - 300), sel.value!.start)
  const after = full.slice(sel.value!.end, sel.value!.end + 300)
  const parts: string[] = []
  if (before.trim()) parts.push(`【前文】\n${before}`)
  if (after.trim()) parts.push(`【后文】\n${after}`)
  if (!parts.length) return prompt
  return `${parts.join('\n\n')}\n\n---\n\n${prompt}`
}

async function run(actionId: string, extra?: string) {
  const provider = ai.activeProvider
  if (!provider?.apiKey) {
    activeAction.value = actionId
    error.value = '请先在设置中配置 API Key'
    return
  }
  if (!sel.value || running.value) return
  activeAction.value = actionId
  error.value = ''
  result.value = ''
  running.value = true
  abortCtrl = new AbortController()

  let prompt: string
  const refText = reference.value.trim()
  if (actionId === 'imitate' && refText) {
    prompt = `请模仿以下【参考段落】的文风、节奏与笔触，结合【选中段落】的情节与人物，另写一段衔接自然的新内容（只输出正文，不要解释）：\n\n【参考段落】\n${refText}\n\n【选中段落】\n${sel.value.text}`
  } else {
    prompt = getPreset(actionId).buildPrompt(sel.value.text)
  }
  if (extra && actionId !== 'custom') prompt += `\n\n补充要求：${extra}`
  const userContent = buildUserContent(prompt)
  history = [{ role: 'user', content: userContent }]

  try {
    const full = await streamChat(provider, {
      messages: history,
      signal: abortCtrl.signal,
      onDelta: (text) => {
        result.value = text
      },
    })
    result.value = full
    history.push({ role: 'assistant', content: full })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('abort')) error.value = message
  } finally {
    running.value = false
    abortCtrl = null
  }
}

/** chips 点击：仿写只选中动作（等用户粘贴素材后点「生成」），其余直接执行 */
function onChipClick(id: string) {
  if (id === 'imitate') {
    if (!running.value) {
      activeAction.value = 'imitate'
      error.value = ''
    }
    return
  }
  run(id)
}

/** 按 chips 上的补充要求重跑当前动作 */
function rerunWithInstruction() {
  const text = instruction.value.trim()
  if (!text || running.value || !activeAction.value) return
  run(activeAction.value, text)
}

async function sendFollowUp() {
  const provider = ai.activeProvider
  const text = followInput.value.trim()
  if (!text || running.value || !provider?.apiKey) return
  followInput.value = ''
  error.value = ''
  running.value = true
  abortCtrl = new AbortController()
  history = [...history, { role: 'user', content: text } as ChatMessage].slice(-12)
  try {
    const full = await streamChat(provider, {
      messages: history,
      signal: abortCtrl.signal,
      onDelta: (t) => {
        result.value = t
      },
    })
    result.value = full
    history.push({ role: 'assistant', content: full })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('abort')) error.value = message
  } finally {
    running.value = false
    abortCtrl = null
  }
}

function abort() {
  abortCtrl?.abort()
}

// ---------- 结果落回 ----------

function replaceSel() {
  if (!sel.value) return
  editor.replaceRange(sel.value.start, sel.value.end, result.value)
  editor.focus()
  emit('close')
}

function insertAfterSel() {
  if (!sel.value) return
  editor.insertAfter(sel.value.end, `\n\n${result.value}`)
  editor.focus()
  emit('close')
}

function copyOnly() {
  void navigator.clipboard.writeText(result.value).catch(() => {})
  emit('close')
}
</script>

<style scoped>
.ai-dialog {
  position: fixed;
  right: 24px;
  bottom: 64px;
  z-index: 70;
  width: 560px;
  max-width: calc(100vw - 48px);
  max-height: min(76vh, 720px);
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
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--purple-soft);
  color: var(--purple);
}
.head-title {
  font-size: 15px;
  font-weight: 700;
}
.action-pill {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--purple-soft);
  color: var(--purple);
  font-size: 12px;
  font-weight: 600;
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  font-size: 13px;
  color: var(--text-2);
  transition: all 0.12s;
}
.chip:hover:not(:disabled) {
  border-color: var(--purple);
  color: var(--purple);
}
.chip.active {
  border-color: var(--purple);
  background: var(--purple-soft);
  color: var(--purple);
  font-weight: 600;
}
.chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.instruction {
  flex: none;
}
.reference {
  flex: none;
  resize: vertical;
  min-height: 64px;
  font-size: 13px;
  line-height: 1.7;
}
.gen-btn {
  flex: none;
  align-self: flex-end;
  padding: 6px 22px;
  font-size: 13px;
}

.result {
  flex: 1;
  min-height: 110px;
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
  gap: 5px;
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
.md :deep(p:last-child) {
  margin-bottom: 0;
}
.md :deep(pre) {
  margin: 8px 0;
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
  margin: 8px 0;
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
.md :deep(ul),
.md :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.foot {
  display: flex;
  align-items: center;
  gap: 10px;
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
