<template>
  <div v-if="project.isOpen" class="workspace">
    <header class="topbar">
      <div class="tb-left">
        <button class="icon-btn" title="返回项目列表" @click="router.push({ name: 'home' })">
          <AppIcon name="back" :size="17" />
        </button>
        <span class="logo"><AppIcon name="logo" :size="22" /></span>
        <span class="crumb-project">{{ project.projectName }}</span>
        <template v-if="editor.doc">
          <span class="crumb-sep">/</span>
          <span class="crumb-path">{{ crumbPath }}</span>
        </template>
      </div>

      <div class="tb-center">
        <div class="mode-switch" :class="{ disabled: !editor.doc }">
          <button
            class="mode-btn"
            :class="{ active: editor.mode === 'wysiwyg' }"
            :disabled="!editor.doc"
            @click="editor.setMode('wysiwyg')"
          >
            所见即所得
          </button>
          <button
            class="mode-btn"
            :class="{ active: editor.mode === 'source' }"
            :disabled="!editor.doc"
            @click="editor.setMode('source')"
          >
            源码
          </button>
        </div>
      </div>

      <div class="tb-right">
        <template v-if="editor.doc">
          <span class="stat">本章 {{ formatWords(editor.wordCount) }}</span>
          <span class="stat dim">· 全书 {{ formatWords(totalWords) }}</span>
          <span class="save-state" :class="{ dirty: editor.dirty }">
            <template v-if="editor.saving">保存中…</template>
            <template v-else-if="editor.dirty">编辑中…</template>
            <template v-else>
              <AppIcon name="check" :size="12" class="save-check" />
              已自动保存 {{ formatClock(editor.doc.lastSavedAt) }}
            </template>
          </span>
        </template>
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">
          <AppIcon name="settings" :size="17" />
        </button>
      </div>
    </header>

    <div class="main">
      <ActivityBar side="left" />
      <SidePanel v-if="layout.left.open && layout.left.activeAppId" side="left" />
      <EditorPane />
      <SidePanel v-if="layout.right.open && layout.right.activeAppId" side="right" />
      <ActivityBar side="right" />
    </div>

    <StatusBar />

    <SelectionToolbar @action="openAIDialog" />
    <AIDialog v-if="aiDialog" :action-id="aiDialog.actionId" @close="aiDialog = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ActivityBar from '../components/ActivityBar.vue'
import SidePanel from '../components/SidePanel.vue'
import EditorPane from '../components/EditorPane.vue'
import StatusBar from '../components/StatusBar.vue'
import SelectionToolbar from '../components/SelectionToolbar.vue'
import AIDialog from '../components/AIDialog.vue'
import AppIcon from '../components/AppIcon.vue'
import { formatClock, formatWords } from '../core/storage'
import { useEditorStore } from '../stores/editor'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'

const router = useRouter()
const editor = useEditorStore()
const layout = useLayoutStore()
const project = useProjectStore()

const aiDialog = ref<{ actionId: string | null } | null>(null)

const crumbPath = computed(() => editor.doc?.path ?? '')

/** 全书字数 = 文档列表字数之和（当前文档打开/保存时已同步进列表） */
const totalWords = computed(() => project.docs.reduce((sum, d) => sum + d.wordCount, 0))

function openAIDialog(actionId: string) {
  if (!editor.getSelection()) return
  aiDialog.value = { actionId }
}

function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    void editor.flush()
  } else if (key === 'e' && editor.doc) {
    e.preventDefault()
    editor.setMode(editor.mode === 'wysiwyg' ? 'source' : 'wysiwyg')
  } else if (key === 'j') {
    e.preventDefault()
    if (editor.getSelection()) aiDialog.value = { actionId: null }
  }
}

onMounted(() => {
  if (!project.isOpen) {
    void router.replace({ name: 'home' })
    return
  }
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

/* ---------- 顶栏 ---------- */

.topbar {
  height: 50px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.tb-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo {
  display: flex;
  color: var(--accent);
}
.crumb-project {
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}
.crumb-sep {
  color: var(--text-3);
}
.crumb-path {
  color: var(--text-2);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-center {
  flex: none;
}
.mode-switch {
  display: flex;
  background: var(--bg-deep);
  border-radius: 999px;
  padding: 3px;
}
.mode-switch.disabled {
  opacity: 0.5;
}
.mode-btn {
  padding: 5px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-2);
  transition: all 0.15s;
}
.mode-btn.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  box-shadow: var(--shadow);
}
.mode-btn:disabled {
  cursor: not-allowed;
}

.tb-right {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  font-size: 12.5px;
}
.stat {
  white-space: nowrap;
}
.dim {
  color: var(--text-3);
}
.save-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--green);
  white-space: nowrap;
}
.save-state.dirty {
  color: var(--text-3);
}
.save-check {
  color: var(--green);
}

/* ---------- 三栏主体 ---------- */

.main {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
