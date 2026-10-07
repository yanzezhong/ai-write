import type { ChatMessage } from '../types'
import { getFS } from '../core/fs'
import { useAIStore } from '../stores/ai'
import { useEditorStore } from '../stores/editor'
import { useLibraryStore } from '../stores/library'
import { useProjectStore } from '../stores/project'
import { useViewerStore } from '../stores/viewer'

/**
 * 按聊天面板中的手动勾选，组装喂给 AI 的项目上下文。
 * 返回 null 表示未勾选任何内容。
 */
export async function buildContextBlock(): Promise<string | null> {
  const ai = useAIStore()
  const editor = useEditorStore()
  const project = useProjectStore()
  const sections: string[] = []

  if (ai.ctx.currentDoc && editor.doc) {
    sections.push(`【当前文档：${editor.doc.name}】\n${editor.doc.content}`)
  }
  if (ai.ctx.outline) {
    const outline = await project.readOutline()
    if (outline.trim()) sections.push(`【剧情大纲】\n${outline}`)
  }
  if (ai.ctx.characters && project.characters.length) {
    const text = project.characters
      .map((c) => `${c.name}（${c.role}${c.identity ? ' · ' + c.identity : ''}）\n${c.description}`)
      .join('\n\n')
    sections.push(`【人物库】\n${text}`)
  }
  if (ai.ctx.extraDocs.length) {
    const fs = getFS()
    const parts: string[] = []
    for (const path of ai.ctx.extraDocs) {
      const content = await fs.readFile(path).catch(() => '')
      if (content.trim()) parts.push(`【文档：${path}】\n${content}`)
    }
    if (parts.length) sections.push(parts.join('\n\n'))
  }
  if (ai.ctx.libraryDocs) {
    // 当前打开的资料（资料展示窗格中的文件）
    const viewer = useViewerStore()
    const library = useLibraryStore()
    if (viewer.tabs.length && library.ready) {
      const parts: string[] = []
      for (const tab of viewer.tabs) {
        if (tab.source !== 'library') continue
        const content = await library.readFileText(tab.path).catch(() => '')
        if (content.trim()) parts.push(`【资料：${tab.name}】\n${content}`)
      }
      if (parts.length) sections.push(`【当前打开的资料】\n${parts.join('\n\n')}`)
    }
  }

  if (!sections.length) return null
  return `以下是我项目中的资料，供你参考（不要在回复中复述）：\n\n${sections.join('\n\n')}`
}

/** 带上下文的用户消息 */
export async function buildUserMessage(content: string): Promise<ChatMessage[]> {
  const ctx = await buildContextBlock()
  return [{ role: 'user' as const, content: ctx ? `${ctx}\n\n---\n\n${content}` : content }]
}

/** 追加在指定消息之后的一段前后文（选中文字 AI 操作自动携带） */
export function surroundingContext(fullText: string, start: number, end: number, radius = 300): string {
  const before = fullText.slice(Math.max(0, start - radius), start)
  const after = fullText.slice(end, end + radius)
  return `【前文】\n${before}\n\n【选中段落】\n${fullText.slice(start, end)}\n\n【后文】\n${after}`
}
