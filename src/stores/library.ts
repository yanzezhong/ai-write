import { defineStore } from 'pinia'
import {
  ensureGlobalLibrary,
  getGlobalLibraryFS,
  isTextLike,
  listLibraryFiles,
  readMeta,
  setupDemoGlobalLibrary,
  setupGlobalLibrary,
  writeMeta,
  type LibraryDoc,
  type LibraryMeta,
  type LibraryTag,
  type TagGroup,
} from '../core/globalLibrary'
import { idbDelete } from '../core/storage'
import { useProjectStore } from './project'

/** 总资料库状态：meta、文件清单、当前视图标签组、预览文件 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    ready: false,
    /** 总资料库是否已完成首次设置 */
    setupDone: false,
    meta: null as LibraryMeta | null,
    files: [] as string[],
    /** 当前选中的标签组视图；'all' = 平铺全部 */
    viewGroupId: 'all' as string,
    /** 预览中的文件名（files/ 下的名字） */
    previewFile: null as string | null,
    busy: false,
    error: '' as string,
  }),
  getters: {
    groups: (s): TagGroup[] => s.meta?.tagGroups ?? [],
    tags: (s): LibraryTag[] => s.meta?.tags ?? [],
    docOf: (s) => (file: string): LibraryDoc | undefined => s.meta?.docs.find((d) => d.file === file),
    /** 视图：标签 = 文件夹；返回 { tag, files }[]，未挂标签的文件归到「未分组」 */
    viewRows(s): { tag: LibraryTag | null; files: string[] }[] {
      const files = s.files
      if (s.viewGroupId === 'all' || !s.meta) return [{ tag: null, files }]
      const tags = s.meta.tags.filter((t) => t.groupId === s.viewGroupId)
      const rows: { tag: LibraryTag | null; files: string[] }[] = tags.map((tag) => ({
        tag,
        files: files.filter((f) => this.docOf(f)?.tagIds.includes(tag.id)),
      }))
      const untagged = files.filter((f) => {
        const doc = this.docOf(f)
        return !doc || !doc.tagIds.some((id) => tags.some((t) => t.id === id))
      })
      if (untagged.length) rows.push({ tag: null, files: untagged })
      return rows
    },
  },
  actions: {
    /** 打开/恢复总资料库；返回 false 表示需要用户先设置 */
    async init(): Promise<boolean> {
      this.error = ''
      try {
        const fs = await ensureGlobalLibrary()
        this.setupDone = true
        await this.refresh(fs)
        this.ready = true
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('尚未设置')) {
          this.setupDone = false
          this.ready = false
          return false
        }
        this.error = msg
        return false
      }
    },

    /** 首次设置：用户选定文件夹；演示模式传 demo=true */
    async setup(handle: FileSystemDirectoryHandle | null, demo = false): Promise<void> {
      if (demo) {
        setupDemoGlobalLibrary()
      } else if (handle) {
        await setupGlobalLibrary(handle)
      } else {
        throw new Error('未选择文件夹')
      }
      this.setupDone = true
      const fs = getGlobalLibraryFS()!
      await this.refresh(fs)
      this.ready = true
    },

    /** 清除设置（演示切真实时用） */
    async reset(): Promise<void> {
      this.ready = false
      this.setupDone = false
      this.meta = null
      this.files = []
      this.previewFile = null
      const { resetGlobalLibraryCache } = await import('../core/globalLibrary')
      resetGlobalLibraryCache()
      await idbDelete('handles', 'global-library').catch(() => {})
    },

    async refresh(fs = getGlobalLibraryFS()): Promise<void> {
      if (!fs) throw new Error('总资料库不可用')
      this.meta = await readMeta(fs)
      this.files = await listLibraryFiles(fs)
      if (this.previewFile && !this.files.includes(this.previewFile)) this.previewFile = null
    },

    async persistMeta(): Promise<void> {
      const fs = getGlobalLibraryFS()
      if (!fs || !this.meta) return
      await writeMeta(fs, this.meta)
    },

    // ---------- 标签组 ----------

    async addGroup(name: string, type: 'normal' | 'exclusive'): Promise<void> {
      if (!this.meta) return
      this.meta.tagGroups.push({ id: `g_${Date.now().toString(36)}`, name, type, parentGroupId: null })
      await this.persistMeta()
    },

    async renameGroup(id: string, name: string): Promise<void> {
      const g = this.groups.find((x) => x.id === id)
      if (g && this.meta) {
        g.name = name
        await this.persistMeta()
      }
    },

    async removeGroup(id: string): Promise<void> {
      if (!this.meta || id === 'g_default') return // 预置默认组不可删
      const group = this.groups.find((g) => g.id === id)
      const tagIds = new Set(this.tags.filter((t) => t.groupId === id).map((t) => t.id))
      this.meta.tagGroups = this.meta.tagGroups.filter((g) => g.id !== id)
      this.meta.tags = this.meta.tags.filter((t) => t.groupId !== id)
      for (const doc of this.meta.docs) doc.tagIds = doc.tagIds.filter((tid) => !tagIds.has(tid))
      void group
      if (this.viewGroupId === id) this.viewGroupId = 'all'
      await this.persistMeta()
    },

    // ---------- 标签 ----------

    async addTag(groupId: string, name: string): Promise<LibraryTag> {
      if (!this.meta) throw new Error('资料库未初始化')
      const existing = this.tags.find((t) => t.groupId === groupId && t.name === name)
      if (existing) return existing
      const tag: LibraryTag = { id: `t_${Date.now().toString(36)}`, name, groupId }
      this.meta.tags.push(tag)
      await this.persistMeta()
      return tag
    },

    async removeTag(tagId: string): Promise<void> {
      if (!this.meta) return
      this.meta.tags = this.meta.tags.filter((t) => t.id !== tagId)
      for (const doc of this.meta.docs) doc.tagIds = doc.tagIds.filter((id) => id !== tagId)
      await this.persistMeta()
    },

    /** 给文件打标签。排他组：替换同组标签。toggle=true 时重复打同标签=取消 */
    async toggleTag(file: string, tag: LibraryTag, toggle = false): Promise<void> {
      if (!this.meta) return
      let doc = this.docOf(file)
      if (!doc) {
        doc = { id: `d_${Date.now().toString(36)}`, file, tagIds: [] }
        this.meta.docs.push(doc)
      }
      const group = this.groups.find((g) => g.id === tag.groupId)
      const has = doc.tagIds.includes(tag.id)
      if (has && toggle) {
        doc.tagIds = doc.tagIds.filter((id) => id !== tag.id)
      } else if (!has) {
        if (group?.type === 'exclusive') {
          const siblingIds = new Set(this.tags.filter((t) => t.groupId === tag.groupId).map((t) => t.id))
          doc.tagIds = doc.tagIds.filter((id) => !siblingIds.has(id))
        }
        doc.tagIds.push(tag.id)
      }
      await this.persistMeta()
    },

    // ---------- 文件 ----------

    async importData(name: string, data: Uint8Array): Promise<void> {
      const { importFile } = await import('../core/globalLibrary')
      const fs = getGlobalLibraryFS()
      if (!fs) throw new Error('总资料库不可用')
      await importFile(fs, name, data)
      await this.refresh(fs)
    },

    /** 删除文件 + 清掉 meta 记录 */
    async removeFile(file: string): Promise<void> {
      const fs = getGlobalLibraryFS()
      if (!fs) throw new Error('总资料库不可用')
      await fs.delete(`files/${file}`)
      if (this.meta) {
        this.meta.docs = this.meta.docs.filter((d) => d.file !== file)
        await this.persistMeta()
      }
      if (this.previewFile === file) this.previewFile = null
      await this.refresh(fs)
    },

    async readFileText(file: string): Promise<string> {
      const fs = getGlobalLibraryFS()
      if (!fs) throw new Error('总资料库不可用')
      return fs.readFile(`files/${file}`)
    },

    /** 归档 note：移动语义 + 自动打「来源项目」标签，返回提示信息 */
    async archiveNoteFromProject(notePath: string): Promise<string> {
      const project = useProjectStore()
      const { archiveNote } = await import('../core/globalLibrary')
      const { file, tagName } = await archiveNote(notePath, project.projectName)
      await this.refresh()
      await project.refresh()
      return `已归档到总资料库（标签：来源项目 · ${tagName}），原 note 已删除`
    },

    tagNamesOf(file: string): string[] {
      const doc = this.docOf(file)
      if (!doc || !this.meta) return []
      return doc.tagIds
        .map((id) => this.meta!.tags.find((t) => t.id === id))
        .filter((t): t is LibraryTag => !!t)
        .map((t) => `${this.groups.find((g) => g.id === t.groupId)?.name ?? ''} · ${t.name}`)
    },

    isText(file: string): boolean {
      return isTextLike(file)
    },
  },
})
