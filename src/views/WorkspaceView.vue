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
        <button
          v-if="isNoteOpen"
          class="btn archive-note"
          title="归档到总资料库（原 note 消失，变为只读资料）"
          :disabled="archivingNote"
          @click="archiveCurrentNote"
        >
          {{ archivingNote ? '归档中…' : '归档→总资料库' }}
        </button>
        <button
          v-if="canResumeImitate"
          class="btn resume-imitate"
          title="上次的一键仿写还没完成"
          @click="resumeImitate"
        >
          ✨ 继续仿写
        </button>
        <button class="icon-btn" title="资料库" @click="router.push({ name: 'library' })">
          <AppIcon name="layers" :size="17" />
        </button>
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">
          <AppIcon name="settings" :size="17" />
        </button>
      </div>
    </header>

    <div class="main">
      <ActivityBar side="left" />
      <SidePanel v-if="layout.left.open && layout.left.activeAppId" side="left" />
      <ViewerPane v-if="viewer.open && viewer.tabs.length" />
      <EditorPane />
      <SidePanel v-if="layout.right.open && layout.right.activeAppId" side="right" />
      <ActivityBar side="right" />
    </div>

    <StatusBar />

    <SelectionToolbar @action="openAIDialog" />
    <AIDialog v-if="aiDialog" :action-id="aiDialog.actionId" :read-only="aiDialog.readOnly" @close="aiDialog = null" />
    <FloatingChat v-if="layout.chatMode === 'float'" />
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
import FloatingChat from '../components/FloatingChat.vue'
import ViewerPane from '../components/ViewerPane.vue'
import AppIcon from '../components/AppIcon.vue'
import { formatClock, formatWords } from '../core/storage'
import { getFS } from '../core/fs'
import { useEditorStore } from '../stores/editor'
import { useImitateStore } from '../stores/imitate'
import { useLayoutStore } from '../stores/layout'
import { useLibraryStore } from '../stores/library'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'

const router = useRouter()
const editor = useEditorStore()
const layout = useLayoutStore()
const project = useProjectStore()
const viewer = useViewerStore()
const library = useLibraryStore()

const aiDialog = ref<{ actionId: string | null; readOnly: boolean } | null>(null)
const archivingNote = ref(false)
const canResumeImitate = ref(false)

const crumbPath = computed(() => editor.doc?.path ?? '')
const isNoteOpen = computed(() => !!editor.doc?.path.startsWith('notes/'))

/** 全书字数 = 文档列表字数之和（当前文档打开/保存时已同步进列表） */
const totalWords = computed(() => project.docs.reduce((sum, d) => sum + d.wordCount, 0))

function openAIDialog(payload: { actionId: string; source: 'editor' | 'viewer' }) {
  if (payload.source === 'editor') {
    if (!editor.getSelection()) return
  } else if (!window.getSelection()?.toString()) {
    return
  }
  aiDialog.value = { actionId: payload.actionId, readOnly: payload.source === 'viewer' }
}

async function archiveCurrentNote() {
  if (!editor.doc) return
  if (!window.confirm(`把笔记「${editor.doc.name}」归档到总资料库？\n归档后 note 将从项目中消失，变为只读资料。`)) return
  archivingNote.value = true
  try {
    if (!library.ready) {
      const ok = await library.init()
      if (!ok) {
        window.alert('总资料库尚未设置，请先在「资料库」页选择文件夹。')
        return
      }
    }
    await library.archiveNoteFromProject(editor.doc.path)
    editor.doc = null
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    archivingNote.value = false
  }
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
    if (editor.getSelection()) aiDialog.value = { actionId: null, readOnly: false }
  }
}

onMounted(async () => {
  if (!project.isOpen) {
    // 刷新页面后尝试恢复上次会话（演示模式直接重开；真实项目依赖持久授权）
    const { restoreSession } = await import('../services/session')
    const restored = await restoreSession()
    if (!restored) {
      void router.replace({ name: 'home' })
      return
    }
  }
  // 项目里有未完成的仿写进度 → 顶栏显示「继续仿写」
  try {
    const fs = getFS()
    if (await fs.exists('worldbuilding/imitate.json')) {
      const imitate = useImitateStore()
      if (imitate.phase !== 'done') canResumeImitate.value = true
    }
  } catch {
    /* 无仿写进度 */
  }
  window.addEventListener('keydown', onKeydown)
})

async function resumeImitate() {
  const imitate = useImitateStore()
  const ok = imitate.active || (await imitate.loadFromProject())
  if (ok) await router.push({ name: 'imitate' })
}

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

.resume-imitate {
  padding: 5px 12px;
  font-size: 12.5px;
  background: var(--purple-soft);
  border-color: var(--purple);
  color: var(--purple);
}
.resume-imitate:hover {
  filter: brightness(1.05);
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
.archive-note {
  padding: 5px 12px;
  font-size: 12.5px;
}

/* ---------- 三栏主体 ---------- */

.main {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
