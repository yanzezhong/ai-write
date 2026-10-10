<template>
  <div class="skeleton-stage">
    <!-- 左侧导航 -->
    <nav class="nav">
      <button
        v-for="s in sections"
        :key="s.id"
        class="nav-btn"
        :class="{ active: active === s.id }"
        @click="active = s.id"
      >
        <span>{{ s.label }}</span>
        <span v-if="s.locked" class="nav-lock">🔒 {{ s.locked }}</span>
      </button>
      <p class="nav-tip">🔒 锁定的条目不会被 AI 修改</p>
    </nav>

    <!-- 右侧编辑区 -->
    <div class="editor">
      <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>

      <!-- 世界观 -->
      <template v-if="active === 'world'">
        <div class="sec-actions">
          <button class="btn" @click="batchModal = 'world'">✨ AI 修改全部（未锁定）</button>
          <button class="btn ghost" @click="imitate.addWorld()">+ 新增条目</button>
        </div>
        <div v-for="w in imitate.world" :key="w.id" class="row" :class="{ locked: w.locked }">
          <input v-model="w.name" class="input row-name" :disabled="w.locked" @input="w.dirty = true" />
          <textarea v-model="w.detail" class="input row-main" rows="2" :disabled="w.locked" @input="w.dirty = true"></textarea>
          <span class="row-tools">
            <button class="mini" :disabled="w.locked || !w.dirty || imitate.generating" title="AI 优化此条目" @click="imitate.aiPolish('world', w.id)">
              ✨ 优化
            </button>
            <button class="mini" :class="{ on: w.locked }" @click="imitate.toggleLock('world', w.id)">
              {{ w.locked ? '🔒 已锁' : '🔓 锁定' }}
            </button>
            <button v-if="!w.locked" class="mini danger" title="删除" @click="imitate.removeAt('world', w.id)">删</button>
          </span>
        </div>
      </template>

      <!-- 人物库 -->
      <template v-else-if="active === 'persons'">
        <div class="sec-actions">
          <button class="btn" @click="batchModal = 'persons'">✨ AI 修改全部（未锁定）</button>
          <button class="btn ghost" @click="imitate.addPerson()">+ 新增人物</button>
        </div>
        <div v-for="p in imitate.persons" :key="p.id" class="p-card" :class="{ locked: p.locked }">
          <div class="p-grid">
            <input v-model="p.name" class="input" :disabled="p.locked" placeholder="姓名" @input="p.dirty = true" />
            <select v-model="p.role" class="input" :disabled="p.locked" @change="p.dirty = true">
              <option>主角</option><option>配角</option><option>反派</option><option>其他</option>
            </select>
            <input v-model="p.identity" class="input" :disabled="p.locked" placeholder="身份" @input="p.dirty = true" />
            <input v-model="p.tagsText" class="input" :disabled="p.locked" placeholder="标签（顿号/逗号分隔）" @input="onTags(p)" />
          </div>
          <textarea v-model="p.description" class="input p-desc" rows="2" :disabled="p.locked" placeholder="人物描述" @input="p.dirty = true"></textarea>
          <span class="row-tools">
            <button class="mini" :disabled="p.locked || !p.dirty || imitate.generating" title="AI 优化描述" @click="imitate.aiPolish('person-desc', p.id)">
              ✨ 优化
            </button>
            <button class="mini" :class="{ on: p.locked }" @click="imitate.toggleLock('person', p.id)">
              {{ p.locked ? '🔒 已锁' : '🔓 锁定' }}
            </button>
            <button v-if="!p.locked" class="mini danger" title="删除" @click="imitate.removeAt('person', p.id)">删</button>
          </span>
        </div>
      </template>

      <!-- 文风样例 -->
      <template v-else-if="active === 'style'">
        <p class="sec-tip">文风样例会保存到 notes/文风样例.md，生成时作为文风基准。可直接修改。</p>
        <textarea v-model="imitate.styleNote" class="input style-area" rows="16"></textarea>
      </template>

      <!-- 大纲 -->
      <template v-else>
        <div class="sec-actions">
          <button class="btn" @click="regenModal = true" :disabled="imitate.generating">🔄 重新生成大纲（保留锁定章）</button>
          <button class="btn ghost" @click="imitate.addChapter()">+ 新增章节</button>
        </div>
        <div
          v-for="(o, ci) in imitate.outline"
          :key="o.id"
          class="ch-card"
          :class="{ locked: o.locked, dragging: dragIdx === ci }"
          :draggable="!o.locked"
          @dragstart="dragIdx = ci"
          @dragover.prevent
          @drop.prevent="onDrop(ci)"
          @dragend="dragIdx = null"
        >
          <div class="ch-head">
            <span class="drag-handle" :title="o.locked ? '已锁定，不可拖动' : '拖动排序'" :class="{ off: o.locked }">⠿</span>
            <input v-model="o.chapter" class="input ch-title" :disabled="o.locked" @input="o.dirty = true" />
            <span class="row-tools">
              <button class="mini" :disabled="o.locked || !o.dirty || imitate.generating" title="AI 优化本章概要" @click="imitate.aiPolish('chapter-summary', o.id)">✨</button>
              <button class="mini" :class="{ on: o.locked }" @click="imitate.toggleLock('chapter', o.id)">
                {{ o.locked ? '🔒' : '🔓' }}
              </button>
              <button v-if="!o.locked" class="mini danger" title="删除本章" @click="imitate.removeAt('chapter', o.id)">删</button>
            </span>
          </div>
          <textarea v-model="o.summary" class="input ch-summary" rows="2" :disabled="o.locked" placeholder="本章概要" @input="o.dirty = true"></textarea>
          <div v-for="(s, si) in o.scenes" :key="s.id" class="scene">
            <input v-model="s.title" class="input sc-title" :disabled="o.locked" placeholder="场景" />
            <textarea v-model="s.desc" class="input sc-desc" rows="1" :disabled="o.locked" placeholder="场景描述" @input="dirtyScene(o, s)"></textarea>
            <span class="row-tools">
              <button class="mini" :disabled="o.locked || imitate.generating" title="AI 优化场景描述" @click="imitate.aiPolish('scene-desc', o.id, s.id)">✨</button>
              <button class="mini" :disabled="o.locked || si === 0" @click="imitate.moveScene(o.id, si, si - 1)">↑</button>
              <button class="mini" :disabled="o.locked || si === o.scenes.length - 1" @click="imitate.moveScene(o.id, si, si + 1)">↓</button>
              <button v-if="!o.locked" class="mini danger" @click="imitate.removeScene(o.id, s.id)">删</button>
            </span>
          </div>
          <button v-if="!o.locked" class="mini add-scene" @click="imitate.addScene(o.id)">+ 添加场景</button>
        </div>
      </template>
    </div>

    <!-- 底部栏 -->
    <footer class="bottom">
      <span class="lock-stat">🔒 {{ imitate.totalLocked }} 个已锁定</span>
      <span class="spacer"></span>
      <button class="btn" @click="previewModal = true">预览骨架</button>
      <button class="btn primary" :disabled="imitate.generating" @click="emit('request-generate')">生成文章</button>
    </footer>

    <!-- 批量修改弹窗 -->
    <Teleport to="body">
      <div v-if="batchModal" class="mask" @click.self="batchModal = null">
        <div class="dlg">
          <div class="dlg-head">
            <strong>{{ batchModal === 'world' ? 'AI 修改世界观（未锁定条目）' : 'AI 修改人物（未锁定人物）' }}</strong>
            <button class="icon-btn" @click="batchModal = null"><AppIcon name="close" :size="15" /></button>
          </div>
          <p class="dlg-note">已锁定 {{ batchModal === 'world' ? imitate.lockedCounts.world : imitate.lockedCounts.persons }} 项不会被修改。</p>
          <textarea v-model="batchOpinion" class="input" rows="3" placeholder="修改意见，如：名字更口语化、设定更冷峻"></textarea>
          <div class="dlg-foot">
            <button class="btn" @click="batchModal = null">取消</button>
            <button class="btn primary" :disabled="!batchOpinion.trim() || imitate.generating" @click="runBatch">
              {{ imitate.generating ? '修改中…' : '开始修改' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 重新生成大纲弹窗 -->
      <div v-if="regenModal" class="mask" @click.self="regenModal = false">
        <div class="dlg">
          <div class="dlg-head">
            <strong>重新生成大纲</strong>
            <button class="icon-btn" @click="regenModal = false"><AppIcon name="close" :size="15" /></button>
          </div>
          <p class="dlg-note">已锁定的 {{ imitate.lockedCounts.chapters }} 章会按标题原样保留，其余章节按你的意见重排。</p>
          <textarea v-model="regenOpinion" class="input" rows="3" placeholder="调整意见，可留空：如 压缩到 6 章、加强中段冲突"></textarea>
          <div class="dlg-foot">
            <button class="btn" @click="regenModal = false">取消</button>
            <button class="btn primary" :disabled="imitate.generating" @click="runRegen">
              {{ imitate.generating ? '生成中…' : '重新生成' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 预览骨架弹窗 -->
      <div v-if="previewModal" class="mask" @click.self="previewModal = false">
        <div class="dlg preview">
          <div class="dlg-head">
            <strong>骨架预览</strong>
            <button class="icon-btn" @click="previewModal = false"><AppIcon name="close" :size="15" /></button>
          </div>
          <div class="preview-body">
            <pre>{{ previewText }}</pre>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useImitateStore, type ImitatePerson, type ImitateScene } from '../../stores/imitate'

const emit = defineEmits<{ 'request-generate': [] }>()

const imitate = useImitateStore()

const active = ref<'world' | 'persons' | 'style' | 'outline'>('world')
const batchModal = ref<'world' | 'persons' | null>(null)
const batchOpinion = ref('')
const regenModal = ref(false)
const regenOpinion = ref('')
const previewModal = ref(false)
const dragIdx = ref<number | null>(null)

const sections = computed(() => [
  { id: 'world' as const, label: '世界观', locked: imitate.lockedCounts.world },
  { id: 'persons' as const, label: '人物库', locked: imitate.lockedCounts.persons },
  { id: 'style' as const, label: '文风样例', locked: 0 },
  { id: 'outline' as const, label: '大纲', locked: imitate.lockedCounts.chapters },
])

// 人物 tagsText：向 store 写回 tags 数组
function onTags(p: ImitatePerson) {
  p.tags = p.tagsText
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
  p.dirty = true
}

function dirtyScene(o: { id: string }, _s: ImitateScene) {
  void o
}

function onDrop(to: number) {
  if (dragIdx.value === null || dragIdx.value === to) {
    dragIdx.value = null
    return
  }
  imitate.moveChapter(dragIdx.value, to)
  dragIdx.value = null
}

async function runBatch() {
  if (!batchModal.value) return
  await imitate.batchModify(batchModal.value, batchOpinion.value.trim())
  batchOpinion.value = ''
  batchModal.value = null
}

async function runRegen() {
  await imitate.regenOutline(regenOpinion.value.trim())
  regenOpinion.value = ''
  regenModal.value = false
}

const previewText = computed(() => {
  const parts: string[] = ['【世界观】']
  for (const w of imitate.world) parts.push(`· ${w.name}${w.locked ? ' 🔒' : ''}：${w.detail}`)
  parts.push('', '【人物】')
  for (const p of imitate.persons) parts.push(`· ${p.name}（${p.role} · ${p.identity}）${p.locked ? ' 🔒' : ''}：${p.description}`)
  parts.push('', '【文风】', imitate.styleNote, '', '【大纲】')
  for (const o of imitate.outline) {
    parts.push(`${o.chapter}${o.locked ? ' 🔒' : ''}：${o.summary}`)
    for (const s of o.scenes) parts.push(`  - ${s.title}：${s.desc}`)
  }
  return parts.join('\n')
})
</script>

<style scoped>
.skeleton-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.err {
  padding: 6px 14px;
  color: var(--accent);
  font-size: 12.5px;
}

.nav {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-2);
  background: var(--panel-2);
}
.nav-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
.nav-lock {
  font-size: 11px;
}
.nav-tip {
  margin-left: auto;
  align-self: center;
  font-size: 11.5px;
  color: var(--text-3);
}

.editor {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
}
.sec-actions .btn {
  padding: 6px 14px;
  font-size: 13px;
}
.sec-tip {
  font-size: 12.5px;
  color: var(--text-3);
}

.row,
.p-card,
.ch-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.row {
  flex-direction: row;
  align-items: flex-start;
}
.row.locked,
.p-card.locked,
.ch-card.locked {
  border: 2px solid var(--text-2);
  background: var(--panel-2);
}
.row-name {
  width: 180px;
  flex: none;
  font-weight: 600;
}
.row-main {
  flex: 1;
  resize: vertical;
}
.row-tools {
  display: inline-flex;
  gap: 4px;
  align-self: center;
  flex: none;
}
.mini {
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
  white-space: nowrap;
}
.mini:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.4;
}
.mini.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.mini.danger:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.p-grid {
  display: grid;
  grid-template-columns: 120px 90px 1fr 1fr;
  gap: 8px;
}
.p-desc {
  resize: vertical;
}

.style-area {
  resize: vertical;
  line-height: 1.8;
  font-size: 13.5px;
}

.ch-card {
  cursor: default;
}
.ch-card.dragging {
  opacity: 0.5;
}
.drag-handle {
  cursor: grab;
  color: var(--text-3);
  font-size: 15px;
  user-select: none;
}
.drag-handle.off {
  cursor: not-allowed;
  opacity: 0.35;
}
.ch-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ch-title {
  flex: 1;
  font-weight: 700;
}
.ch-summary {
  resize: vertical;
}
.scene {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-left: 22px;
}
.sc-title {
  width: 150px;
  flex: none;
}
.sc-desc {
  flex: 1;
  resize: vertical;
}
.add-scene {
  margin-left: 22px;
  align-self: flex-start;
}

.bottom {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}
.lock-stat {
  font-size: 12.5px;
  color: var(--text-2);
}
.spacer {
  flex: 1;
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
  width: 480px;
  max-width: calc(100vw - 48px);
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dlg.preview {
  width: 640px;
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dlg-note {
  font-size: 12.5px;
  color: var(--text-2);
}
.dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.preview-body {
  max-height: 60vh;
  overflow-y: auto;
  background: var(--panel-2);
  border-radius: var(--radius);
  padding: 12px;
}
.preview-body pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12.5px;
  line-height: 1.8;
  font-family: var(--font-ui);
}
</style>
