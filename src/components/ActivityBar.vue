<template>
  <nav class="activity-bar" :class="side">
    <button
      v-for="app in apps"
      :key="app.id"
      class="rail-btn"
      :class="{ active: isActive(app.id) }"
      :title="app.name"
      @click="toggle(app.id)"
    >
      <AppIcon :name="app.icon" :size="19" />
    </button>

    <div class="rail-spacer"></div>
    <button class="rail-btn" title="设置" @click="router.push({ name: 'settings' })">
      <AppIcon name="settings" :size="18" />
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { APP_PLUGINS } from '../plugins'
import type { AppPlugin } from '../core/pluginRegistry'
import { useLayoutStore, type Side } from '../stores/layout'

const props = defineProps<{ side: Side }>()

const router = useRouter()
const layout = useLayoutStore()

/** 兼容旧持久化数据：appSide 未记录的应用按「导航类左栏 / 辅助类右栏」回退 */
const DEFAULT_SIDE: Record<string, Side> = {
  files: 'left',
  docs: 'left',
  outline: 'left',
  characters: 'right',
  chat: 'right',
  browser: 'right',
}

const apps = computed<AppPlugin[]>(() =>
  APP_PLUGINS.filter((p) => (layout.appSide[p.id] ?? DEFAULT_SIDE[p.id] ?? 'left') === props.side),
)

function isActive(appId: string): boolean {
  const panel = layout[props.side]
  return panel.open && panel.activeAppId === appId
}

/** 点击：已在该侧打开则收起，否则打开（全局单例由 openApp 保证） */
function toggle(appId: string) {
  if (isActive(appId)) layout.closeApp(props.side)
  else layout.openApp(appId, props.side)
}
</script>

<style scoped>
.activity-bar {
  width: 48px;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  background: var(--bg-deep);
  overflow: hidden;
}

.rail-btn {
  position: relative;
  width: 36px;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: var(--text-3);
  transition: all 0.15s;
}
.rail-btn:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.45);
}
.rail-btn.active {
  color: var(--accent);
  background: var(--panel);
  box-shadow: var(--shadow);
}

/* 激活指示条：左栏贴左缘、右栏贴右缘（与设计稿一致） */
.rail-btn.active::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}
.activity-bar.left .rail-btn.active::before {
  left: -6px;
}
.activity-bar.right .rail-btn.active::before {
  right: -6px;
}

.rail-spacer {
  flex: 1;
}
</style>
