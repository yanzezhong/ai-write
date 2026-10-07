<template>
  <aside v-if="plugin" class="side-panel" :class="side">
    <header class="panel-head">
      <span class="panel-title">{{ plugin.name }}</span>
      <div class="panel-actions">
        <button
          class="icon-btn"
          :title="`移到${otherLabel}侧栏`"
          @click="layout.moveApp(plugin.id, other)"
        >
          <AppIcon name="move" :size="15" />
        </button>
        <button class="icon-btn" title="收起" @click="layout.closeApp(side)">
          <AppIcon name="close" :size="15" />
        </button>
      </div>
    </header>
    <div class="panel-body">
      <component :is="bodyComponent" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, shallowRef, watch, type Component } from 'vue'
import AppIcon from './AppIcon.vue'
import { getPlugin } from '../plugins'
import { useLayoutStore, type Side } from '../stores/layout'

const props = defineProps<{ side: Side }>()

const layout = useLayoutStore()
const other: Side = props.side === 'left' ? 'right' : 'left'
const otherLabel = other === 'left' ? '左' : '右'

const plugin = computed(() => {
  const id = layout[props.side].activeAppId
  return getPlugin(id ?? '')
})

/** 异步 loader 包装为异步组件；同步组件直接用（shallowRef 避免组件对象被响应式代理） */
const bodyComponent = shallowRef<Component | null>(null)
watch(
  plugin,
  (p) => {
    const comp = p?.component
    if (!comp) {
      bodyComponent.value = null
    } else if (typeof comp === 'function') {
      bodyComponent.value = defineAsyncComponent(comp as () => Promise<Component>)
    } else {
      bodyComponent.value = comp
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.side-panel {
  width: 320px;
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  overflow: hidden;
}
.side-panel.right {
  width: 430px;
}

.panel-head {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--border);
}
.panel-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  position: relative;
  padding-left: 10px;
}
.panel-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--accent);
}
.panel-actions {
  display: flex;
  gap: 2px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-body > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
