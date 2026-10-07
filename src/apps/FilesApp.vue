<template>
  <div class="files-app">
    <div class="toolbar">
      <button class="icon-btn" title="刷新" @click="reload">
        <AppIcon name="refresh" :size="15" />
      </button>
      <div class="crumbs">
        <span class="crumb" @click="cwd = ''">根目录</span>
        <template v-for="(part, i) in crumbParts" :key="i">
          <span class="crumb-sep">/</span>
          <span class="crumb" @click="cwd = crumbParts.slice(0, i + 1).join('/')">{{ part }}</span>
        </template>
      </div>
    </div>

    <div class="tree" @click.stop>
      <div v-if="!nodes.length" class="empty">目录为空</div>
      <div
        v-for="node in nodes"
        :key="node.info.path"
        class="tree-row"
        :style="{ paddingLeft: `${node.depth * 14 + 10}px` }"
        @click="onRowClick(node)"
      >
        <span v-if="node.info.kind === 'dir'" class="twisty">
          <AppIcon :name="node.open ? 'chevron-down' : 'chevron-right'" :size="13" />
        </span>
        <span v-else class="twisty"></span>
        <AppIcon :name="node.info.kind === 'dir' ? 'folder' : 'file'" :size="15" class="row-icon" />
        <span class="row-name">{{ node.info.name }}</span>
      </div>
    </div>

    <div v-if="preview" class="preview">
      <div class="preview-head">
        <AppIcon name="file" :size="14" />
        <span class="preview-name">{{ preview.name }}</span>
        <button class="icon-btn preview-close" @click="preview = null">
          <AppIcon name="close" :size="13" />
        </button>
      </div>
      <pre class="preview-body">{{ preview.text }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { getFS } from '../core/fs'
import type { FileInfo } from '../types'
import { openDocInEditor } from '../services/docService'

interface TreeNode {
  info: FileInfo
  depth: number
  open: boolean
}

const cwd = ref('')
const nodes = ref<TreeNode[]>([])
const preview = ref<{ name: string; text: string } | null>(null)

const crumbParts = computed(() => cwd.value.split('/').filter(Boolean))

async function listNodes(path: string, depth: number): Promise<TreeNode[]> {
  const infos = await getFS()
    .listDir(path)
    .catch(() => [] as FileInfo[])
  return infos.map((info) => ({ info, depth, open: false }))
}

async function reload() {
  nodes.value = await listNodes(cwd.value, 0)
}

async function onRowClick(node: TreeNode) {
  if (node.info.kind === 'dir') {
    const idx = nodes.value.indexOf(node)
    if (idx < 0) return
    if (!node.open) {
      const children = await listNodes(node.info.path, node.depth + 1)
      nodes.value.splice(idx + 1, 0, ...children)
      node.open = true
    } else {
      // 收起：删除其后所有更深层的节点
      let end = idx + 1
      while (end < nodes.value.length && nodes.value[end].depth > node.depth) end++
      nodes.value.splice(idx + 1, end - idx - 1)
      node.open = false
    }
    return
  }
  preview.value = null
  if (/\.md$/i.test(node.info.name)) {
    await openDocInEditor(node.info.path)
    return
  }
  try {
    const text = await getFS().readFile(node.info.path)
    if (text.includes('\0')) {
      preview.value = { name: node.info.name, text: '暂不支持预览' }
    } else {
      preview.value = { name: node.info.name, text: text.slice(0, 2000) }
    }
  } catch {
    preview.value = { name: node.info.name, text: '暂不支持预览' }
  }
}

onMounted(reload)
</script>

<style scoped>
.files-app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--border);
}
.crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
}
.crumb {
  cursor: pointer;
  padding: 2px 3px;
  border-radius: 4px;
}
.crumb:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.crumb-sep {
  color: var(--border-strong);
}

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 4px;
}
.empty {
  padding: 16px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
}
.tree-row:hover {
  background: var(--panel-2);
  color: var(--text);
}
.twisty {
  width: 14px;
  flex-shrink: 0;
  display: inline-flex;
  color: var(--text-3);
}
.row-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: calc(100% - 20px);
  max-height: 55%;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 5;
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.preview-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-close {
  width: 24px;
  height: 24px;
}
.preview-body {
  flex: 1;
  overflow: auto;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
