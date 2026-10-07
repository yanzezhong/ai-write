<template>
  <div class="library-app">
    <!-- 未设置 -->
    <div v-if="!library.ready && !library.setupDone" class="empty">
      <AppIcon name="folder" :size="26" class="empty-icon" />
      <p class="empty-title">总资料库未设置</p>
      <p class="empty-desc">选择全局文件夹后即可浏览、归档资料。</p>
      <div class="empty-actions">
        <button class="btn primary" :disabled="busy" @click="chooseFolder">选择文件夹…</button>
        <button v-if="project.isDemo" class="btn" :disabled="busy" @click="useDemo">演示资料库</button>
      </div>
      <p v-if="error" class="err">⚠ {{ error }}</p>
    </div>

    <template v-else-if="library.ready">
      <div class="view-bar">
        <select v-model="library.viewGroupId" class="input view-select">
          <option value="all">全部</option>
          <option v-for="g in library.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button class="icon-btn" title="在资料库页面打开（管理标签组 / 导入 / 删除）" @click="goPage">
          <AppIcon name="external" :size="15" />
        </button>
      </div>

      <div class="tree">
        <template v-if="library.viewGroupId === 'all'">
          <div
            v-for="f in library.files"
            :key="f"
            class="row"
            :class="{ active: isOpen(f) }"
            :title="f"
            @click="open(f)"
          >
            <span class="row-name">{{ f }}</span>
            <AppIcon name="lock" :size="11" class="lock" />
          </div>
        </template>
        <template v-else>
          <div v-for="row in library.viewRows" :key="row.tag?.id ?? '__untagged'" class="grp">
            <div class="grp-head">
              {{ row.tag ? row.tag.name : '未分组' }}
              <span class="grp-count">{{ row.files.length }}</span>
            </div>
            <div
              v-for="f in row.files"
              :key="f"
              class="row indent"
              :class="{ active: isOpen(f) }"
              :title="f"
              @click="open(f)"
            >
              <span class="row-name">{{ f }}</span>
              <AppIcon name="lock" :size="11" class="lock" />
            </div>
          </div>
        </template>
        <p v-if="!library.files.length" class="tree-empty">资料库为空：在资料库页导入，或归档笔记</p>
      </div>

      <p class="hint">点击文件在「资料展示窗格」打开（与编辑区并列）</p>
    </template>

    <div v-else class="empty"><p class="empty-desc">正在打开…</p></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { pickDirectory } from '../services/picker'
import { useLibraryStore } from '../stores/library'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'

const router = useRouter()
const library = useLibraryStore()
const project = useProjectStore()
const viewer = useViewerStore()

const busy = ref(false)
const error = ref('')

onMounted(async () => {
  if (!library.ready && !library.setupDone) {
    // 演示模式下如果库已设置过（刷新后句柄丢失）不自动处理，等用户点按钮
  }
})

function open(file: string) {
  viewer.openLibraryFile(file)
}

function isOpen(file: string): boolean {
  return viewer.tabs.some((t) => t.source === 'library' && t.path === file)
}

function goPage() {
  void router.push({ name: 'library' })
}

async function chooseFolder() {
  busy.value = true
  error.value = ''
  try {
    const handle = await pickDirectory()
    await library.setup(handle)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function useDemo() {
  busy.value = true
  try {
    await library.setup(null, true)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.library-app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.view-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.view-select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  font-size: 12.5px;
}
.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.grp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 6px 3px;
}
.grp-count {
  color: var(--text-3);
  font-weight: 400;
  font-size: 11px;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.row.indent {
  margin-left: 12px;
}
.row:hover {
  background: var(--panel-2);
}
.row.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lock {
  color: var(--text-3);
  flex: none;
}
.tree-empty {
  padding: 24px 14px;
  font-size: 12.5px;
  color: var(--text-3);
  text-align: center;
  line-height: 1.7;
}
.hint {
  flex: none;
  padding: 8px 12px;
  font-size: 11.5px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}
.empty-icon {
  color: var(--text-3);
}
.empty-title {
  font-weight: 600;
}
.empty-desc {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.6;
}
.empty-actions {
  display: flex;
  gap: 8px;
}
.err {
  color: var(--accent);
  font-size: 12px;
}
</style>
