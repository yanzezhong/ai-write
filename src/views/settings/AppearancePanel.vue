<template>
  <div class="panel">
    <h1 class="page-title">外观</h1>

    <div class="card section">
      <div class="row">
        <div>
          <div class="row-title">主题色</div>
          <div class="row-desc">当前为暖米白 + 朱红主色。</div>
        </div>
        <div class="swatches">
          <button
            v-for="t in themes"
            :key="t.label"
            class="swatch"
            :class="{ active: theme === t.label }"
            :style="{ background: t.bg, borderColor: t.accent }"
            :title="t.label"
            @click="theme = t.label"
          >
            <AppIcon v-if="theme === t.label" name="check" :size="16" />
          </button>
        </div>
      </div>

      <div class="row">
        <div>
          <div class="row-title">标题字体</div>
          <div class="row-desc">文档标题使用衬线更显正式，无衬线更现代。</div>
        </div>
        <div class="fake-select">
          <button
            v-for="opt in headingFontOptions"
            :key="opt"
            class="fake-option"
            :class="{ active: headingFont === opt }"
            @click="headingFont = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { usePrefsStore } from '../../stores/prefs'

const themes = [
  { label: '暖米白', bg: '#f5f2ea', accent: '#bc3f2b' },
  { label: '石墨灰', bg: '#2b2b30', accent: '#d0d0d6' },
  { label: '雾蓝', bg: '#eef2f6', accent: '#3d6ea5' },
]

const headingFontOptions = ['衬线标题', '无衬线标题'] as const

const theme = ref('暖米白')
const prefs = usePrefsStore()
const headingFont = computed({
  get: () => prefs.headingFont,
  set: (v) => prefs.update({ headingFont: v }),
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

.swatches {
  display: flex;
  gap: 10px;
}

.swatch {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.15s;
}

.swatch.active {
  box-shadow: 0 0 0 2px var(--accent);
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
