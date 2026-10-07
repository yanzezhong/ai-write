<template>
  <div class="notes-app">
    <!-- 页头：笔记 | AI 历史 -->
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'notes' }" @click="tab = 'notes'">笔记</button>
      <button class="tab" :class="{ active: tab === 'history' }" @click="tab = 'history'">AI 历史</button>
      <button class="icon-btn new-btn" title="新建笔记" @click="createNote">
        <AppIcon name="plus" :size="16" />
      </button>
    </div>

    <!-- 笔记列表 -->
    <div v-if="tab === 'notes'" class="list">
      <p class="group-label">NOTES/ · 可编辑</p>
      <div v-for="n in notes" :key="n.path" class="note-card" :class="{ active: editor.doc?.path === n.path }">
        <div class="note-main" @click="openNote(n)">
          <div class="note-title">
            {{ n.name.replace(/\.md$/i, '') }}
            <span v-if="isAiNote(n.path)" class="ai-badge">由 AI 总结</span>
          </div>
          <div class="note-meta">{{ timeAgo(n.modified ?? Date.now()) }} · {{ formatWords(n.wordCount) }}</div>
        </div>
        <button
          class="archive-btn"
          title="归档到总资料库（原 note 移入资料库，变为只读资料）"
          :disabled="archiving === n.path"
          @click="archive(n)"
        >
          {{ archiving === n.path ? '归档中…' : '归档→总资料库' }}
        </button>
      </div>
      <p v-if="!notes.length" class="empty">还没有笔记。在编辑器里新建，或从 AI 聊天「总结成 note」。</p>
      <p class="hint">归档路径：note → 总资料库（只读）。归档后原 note 消失。</p>
    </div>

    <!-- AI 历史 -->
    <div v-else class="list">
      <p class="group-label">本项目会话</p>
      <div
        v-for="s in projectSessions"
        :key="s.id"
        class="session-row"
        :class="{ active: s.id === ai.currentSessionId }"
        @click="continueSession(s.id)"
      >
        <span class="session-title">{{ s.title }}</span>
        <span class="session-meta">{{ s.messages.length }} 条 · {{ timeAgo(s.updatedAt) }}</span>
      </div>
      <p v-if="!projectSessions.length" class="empty">当前项目还没有 AI 会话</p>
      <template v-if="otherSessions.length">
        <p class="group-label">其他项目</p>
        <div v-for="s in otherSessions" :key="s.id" class="session-row dim" @click="continueSession(s.id)">
          <span class="session-title">{{ s.title }}</span>
          <span class="session-meta">{{ s.projectName || '未关联项目' }} · {{ timeAgo(s.updatedAt) }}</span>
        </div>
      </template>
      <p class="hint">点击会话跳到 AI 聊天继续对话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { formatWords, timeAgo } from '../core/storage'
import { useAIStore } from '../stores/ai'
import { useEditorStore } from '../stores/editor'
import { useLayoutStore } from '../stores/layout'
import { useLibraryStore } from '../stores/library'
import { useProjectStore } from '../stores/project'
import { getFS } from '../core/fs'
import { openDocInEditor } from '../services/docService'

const ai = useAIStore()
const editor = useEditorStore()
const project = useProjectStore()
const layout = useLayoutStore()
const library = useLibraryStore()

const tab = ref<'notes' | 'history'>('notes')
const archiving = ref('')

const notes = computed(() => project.docs.filter((d) => d.path.startsWith('notes/')))
const projectSessions = computed(() => ai.sessions.filter((s) => s.projectName === project.projectName))
const otherSessions = computed(() => ai.sessions.filter((s) => s.projectName !== project.projectName))

function isAiNote(path: string): boolean {
  return /总结-.*\.md$/.test(path.split('/').pop() ?? '')
}

async function openNote(n: { path: string }) {
  await openDocInEditor(n.path)
}

async function createNote() {
  const name = window.prompt('新笔记名称：', '未命名笔记')
  if (!name?.trim()) return
  const safe = name.trim().replace(/[\\/:*?"<>|]/g, '')
  const path = `notes/${safe}.md`
  const fs = getFS()
  if (await fs.exists(path)) {
    window.alert('已存在同名笔记')
    return
  }
  await fs.writeFile(path, `# ${safe}\n\n`)
  await project.refresh()
  await openDocInEditor(path)
}

async function archive(n: { path: string; name: string }) {
  if (!window.confirm(`把笔记「${n.name}」归档到总资料库？\n归档后 note 将从项目中消失，变为只读资料。`)) return
  archiving.value = n.path
  try {
    if (!library.ready) {
      const ok = await library.init()
      if (!ok) {
        window.alert('总资料库尚未设置，请先在「资料库」页选择文件夹。')
        return
      }
    }
    await library.archiveNoteFromProject(n.path)
    if (editor.doc?.path === n.path) {
      // 当前打开的 note 已归档，清空编辑区
      editor.doc = null
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    archiving.value = ''
  }
}

function continueSession(id: string) {
  ai.switchSession(id)
  layout.chatMode === 'float' ? layout.dockChat() : layout.openApp('chat', 'right')
}
</script>

<style scoped>
.notes-app {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 10px 0;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 6px 12px;
  font-size: 13.5px;
  color: var(--text-2);
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--accent);
  font-weight: 700;
  border-bottom-color: var(--accent);
}
.new-btn {
  margin-left: auto;
  margin-bottom: 4px;
}
.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.group-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-3);
  padding: 6px 6px 4px;
}
.note-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  margin-bottom: 8px;
  background: var(--panel);
  transition: border-color 0.12s;
}
.note-card:hover {
  border-color: var(--border-strong);
}
.note-card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.note-main {
  cursor: pointer;
}
.note-title {
  font-size: 13.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-badge {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--purple);
  background: var(--purple-soft);
  padding: 1px 7px;
  border-radius: 999px;
  flex: none;
}
.note-meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.archive-btn {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 3px 12px;
  transition: all 0.12s;
}
.archive-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.archive-btn:disabled {
  opacity: 0.5;
}
.session-row {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
}
.session-row:hover {
  background: var(--panel-2);
}
.session-row.active {
  background: var(--accent-soft);
}
.session-row.dim {
  opacity: 0.75;
}
.session-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-meta {
  font-size: 11.5px;
  color: var(--text-3);
}
.empty {
  padding: 20px 12px;
  font-size: 12.5px;
  color: var(--text-3);
  text-align: center;
  line-height: 1.7;
}
.hint {
  padding: 8px 6px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.6;
}
</style>
