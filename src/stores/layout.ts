import { defineStore } from 'pinia'
import { lsGet, lsSet } from '../core/storage'

export type Side = 'left' | 'right'

interface PanelState {
  open: boolean
  activeAppId: string | null
}

interface LayoutState {
  left: PanelState
  right: PanelState
  /** 每种应用全局单例，记录它挂在哪一侧 */
  appSide: Record<string, Side>
}

const DEFAULTS: LayoutState = {
  left: { open: true, activeAppId: 'docs' },
  right: { open: false, activeAppId: null },
  // 应用默认分布：写作导航放左栏，AI / 资料放右栏
  appSide: { files: 'left', docs: 'left', outline: 'left', characters: 'right', chat: 'right', browser: 'right' },
}

function load(): LayoutState {
  return { ...DEFAULTS, ...lsGet<LayoutState>('layout', DEFAULTS) }
}

function persist(state: LayoutState) {
  lsSet('layout', {
    left: state.left,
    right: state.right,
    appSide: state.appSide,
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
  },
})
