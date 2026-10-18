import { defineStore } from 'pinia'
import type { CharacterCard, DocEntry, FileInfo, InfoCard, ProjectMeta, RecentProject } from '../types'
import { getFS, setFS, WebFSAdapter } from '../core/fs'
import { countWords, idbSet, lsGet, lsSet } from '../core/storage'
import { useEditorStore } from './editor'

export const PROJECT_SCHEMA = 1

export const PROJECT_TREE_PREVIEW = [
  { name: 'project.json', note: '# 项目元信息', dir: false },
  { name: 'outline.md', note: '# 剧情大纲', dir: false },
  { name: 'chapters/', note: '# 正文文档', dir: true },
  { name: 'characters/', note: '# 人物库', dir: true },
  { name: 'worldview/', note: '# 世界观库', dir: true },
  { name: 'notes/', note: '# 随笔 / 资料', dir: true },
]

interface ProjectState {
  rootHandle: FileSystemDirectoryHandle | null
  meta: ProjectMeta | null
  /** 演示模式（内存文件系统，不写磁盘） */
  isDemo: boolean
  /** 项目内 markdown 文档（chapters/ + notes/） */
  docs: DocEntry[]
  /** 人物库与世界观库共用同一卡片结构（characters/ 与 worldview/ 目录） */
  characters: InfoCard[]
  worldview: InfoCard[]
  outlinePath: string
  stats: { docCount: number; wordCount: number }
}

export const useProjectStore = defineStore('project', {
  state: (): ProjectState => ({
    rootHandle: null,
    meta: null,
    isDemo: false,
    docs: [],
    characters: [],
    worldview: [],
    outlinePath: 'outline.md',
    stats: { docCount: 0, wordCount: 0 },
  }),
  getters: {
    isOpen: (s) => s.rootHandle !== null,
    projectName: (s) => s.meta?.name ?? s.rootHandle?.name ?? '',
  },
  actions: {
    async openWithHandle(handle: FileSystemDirectoryHandle) {
      const fs = new WebFSAdapter(handle)
      setFS(fs)
      this.rootHandle = handle
      this.isDemo = false
      let meta: ProjectMeta
      try {
        meta = JSON.parse(await fs.readFile('project.json')) as ProjectMeta
      } catch {
        meta = { name: handle.name, createdAt: Date.now(), schema: PROJECT_SCHEMA }
      }
      this.meta = meta
      await this.refresh()
      const recent = lsGet<RecentProject[]>('recentProjects', [])
      const entry: RecentProject = {
        id: handle.name,
        name: meta.name,
        dirName: handle.name,
        openedAt: Date.now(),
        docCount: this.stats.docCount,
        wordCount: this.stats.wordCount,
      }
      const rest = recent.filter((r) => r.dirName !== handle.name)
      lsSet('recentProjects', [entry, ...rest].slice(0, 20))
      // 句柄存 IndexedDB，便于下次会话重新授权（queryPermission）
      await idbSet('handles', handle.name, handle).catch(() => {})
      const { recordSession } = await import('../services/session')
      recordSession()
    },

    async openExisting(handle: FileSystemDirectoryHandle) {
      await this.openWithHandle(handle)
    },

    /** 新建项目：在 parent 目录下创建 name 子目录并初始化结构 */
    async create(parent: FileSystemDirectoryHandle, name: string) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('项目名称不能为空')
      if (/[\\/:*?"<>|]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
        throw new Error('项目名称不能包含 / \\ : * ? " < > | 等字符')
      }
      const dir = await parent.getDirectoryHandle(trimmed, { create: true })
      const fs = new WebFSAdapter(dir)
      // 文件夹已存在且已是项目：直接打开，不覆盖任何文件
      let existed = false
      try {
        existed = await fs.exists('project.json')
      } catch {
        existed = false
      }
      if (!existed) {
        const meta: ProjectMeta = { name: trimmed, createdAt: Date.now(), schema: PROJECT_SCHEMA }
        await fs.writeFile('project.json', JSON.stringify(meta, null, 2))
        await fs.writeFile('outline.md', `# ${trimmed} · 剧情大纲\n\n`)
        await fs.createDir('chapters')
        await fs.createDir('characters')
        await fs.createDir('worldview')
        await fs.createDir('notes')
      }
      await this.openWithHandle(dir)
    },

    /** 手机端：在 OPFS 中新建项目并打开 */
    async createMobile(name: string) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('项目名称不能为空')
      const { createMobileProject } = await import('../core/mobileFS')
      const meta: ProjectMeta = { name: trimmed, createdAt: Date.now(), schema: PROJECT_SCHEMA }
      const initial: Record<string, string> = {
        'project.json': JSON.stringify(meta, null, 2),
        'outline.md': `# ${trimmed} · 剧情大纲\n\n`,
      }
      const { fs, meta: mobileMeta } = await createMobileProject(trimmed, initial)
      await fs.createDir('chapters')
      await fs.createDir('characters')
      await fs.createDir('worldview')
      await fs.createDir('notes')
      await this.openMobile(mobileMeta.id)
    },

    /** 手机端：打开 OPFS 中的已有项目 */
    async openMobile(id: string) {
      const { openMobileProject, updateMobileProjectStats } = await import('../core/mobileFS')
      const fs = await openMobileProject(id)
      if (!fs) throw new Error('项目不存在或已被删除')
      setFS(fs)
      this.rootHandle = fs.root
      this.isDemo = false
      try {
        this.meta = JSON.parse(await fs.readFile('project.json')) as ProjectMeta
      } catch {
        this.meta = { name: fs.root.name, createdAt: Date.now(), schema: PROJECT_SCHEMA }
      }
      await this.refresh()
      updateMobileProjectStats(id, this.stats)
      const { recordSession } = await import('../services/session')
      recordSession()
    },

    /** 演示模式（通用）：以自定义名称与文件种子打开内存项目（一键仿写用） */
    async openDemoProject(name: string, files: Record<string, string>) {
      const { MemoryFSAdapter } = await import('../core/memoryFS')
      const fs = new MemoryFSAdapter(files)
      setFS(fs)
      this.rootHandle = { name } as FileSystemDirectoryHandle
      this.meta = { name, createdAt: Date.now(), schema: PROJECT_SCHEMA }
      this.isDemo = true
      this.outlinePath = 'outline.md'
      const { setupDemoGlobalLibrary } = await import('../core/globalLibrary')
      setupDemoGlobalLibrary()
      await this.refresh()
      const { recordSession } = await import('../services/session')
      recordSession()
    },

    /** 演示模式：内存文件系统，不依赖系统选择器、不写入磁盘（刷新即清空） */
    async openDemo() {
      const { MemoryFSAdapter, demoProjectFiles } = await import('../core/memoryFS')
      const fs = new MemoryFSAdapter(demoProjectFiles())
      setFS(fs)
      this.rootHandle = { name: '星海纪元（演示）' } as FileSystemDirectoryHandle
      this.meta = { name: '星海纪元（演示）', createdAt: Date.now(), schema: PROJECT_SCHEMA }
      this.isDemo = true
      this.outlinePath = 'outline.md'
      // 演示模式自带演示总资料库
      const { setupDemoGlobalLibrary } = await import('../core/globalLibrary')
      setupDemoGlobalLibrary()
      await this.refresh()
      const editor = useEditorStore()
      const first = this.docs.find((d) => d.path.startsWith('chapters/'))
      if (first) {
        const content = await fs.readFile(first.path).catch(() => '')
        editor.openDoc(first.path, first.name, content)
      }
      const { recordSession } = await import('../services/session')
      recordSession()
    },

    async refresh() {
      const fs = getFS()
      this.docs = []
      this.characters = []
      let wordCount = 0
      for (const sub of ['chapters', 'notes']) {
        let files: FileInfo[] = []
        try {
          files = (await fs.listDir(sub)).filter((f) => f.kind === 'file' && /\.(md|txt)$/i.test(f.name))
        } catch {
          /* 目录可能不存在 */
        }
        for (const f of files) {
          const text = await fs.readFile(f.path).catch(() => '')
          const wc = countWords(text)
          wordCount += wc
          this.docs.push({ name: f.name, path: f.path, wordCount: wc, modified: f.modified ?? Date.now() })
        }
      }
      this.docs.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
      this.stats = { docCount: this.docs.length, wordCount }
      // 刷新最近项目里的统计
      const recent = lsGet<RecentProject[]>('recentProjects', [])
      const cur = recent.find((r) => r.dirName === this.rootHandle?.name)
      if (cur) {
        cur.docCount = this.stats.docCount
        cur.wordCount = this.stats.wordCount
        lsSet('recentProjects', recent)
      }
      await this.loadCards('characters')
      await this.loadCards('worldview')
    },

    /**
     * 卡片库通用加载：人物库（characters/）与世界观库（worldview/）共用。
     * md 字段约定见 parseCardMd。
     */
    async loadCards(folder: 'characters' | 'worldview') {
      const fs = getFS()
      let files: FileInfo[] = []
      try {
        files = (await fs.listDir(folder)).filter((f) => f.kind === 'file' && /\.md$/i.test(f.name))
      } catch {
        return
      }
      const cards: InfoCard[] = []
      for (const f of files) {
        const text = await fs.readFile(f.path).catch(() => '')
        cards.push(parseCardMd(f.path, text))
      }
      this[folder] = cards
    },

    /** 兼容别名 */
    async loadCharacters() {
      await this.loadCards('characters')
    },

    async readOutline(): Promise<string> {
      return getFS().readFile(this.outlinePath).catch(() => '')
    },

    async writeOutline(content: string) {
      await getFS().writeFile(this.outlinePath, content)
    },

    close() {
      setFS(null)
      this.rootHandle = null
      this.meta = null
      this.isDemo = false
      this.docs = []
      this.characters = []
      this.worldview = []
      void import('../services/session').then((m) => m.clearSession())
    },
  },
})

/** 卡片 md 字段约定：frontmatter 风格的键值行。人物库与世界观库共用同一结构 */
export function parseCardMd(path: string, text: string): InfoCard {
  const card: InfoCard = { name: '', role: '', identity: '', tags: [], description: '', filePath: path }
  const lines = text.split('\n')
  const body: string[] = []
  for (const line of lines) {
    const kv = line.match(/^([^:：#\-]{1,12})[:：]\s*(.*)$/)
    if (kv && !card.name) {
      const key = kv[1].trim()
      const value = kv[2].trim()
      if (key === '姓名' || key === '名字' || key === '名称') card.name = value
      else if (key === '角色' || key === '类别') card.role = value
      else if (key === '身份') card.identity = value
      else if (key === '标签') card.tags = value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
      else body.push(line)
    } else if (kv && (kv[1].trim() === '角色' || kv[1].trim() === '类别') && !card.role) {
      card.role = kv[2].trim()
    } else {
      body.push(line)
    }
  }
  const h1 = text.match(/^#\s+(.+)$/m)
  if (!card.name) card.name = h1 ? h1[1].trim() : path.split('/').pop()!.replace(/\.md$/i, '')
  card.description = body.join('\n').replace(/^#\s+.*$/m, '').trim()
  return card
}

/** 兼容别名 */
export const parseCharacterMd = parseCardMd

export function cardMdTemplate(
  card: Partial<InfoCard>,
  labels: { name?: string; role?: string } = {},
): string {
  const nameLabel = labels.name ?? '姓名'
  const roleLabel = labels.role ?? '角色'
  return `# ${card.name ?? ''}\n\n${nameLabel}: ${card.name ?? ''}\n${roleLabel}: ${card.role ?? ''}\n身份: ${card.identity ?? ''}\n标签: ${(card.tags ?? []).join('、')}\n\n${card.description ?? ''}\n`
}

/** 兼容别名 */
export function characterMdTemplate(card: Partial<CharacterCard>): string {
  return cardMdTemplate(card)
}
