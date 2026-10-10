import { defineStore } from 'pinia'
import { getFS } from '../core/fs'
import { uid } from '../core/storage'
import {
  batchPersonMessages,
  batchWorldMessages,
  chapterGenerateMessages,
  extractJson,
  outlineParseMessages,
  outlineReviseMessages,
  personParseMessages,
  personReviseMessages,
  polishMessages,
  regenOutlineMessages,
  segmentGenerateMessages,
  segmentReviseMessages,
  styleParseMessages,
  styleReviseMessages,
  worldParseMessages,
  worldReviseMessages,
  type OutlineItem,
  type PersonItem,
  type WorldItem,
} from '../ai/imitatePrompts'
import { streamChat, useAIStore } from './ai'
import { useProjectStore } from './project'
import type { AIProviderConfig, ChatMessage } from '../types'

/** 一键仿写：状态机与数据层。持久化到项目内 worldbuilding/imitate.json + 派生文件。 */

export interface ImitateWorldEntry extends WorldItem {
  id: string
  locked: boolean
  dirty: boolean
}

export interface ImitatePerson extends PersonItem {
  id: string
  locked: boolean
  dirty: boolean
  /** 标签的文本输入态（编辑用），落盘前同步回 tags */
  tagsText: string
}

export interface ImitateScene {
  id: string
  title: string
  desc: string
}

export interface ImitateChapter {
  id: string
  chapter: string
  summary: string
  scenes: ImitateScene[]
  locked: boolean
  /** 用户手动改过（解锁「✨ AI 优化」） */
  dirty?: boolean
}

export type ImitateStep = 'world' | 'characters' | 'style' | 'outline'
export type ImitatePhase = 'parse' | 'skeleton' | 'segment' | 'done'

export const STEPS: { id: ImitateStep; label: string }[] = [
  { id: 'world', label: '世界观' },
  { id: 'characters', label: '人物库' },
  { id: 'style', label: '文风' },
  { id: 'outline', label: '大纲' },
]

export const STEP_INDEX: Record<ImitateStep, number> = { world: 0, characters: 1, style: 2, outline: 3 }

interface PersistShape {
  phase: ImitatePhase
  step: ImitateStep
  sourceName: string
  world: ImitateWorldEntry[]
  persons: ImitatePerson[]
  styleNote: string
  outline: ImitateChapter[]
}

interface ImitateState {
  active: boolean
  phase: ImitatePhase
  step: ImitateStep
  sourceName: string
  sourceText: string
  world: ImitateWorldEntry[]
  persons: ImitatePerson[]
  styleNote: string
  outline: ImitateChapter[]
  /** 解析阶段 AI 对话历史（跨步骤保留） */
  chat: { role: 'user' | 'assistant'; content: string }[]
  generating: boolean
  error: string
  /** 父目录句柄（真实项目取消时删除用） */
  parentHandle: FileSystemDirectoryHandle | null
  /** 逐段生成 */
  segmentIdx: number
  chapterTexts: Record<string, string>
}

export const useImitateStore = defineStore('imitate', {
  state: (): ImitateState => ({
    active: false,
    phase: 'parse',
    step: 'world',
    sourceName: '',
    sourceText: '',
    world: [],
    persons: [],
    styleNote: '',
    outline: [],
    chat: [],
    generating: false,
    error: '',
    parentHandle: null,
    segmentIdx: 0,
    chapterTexts: {},
  }),
  getters: {
    lockedCounts(s): { world: number; persons: number; chapters: number } {
      return {
        world: s.world.filter((w) => w.locked).length,
        persons: s.persons.filter((p) => p.locked).length,
        chapters: s.outline.filter((o) => o.locked).length,
      }
    },
    totalLocked(): number {
      return this.lockedCounts.world + this.lockedCounts.persons + this.lockedCounts.chapters
    },
    allConfirmed(): boolean {
      return this.phase === 'skeleton'
    },
  },
  actions: {
    // ---------- 生命周期 ----------

    /** 从例文开始一个新的仿写流程（项目已由调用方创建/打开） */
    start(sourceName: string, sourceText: string) {
      this.$reset()
      this.active = true
      this.sourceName = sourceName
      this.sourceText = sourceText
      this.chat = [
        {
          role: 'assistant',
          content: `我已收到例文《${sourceName}》（${sourceText.length} 字）。接下来我会分四步解析：世界观 → 人物库 → 文风 → 大纲。先开始第 1 步：从例文中提取世界观设定。`,
        },
      ]
      void this.save()
    },

    /** 从项目文件恢复（重新进入仿写项目时） */
    async loadFromProject(): Promise<boolean> {
      const fs = getFS()
      try {
        const raw = await fs.readFile('worldbuilding/imitate.json')
        const data = JSON.parse(raw) as PersistShape
        this.active = true
        this.phase = data.phase === 'segment' ? 'skeleton' : data.phase // 逐段进度不跨会话恢复
        this.step = data.step
        this.sourceName = data.sourceName
        this.world = data.world
        this.persons = (data.persons ?? []).map((p) => ({ ...p, tagsText: p.tagsText ?? (p.tags ?? []).join('、') }))
        this.styleNote = data.styleNote
        this.outline = data.outline
        this.sourceText = await fs.readFile('worldbuilding/例文原文.md').catch(() => '')
        this.chat = [{ role: 'assistant', content: `已恢复仿写进度，当前处于「${this.phase === 'skeleton' ? '骨架编辑' : '解析'}」阶段。` }]
        return true
      } catch {
        return false
      }
    },

    async save() {
      if (!this.active) return
      const fs = getFS()
      const shape: PersistShape = {
        phase: this.phase,
        step: this.step,
        sourceName: this.sourceName,
        world: this.world,
        persons: this.persons,
        styleNote: this.styleNote,
        outline: this.outline,
      }
      await fs.writeFile('worldbuilding/imitate.json', JSON.stringify(shape, null, 2)).catch(() => {})
    },

    /** 把骨架派生文件写入项目（人物卡 / 文风样例 / 大纲） */
    async writeDerived() {
      const fs = getFS()
      const project = useProjectStore()
      // 人物卡 → characters/*.md（复用 V2 人物卡解析格式）
      for (const p of this.persons) {
        const body = [
          `# ${p.name}`,
          '',
          `姓名: ${p.name}`,
          `角色: ${p.role}`,
          `身份: ${p.identity}`,
          `标签: ${p.tags.join('、')}`,
          '',
          p.description,
          '',
        ].join('\n')
        await fs.writeFile(`characters/${p.name}.md`, body).catch(() => {})
      }
      // 文风样例 → notes/文风样例.md
      if (this.styleNote) {
        await fs
          .writeFile('notes/文风样例.md', `${this.styleNote.trim()}\n\n—— 由 AI 仿写生成，可继续编辑；归档后转为只读资料。\n`)
          .catch(() => {})
      }
      // 大纲 → outline.md（## 章 / ### 场景，兼容工作区大纲树）
      const lines: string[] = [`# ${project.projectName} · 剧情大纲`, '']
      for (const o of this.outline) {
        lines.push(`## ${o.chapter}`, '', o.summary, '')
        for (const s of o.scenes) {
          lines.push(`### ${s.title}`, '', `- ${s.desc}`, '')
        }
      }
      await fs.writeFile('outline.md', lines.join('\n')).catch(() => {})
      await project.refresh()
    },

    /** 取消仿写：删除临时项目（二次确认由调用方做） */
    async cancel() {
      const project = useProjectStore()
      if (!project.isDemo && this.parentHandle && project.rootHandle) {
        await this.parentHandle.removeEntry(project.rootHandle.name, { recursive: true }).catch(() => {})
      }
      project.close()
      this.$reset()
    },

    /** 重置骨架：回到解析第 1 步（保留例文） */
    resetToParse() {
      this.phase = 'parse'
      this.step = 'world'
      this.world = []
      this.persons = []
      this.styleNote = ''
      this.outline = []
      this.chat.push({ role: 'assistant', content: '已重置骨架，我们从世界观解析重新开始。' })
      void this.save()
    },

    // ---------- 解析阶段 ----------

    async runParse(step: ImitateStep): Promise<void> {
      this.generating = true
      this.error = ''
      try {
        const p = this.needProvider()
        const messages =
          step === 'world'
            ? worldParseMessages(this.sourceText)
            : step === 'characters'
              ? personParseMessages(this.sourceText)
              : step === 'style'
                ? styleParseMessages(this.sourceText)
                : outlineParseMessages(this.sourceText)
        const full = await this.stream(p, messages)
        this.applyParseResult(step, full)
        const notes: Record<ImitateStep, string> = {
          world: `我已从《${this.sourceName}》中提取了世界观设定，共 ${this.world.length} 个核心条目。请确认或提出修改意见，我随时调整。`,
          characters: `已提取 ${this.persons.length} 位核心人物。请确认或提出修改意见。`,
          style: '已生成文风样例笔记（含手法分析与样例片段），已保存至 notes/文风样例.md。可要求我调整文风侧重点。',
          outline: `已生成 ${this.outline.length} 章大纲，共 ${this.outline.reduce((n, o) => n + o.scenes.length, 0)} 个场景。每章下挂载 2-4 个具体场景，你可以增删或提出结构调整意见。`,
        }
        this.chat.push({ role: 'assistant', content: notes[step] })
        await this.save()
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
        this.chat.push({ role: 'assistant', content: `解析失败：${this.error}。可以点击「重新解析」重试。` })
      } finally {
        this.generating = false
      }
    },

    applyParseResult(step: ImitateStep, full: string): void {
      if (step === 'world') {
        const items = extractJson<WorldItem[]>(full)
        this.world = items.map((w) => ({ id: uid(), name: w.name, detail: w.detail, locked: false, dirty: false }))
      } else if (step === 'characters') {
        const items = extractJson<PersonItem[]>(full)
        this.persons = items.map((p) => ({
          id: uid(),
          name: p.name,
          role: p.role || '配角',
          identity: p.identity || '',
          tags: p.tags ?? [],
          tagsText: (p.tags ?? []).join('、'),
          description: p.description || '',
          locked: false,
          dirty: false,
        }))
      } else if (step === 'style') {
        this.styleNote = full.trim()
      } else {
        const items = extractJson<OutlineItem[]>(full)
        this.outline = items.map((o) => ({
          id: uid(),
          chapter: o.chapter,
          summary: o.summary || '',
          locked: false,
          scenes: (o.scenes ?? []).map((s) => ({ id: uid(), title: s.title, desc: s.desc })),
        }))
      }
    },

    /** 解析阶段：对话式修改当前步骤 */
    async reviseCurrent(opinion: string): Promise<void> {
      const p = this.needProvider()
      this.chat.push({ role: 'user', content: opinion })
      this.generating = true
      this.error = ''
      try {
        const step = this.step
        const messages =
          step === 'world'
            ? worldReviseMessages(this.sourceText, this.world, opinion)
            : step === 'characters'
              ? personReviseMessages(this.sourceText, this.persons, opinion)
              : step === 'style'
                ? styleReviseMessages(this.sourceText, this.styleNote, opinion)
                : outlineReviseMessages(this.sourceText, this.outline, opinion)
        const full = await this.stream(p, messages)
        this.applyParseResult(step, full)
        this.chat.push({ role: 'assistant', content: '已按你的意见调整，见右侧更新后的结果。' })
        await this.save()
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
        this.chat.push({ role: 'assistant', content: `调整失败：${this.error}` })
      } finally {
        this.generating = false
      }
    },

    async confirmStep(): Promise<void> {
      const idx = STEP_INDEX[this.step]
      if (idx >= 3) {
        // 大纲确认 → 进入骨架编辑
        this.phase = 'skeleton'
        this.chat.push({ role: 'assistant', content: '骨架已确认。现在你可以逐项编辑或锁定条目，满意后点击「生成文章」。' })
      } else {
        this.step = STEPS[idx + 1].id
      }
      await this.writeDerived()
      await this.save()
    },

    backStep(): void {
      const idx = STEP_INDEX[this.step]
      if (idx > 0) this.step = STEPS[idx - 1].id
      void this.save()
    },

    // ---------- 骨架编辑 ----------

    toggleLock(kind: 'world' | 'person' | 'chapter', id: string): void {
      const list = kind === 'world' ? this.world : kind === 'person' ? this.persons : this.outline
      const item = list.find((x) => x.id === id) as { locked: boolean } | undefined
      if (item) {
        item.locked = !item.locked
        void this.save()
      }
    },

    removeAt(kind: 'world' | 'person' | 'chapter', id: string): void {
      if (kind === 'world') this.world = this.world.filter((x) => x.id !== id)
      else if (kind === 'person') this.persons = this.persons.filter((x) => x.id !== id)
      else this.outline = this.outline.filter((x) => x.id !== id)
      void this.save()
    },

    addWorld(): void {
      this.world.push({ id: uid(), name: '新条目', detail: '', locked: false, dirty: true })
    },

    addPerson(): void {
      this.persons.push({
        id: uid(),
        name: '新人物',
        role: '配角',
        identity: '',
        tags: [],
        tagsText: '',
        description: '',
        locked: false,
        dirty: true,
      })
    },

    addChapter(): void {
      this.outline.push({ id: uid(), chapter: `第${this.outline.length + 1}章 · 新章节`, summary: '', locked: false, scenes: [] })
    },

    addScene(chapterId: string): void {
      const c = this.outline.find((o) => o.id === chapterId)
      c?.scenes.push({ id: uid(), title: '新场景', desc: '' })
    },

    removeScene(chapterId: string, sceneId: string): void {
      const c = this.outline.find((o) => o.id === chapterId)
      if (c) c.scenes = c.scenes.filter((s) => s.id !== sceneId)
    },

    moveChapter(from: number, to: number): void {
      const [x] = this.outline.splice(from, 1)
      this.outline.splice(to, 0, x)
    },

    moveScene(chapterId: string, from: number, to: number): void {
      const c = this.outline.find((o) => o.id === chapterId)
      if (!c) return
      const [x] = c.scenes.splice(from, 1)
      c.scenes.splice(to, 0, x)
    },

    /** 单项 AI 优化（世界观/人物字段/章节概要/场景描述） */
    async aiPolish(kind: 'world' | 'person-desc' | 'chapter-summary' | 'scene-desc', id: string, subId?: string): Promise<void> {
      const p = this.needProvider()
      this.generating = true
      this.error = ''
      let content = ''
      if (kind === 'world') content = this.world.find((w) => w.id === id)?.detail ?? ''
      else if (kind === 'person-desc') content = this.persons.find((x) => x.id === id)?.description ?? ''
      else if (kind === 'chapter-summary') content = this.outline.find((o) => o.id === id)?.summary ?? ''
      else content = this.outline.find((o) => o.id === id)?.scenes.find((s) => s.id === subId)?.desc ?? ''
      const label = kind === 'world' ? '世界观条目' : kind === 'person-desc' ? '人物描述' : kind === 'chapter-summary' ? '章节概要' : '场景描述'
      try {
        const full = await this.stream(p, polishMessages(label, content, this.styleNote))
        if (kind === 'world') {
          const w = this.world.find((x) => x.id === id)
          if (w) w.detail = full.trim()
        } else if (kind === 'person-desc') {
          const x = this.persons.find((y) => y.id === id)
          if (x) x.description = full.trim()
        } else if (kind === 'chapter-summary') {
          const o = this.outline.find((y) => y.id === id)
          if (o) o.summary = full.trim()
        } else {
          const s = this.outline.find((y) => y.id === id)?.scenes.find((z) => z.id === subId)
          if (s) s.desc = full.trim()
        }
        await this.save()
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
      } finally {
        this.generating = false
      }
    },

    /** 批量修改（仅未锁定项） */
    async batchModify(kind: 'world' | 'persons', opinion: string): Promise<void> {
      const p = this.needProvider()
      this.generating = true
      this.error = ''
      try {
        if (kind === 'world') {
          const unlocked = this.world.filter((w) => !w.locked)
          const full = await this.stream(p, batchWorldMessages(unlocked, opinion, this.styleNote))
          const items = extractJson<WorldItem[]>(full)
          // 按顺序写回未锁定项
          unlocked.forEach((w, i) => {
            if (items[i]) {
              w.name = items[i].name
              w.detail = items[i].detail
            }
          })
        } else {
          const unlocked = this.persons.filter((x) => !x.locked)
          const full = await this.stream(p, batchPersonMessages(unlocked, opinion, this.styleNote))
          const items = extractJson<PersonItem[]>(full)
          unlocked.forEach((x, i) => {
            if (items[i]) {
              Object.assign(x, items[i])
              x.tagsText = (x.tags ?? []).join('、')
            }
          })
        }
        await this.save()
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
      } finally {
        this.generating = false
      }
    },

    /** 重新生成大纲（保留锁定章，其余按意见重排） */
    async regenOutline(opinion: string): Promise<void> {
      const p = this.needProvider()
      this.generating = true
      this.error = ''
      try {
        const lockedChapters = this.outline.filter((o) => o.locked)
        const full = await this.stream(
          p,
          regenOutlineMessages(
            this.world.map(({ name, detail }) => ({ name, detail })),
            this.persons.map(({ name, role, identity, tags, description }) => ({ name, role, identity, tags, description })),
            this.styleNote,
            lockedChapters.map(({ chapter, summary, scenes }) => ({
              chapter,
              summary,
              scenes: scenes.map(({ title, desc }) => ({ title, desc })),
            })),
            opinion,
          ),
        )
        const items = extractJson<OutlineItem[]>(full)
        // 组装：锁定章保持原 id/locked；其余按解析结果
        this.outline = items.map((o) => {
          const locked = lockedChapters.find((c) => c.chapter === o.chapter)
          if (locked) return locked
          return {
            id: uid(),
            chapter: o.chapter,
            summary: o.summary || '',
            locked: false,
            scenes: (o.scenes ?? []).map((s) => ({ id: uid(), title: s.title, desc: s.desc })),
          }
        })
        await this.save()
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
      } finally {
        this.generating = false
      }
    },

    // ---------- 生成 ----------

    skeletonArgs() {
      return {
        world: this.world.map((item) => ({ item: { name: item.name, detail: item.detail }, locked: item.locked })),
        persons: this.persons.map((item) => ({
          item: { name: item.name, role: item.role, identity: item.identity, tags: item.tags, description: item.description },
          locked: item.locked,
        })),
        styleNote: this.styleNote,
        outline: this.outline.map((item) => ({
          item: { chapter: item.chapter, summary: item.summary, scenes: item.scenes.map((s) => ({ title: s.title, desc: s.desc })) },
          locked: item.locked,
        })),
      }
    },

    /** 一次性生成：逐章流式生成并写入 chapters/。返回进度信息。 */
    async generateAll(onProgress: (done: number, total: number, chapter: string) => void): Promise<void> {
      const p = this.needProvider()
      this.generating = true
      this.error = ''
      const fs = getFS()
      const args = this.skeletonArgs()
      try {
        for (let i = 0; i < this.outline.length; i++) {
          const o = this.outline[i]
          onProgress(i, this.outline.length, o.chapter)
          const full = await this.stream(p, chapterGenerateMessages(
            { chapter: o.chapter, summary: o.summary, scenes: o.scenes.map((s) => ({ title: s.title, desc: s.desc })) },
            args,
          ))
          await fs.writeFile(`chapters/${o.chapter}.md`, full.trim() + '\n').catch(() => {})
        }
        onProgress(this.outline.length, this.outline.length, '')
        this.phase = 'done'
        await this.writeDerived()
        await this.save()
      } catch (err) {
        // 网络中断等：已生成章节已落盘
        this.error = err instanceof Error ? err.message : String(err)
        throw err
      } finally {
        this.generating = false
      }
    },

    // ---------- 逐段生成 ----------

    startSegment(): void {
      this.phase = 'segment'
      this.segmentIdx = 0
      this.chapterTexts = {}
    },

    currentChapter(): ImitateChapter | null {
      return this.outline[this.segmentIdx] ?? null
    },

    async segmentGenerate(): Promise<string> {
      const p = this.needProvider()
      const c = this.currentChapter()
      if (!c) return ''
      this.generating = true
      this.error = ''
      try {
        const full = await this.stream(
          p,
          segmentGenerateMessages(
            { chapter: c.chapter, summary: c.summary, scenes: c.scenes.map((s) => ({ title: s.title, desc: s.desc })) },
            this.chapterTexts[c.id] ?? '',
            this.skeletonArgs(),
          ),
        )
        this.chapterTexts[c.id] = full.trim()
        return full.trim()
      } finally {
        this.generating = false
      }
    },

    async segmentRevise(opinion: string): Promise<string> {
      const p = this.needProvider()
      const c = this.currentChapter()
      if (!c) return ''
      this.generating = true
      this.error = ''
      try {
        const full = await this.stream(
          p,
          segmentReviseMessages(
            { chapter: c.chapter, summary: c.summary, scenes: c.scenes.map((s) => ({ title: s.title, desc: s.desc })) },
            this.chapterTexts[c.id] ?? '',
            opinion,
            this.skeletonArgs(),
          ),
        )
        this.chapterTexts[c.id] = full.trim()
        return full.trim()
      } finally {
        this.generating = false
      }
    },

    /** 逐段：保存当前章并推进；末章返回 true（不改 phase，由 UI 弹完成窗决定去向） */
    async segmentNext(): Promise<boolean> {
      const c = this.currentChapter()
      const fs = getFS()
      if (c && this.chapterTexts[c.id]) {
        await fs.writeFile(`chapters/${c.chapter}.md`, this.chapterTexts[c.id] + '\n').catch(() => {})
      }
      if (this.segmentIdx >= this.outline.length - 1) {
        await this.writeDerived()
        await this.save()
        return true
      }
      this.segmentIdx++
      return false
    },

    segmentPrev(): void {
      if (this.segmentIdx > 0) this.segmentIdx--
    },

    async finishToWorkspace(): Promise<void> {
      const fs = getFS()
      // 确保所有已有文本落盘
      for (const c of this.outline) {
        const t = this.chapterTexts[c.id]
        if (t) await fs.writeFile(`chapters/${c.chapter}.md`, t + '\n').catch(() => {})
      }
      await this.writeDerived()
      this.phase = 'done'
      this.active = false
      const project = useProjectStore()
      await project.refresh()
    },

    // ---------- 内部 ----------

    needProvider() {
      const p = useAIStore().activeProvider
      if (!p?.apiKey) throw new Error('请先在设置中配置 API Key')
      return p
    },

    async stream(provider: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
      return streamChat(provider, {
        messages,
        onDelta: () => {},
      })
    },
  },
})
