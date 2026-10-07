import { defineStore } from 'pinia'
import type { SelectionContext } from '../types'
import { countWords } from '../core/storage'

export type EditorMode = 'wysiwyg' | 'source'

export interface CurrentDoc {
  path: string
  name: string
  content: string
  wordCount: number
  lastSavedAt: number | null
}

interface EditorState {
  doc: CurrentDoc | null
  mode: EditorMode
  /** 自动生成（未保存到磁盘）的改动 */
  dirty: boolean
  saving: boolean
  cursor: { line: number; col: number } | null
  /** 编辑区内存在非空选区时的浮动工具条锚点（视口坐标）；null 表示无选区 */
  selBox: { x: number; y: number; width: number; height: number } | null
  /** 由 EditorPane 注册的选区桥接函数 */
  _getSelection: (() => SelectionContext | null) | null
  _replaceRange: ((start: number, end: number, text: string) => void) | null
  _insertAfter: ((pos: number, text: string) => void) | null
  _focus: (() => void) | null
  /** 立即保存当前文档（⌘S / 退出前调用） */
  _flush: (() => Promise<void>) | null
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    doc: null,
    mode: 'wysiwyg',
    dirty: false,
    saving: false,
    cursor: null,
    selBox: null,
    _getSelection: null,
    _replaceRange: null,
    _insertAfter: null,
    _focus: null,
    _flush: null,
  }),
  getters: {
    wordCount: (s) => s.doc?.wordCount ?? 0,
    displayPath: (s) => (s.doc ? s.doc.path : ''),
  },
  actions: {
    registerBridge(bridge: {
      getSelection: () => SelectionContext | null
      replaceRange: (start: number, end: number, text: string) => void
      insertAfter: (pos: number, text: string) => void
      focus: () => void
      flush?: () => Promise<void>
    }) {
      this._getSelection = bridge.getSelection
      this._replaceRange = bridge.replaceRange
      this._insertAfter = bridge.insertAfter
      this._focus = bridge.focus
      this._flush = bridge.flush ?? null
    },
    clearBridge() {
      this._getSelection = null
      this._replaceRange = null
      this._insertAfter = null
      this._focus = null
      this._flush = null
    },
    openDoc(path: string, name: string, content: string) {
      this.doc = { path, name, content, wordCount: countWords(content), lastSavedAt: Date.now() }
      this.dirty = false
    },
    updateContent(content: string) {
      if (!this.doc) return
      this.doc.content = content
      this.doc.wordCount = countWords(content)
      this.dirty = true
    },
    markSaved() {
      if (this.doc) this.doc.lastSavedAt = Date.now()
      this.dirty = false
    },
    setMode(mode: EditorMode) {
      this.mode = mode
      this.selBox = null
    },
    setSelBox(box: { x: number; y: number; width: number; height: number } | null) {
      this.selBox = box
    },
    getSelection(): SelectionContext | null {
      return this._getSelection?.() ?? null
    },
    replaceRange(start: number, end: number, text: string) {
      this._replaceRange?.(start, end, text)
    },
    insertAfter(pos: number, text: string) {
      this._insertAfter?.(pos, text)
    },
    async flush() {
      await this._flush?.()
    },
    focus() {
      this._focus?.()
    },
  },
})
