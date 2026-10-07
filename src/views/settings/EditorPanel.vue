<template>
  <div class="panel">
    <h1 class="page-title">编辑器</h1>

    <div class="card section">
      <div class="row">
        <div>
          <div class="row-title">字号</div>
          <div class="row-desc">正文字号，当前 {{ fontSize }}px。</div>
        </div>
        <div class="slider-wrap">
          <input v-model.number="fontSize" type="range" :min="14" :max="20" :step="1" />
        </div>
      </div>

      <div class="row">
        <div>
          <div class="row-title">行宽</div>
          <div class="row-desc">编辑区内容最大宽度。</div>
        </div>
        <div class="fake-select">
          <button
            v-for="opt in lineWidthOptions"
            :key="opt"
            class="fake-option"
            :class="{ active: lineWidth === opt }"
            @click="lineWidth = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="row">
        <div>
          <div class="row-title">段落间距</div>
          <div class="row-desc">段落之间的留白，当前{{ paragraphGap === '紧凑' ? '较小' : paragraphGap === '默认' ? '适中' : '较大' }}。</div>
        </div>
        <div class="fake-select">
          <button
            v-for="opt in paragraphGapOptions"
            :key="opt"
            class="fake-option"
            :class="{ active: paragraphGap === opt }"
            @click="paragraphGap = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePrefsStore } from '../../stores/prefs'
import type { LineWidth, ParagraphGap } from '../../stores/prefs'

const lineWidthOptions = ['窄', '默认', '宽'] as const
const paragraphGapOptions = ['紧凑', '默认', '宽松'] as const

const prefs = usePrefsStore()
const fontSize = computed({
  get: () => prefs.fontSize,
  set: (v: number) => prefs.update({ fontSize: v }),
})
const lineWidth = computed({
  get: () => prefs.lineWidth,
  set: (v: LineWidth) => prefs.update({ lineWidth: v }),
})
const paragraphGap = computed({
  get: () => prefs.paragraphGap,
  set: (v: ParagraphGap) => prefs.update({ paragraphGap: v }),
})
</script>

<style scoped>
.panel {
  max-width: 680px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
}

.section {
  padding: 6px 20px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.row:last-child {
  border-bottom: none;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.row-desc {
  color: var(--text-3);
  font-size: 12px;
}

.slider-wrap input[type='range'] {
  width: 180px;
  accent-color: var(--accent);
}

.fake-select {
  display: flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  overflow: hidden;
}

.fake-option {
  padding: 7px 16px;
  font-size: 13px;
  color: var(--text-2);
  transition: all 0.15s;
}

.fake-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
</style>
