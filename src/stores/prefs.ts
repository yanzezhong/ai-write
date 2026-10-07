import { defineStore } from 'pinia'
import { lsGet, lsSet } from '../core/storage'

export type LineWidth = '窄' | '默认' | '宽'
export type ParagraphGap = '紧凑' | '默认' | '宽松'
export type HeadingFont = '衬线标题' | '无衬线标题'
export type ThemeName = '暖米白' | '石墨灰' | '雾蓝'

interface PrefsState {
  autoSave: boolean
  defaultMode: 'wysiwyg' | 'source'
  fontSize: number
  lineWidth: LineWidth
  paragraphGap: ParagraphGap
  headingFont: HeadingFont
  theme: ThemeName
}

function initial(): PrefsState {
  return {
    autoSave: lsGet('prefs.autoSave', true),
    defaultMode: lsGet<'wysiwyg' | 'source'>('prefs.defaultMode', 'wysiwyg'),
    fontSize: lsGet('prefs.fontSize', 16),
    lineWidth: lsGet<LineWidth>('prefs.lineWidth', '默认'),
    paragraphGap: lsGet<ParagraphGap>('prefs.paragraphGap', '默认'),
    headingFont: lsGet<HeadingFont>('prefs.headingFont', '衬线标题'),
    theme: lsGet<ThemeName>('prefs.theme', '暖米白'),
  }
}

/** 界面偏好（设置页 ↔ 编辑器共用），全部持久化到 localStorage */
export const usePrefsStore = defineStore('prefs', {
  state: initial,
  getters: {
    /** 正文的行宽上限（em） */
    lineWidthEm: (s) => ({ 窄: 36, 默认: 44, 宽: 54 })[s.lineWidth],
    /** 段落间距（em） */
    paragraphGapEm: (s) => ({ 紧凑: 0.5, 默认: 1, 宽松: 1.6 })[s.paragraphGap],
    headingFontFamily: (s) => (s.headingFont === '衬线标题' ? 'var(--font-serif)' : 'var(--font-ui)'),
  },
  actions: {
    update(patch: Partial<PrefsState>) {
      Object.assign(this, patch)
      lsSet('prefs.autoSave', this.autoSave)
      lsSet('prefs.defaultMode', this.defaultMode)
      lsSet('prefs.fontSize', this.fontSize)
      lsSet('prefs.lineWidth', this.lineWidth)
      lsSet('prefs.paragraphGap', this.paragraphGap)
      lsSet('prefs.headingFont', this.headingFont)
      lsSet('prefs.theme', this.theme)
      applyTheme(this.theme)
    },
  },
})

/** 主题 → <html data-theme>，变量覆盖定义在 base.css；主 accent 保留朱红，保证全部既有对比度逻辑不变 */
function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return
  const map: Record<ThemeName, string> = { 暖米白: '', 石墨灰: 'graphite', 雾蓝: 'mist' }
  const name = map[theme]
  if (name) document.documentElement.dataset.theme = name
  else delete document.documentElement.dataset.theme
}

/** 供 App 启动时恢复当前主题 */
export function applyCurrentTheme(): void {
  applyTheme(usePrefsStore().theme)
}
