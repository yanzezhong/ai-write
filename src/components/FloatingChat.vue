<template>
  <div v-if="!minimized" class="float-chat" :style="{ left: pos.x + 'px', top: pos.y + 'px', width: width + 'px' }">
    <header class="fc-head" @mousedown="startDrag">
      <span class="fc-title">
        <AppIcon name="sparkles" :size="14" />
        AI 聊天 · 浮动中（拖我移动）
      </span>
      <span class="fc-actions">
        <button class="icon-btn" title="停靠到侧边栏" @click="layout.dockChat()">
          <AppIcon name="move" :size="14" />
        </button>
        <button class="icon-btn" title="最小化" @click="minimized = true">
          <AppIcon name="chevron-down" :size="14" />
        </button>
      </span>
    </header>
    <div class="fc-body">
      <ChatApp embedded />
    </div>
    <span class="fc-resize" title="拖动调整宽度" @mousedown="startResize"></span>
  </div>
  <button v-else class="fc-min" title="恢复 AI 聊天" @click="minimized = false">
    <AppIcon name="sparkles" :size="15" />
    AI 聊天
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ChatApp from '../apps/ChatApp.vue'
import { useLayoutStore } from '../stores/layout'

const layout = useLayoutStore()

const pos = ref({ x: Math.max(60, window.innerWidth - 480), y: 90 })
const width = ref(400)
const minimized = ref(false)

let drag: { dx: number; dy: number } | null = null
let resize: { startX: number; startW: number } | null = null

function startDrag(e: MouseEvent) {
  drag = { dx: e.clientX - pos.value.x, dy: e.clientY - pos.value.y }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', stop)
}

function startResize(e: MouseEvent) {
  resize = { startX: e.clientX, startW: width.value }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', stop)
  e.preventDefault()
}

function onMove(e: MouseEvent) {
  if (drag) {
    pos.value.x = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - 120)
    pos.value.y = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 60)
  }
  if (resize) {
    width.value = Math.min(Math.max(320, resize.startW + (e.clientX - resize.startX)), 720)
  }
}

function stop() {
  drag = null
  resize = null
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', stop)
}

onBeforeUnmount(stop)
</script>

<style scoped>
.float-chat {
  position: fixed;
  z-index: 60;
  height: min(560px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.fc-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--purple-soft);
  color: var(--purple);
  cursor: grab;
  user-select: none;
}
.fc-head:active {
  cursor: grabbing;
}
.fc-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
}
.fc-actions {
  display: inline-flex;
  gap: 2px;
}
.fc-actions .icon-btn {
  width: 24px;
  height: 24px;
  color: var(--purple);
}
.fc-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fc-resize {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: ew-resize;
}
.fc-min {
  position: fixed;
  right: 18px;
  bottom: 44px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--purple);
  color: #fff;
  font-size: 12.5px;
  box-shadow: var(--shadow);
}
</style>
