import { defineStore } from 'pinia'
import { lsGet, lsSet } from '../core/storage'

export type Side = 'left' | 'right'

interface PanelState {
  open: boolean
  activeAppId: string | null
}

/** AI 聊天形态：停靠侧边栏 / 浮动窗口 */
export type ChatMode = 'docked' | 'float'

interface LayoutState {
  left: PanelState
  right: PanelState
  /** 每种应用全局单例，记录它挂在哪一侧 */
  appSide: Record<string, Side>
  chatMode: ChatMode
}

const DEFAULTS: LayoutState = {
  left: { open: true, activeAppId: 'docs' },
  right: { open: false, activeAppId: null },
  // 应用默认分布：写作导航放左栏，AI / 资料放右栏
  appSide: {
    files: 'left',
    docs: 'left',
    outline: 'left',
    git: 'left',
    library: 'left',
    notes: 'left',
    characters: 'right',
    worldview: 'right',
    chat: 'right',
    browser: 'right',
  },
  chatMode: 'docked' as ChatMode,
}

function load(): LayoutState {
  return { ...DEFAULTS, ...lsGet<LayoutState>('layout', DEFAULTS) }
}

function persist(state: LayoutState) {
  lsSet('layout', {
    left: state.left,
    right: state.right,
    appSide: state.appSide,
    chatMode: state.chatMode,
  })
}

export const useLayoutStore = defineStore('layout', {
  state: load,
  getters: {
    activeApp: (s): { side: Side; appId: string } | null => {
      for (const side of ['left', 'right'] as Side[]) {
        const p = s[side]
        if (p.open && p.activeAppId) return { side, appId: p.activeAppId }
      }
      return null
    },
  },
  actions: {
    togglePanel(side: Side) {
      this[side].open = !this[side].open
      persist(this.$state)
    },
    /** 打开某应用；若已在另一侧打开则聚焦那一侧（全局单例） */
    openApp(appId: string, side: Side) {
      const other: Side = side === 'left' ? 'right' : 'left'
      if (this[other].activeAppId === appId) this[other].activeAppId = null
      this.appSide[appId] = side
      this[side].activeAppId = appId
      this[side].open = true
      // 从侧栏打开聊天 = 停靠意图：结束浮动状态，避免「停靠 + 浮动」双窗口
      if (appId === 'chat' && this.chatMode === 'float') this.chatMode = 'docked'
      persist(this.$state)
    },
    closeApp(side: Side) {
      this[side].open = false
      persist(this.$state)
    },
    moveApp(appId: string, to: Side) {
      const from: Side = to === 'left' ? 'right' : 'left'
      if (this[from].activeAppId === appId) this[from].activeAppId = null
      this.appSide[appId] = to
      this[to].activeAppId = appId
      this[to].open = true
      persist(this.$state)
    },
    /** AI 聊天切到浮动窗口：不占侧边栏 */
    floatChat() {
      this.chatMode = 'float'
      if (this.right.activeAppId === 'chat') this.right.activeAppId = null
      persist(this.$state)
    },
    /** AI 聊天停靠回侧边栏 */
    dockChat() {
      this.chatMode = 'docked'
      this.openApp('chat', 'right')
      persist(this.$state)
    },
  },
})
