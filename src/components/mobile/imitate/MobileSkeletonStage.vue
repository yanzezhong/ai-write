<template>
  <div class="m-skeleton">
    <!-- 顶部 Tab -->
    <nav class="tabs">
      <button
        v-for="s in sections"
        :key="s.id"
        class="tab"
        :class="{ active: active === s.id }"
        @click="active = s.id"
      >
        {{ s.label }}<span v-if="s.locked" class="tab-lock">{{ s.locked }}</span>
      </button>
    </nav>

    <!-- 内容区 -->
    <main class="scroll">
      <p v-if="imitate.error" class="err">⚠ {{ imitate.error }}</p>

      <!-- 世界观 -->
      <template v-if="active === 'world'">
        <button class="btn ghost wide" @click="imitate.addWorld()">+ 新增条目</button>
        <div v-for="w in imitate.world" :key="w.id" class="card" :class="{ locked: w.locked }">
          <input v-model="w.name" class="input c-name" :disabled="w.locked" @input="w.dirty = true" />
          <textarea v-model="w.detail" class="input c-main" rows="2" :disabled="w.locked" @input="w.dirty = true"></textarea>
          <div class="card-tools">
            <button class="pill-btn" :disabled="w.locked || !w.dirty || imitate.generating" @click="imitate.aiPolish('world', w.id)">
              ✨ AI 优化<span v-if="!w.dirty" class="dim">（未改动）</span>
            </button>
            <button v-if="!w.locked" class="pill-btn danger" @click="imitate.removeAt('world', w.id)">删除</button>
            <span class="spacer"></span>
            <button class="lock-btn" :class="{ on: w.locked }" :aria-label="w.locked ? '解锁' : '锁定'" @click="imitate.toggleLock('world', w.id)">
              {{ w.locked ? '🔒' : '🔓' }}
            </button>
          </div>
        </div>
        <button class="btn ghost wide" @click="openBatch('world')">✨ AI 修改全部（未锁定）</button>
      </template>

      <!-- 人物库 -->
      <template v-else-if="active === 'persons'">
        <button class="btn ghost wide" @click="imitate.addPerson()">+ 新增人物</button>
        <div v-for="p in imitate.persons" :key="p.id" class="card" :class="{ locked: p.locked }">
          <div class="p-head">
            <input v-model="p.name" class="input p-name" :disabled="p.locked" placeholder="姓名" @input="p.dirty = true" />
            <select v-model="p.role" class="input p-role" :disabled="p.locked" @change="p.dirty = true">
              <option>主角</option><option>配角</option><option>反派</option><option>其他</option>
            </select>
          </div>
          <input v-model="p.identity" class="input" :disabled="p.locked" placeholder="身份" @input="p.dirty = true" />
          <input
            v-model="p.tagsText"
            class="input"
            :disabled="p.locked"
            placeholder="标签（顿号/逗号分隔）"
            @input="onTags(p)"
          />
          <textarea v-model="p.description" class="input c-main" rows="3" :disabled="p.locked" placeholder="人物描述" @input="p.dirty = true"></textarea>
          <div class="card-tools">
            <button class="pill-btn" :disabled="p.locked || !p.dirty || imitate.generating" @click="imitate.aiPolish('person-desc', p.id)">
              ✨ AI 优化<span v-if="!p.dirty" class="dim">（未改动）</span>
            </button>
            <button v-if="!p.locked" class="pill-btn danger" @click="imitate.removeAt('person', p.id)">删除</button>
            <span class="spacer"></span>
            <button class="lock-btn" :class="{ on: p.locked }" :aria-label="p.locked ? '解锁' : '锁定'" @click="imitate.toggleLock('person', p.id)">
              {{ p.locked ? '🔒' : '🔓' }}
            </button>
          </div>
        </div>
        <button class="btn ghost wide" @click="openBatch('persons')">✨ AI 修改全部（未锁定）</button>
      </template>

      <!-- 文风样例 -->
      <template v-else-if="active === 'style'">
        <p class="tip">文风样例会保存到 notes/文风样例.md，生成时作为文风基准。可直接修改。</p>
        <textarea v-model="imitate.styleNote" class="input style-area" rows="16"></textarea>
      </template>

      <!-- 大纲 -->
      <template v-else>
        <button class="btn ghost wide" @click="regenModal = true">🔄 重新生成大纲（保留锁定章）</button>
        <button class="btn ghost wide" @click="imitate.addChapter()">+ 新增章节</button>
        <div v-for="(o, ci) in imitate.outline" :key="o.id" class="card ch-card" :class="{ locked: o.locked }">
          <div class="ch-head">
            <input v-model="o.chapter" class="input ch-title" :disabled="o.locked" @input="o.dirty = true" />
            <button class="lock-btn" :class="{ on: o.locked }" :aria-label="o.locked ? '解锁' : '锁定'" @click="imitate.toggleLock('chapter', o.id)">
              {{ o.locked ? '🔒' : '🔓' }}
            </button>
          </div>
          <textarea v-model="o.summary" class="input c-main" rows="2" :disabled="o.locked" placeholder="本章概要" @input="o.dirty = true"></textarea>
          <div class="ch-ops">
            <button class="pill-btn" :disabled="o.locked || imitate.generating" @click="imitate.regenScenes(o.id)">🔄 重生成场景</button>
            <button class="pill-btn" :disabled="o.locked || !o.dirty || imitate.generating" @click="imitate.aiPolish('chapter-summary', o.id)">✨ 优化概要</button>
            <button v-if="!o.locked" class="pill-btn danger" @click="imitate.removeAt('chapter', o.id)">删除本章</button>
          </div>
          <div v-for="(s, si) in o.scenes" :key="s.id" class="scene">
            <div class="scene-row">
              <input v-model="s.title" class="input sc-title" :disabled="o.locked" placeholder="场景" @input="o.dirty = true" />
              <button class="mini" :disabled="o.locked || si === 0" aria-label="上移" @click="imitate.moveScene(o.id, si, si - 1)">↑</button>
              <button class="mini" :disabled="o.locked || si === o.scenes.length - 1" aria-label="下移" @click="imitate.moveScene(o.id, si, si + 1)">↓</button>
              <button v-if="!o.locked" class="mini danger" aria-label="删除场景" @click="imitate.removeScene(o.id, s.id)">✕</button>
            </div>
            <textarea v-model="s.desc" class="input sc-desc" rows="1" :disabled="o.locked" placeholder="场景描述" @input="o.dirty = true"></textarea>
            <button class="pill-btn sc-polish" :disabled="o.locked || !o.dirty || imitate.generating" @click="imitate.aiPolish('scene-desc', o.id, s.id)">✨ 优化</button>
          </div>
          <button v-if="!o.locked" class="pill-btn add-scene" @click="imitate.addScene(o.id)">+ 添加场景</button>
        </div>
      </template>
    </main>

    <!-- 底部固定栏 -->
    <footer class="bottom">
      <span class="lock-stat">🔒 {{ imitate.totalLocked }}/{{ imitate.world.length + imitate.persons.length + imitate.outline.length }} 条已锁定</span>
      <button class="btn primary gen" :disabled="imitate.generating" @click="emit('request-generate')">生成文章 →</button>
    </footer>

    <!-- 批量修改：全屏对话框 -->
    <Teleport to="body">
      <div v-if="batchModal" class="full-dialog">
        <header class="fd-head">
          <button class="icon-btn" aria-label="返回" @click="batchModal = null"><AppIcon name="back" :size="18" /></button>
          <strong>{{ batchModal === 'world' ? 'AI 修改世界观' : 'AI 修改人物' }}</strong>
        </header>
        <main class="fd-body">
          <p class="tip">已锁定 {{ batchModal === 'world' ? imitate.lockedCounts.world : imitate.lockedCounts.persons }} 项不会被修改。</p>
          <textarea v-model="batchOpinion" class="input opinion" rows="4" placeholder="修改意见，如：名字更口语化、设定更冷峻"></textarea>
        </main>
        <footer class="fd-foot">
          <button class="btn ghost" @click="batchModal = null">取消</button>
          <button class="btn primary grow" :disabled="!batchOpinion.trim() || imitate.generating" @click="runBatch">
            {{ imitate.generating ? '修改中…' : '开始修改' }}
          </button>
        </footer>
      </div>

      <!-- 重新生成大纲：全屏对话框 -->
      <div v-if="regenModal" class="full-dialog">
        <header class="fd-head">
          <button class="icon-btn" aria-label="返回" @click="regenModal = false"><AppIcon name="back" :size="18" /></button>
          <strong>重新生成大纲</strong>
        </header>
        <main class="fd-body">
          <p class="tip">已锁定的 {{ imitate.lockedCounts.chapters }} 章会按标题原样保留，其余章节按你的意见重排。</p>
          <textarea v-model="regenOpinion" class="input opinion" rows="4" placeholder="调整意见，可留空：如 压缩到 6 章、加强中段冲突"></textarea>
        </main>
        <footer class="fd-foot">
          <button class="btn ghost" @click="regenModal = false">取消</button>
          <button class="btn primary grow" :disabled="imitate.generating" @click="runRegen">
            {{ imitate.generating ? '生成中…' : '重新生成' }}
          </button>
        </footer>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../AppIcon.vue'
import { useImitateStore, type ImitatePerson } from '../../../stores/imitate'

const emit = defineEmits<{ 'request-generate': [] }>()
const imitate = useImitateStore()

const active = ref<'world' | 'persons' | 'style' | 'outline'>('world')
const batchModal = ref<'world' | 'persons' | null>(null)
const batchOpinion = ref('')
const regenModal = ref(false)
const regenOpinion = ref('')

const sections = computed(() => [
  { id: 'world' as const, label: '世界观', locked: imitate.lockedCounts.world },
  { id: 'persons' as const, label: '人物库', locked: imitate.lockedCounts.persons },
  { id: 'style' as const, label: '文风样例', locked: 0 },
  { id: 'outline' as const, label: '大纲', locked: imitate.lockedCounts.chapters },
])

function onTags(p: ImitatePerson) {
  p.tags = p.tagsText
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
  p.dirty = true
}

function openBatch(kind: 'world' | 'persons') {
  batchOpinion.value = ''
  batchModal.value = kind
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
</script>

<style scoped>
.m-skeleton {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tabs {
  flex: none;
  display: flex;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.tab {
  flex: 1;
  min-height: 48px;
  font-size: 14px;
  color: var(--text-2);
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--accent);
  font-weight: 700;
  border-bottom-color: var(--accent);
}
.tab-lock {
  margin-left: 3px;
  font-size: 11px;
  color: var(--text-3);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.err {
  color: var(--accent);
  font-size: 12.5px;
}
.tip {
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.7;
}
.wide {
  width: 100%;
  min-height: 46px;
}
.spacer {
  flex: 1;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.card.locked {
  border: 2px solid var(--text-2);
  background: var(--panel-2);
}
.c-name {
  font-weight: 700;
}
.c-main {
  resize: none;
}
.card-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pill-btn {
  min-height: 36px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  font-size: 12.5px;
  color: var(--text-2);
}
.pill-btn:disabled {
  opacity: 0.4;
}
.pill-btn.danger {
  color: var(--accent);
}
.dim {
  color: var(--text-3);
  font-size: 11.5px;
}
.lock-btn {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.lock-btn.on {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.p-head {
  display: flex;
  gap: 8px;
}
.p-name {
  flex: 1;
  font-weight: 700;
}
.p-role {
  width: 96px;
  flex: none;
}

.style-area {
  resize: none;
  line-height: 1.8;
  font-size: 14px;
}

.ch-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ch-title {
  flex: 1;
  min-width: 0;
  font-weight: 700;
}
.ch-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.scene {
  padding: 8px 0 0;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scene-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sc-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}
.sc-desc {
  resize: none;
}
.sc-polish {
  align-self: flex-start;
}
.mini {
  width: 32px;
  height: 32px;
  flex: none;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  color: var(--text-2);
}
.mini.danger {
  color: var(--accent);
}
.add-scene {
  align-self: flex-start;
}

.bottom {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: var(--panel);
  border-top: 1px solid var(--border);
}
.lock-stat {
  font-size: 13px;
  color: var(--text-2);
  flex: none;
}
.gen {
  flex: 1;
  min-height: 50px;
  font-size: 15.5px;
  border-radius: var(--radius-lg);
}

/* ---------- 全屏对话框 ---------- */
.full-dialog {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
.fd-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 6px 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.fd-head .icon-btn {
  width: 44px;
  height: 44px;
}
.fd-head strong {
  font-size: 16px;
}
.fd-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.opinion {
  resize: none;
  font-size: 14.5px;
  line-height: 1.7;
}
.fd-foot {
  flex: none;
  display: flex;
  gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--panel);
}
.fd-foot .btn {
  min-height: 48px;
}
.grow {
  flex: 1;
}
</style>
