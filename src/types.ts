export interface ProjectMeta {
  name: string
  createdAt: number
  schema: number
}

export interface RecentProject {
  id: string
  name: string
  dirName: string
  openedAt: number
  /** 展示用统计（打开项目时刷新） */
  docCount?: number
  wordCount?: number
}

export interface FileInfo {
  name: string
  path: string
  kind: 'file' | 'dir'
  modified?: number
}

export interface DocEntry {
  name: string
  path: string
  wordCount: number
  modified?: number
}

export interface AIProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** 下拉候选模型，可手动追加 */
  models: string[]
  builtin?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  providerId: string
  model: string
  /** 发起会话时所在项目（AI 历史按项目过滤用） */
  projectName?: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

/** 编辑器中选区上下文（相对当前文档全文） */
export interface SelectionContext {
  text: string
  start: number
  end: number
  fullText: string
}

/** 通用资料卡：人物库 / 世界观库共用的数据结构（md 文件 ⇄ 卡片） */
export interface InfoCard {
  name: string
  /** 人物：主角/配角/反派/其他；世界观：地点/组织/物品/设定/其他 */
  role: string
  identity: string
  tags: string[]
  description: string
  filePath: string
}

/** 兼容别名：人物库即 InfoCard */
export type CharacterCard = InfoCard

/** 大纲树节点（由 outline.md 标题层级解析） */
export interface OutlineNode {
  level: number
  title: string
  line: number
  children: OutlineNode[]
}
