<template>
  <section class="viewer-pane">
    <header class="vp-tabs">
      <div
        v-for="t in viewer.tabs"
        :key="t.id"
        class="vp-tab"
        :class="{ active: t.id === viewer.activeId }"
        @click="viewer.activeId = t.id"
      >
        <span class="vp-tab-name" :title="t.name">{{ t.name }}</span>
        <span class="vp-tab-badge"><AppIcon name="lock" :size="10" /> 只读</span>
        <button class="vp-close" title="关闭" @click.stop="viewer.closeTab(t.id)">
          <AppIcon name="close" :size="12" />
        </button>
      </div>
      <button class="vp-add" title="关闭全部" @click="viewer.closeAll">
        <AppIcon name="close" :size="13" />
      </button>
    </header>

    <div class="vp-body">
      <template v-if="tab">
        <div v-if="error" class="vp-error">⚠ {{ error }}</div>
        <div v-else-if="!library.isText(tab.path)" class="vp-binary">
          <AppIcon name="file" :size="26" />
          <p>「{{ tab.name }}」暂不支持在线预览</p>
          <p class="vp-binary-sub">可在资料库页面用系统应用打开</p>
        </div>
        <div v-else-if="content" class="md" v-html="renderMd(content)"></div>
        <p v-else class="vp-loading">读取中…</p>
      </template>
    </div>

    <footer class="vp-foot">资料展示窗格 · 只读，选中文字即可复制摘录</footer>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { renderMd } from '../services/md'
import { useLibraryStore } from '../stores/library'
import { useViewerStore } from '../stores/viewer'

const viewer = useViewerStore()
const library = useLibraryStore()

const tab = ref(viewer.active)
const content = ref('')
const error = ref('')

watch(
  () => viewer.activeId,
  async () => {
    tab.value = viewer.active
    content.value = ''
    error.value = ''
    if (!tab.value || !library.ready) return
    if (!library.isText(tab.value.path)) return
    try {
      content.value = await library.readFileText(tab.value.path)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.viewer-pane {
  width: 400px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--border);
  min-height: 0;
}
.vp-tabs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.vp-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px 6px 12px;
  font-size: 12.5px;
  border-radius: 8px 8px 0 0;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
  border-bottom: none;
  max-width: 180px;
}
.vp-tab.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  border-color: var(--border);
  position: relative;
}
.vp-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--panel);
}
.vp-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.vp-tab-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 5px;
  border-radius: 999px;
  flex: none;
}
.vp-close {
  display: inline-flex;
  color: var(--text-3);
  border-radius: 4px;
  padding: 1px;
  flex: none;
}
.vp-close:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.vp-add {
  margin-left: auto;
  display: inline-flex;
  padding: 4px;
  border-radius: 6px;
  color: var(--text-3);
  flex: none;
}
.vp-add:hover {
  background: var(--bg-deep);
  color: var(--accent);
}
.vp-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  user-select: text;
}
.md {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--text);
  word-break: break-word;
}
.md :deep(p) {
  margin: 0 0 8px;
}
.vp-binary {
  margin-top: 60px;
  text-align: center;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.vp-binary-sub {
  font-size: 12px;
  color: var(--text-3);
}
.vp-error {
  color: var(--accent);
  font-size: 13px;
}
.vp-loading {
  color: var(--text-3);
  font-size: 13px;
}
.vp-foot {
  flex: none;
  padding: 6px 12px;
  font-size: 11.5px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
}
</style>
