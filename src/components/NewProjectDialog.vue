<template>
  <div class="overlay" @click.self="close">
    <div class="dialog card" role="dialog" aria-modal="true" aria-label="新建项目">
      <header class="dialog-head">
        <h2 class="dialog-title">新建项目</h2>
        <button class="icon-btn" title="关闭" @click="close">
          <AppIcon name="close" :size="18" />
        </button>
      </header>

      <div class="field">
        <label class="field-label" for="np-name">项目名称</label>
        <input
          id="np-name"
          ref="nameInput"
          v-model="name"
          class="input"
          placeholder="给作品起个名字…"
          @keydown.enter="create"
          @keydown.esc="close"
        />
      </div>

      <div class="field">
        <label class="field-label">存放位置</label>
        <div class="location-row">
          <input class="input" :value="parentName" placeholder="选择存放位置的父文件夹…" readonly />
          <button class="btn" @click="pickParent">选择文件夹…</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label">初始化结构（自动创建）</label>
        <div class="tree-preview">
          <p class="tree-root">{{ name.trim() || '项目名' }}/</p>
          <p v-for="(item, i) in PROJECT_TREE_PREVIEW" :key="item.name" class="tree-line">
            <span class="tree-connector">{{ i === PROJECT_TREE_PREVIEW.length - 1 ? '└──' : '├──' }}</span>
            <span class="tree-name">{{ item.name }}</span>
            <span class="tree-note">{{ item.note }}</span>
          </p>
        </div>
      </div>

      <footer class="dialog-foot">
        <button class="btn" @click="close">取消</button>
        <button class="btn primary" :disabled="!canCreate || creating" @click="create">
          {{ creating ? '创建中…' : '创建项目' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { PROJECT_TREE_PREVIEW, useProjectStore } from '../stores/project'
import { pickDirectory } from '../services/picker'

const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const project = useProjectStore()

const name = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const parentHandle = ref<FileSystemDirectoryHandle | null>(null)
const parentName = ref('')
const creating = ref(false)

const canCreate = computed(() => name.value.trim().length > 0 && parentHandle.value !== null)

onMounted(() => {
  nameInput.value?.focus()
})

function close() {
  emit('close')
}

async function pickParent() {
  try {
    const handle = await pickDirectory()
    parentHandle.value = handle
    parentName.value = handle.name
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    console.error('[选择文件夹]', err)
    alert(err instanceof Error ? err.message : '选择文件夹失败，请重试。')
  }
}

async function create() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    await project.create(parentHandle.value!, name.value.trim())
    close()
    await router.push({ name: 'workspace' })
  } catch (err) {
    console.error('[创建项目]', err)
    alert(err instanceof Error ? `创建项目失败：${err.message}` : '创建项目失败，请检查所选目录权限后重试。')
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  width: 520px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 24px 28px;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 700;
}

.field {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 8px;
}

.location-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.location-row .input {
  flex: 1;
  color: var(--text-2);
}

.tree-preview {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 2;
  overflow-x: auto;
}

.tree-root {
  font-weight: 700;
}

.tree-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  white-space: nowrap;
}

.tree-connector {
  color: var(--text-3);
}

.tree-note {
  color: var(--text-3);
}

.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>
