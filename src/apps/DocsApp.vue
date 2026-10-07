<template>
  <div class="docs-app">
    <div class="search-row">
      <AppIcon name="search" :size="15" class="search-icon" />
      <input v-model="keyword" class="search-input" placeholder="搜索文档…" />
    </div>

    <div class="list">
      <template v-for="group in groups" :key="group.label">
        <div v-if="group.docs.length" class="group">
          <div class="group-label">{{ group.label }}</div>
          <div
            v-for="doc in group.docs"
            :key="doc.path"
            class="doc-row"
            :class="{ active: editor.doc?.path === doc.path }"
            @click="openDocInEditor(doc.path)"
          >
            <AppIcon name="doc" :size="15" class="row-icon" />
            <span class="row-name">
              {{ doc.name }}
              <span v-if="doc.wordCount < 800" class="draft-pill">草稿</span>
            </span>
            <span class="row-words">{{ formatWords(doc.wordCount) }}</span>
          </div>
        </div>
        <div v-if="!group.docs.length" class="group">
          <div class="group-label">{{ group.label }}</div>
          <div class="group-empty">暂无文档</div>
        </div>
      </template>
    </div>

    <div class="footer">
      <div v-if="creating" class="create-inline">
        <input
          ref="createInput"
          v-model="newName"
          class="input create-input"
          placeholder="输入文档名，回车创建（chapters/）"
          @keydown.enter="submitCreate"
          @keydown.esc="creating = false"
        />
      </div>
      <button v-else class="new-btn" @click="startCreate">
        <AppIcon name="plus" :size="15" />
        新建文档
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { formatWords } from '../core/storage'
import { createDoc, openDocInEditor } from '../services/docService'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'

const project = useProjectStore()
const editor = useEditorStore()

const keyword = ref('')
const creating = ref(false)
const newName = ref('')
const createInput = ref<HTMLInputElement | null>(null)

const match = (path: string) => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return true
  return path.toLowerCase().includes(kw)
}

const groups = computed(() => [
  {
    label: 'CHAPTERS',
    docs: project.docs.filter((d) => d.path.startsWith('chapters/') && match(d.path)),
  },
  {
    label: 'NOTES',
    docs: project.docs.filter((d) => d.path.startsWith('notes/') && match(d.path)),
  },
])

function startCreate() {
  creating.value = true
  newName.value = ''
  void nextTick(() => createInput.value?.focus())
}

async function submitCreate() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = false
  await createDoc('chapters', name)
}
</script>

<style scoped>
.docs-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-row {
  position: relative;
  padding: 10px 12px 6px;
}
.search-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(calc(-50% + 2px));
  color: var(--text-3);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  outline: none;
  font-size: 13px;
  transition: border-color 0.15s;
}
.search-input:focus {
  border-color: var(--accent);
}
.search-input::placeholder {
  color: var(--text-3);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
}

.group-label {
  padding: 10px 8px 4px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--text-3);
}
.group-empty {
  padding: 2px 8px 6px;
  font-size: 12px;
  color: var(--text-3);
}

.doc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  border-left: 3px solid transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
  transition: background 0.12s;
}
.doc-row:hover {
  background: var(--panel-2);
  color: var(--text);
}
.doc-row.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-left-color: var(--accent);
  font-weight: 600;
}
.row-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.doc-row.active .row-icon {
  color: var(--accent);
}
.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.draft-pill {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 400;
  padding: 1px 6px;
  border-radius: 99px;
  background: var(--bg-deep);
  color: var(--text-3);
}
.row-words {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
}

.footer {
  position: sticky;
  bottom: 0;
  padding: 8px 12px 10px;
  background: var(--panel);
}
.new-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 13px;
  transition: all 0.15s;
}
.new-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.create-input {
  font-size: 13px;
  padding: 7px 10px;
}
</style>
