<template>
  <div class="imitate-view">
    <header class="top">
      <button class="icon-btn" title="取消仿写" @click="tryCancel">
        <AppIcon name="back" :size="17" />
      </button>
      <span class="title"><AppIcon name="sparkles" :size="16" /> 一键仿写</span>
      <span class="proj">{{ project.projectName }}</span>

      <div v-if="imitate.phase === 'parse'" class="steps">
        <template v-for="(s, i) in STEPS" :key="s.id">
          <span class="arrow" v-if="i > 0">→</span>
          <span
            class="step"
            :class="{ active: imitate.step === s.id, done: stepDone(s.id) && imitate.step !== s.id }"
          >
            <AppIcon v-if="stepDone(s.id) && imitate.step !== s.id" name="check" :size="11" />
            {{ s.label }}
          </span>
        </template>
      </div>
      <span v-else class="phase-tag">{{ imitate.phase === 'skeleton' ? '骨架编辑' : '逐段生成' }}</span>

      <div class="spacer"></div>
      <span class="demo-tag" v-if="project.isDemo">演示</span>
    </header>

    <div class="body">
      <!-- ============ 解析阶段 ============ -->
      <template v-if="imitate.phase === 'parse'">
        <section class="chat">
          <div class="msgs" ref="msgsEl">
            <div v-for="(m, i) in imitate.chat" :key="i" class="msg" :class="m.role">
              <div class="bubble">{{ m.content }}</div>
            </div>
            <div v-if="imitate.generating" class="msg assistant">
              <div class="bubble typing">AI 正在解析<span class="dots">…</span></div>
            </div>
          </div>
          <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
          <div class="chat-input">
            <input
              v-model="opinion"
              class="input"
              :placeholder="`对「${currentLabel}」提修改意见，如：再黑暗一些`"
              :disabled="imitate.generating"
              @keydown.enter="send"
            />
            <button class="btn" :disabled="imitate.generating || !opinion.trim()" @click="send">发送</button>
            <button class="btn ghost" :disabled="imitate.generating" @click="imitate.runParse(imitate.step)">
              重新解析
            </button>
          </div>
        </section>

        <section class="result">
          <header class="result-head">
            <h3>{{ currentLabel }}<span class="step-idx">第 {{ stepIdx + 1 }}/4 步</span></h3>
            <div class="result-actions">
              <button v-if="stepIdx > 0" class="btn" :disabled="imitate.generating" @click="imitate.backStep()">
                上一步
              </button>
              <button class="btn primary" :disabled="!stepReady || imitate.generating" @click="confirmStep">
                {{ stepIdx < 3 ? '确认，下一步' : '确认骨架，进入生成模式' }}
              </button>
            </div>
          </header>

          <div class="result-body">
            <!-- 世界观 -->
            <template v-if="imitate.step === 'world'">
              <div v-for="w in imitate.world" :key="w.id" class="w-row">
                <input v-model="w.name" class="input w-name" @input="w.dirty = true" />
                <textarea v-model="w.detail" class="input w-detail" rows="2" @input="w.dirty = true"></textarea>
              </div>
              <p v-if="!imitate.world.length" class="empty">还没有解析结果</p>
            </template>

            <!-- 人物 -->
            <template v-else-if="imitate.step === 'characters'">
              <div v-for="p in imitate.persons" :key="p.id" class="p-card">
                <div class="p-head">
                  <input v-model="p.name" class="input p-name" @input="p.dirty = true" />
                  <span class="pill">{{ p.role }}</span>
                  <span class="identity">{{ p.identity }}</span>
                </div>
                <div class="p-tags"><span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span></div>
                <textarea v-model="p.description" class="input p-desc" rows="2" @input="p.dirty = true"></textarea>
              </div>
              <p v-if="!imitate.persons.length" class="empty">还没有解析结果</p>
            </template>

            <!-- 文风 -->
            <template v-else-if="imitate.step === 'style'">
              <div class="md" v-html="renderMd(imitate.styleNote || '（生成中…）')"></div>
            </template>

            <!-- 大纲 -->
            <template v-else>
              <div v-for="(o, ci) in imitate.outline" :key="o.id" class="o-chapter">
                <div class="o-ch-head">
                  <strong>{{ o.chapter }}</strong>
                  <span class="o-actions">
                    <button class="mini" title="上移" :disabled="ci === 0" @click="imitate.moveChapter(ci, ci - 1)">↑</button>
                    <button class="mini" title="下移" :disabled="ci === imitate.outline.length - 1" @click="imitate.moveChapter(ci, ci + 1)">↓</button>
                    <button class="mini danger" title="删除本章" @click="imitate.removeAt('chapter', o.id)">删</button>
                  </span>
                </div>
                <p class="o-summary">{{ o.summary }}</p>
                <div v-for="(s, si) in o.scenes" :key="s.id" class="o-scene">
                  <span class="o-scene-title">{{ s.title }}</span>
                  <span class="o-scene-desc">{{ s.desc }}</span>
                  <span class="o-actions">
                    <button class="mini" title="上移" :disabled="si === 0" @click="imitate.moveScene(o.id, si, si - 1)">↑</button>
                    <button class="mini" title="下移" :disabled="si === o.scenes.length - 1" @click="imitate.moveScene(o.id, si, si + 1)">↓</button>
                    <button class="mini danger" title="删除场景" @click="imitate.removeScene(o.id, s.id)">删</button>
                  </span>
                </div>
              </div>
              <p v-if="!imitate.outline.length" class="empty">还没有解析结果</p>
            </template>
          </div>
        </section>
      </template>

      <!-- ============ 骨架编辑 / 逐段生成 ============ -->
      <SkeletonStage v-else-if="imitate.phase === 'skeleton'" @request-generate="genModal = true" />
      <SegmentStage v-else-if="imitate.phase === 'segment'" />

      <!-- ============ 完成 ============ -->
      <div v-else class="done-page">
        <AppIcon name="check" :size="34" class="done-icon" />
        <h2>仿写完成</h2>
        <p>全部章节已生成并写入项目，可在工作区继续编辑。</p>
        <button class="btn primary" @click="toWorkspace">进入编辑器</button>
      </div>
    </div>

    <!-- 生成模式弹窗 -->
    <Teleport to="body">
      <div v-if="genModal" class="mask" @click.self="genModal = false">
        <div class="gen-dlg">
          <div class="gen-head">
            <span class="gen-title">选择生成方式</span>
            <button class="icon-btn" @click="genModal = false"><AppIcon name="close" :size="15" /></button>
          </div>
          <button class="gen-opt" :disabled="genBusy" @click="generateAll">
            <span class="gen-icon">⚡</span>
            <span class="gen-main">
              <strong>一次性生成</strong>
              <span>AI 按大纲一次写完全部 {{ imitate.outline.length }} 章，期间显示进度</span>
            </span>
          </button>
          <button class="gen-opt" :disabled="genBusy" @click="startSegment">
            <span class="gen-icon">📑</span>
            <span class="gen-main">
              <strong>逐段生成</strong>
              <span>每章先出稿，你可以手改、追问，确认后再写下一章</span>
            </span>
          </button>
          <p v-if="genBusy" class="gen-progress">⏳ 正在生成（{{ genDone }}/{{ genTotal }}）{{ genChapter }}…</p>
          <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import SkeletonStage from '../components/imitate/SkeletonStage.vue'
import SegmentStage from '../components/imitate/SegmentStage.vue'
import { renderMd } from '../services/md'
import { STEPS, STEP_INDEX, useImitateStore, type ImitateStep } from '../stores/imitate'
import { useProjectStore } from '../stores/project'

const router = useRouter()
const imitate = useImitateStore()
const project = useProjectStore()

const opinion = ref('')
const msgsEl = ref<HTMLDivElement | null>(null)
const genModal = ref(false)
const genBusy = ref(false)
const genDone = ref(0)
const genTotal = ref(0)
const genChapter = ref('')

const stepIdx = computed(() => STEP_INDEX[imitate.step])
const currentLabel = computed(() => STEPS[stepIdx.value].label)

const stepReady = computed(() => {
  switch (imitate.step) {
    case 'world':
      return imitate.world.length > 0
    case 'characters':
      return imitate.persons.length > 0
    case 'style':
      return !!imitate.styleNote.trim()
    case 'outline':
      return imitate.outline.length > 0
  }
})

function stepDone(id: ImitateStep): boolean {
  switch (id) {
    case 'world':
      return imitate.world.length > 0
    case 'characters':
      return imitate.persons.length > 0
    case 'style':
      return !!imitate.styleNote.trim()
    case 'outline':
      return imitate.outline.length > 0
  }
}

function send() {
  const text = opinion.value.trim()
  if (!text || imitate.generating) return
  opinion.value = ''
  void imitate.reviseCurrent(text)
}

async function confirmStep() {
  await imitate.confirmStep()
}

function tryCancel() {
  if (window.confirm('放弃这次仿写？\n演示项目与未保存的骨架将被删除。')) {
    void imitate.cancel().then(() => router.push({ name: 'home' }))
  }
}

function toWorkspace() {
  void router.push({ name: 'workspace' })
}

// ---------- 一次性生成 ----------
async function generateAll() {
  genBusy.value = true
  imitate.error = ''
  try {
    await imitate.generateAll((done, total, chapter) => {
      genDone.value = done
      genTotal.value = total
      genChapter.value = chapter
    })
    genModal.value = false
  } catch {
    /* 错误已落在 imitate.error，弹窗保持打开供重试 */
  } finally {
    genBusy.value = false
  }
}

// ---------- 逐段生成 ----------
function startSegment() {
  imitate.startSegment()
  genModal.value = false
}

// 对话流自动滚到底
watch(
  () => imitate.chat.length + Number(imitate.generating),
  () => {
    void nextTick(() => {
      const el = msgsEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

// 进入没有数据的新步骤时自动解析（如确认世界观后进入人物库）
watch(
  () => imitate.step,
  (step) => {
    if (imitate.phase !== 'parse' || imitate.generating) return
    if (!stepDone(step) && !imitate.error) void imitate.runParse(step)
  },
)

onMounted(async () => {
  if (!imitate.active) {
    // 项目没开（如刷新后直达 /imitate）：先恢复会话，再恢复仿写进度
    if (!project.isOpen) {
      const { restoreSession } = await import('../services/session')
      await restoreSession()
    }
    const ok = imitate.active || (await imitate.loadFromProject())
    if (!ok) {
      await router.replace({ name: 'home' })
    }
  }
})
</script>

<style scoped>
.imitate-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.top {
  height: 50px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--purple);
}
.proj {
  font-size: 13px;
  color: var(--text-2);
}
.phase-tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--purple-soft);
  color: var(--purple);
  font-weight: 600;
}
.demo-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-deep);
  color: var(--text-3);
}
.spacer {
  flex: 1;
}

.steps {
  display: flex;
  align-items: center;
  gap: 6px;
}
.step {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--text-3);
  padding: 3px 10px;
  border-radius: 999px;
}
.step.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.step.done {
  color: var(--green);
}
.arrow {
  color: var(--text-3);
  font-size: 12px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* ---------- 解析阶段 ---------- */
.chat {
  width: 400px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--border);
  min-height: 0;
}
.msgs {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  display: flex;
}
.msg.assistant {
  justify-content: flex-start;
}
.msg.user {
  justify-content: flex-end;
}
.bubble {
  max-width: 88%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13px;
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
.dots {
  animation: blink 1s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
.err {
  padding: 6px 14px;
  color: var(--accent);
  font-size: 12.5px;
}
.chat-input {
  display: flex;
  gap: 6px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
}
.chat-input .input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  font-size: 13px;
}
.chat-input .btn {
  padding: 8px 14px;
  font-size: 13px;
}

.result {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.result-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
}
.result-head h3 {
  font-size: 15px;
}
.step-idx {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--text-3);
  font-weight: 400;
}
.result-actions {
  display: flex;
  gap: 8px;
}
.result-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 40px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}

.w-row {
  display: flex;
  gap: 8px;
}
.w-name {
  width: 180px;
  flex: none;
  font-weight: 600;
}
.w-detail {
  flex: 1;
  resize: vertical;
}

.p-card {
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.p-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.p-name {
  width: 140px;
  font-weight: 600;
}
.pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  flex: none;
}
.identity {
  font-size: 12.5px;
  color: var(--text-2);
}
.p-tags {
  display: flex;
  gap: 5px;
  margin-top: 6px;
}
.tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-2);
}
.p-desc {
  margin-top: 8px;
  resize: vertical;
}

.o-chapter {
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.o-ch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.o-actions {
  display: inline-flex;
  gap: 4px;
}
.mini {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
}
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.4;
}
.mini.danger:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.o-summary {
  font-size: 12.5px;
  color: var(--text-2);
  margin: 6px 0 8px;
  line-height: 1.6;
}
.o-scene {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0 5px 14px;
  border-top: 1px dashed var(--border);
  font-size: 12.5px;
}
.o-scene-title {
  font-weight: 600;
  flex: none;
}
.o-scene-desc {
  flex: 1;
  color: var(--text-2);
  min-width: 0;
}

.done-page {
  margin: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
}
.done-icon {
  color: var(--green);
}
.done-page h2 {
  color: var(--text);
}

/* ---------- 生成模式弹窗 ---------- */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}
.gen-dlg {
  width: 460px;
  max-width: calc(100vw - 48px);
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px 18px;
}
.gen-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.gen-title {
  font-weight: 700;
}
.gen-opt {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  margin-bottom: 10px;
  transition: all 0.15s;
}
.gen-opt:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.gen-opt:disabled {
  opacity: 0.55;
}
.gen-icon {
  font-size: 22px;
}
.gen-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gen-main span {
  font-size: 12.5px;
  color: var(--text-2);
}
.gen-progress {
  font-size: 12.5px;
  color: var(--purple);
}
</style>
