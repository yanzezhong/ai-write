import { defineStore } from 'pinia'

/** 资料展示窗格（V2 §4.2）：与编辑区并列的只读资料区，选项卡多开 */
export interface ViewerTab {
  id: string
  /** 展示名 */
  name: string
  /** 来源：library = 总资料库 files/ 下的文件 */
  source: 'library'
  path: string
}

export const useViewerStore = defineStore('viewer', {
  state: () => ({
    open: false,
    tabs: [] as ViewerTab[],
    activeId: null as string | null,
  }),
  getters: {
    active: (s): ViewerTab | null => s.tabs.find((t) => t.id === s.activeId) ?? null,
  },
  actions: {
    openLibraryFile(name: string): void {
      const existing = this.tabs.find((t) => t.source === 'library' && t.path === name)
      if (existing) {
        this.activeId = existing.id
      } else {
        const tab: ViewerTab = { id: `v_${Date.now().toString(36)}_${this.tabs.length}`, name, source: 'library', path: name }
        this.tabs.push(tab)
        this.activeId = tab.id
      }
      this.open = true
    },
    closeTab(id: string): void {
      const i = this.tabs.findIndex((t) => t.id === id)
      if (i === -1) return
      this.tabs.splice(i, 1)
      if (this.activeId === id) this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? null
      if (!this.tabs.length) this.open = false
    },
    closeAll(): void {
      this.tabs = []
      this.activeId = null
      this.open = false
    },
  },
})
