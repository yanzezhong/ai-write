<template>
  <div class="panel">
    <h1 class="page-title">通用</h1>

    <div class="card section">
      <div class="row">
        <div>
          <div class="row-title">自动保存</div>
          <div class="row-desc">编辑内容防抖 800ms 后自动写入本地文件，无需手动保存。</div>
        </div>
        <button class="switch" :class="{ on: autoSave }" role="switch" :aria-checked="autoSave" @click="autoSave = !autoSave">
          <span class="knob" />
        </button>
      </div>

      <div class="row">
        <div>
          <div class="row-title">编辑器模式默认</div>
          <div class="row-desc">新建文档时使用的编辑模式。</div>
        </div>
        <div class="fake-select">
          <button
            v-for="opt in modeOptions"
            :key="opt"
            class="fake-option"
            :class="{ active: editorMode === opt }"
            @click="editorMode = opt"
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

const modeOptions = ['所见即所得', '源码'] as const

const prefs = usePrefsStore()
const autoSave = computed({
  get: () => prefs.autoSave,
  set: (v: boolean) => prefs.update({ autoSave: v }),
})
const editorMode = computed({
  get: () => (prefs.defaultMode === 'source' ? '源码' : '所见即所得'),
  set: (v) => prefs.update({ defaultMode: v === '源码' ? 'source' : 'wysiwyg' }),
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

.switch {
  flex: none;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: var(--border-strong);
  position: relative;
  transition: background 0.15s;
}

.switch.on {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}

.switch.on .knob {
  transform: translateX(18px);
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

/* ---------- 移动端（<768px）：行纵向堆叠，控件全宽、触屏热区 ≥44px ---------- */
@media (max-width: 767.98px) {
  .section {
    padding: 6px 16px;
  }

  .row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .fake-select {
    width: 100%;
  }

  .fake-option {
    flex: 1;
    min-height: 44px;
  }

  .switch {
    align-self: flex-start;
    width: 54px;
    height: 32px;
  }

  .knob {
    width: 26px;
    height: 26px;
  }

  .switch.on .knob {
    transform: translateX(22px);
  }

  /* 扩大点击热区至 44px 高（32px 轨道 + 上下各 6px 透明区） */
  .switch::after {
    content: '';
    position: absolute;
    inset: -6px;
  }
}
</style>
