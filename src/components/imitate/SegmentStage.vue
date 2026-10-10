<template>
  <div class="segment-stage">
    <!-- 左：章节进度 -->
    <nav class="progress">
      <div class="pg-head">章节进度</div>
      <button
        v-for="(c, i) in imitate.outline"
        :key="c.id"
        class="pg-row"
        :class="{ done: isDone(i), current: i === imitate.segmentIdx, pending: i > imitate.segmentIdx }"
        @click="jumpTo(i)"
      >
        <span class="pg-mark">{{ isDone(i) ? '✓' : i === imitate.segmentIdx ? '✍' : i + 1 }}</span>
        <span class="pg-name">{{ c.chapter }}</span>
        <span v-if="isDone(i)" class="pg-words">{{ wordsOf(c.id) }}</span>
      </button>
    </nav>

    <!-- 中：编辑器 -->
    <section class="writer">
      <div class="w-head">
        <strong>{{ current?.chapter }}</strong>
        <span class="w-hint">可直接编辑，AI 以你的修改为基础继续生成</span>
      </div>
      <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
      <textarea
        v-if="current"
        v-model="imitate.chapterTexts[current.id]"
        class="input writer-area"
        :placeholder="generatingNow ? 'AI 正在生成本章…' : '点击「生成本段」开始，或直接在这里手写'"
      ></textarea>
      <div class="w-count">{{ text.length }} 字</div>

      <footer class="w-foot">
        <button class="btn" :disabled="imitate.segmentIdx === 0 || imitate.generating" @click="imitate.segmentPrev()">
          ← 上一段
        </button>
        <button class="btn" :disabled="imitate.generating" @click="regen">
          {{ text ? '🔄 重写本段（以当前内容为基础）' : '✨ 生成本段' }}
        </button>
        <span class="spacer"></span>
        <button class="btn primary" :disabled="imitate.generating" @click="next">
          {{ isLast ? '✅ 完成生成' : '下一段 →' }}
        </button>
      </footer>
    </section>

    <!-- 右：AI 面板 -->
    <aside class="ai-panel">
      <div class="ai-head">当前章节场景</div>
      <div class="scenes">
        <div v-for="s in current?.scenes ?? []" :key="s.id" class="scene">
          <strong>{{ s.title }}</strong>
          <span>{{ s.desc }}</span>
        </div>
      </div>
      <div class="ai-head">让 AI 调整本段</div>
      <div class="chips">
        <button v-for="c in chips" :key="c" class="chip" :disabled="imitate.generating || !text" @click="revise(c)">
          {{ c }}
        </button>
      </div>
      <textarea
        v-model="opinion"
        class="input ai-input"
        rows="3"
        placeholder="自定义调整意见，如：把对话再压缩一半"
        :disabled="imitate.generating || !text"
      ></textarea>
      <button class="btn" :disabled="imitate.generating || !text || !opinion.trim()" @click="revise(opinion.trim())">
        {{ imitate.generating ? 'AI 处理中…' : '发送调整意见' }}
      </button>
    </aside>

    <!-- 完成弹窗 -->
    <Teleport to="body">
      <div v-if="finishModal" class="mask">
        <div class="dlg">
          <div class="dlg-head">
            <strong>🎉 全部章节已生成</strong>
          </div>
          <p class="dlg-note">共 {{ imitate.outline.length }} 章、{{ totalWords }} 字。章节与骨架已保存到项目。</p>
          <div class="dlg-actions">
            <button class="btn primary" @click="toWorkspace">保存并进入编辑器</button>
            <button class="btn" @click="keepPolishing">继续逐段精修</button>
            <button class="btn ghost" @click="exportMd">导出 Markdown</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useImitateStore } from '../../stores/imitate'

const imitate = useImitateStore()
const router = useRouter()

const opinion = ref('')
const finishModal = ref(false)
const generatingNow = ref(false)

const chips = ['增加心理描写', '收紧对话', '增加环境氛围']

const current = computed(() => imitate.currentChapter())
const isLast = computed(() => imitate.segmentIdx >= imitate.outline.length - 1)
const text = computed(() => (current.value ? imitate.chapterTexts[current.value.id] ?? '' : ''))

function isDone(i: number): boolean {
  const c = imitate.outline[i]
  return i < imitate.segmentIdx && !!imitate.chapterTexts[c.id]
}
function wordsOf(id: string): string {
  const t = imitate.chapterTexts[id] ?? ''
  return t ? `${t.replace(/\s/g, '').length} 字` : ''
}
const totalWords = computed(() => Object.values(imitate.chapterTexts).reduce((n, t) => n + t.replace(/\s/g, '').length, 0))

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
  if (done) finishModal.value = true
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
.segment-stage {
  flex: 1;
  min-height: 0;
  display: flex;
}

.progress {
  width: 230px;
  flex: none;
  overflow-y: auto;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pg-head {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  padding: 4px 8px 8px;
}
.pg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-2);
  text-align: left;
}
.pg-row.current {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.pg-row.pending {
  opacity: 0.5;
}
.pg-row.done {
  color: var(--green);
}
.pg-mark {
  flex: none;
  width: 18px;
  text-align: center;
}
.pg-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pg-words {
  font-size: 11px;
  color: var(--text-3);
  flex: none;
}

.writer {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 18px;
  gap: 10px;
}
.w-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.w-head strong {
  font-size: 16px;
}
.w-hint {
  font-size: 12px;
  color: var(--purple);
  background: var(--purple-soft);
  padding: 3px 10px;
  border-radius: 999px;
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
  font-size: 14.5px;
  font-family: var(--font-serif);
}
.w-count {
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
}
.w-foot {
  display: flex;
  gap: 8px;
}
.spacer {
  flex: 1;
}

.ai-panel {
  width: 280px;
  flex: none;
  overflow-y: auto;
  background: var(--panel);
  border-left: 1px solid var(--border);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-head {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}
.scenes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.scene {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
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
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--purple);
  color: var(--purple);
}
.chip:hover:not(:disabled) {
  background: var(--purple-soft);
}
.chip:disabled {
  opacity: 0.45;
}
.ai-input {
  resize: vertical;
  font-size: 13px;
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}
.dlg {
  width: 440px;
  max-width: calc(100vw - 48px);
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 18px 20px;
}
.dlg-head {
  margin-bottom: 8px;
}
.dlg-note {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 14px;
}
.dlg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
