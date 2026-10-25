<template>
  <div class="settings-page">
    <header class="topbar">
      <button class="icon-btn" title="返回" @click="goBack">
        <AppIcon name="back" :size="18" />
      </button>
      <span class="topbar-title">设置</span>
    </header>

    <div class="body">
      <nav class="sidenav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeNav === item.key }"
          @click="activeNav = item.key"
        >
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <main class="canvas">
        <component :is="panels[activeNav]" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { router } from '../router'
import ProvidersPanel from './settings/ProvidersPanel.vue'
import GeneralPanel from './settings/GeneralPanel.vue'
import EditorPanel from './settings/EditorPanel.vue'
import AppearancePanel from './settings/AppearancePanel.vue'
import ShortcutsPanel from './settings/ShortcutsPanel.vue'
import AboutPanel from './settings/AboutPanel.vue'

const navItems = [
  { key: 'general', label: '通用', icon: 'layers' },
  { key: 'ai', label: 'AI 供应商', icon: 'sparkles' },
  { key: 'editor', label: '编辑器', icon: 'edit' },
  { key: 'appearance', label: '外观', icon: 'globe' },
  { key: 'shortcuts', label: '快捷键', icon: 'characters' },
  { key: 'about', label: '关于', icon: 'help' },
] as const

type NavKey = (typeof navItems)[number]['key']

const activeNav = ref<NavKey>('ai')

const panels: Record<NavKey, object> = {
  general: GeneralPanel,
  ai: ProvidersPanel,
  editor: EditorPanel,
  appearance: AppearancePanel,
  shortcuts: ShortcutsPanel,
  about: AboutPanel,
}

function goBack() {
  if (history.length > 1) router.back()
  else router.push({ name: 'home' })
}
</script>

<style scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.topbar {
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.topbar-title {
  font-size: 16px;
  font-weight: 600;
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.sidenav {
  width: 220px;
  flex: none;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 14px;
  text-align: left;
  transition: all 0.15s;
}

.nav-item:hover {
  background: var(--panel-2);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: var(--accent);
}

.canvas {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--panel-2);
  padding: 32px;
}

/* ---------- 移动端（<768px）：侧栏变顶部横向标签，内容区单列纵向 ---------- */
@media (max-width: 767.98px) {
  .topbar .icon-btn {
    width: 44px;
    height: 44px;
  }

  .body {
    flex-direction: column;
  }

  .sidenav {
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 2px;
    padding: 6px 10px;
    border-right: none;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .nav-item {
    flex: none;
    min-height: 44px;
    padding: 10px 14px;
    white-space: nowrap;
  }

  .nav-item.active::before {
    left: 10px;
    right: 10px;
    top: auto;
    bottom: -6px;
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }

  .canvas {
    flex: 1;
    min-height: 0;
    padding: 16px;
  }
}
</style>
