<template>
  <footer class="statusbar">
    <div class="left">
      <AppIcon name="folder" :size="12" />
      <span>{{ project.projectName || '未打开项目' }}</span>
      <span v-if="project.isDemo" class="dim">· 演示模式（内存数据，不写磁盘）</span>
      <span v-else-if="project.isOpen" class="dim">· 已授权本地文件夹</span>
    </div>
    <div class="right">
      <span v-if="viewer.open && viewer.tabs.length" class="viewer-stat">
        资料 ×{{ viewer.tabs.length }} 打开中
      </span>
      <span v-if="layout.chatMode === 'float'" class="viewer-stat">AI：浮动</span>
      <template v-if="selCtx">
        <span>已选中 {{ formatWords(countWords(selCtx.text)) }}</span>
        <span v-if="provider" class="dim">· {{ provider.name }} · {{ provider.model }}</span>
      </template>
      <template v-else>
        <span>Markdown</span>
        <span class="dim">· {{ modeLabel }}</span>
        <span v-if="editor.cursor" class="dim">· Ln {{ editor.cursor.line }}，Col {{ editor.cursor.col }}</span>
      </template>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { countWords, formatWords } from '../core/storage'
import { useAIStore } from '../stores/ai'
import { useEditorStore } from '../stores/editor'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'

const editor = useEditorStore()
const project = useProjectStore()
const ai = useAIStore()
const viewer = useViewerStore()
const layout = useLayoutStore()

const provider = computed(() => ai.activeProvider)
const modeLabel = computed(() => (editor.mode === 'wysiwyg' ? '所见即所得' : '源码模式'))

/** selBox 变化时重新读取选区（桥接读取是幂等的） */
const selCtx = computed(() => (editor.selBox ? editor.getSelection() : null))
</script>

<style scoped>
.statusbar {
  height: 26px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
  user-select: none;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.dim {
  color: var(--text-3);
}
.viewer-stat {
  color: var(--accent);
}
</style>
