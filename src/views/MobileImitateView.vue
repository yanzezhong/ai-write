<template>
  <div class="m-imitate">
    <!-- 顶栏 -->
    <header class="top">
      <button class="icon-btn back" aria-label="返回" @click="tryCancel">
        <AppIcon name="back" :size="18" />
      </button>
      <div class="titles">
        <strong>{{ title }}</strong>
        <span>{{ subtitle }}</span>
      </div>
    </header>

    <!-- ============ M7 解析阶段：单栏堆叠 ============ -->
    <template v-if="imitate.phase === 'parse'">
      <nav class="step-bar">
        <template v-for="(s, i) in STEPS" :key="s.id">
          <button
            class="step"
            :class="{ active: imitate.step === s.id, done: stepDone(s.id) && imitate.step !== s.id }"
            :disabled="imitate.generating"
            @click="goStep(s.id)"
          >
            <span class="dot">{{ stepDone(s.id) && imitate.step !== s.id ? '✓' : '' }}</span>
            <span class="label">{{ s.label }}</span>
          </button>
          <span v-if="i < STEPS.length - 1" class="sep">·</span>
        </template>
      </nav>

      <main class="scroll">
        <!-- 最近一条 AI 消息 -->
        <div v-if="lastAssistant" class="ai-bubble">
          <span class="ai-icon">🤖</span>
          <p>{{ lastAssistant }}</p>
        </div>

        <!-- 当前步骤结果 -->
        <div class="result-card">
          <!-- 世界观 -->
          <template v-if="imitate.step === 'world'">
            <div v-for="w in imitate.world" :key="w.id" class="entry">
              <input v-model="w.name" class="input entry-name" @input="w.dirty = true" />
              <textarea v-model="w.detail" class="input entry-detail" rows="2" @input="w.dirty = true"></textarea>
              <button class="entry-del" aria-label="删除" @click="imitate.removeAt('world', w.id)">✕</button>
            </div>
            <p v-if="!imitate.world.length" class="empty">{{ imitate.generating ? 'AI 解析中…' : '还没有解析结果' }}</p>
          </template>

          <!-- 人物 -->
          <template v-else-if="imitate.step === 'characters'">
            <div v-for="p in imitate.persons" :key="p.id" class="person">
              <div class="person-head">
                <input v-model="p.name" class="input p-name" @input="p.dirty = true" />
                <select v-model="p.role" class="input p-role" @change="p.dirty = true">
                  <option>主角</option><option>配角</option><option>反派</option><option>其他</option>
                </select>
              </div>
              <input v-model="p.identity" class="input p-id" placeholder="身份" @input="p.dirty = true" />
              <div class="p-tags"><span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span></div>
              <textarea v-model="p.description" class="input p-desc" rows="2" placeholder="人物描述" @input="p.dirty = true"></textarea>
              <button class="entry-del person-del" aria-label="删除" @click="imitate.removeAt('person', p.id)">✕</button>
            </div>
            <p v-if="!imitate.persons.length" class="empty">{{ imitate.generating ? 'AI 解析中…' : '还没有解析结果' }}</p>
          </template>

          <!-- 文风 -->
          <template v-else-if="imitate.step === 'style'">
            <div class="md" v-html="renderMd(imitate.styleNote || '（生成中…）')"></div>
          </template>

          <!-- 大纲 -->
          <template v-else>
            <div v-for="(o, ci) in imitate.outline" :key="o.id" class="chapter">
              <div class="ch-head">
                <strong class="ch-title">{{ o.chapter }}</strong>
                <span class="ch-ops">
                  <button class="mini" :disabled="ci === 0" aria-label="上移" @click="imitate.moveChapter(ci, ci - 1)">↑</button>
                  <button class="mini" :disabled="ci === imitate.outline.length - 1" aria-label="下移" @click="imitate.moveChapter(ci, ci + 1)">↓</button>
                  <button class="mini danger" @click="imitate.removeAt('chapter', o.id)">删</button>
                </span>
              </div>
              <p class="ch-summary">{{ o.summary }}</p>
              <div v-for="(s, si) in o.scenes" :key="s.id" class="scene">
                <span class="sc-title">{{ s.title }}</span>
                <span class="sc-desc">{{ s.desc }}</span>
                <span class="ch-ops">
                  <button class="mini" :disabled="si === 0" aria-label="上移" @click="imitate.moveScene(o.id, si, si - 1)">↑</button>
                  <button class="mini" :disabled="si === o.scenes.length - 1" aria-label="下移" @click="imitate.moveScene(o.id, si, si + 1)">↓</button>
                  <button class="mini danger" @click="imitate.removeScene(o.id, s.id)">删</button>
                </span>
              </div>
            </div>
            <p v-if="!imitate.outline.length" class="empty">{{ imitate.generating ? 'AI 解析中…' : '还没有解析结果' }}</p>
          </template>
        </div>

        <button v-if="imitate.chat.length > 1" class="history-link" @click="historyOpen = true">
          查看完整对话（{{ imitate.chat.length }} 条）
        </button>
        <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
      </main>

      <!-- 底部：对话条 + 操作栏 -->
      <footer class="dock">
        <div class="chat-row">
          <input
            v-model="opinion"
            class="input"
            :placeholder="`对「${currentLabel}」提修改意见，如：再黑暗一些`"
            :disabled="imitate.generating"
            @keydown.enter="send"
          />
          <button class="send" :disabled="imitate.generating || !opinion.trim()" aria-label="发送" @click="send">➤</button>
        </div>
        <div class="act-row">
          <button class="btn ghost" :disabled="imitate.generating" @click="imitate.runParse(imitate.step)">重新解析</button>
          <button class="btn ghost" :disabled="imitate.generating || stepIdx === 0" @click="imitate.backStep()">← 上一步</button>
          <button class="btn primary grow" :disabled="!stepReady || imitate.generating" @click="confirmStep">
            {{ stepIdx < 3 ? '确认，下一步' : '确认骨架，去生成' }}
          </button>
        </div>
      </footer>

      <!-- 对话历史半屏 -->
      <Teleport to="body">
        <div v-if="historyOpen" class="sheet-mask" @click.self="historyOpen = false">
          <div class="history-sheet" v-swipe-close="() => (historyOpen = false)">
            <div class="grabber"></div>
            <header class="hs-head">
              <strong>解析对话</strong>
              <button class="icon-btn" aria-label="关闭" @click="historyOpen = false"><AppIcon name="close" :size="16" /></button>
            </header>
            <div class="hs-body">
              <div v-for="(m, i) in imitate.chat" :key="i" class="msg" :class="m.role">
                <div class="bubble">{{ m.content }}</div>
              </div>
              <div v-if="imitate.generating" class="msg assistant">
                <div class="bubble typing">AI 正在解析…</div>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- ============ M8 骨架编辑 ============ -->
    <MobileSkeletonStage v-else-if="imitate.phase === 'skeleton'" @request-generate="genSheet = true" />

    <!-- ============ M9 逐段生成 ============ -->
    <MobileSegmentStage v-else-if="imitate.phase === 'segment'" />

    <!-- ============ 一次性生成进度 ============ -->
    <div v-else-if="genBusy" class="progress-page">
      <AppIcon name="sparkles" :size="34" class="pg-icon" />
      <h2>正在生成全文</h2>
      <p class="pg-chapter">{{ genChapter || '准备中…' }}</p>
      <div class="pg-track"><div class="pg-fill" :style="{ width: `${(genDone / Math.max(genTotal, 1)) * 100}%` }"></div></div>
      <p class="pg-num">{{ genDone }} / {{ genTotal }} 章</p>
      <p class="pg-hint">可切后台，生成不会中断；已生成的章节已自动保存。</p>
      <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>
    </div>

    <!-- ============ M9 完成页 ============ -->
    <div v-else class="done-page">
      <span class="done-icon">✅</span>
      <h2>仿写完成</h2>
      <p class="done-sub">全部章节已生成并写入项目</p>
      <div class="stats">
        <div class="stat"><strong>{{ stats.chapters }}</strong><span>章节</span></div>
        <div class="stat"><strong>{{ stats.scenes }}</strong><span>场景</span></div>
        <div class="stat"><strong>{{ stats.words.toLocaleString() }}</strong><span>字数</span></div>
      </div>
      <button class="btn primary big" @click="toWorkspace">进入编辑器</button>
      <button class="btn ghost" @click="toHome">返回首页</button>
    </div>

    <!-- M9 生成模式底部弹层 -->
    <Teleport to="body">
      <div v-if="genSheet" class="sheet-mask" @click.self="genSheet = false">
        <div class="gen-sheet" v-swipe-close="() => (genSheet = false)">
          <div class="grabber"></div>
          <header class="gs-head">
            <h3>选择生成模式</h3>
            <p>骨架已就绪：世界观 {{ imitate.world.length }} · 人物 {{ imitate.persons.length }} · 大纲 {{ imitate.outline.length }} 章 {{ totalScenes }} 场景</p>
          </header>
          <button class="gen-opt" :disabled="genBusy" @click="generateAll">
            <span class="gen-icon">⚡</span>
            <span class="gen-main"><strong>一次性生成</strong><span>AI 一次性写出完整文章，直接进入编辑器编辑。</span></span>
          </button>
          <button class="gen-opt" :disabled="genBusy" @click="startSegment">
            <span class="gen-icon">🧩</span>
            <span class="gen-main"><strong>逐段生成</strong><span>按大纲逐段生成，每段可修改后再生成下一段。</span></span>
          </button>
          <p v-if="genBusy" class="gen-progress">⏳ 正在生成（{{ genDone }}/{{ genTotal }}）{{ genChapter }}…</p>
          <p v-if="imitate.error" class="err pad">⚠ {{ imitate.error }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import MobileSkeletonStage from '../components/mobile/imitate/MobileSkeletonStage.vue'
import MobileSegmentStage from '../components/mobile/imitate/MobileSegmentStage.vue'
import { vSwipeClose } from '../components/mobile/swipeClose'
import { renderMd } from '../services/md'
import { ensureNotifyPermission, notifyDone } from '../services/notify'
import { STEPS, STEP_INDEX, useImitateStore, type ImitateStep } from '../stores/imitate'
import { useProjectStore } from '../stores/project'
import { getFS } from '../core/fs'

const router = useRouter()
const imitate = useImitateStore()
const project = useProjectStore()

const opinion = ref('')
const historyOpen = ref(false)
const genSheet = ref(false)
const genBusy = ref(false)
const genDone = ref(0)
const genTotal = ref(0)
const genChapter = ref('')
const stats = reactive({ chapters: 0, scenes: 0, words: 0 })

const stepIdx = computed(() => STEP_INDEX[imitate.step])
const currentLabel = computed(() => STEPS[stepIdx.value].label)
const title = computed(() => (imitate.phase === 'parse' ? `仿写-${imitate.sourceName}` : imitate.phase === 'skeleton' ? '骨架编辑' : imitate.phase === 'segment' ? '逐段生成' : '生成文章'))
const subtitle = computed(() =>
  imitate.phase === 'parse'
    ? `AI 分步解析 · 第 ${stepIdx.value + 1}/4 步`
    : imitate.phase === 'skeleton'
      ? '所有字段默认可编辑 · 锁定后 AI 不可改'
      : '',
)
const totalScenes = computed(() => imitate.outline.reduce((n, o) => n + o.scenes.length, 0))
const lastAssistant = computed(() => {
  for (let i = imitate.chat.length - 1; i >= 0; i--) {
    if (imitate.chat[i].role === 'assistant') return imitate.chat[i].content
  }
  return ''
})

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

/** 步骤条点击：只允许回退到已完成的步骤 */
function goStep(id: ImitateStep) {
  if (imitate.generating) return
  if (STEP_INDEX[id] < stepIdx.value && stepDone(id)) imitate.step = id
}

function send() {
  const text = opinion.value.trim()
  if (!text || imitate.generating) return
  opinion.value = ''
  void imitate.reviseCurrent(text)
}

async function confirmStep() {
  await imitate.confirmStep()
  if (imitate.phase === 'skeleton') genSheet.value = true
}

function tryCancel() {
  if (window.confirm('放弃这次仿写？\n演示项目与未保存的骨架将被删除。')) {
    void imitate.cancel().then(() => router.push({ name: 'home' }))
  }
}

function toWorkspace() {
  void router.push({ name: 'workspace' })
}
function toHome() {
  void router.push({ name: 'home' })
}

// ---------- 一次性生成 ----------
async function generateAll() {
  genBusy.value = true
  imitate.error = ''
  void ensureNotifyPermission()
  try {
    await imitate.generateAll((done, total, chapter) => {
      genDone.value = done
      genTotal.value = total
      genChapter.value = chapter
    })
    genSheet.value = false
    await loadStats()
    notifyDone('仿写生成完成', `《${imitate.sourceName}》全部 ${imitate.outline.length} 章已生成。`)
  } catch {
    /* 错误已落在 imitate.error，弹层保持打开供重试 */
  } finally {
    genBusy.value = false
  }
}

function startSegment() {
  imitate.startSegment()
  genSheet.value = false
}

// ---------- 完成页统计 ----------
async function loadStats() {
  stats.chapters = imitate.outline.length
  stats.scenes = totalScenes.value
  const fs = getFS()
  let words = 0
  for (const o of imitate.outline) {
    const t = await fs.readFile(`chapters/${o.chapter}.md`).catch(() => '')
    words += t.replace(/\s/g, '').length
  }
  stats.words = words
}

watch(
  () => imitate.step,
  (step) => {
    if (imitate.phase !== 'parse' || imitate.generating) return
    if (!stepDone(step) && !imitate.error) void imitate.runParse(step)
  },
)

onMounted(async () => {
  if (!imitate.active) {
    if (!project.isOpen) {
      const { restoreSession } = await import('../services/session')
      await restoreSession()
    }
    const ok = imitate.active || (await imitate.loadFromProject())
    if (!ok) {
      await router.replace({ name: 'home' })
      return
    }
  }
  if (imitate.phase === 'done') await loadStats()
})
</script>

<style scoped>
.m-imitate {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 6px 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.back {
  width: 44px;
  height: 44px;
  flex: none;
}
.titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.titles strong {
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.titles span {
  font-size: 12px;
  color: var(--text-3);
}

/* ---------- M7 步骤条 ---------- */
.step-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 10px 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 56px;
  min-height: 44px;
  justify-content: center;
  color: var(--text-3);
}
.step .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-strong);
  font-size: 8px;
  line-height: 10px;
  color: #fff;
}
.step.active {
  color: var(--accent);
  font-weight: 700;
}
.step.active .dot {
  background: var(--accent);
}
.step.done {
  color: var(--green);
}
.step.done .dot {
  background: var(--green);
}
.sep {
  color: var(--border-strong);
}

/* ---------- M7 内容区 ---------- */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-bubble {
  display: flex;
  gap: 8px;
  background: var(--purple-soft);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13.5px;
  line-height: 1.7;
}
.ai-icon {
  flex: none;
}
.result-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty {
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
  padding: 30px 0;
}
.err {
  color: var(--accent);
  font-size: 12.5px;
}
.err.pad {
  padding: 0 18px 12px;
}
.history-link {
  align-self: center;
  font-size: 12.5px;
  color: var(--purple);
  min-height: 44px;
  padding: 0 12px;
}

.entry {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 40px 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.entry-name {
  font-weight: 700;
}
.entry-detail {
  resize: none;
}
.entry-del {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--text-3);
  font-size: 13px;
}
.entry-del:active {
  background: var(--accent-soft);
  color: var(--accent);
}

.person {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 40px 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.person-head {
  display: flex;
  gap: 8px;
}
.p-name {
  flex: 1;
  font-weight: 700;
}
.p-role {
  width: 92px;
  flex: none;
}
.p-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-2);
}
.p-desc {
  resize: none;
}
.person-del {
  top: 8px;
  right: 8px;
}

.chapter {
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ch-title {
  font-size: 14.5px;
  min-width: 0;
}
.ch-ops {
  display: inline-flex;
  gap: 4px;
  flex: none;
}
.mini {
  min-width: 32px;
  min-height: 32px;
  font-size: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
}
.mini.danger {
  color: var(--accent);
}
.ch-summary {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.6;
}
.scene {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0 0 12px;
  border-top: 1px dashed var(--border);
  font-size: 12.5px;
}
.sc-title {
  font-weight: 600;
  flex: none;
}
.sc-desc {
  flex: 1;
  min-width: 0;
  color: var(--text-2);
}

/* ---------- M7 底部 ---------- */
.dock {
  flex: none;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chat-row {
  display: flex;
  gap: 8px;
}
.chat-row .input {
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
  background: var(--accent);
  color: #fff;
  font-size: 16px;
}
.send:disabled {
  opacity: 0.4;
}
.act-row {
  display: flex;
  gap: 8px;
}
.act-row .btn {
  min-height: 44px;
}
.grow {
  flex: 1;
}

/* ---------- 对话历史半屏 ---------- */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 90;
}
.history-sheet {
  width: 100%;
  max-width: 560px;
  height: 62vh;
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
.hs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 18px 10px;
  border-bottom: 1px solid var(--border);
}
.hs-head .icon-btn {
  width: 44px;
  height: 44px;
}
.hs-body {
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

/* ---------- 一次性生成进度 ---------- */
.progress-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.pg-icon {
  color: var(--purple);
}
.progress-page h2 {
  font-size: 18px;
}
.pg-chapter {
  color: var(--text-2);
  font-size: 14px;
}
.pg-track {
  width: 100%;
  max-width: 320px;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-deep);
  overflow: hidden;
}
.pg-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s;
}
.pg-num {
  font-size: 13px;
  color: var(--text-3);
}
.pg-hint {
  font-size: 12.5px;
  color: var(--text-3);
  max-width: 280px;
  line-height: 1.7;
}

/* ---------- M9 完成页 ---------- */
.done-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}
.done-icon {
  font-size: 40px;
}
.done-page h2 {
  font-size: 20px;
}
.done-sub {
  color: var(--text-2);
  font-size: 13.5px;
}
.stats {
  display: flex;
  gap: 12px;
  margin: 14px 0 18px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 84px;
  padding: 12px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.stat strong {
  font-size: 19px;
  color: var(--accent);
}
.stat span {
  font-size: 12px;
  color: var(--text-3);
}
.big {
  width: 100%;
  max-width: 320px;
  min-height: 50px;
  font-size: 15.5px;
  border-radius: var(--radius-lg);
}

/* ---------- M9 生成模式弹层 ---------- */
.gen-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--panel);
  border-radius: 18px 18px 0 0;
  padding-bottom: calc(14px + env(safe-area-inset-bottom));
}
.gs-head {
  padding: 6px 18px 12px;
}
.gs-head h3 {
  font-size: 17px;
  font-weight: 700;
}
.gs-head p {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 2px;
}
.gen-opt {
  width: calc(100% - 36px);
  margin: 0 18px 10px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  padding: 14px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-lg);
  min-height: 76px;
}
.gen-icon {
  font-size: 22px;
}
.gen-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gen-main strong {
  font-size: 15px;
}
.gen-main span {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.6;
}
.gen-progress {
  padding: 0 18px;
  font-size: 12.5px;
  color: var(--purple);
}
</style>
