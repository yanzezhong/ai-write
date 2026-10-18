<template>
  <div class="m-segment">
    <!-- 顶部大纲进度条 -->
    <nav class="pg-bar">
      <button
        v-for="(c, i) in imitate.outline"
        :key="c.id"
        class="pg-chip"
        :class="{ done: isDone(i), current: i === imitate.segmentIdx }"
        :disabled="imitate.generating"
        @click="jumpTo(i)"
      >
        {{ isDone(i) ? '✓' : i + 1 }}
      </button>
    </nav>
    <p class="pg-label">{{ current?.chapter ?? '' }}<span v-if="words"> · {{ words }}</span></p>

    <!-- 中部编辑器 -->
    <main class="writer">
      <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
      <textarea
        v-if="current"
        v-model="imitate.chapterTexts[current.id]"
        class="input writer-area"
        :placeholder="generatingNow ? 'AI 正在生成本章…' : '点击「生成本段」开始，或直接在这里手写'"
      ></textarea>
    </main>

    <!-- 底部：操作 + AI 面板 -->
    <footer class="dock">
      <div class="act-row">
        <button class="btn ghost" :disabled="imitate.segmentIdx === 0 || imitate.generating" @click="imitate.segmentPrev()">← 上一段</button>
        <button class="btn ghost" :disabled="imitate.generating" @click="regen">
          {{ text ? '🔄 重写本段' : '✨ 生成本段' }}
        </button>
        <button class="btn primary grow" :disabled="imitate.generating" @click="next">
          {{ isLast ? '✅ 完成生成' : '下一段 →' }}
        </button>
      </div>
      <button class="ai-toggle" @click="aiOpen = !aiOpen">
        {{ aiOpen ? '▼ 收起 AI 面板' : '▲ AI 面板：场景与调整' }}
      </button>
      <div v-if="aiOpen" class="ai-panel">
        <div class="ai-head">当前章节场景</div>
        <div v-for="s in current?.scenes ?? []" :key="s.id" class="scene">
          <strong>{{ s.title }}</strong>
          <span>{{ s.desc }}</span>
        </div>
        <div class="ai-head">让 AI 调整本段</div>
        <div class="chips">
          <button v-for="c in chips" :key="c" class="chip" :disabled="imitate.generating || !text" @click="revise(c)">{{ c }}</button>
        </div>
        <div class="revise-row">
          <input
            v-model="opinion"
            class="input"
            placeholder="自定义调整意见"
            :disabled="imitate.generating || !text"
            @keydown.enter="revise(opinion.trim())"
          />
          <button class="send" :disabled="imitate.generating || !text || !opinion.trim()" aria-label="发送" @click="revise(opinion.trim())">➤</button>
        </div>
      </div>
    </footer>

    <!-- 完成弹层 -->
    <Teleport to="body">
      <div v-if="finishModal" class="sheet-mask">
        <div class="finish-sheet">
          <div class="grabber"></div>
          <h3>🎉 全部章节已生成</h3>
          <p class="fs-note">共 {{ imitate.outline.length }} 章、{{ totalWords.toLocaleString() }} 字。章节与骨架已保存到项目。</p>
          <button class="btn primary big" @click="toWorkspace">保存并进入编辑器</button>
          <button class="btn ghost big" @click="keepPolishing">继续逐段精修</button>
          <button class="btn ghost big" @click="exportMd">导出 Markdown</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useImitateStore } from '../../../stores/imitate'
import { ensureNotifyPermission, notifyDone } from '../../../services/notify'

const imitate = useImitateStore()
const router = useRouter()

const opinion = ref('')
const aiOpen = ref(false)
const finishModal = ref(false)
const generatingNow = ref(false)

const chips = ['增加心理描写', '收紧对话', '增加环境氛围']

const current = computed(() => imitate.currentChapter())
const isLast = computed(() => imitate.segmentIdx >= imitate.outline.length - 1)
const text = computed(() => (current.value ? imitate.chapterTexts[current.value.id] ?? '' : ''))
const words = computed(() => {
  const n = text.value.replace(/\s/g, '').length
  return n ? `${n.toLocaleString()} 字` : ''
})
const totalWords = computed(() => Object.values(imitate.chapterTexts).reduce((n, t) => n + t.replace(/\s/g, '').length, 0))

function isDone(i: number): boolean {
  const c = imitate.outline[i]
  return i < imitate.segmentIdx && !!imitate.chapterTexts[c.id]
}

// 进入没有内容的章时自动生成
watch(
  () => imitate.segmentIdx,
  () => {
    if (current.value && !imitate.chapterTexts[current.value.id]) void doGenerate()
  },
  { immediate: true },
)

async function doGenerate() {
  generatingNow.value = true
  void ensureNotifyPermission()
  try {
    await imitate.segmentGenerate()
  } catch {
    /* 错误在 imitate.error */
  } finally {
    generatingNow.value = false
  }
}

function regen() {
  void doGenerate()
}

async function revise(op: string) {
  if (!op) return
  generatingNow.value = true
  try {
    await imitate.segmentRevise(op)
    opinion.value = ''
  } catch {
    /* 错误在 imitate.error */
  } finally {
    generatingNow.value = false
  }
}

function jumpTo(i: number) {
  if (imitate.generating) return
  imitate.segmentIdx = i
}

async function next() {
  const done = await imitate.segmentNext()
  if (done) {
    finishModal.value = true
    notifyDone('仿写生成完成', `《${imitate.sourceName}》全部 ${imitate.outline.length} 章已生成。`)
  }
}

function keepPolishing() {
  finishModal.value = false
  imitate.segmentIdx = imitate.outline.length - 1
}

async function toWorkspace() {
  await imitate.finishToWorkspace()
  await router.push({ name: 'workspace' })
}

function exportMd() {
  const parts = imitate.outline.map((c) => `# ${c.chapter}\n\n${imitate.chapterTexts[c.id] ?? ''}`)
  const blob = new Blob([parts.join('\n\n---\n\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${imitate.sourceName || '仿写'}-全文.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.m-segment {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pg-bar {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 12px 14px 4px;
  overflow-x: auto;
}
.pg-chip {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  font-size: 14px;
  color: var(--text-2);
}
.pg-chip.current {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.pg-chip.done {
  border-color: var(--green);
  color: var(--green);
}
.pg-label {
  flex: none;
  padding: 4px 16px 8px;
  font-size: 13px;
  color: var(--text-2);
}
.writer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 14px;
  gap: 8px;
}
.err {
  color: var(--accent);
  font-size: 12.5px;
}
.writer-area {
  flex: 1;
  min-height: 0;
  resize: none;
  line-height: 2;
  font-size: 15px;
  font-family: var(--font-serif);
}
.dock {
  flex: none;
  border-top: 1px solid var(--border);
  background: var(--panel);
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.act-row {
  display: flex;
  gap: 8px;
}
.act-row .btn {
  min-height: 46px;
}
.grow {
  flex: 1;
}
.ai-toggle {
  min-height: 44px;
  font-size: 13px;
  color: var(--purple);
  background: var(--purple-soft);
  border-radius: var(--radius);
}
.ai-panel {
  max-height: 40vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}
.ai-head {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}
.scene {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--border);
}
.scene strong {
  color: var(--text);
}
.scene span {
  color: var(--text-2);
  line-height: 1.6;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  min-height: 36px;
  padding: 4px 14px;
  border-radius: 999px;
  border: 1px solid var(--purple);
  color: var(--purple);
  font-size: 12.5px;
}
.chip:disabled {
  opacity: 0.45;
}
.revise-row {
  display: flex;
  gap: 8px;
}
.revise-row .input {
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

.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 90;
}
.finish-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--panel);
  border-radius: 18px 18px 0 0;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 18px calc(16px + env(safe-area-inset-bottom));
}
.grabber {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-strong);
  margin: 0 auto 6px;
}
.finish-sheet h3 {
  font-size: 17px;
  font-weight: 700;
}
.fs-note {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 4px;
}
.big {
  width: 100%;
  min-height: 48px;
  font-size: 15px;
  border-radius: var(--radius-lg);
}
</style>
