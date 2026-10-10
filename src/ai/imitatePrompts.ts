import type { ChatMessage } from '../types'

/** 一键仿写的 Prompt 设计（PRD §8）。所有解析都要求 AI 输出 JSON，便于结构化。 */

export function jsonSystemPrompt(task: string): ChatMessage {
  return {
    role: 'system',
    content: `${task}\n\n【重要】只输出 JSON，不要输出任何解释、markdown 代码块标记或其他文字。`,
  }
}

/** 从模型输出里稳健地提取 JSON 对象/数组 */
export function extractJson<T>(text: string): T {
  const start = text.search(/[[{]/)
  if (start === -1) throw new Error('AI 没有返回 JSON')
  // 找与开头匹配的结尾
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = true
      continue
    }
    if (c === '"') inStr = !inStr
    if (inStr) continue
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T
    } else if (open === '{' && c === '[') depth++
    else if (open === '{' && c === ']') depth--
  }
  throw new Error('AI 返回的 JSON 不完整')
}

// ---------- 步骤 1：世界观（PRD §8.1） ----------

export interface WorldItem {
  name: string
  detail: string
}

export function worldParseMessages(source: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '请从用户提供的例文中提取世界观设定。返回 JSON 数组，每个元素包含「name」（条目名称，如：时代背景、地理设定、社会规则、科技体系）和「detail」（详细描述，具体可执行）。提取 4-8 个核心条目。',
    ),
    { role: 'user', content: `例文：\n${source}` },
  ]
}

/** 对话式修改世界观：把当前条目作为上下文，让用户意见生效 */
export function worldReviseMessages(source: string, current: WorldItem[], opinion: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '用户会对世界观设定提出修改意见。请基于意见调整条目，返回调整后的完整 JSON 数组（格式同初始解析：name + detail）。未提及的条目保持原意，可微调表述以保持一致性。',
    ),
    { role: 'user', content: `例文：\n${source}\n\n当前世界观条目：\n${JSON.stringify(current, null, 2)}\n\n修改意见：${opinion}` },
  ]
}

// ---------- 步骤 2：人物（PRD §8.2） ----------

export interface PersonItem {
  name: string
  role: string
  identity: string
  tags: string[]
  description: string
}

export function personParseMessages(source: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '请从用户提供的例文中提取所有重要人物。返回 JSON 数组，每个元素包含：name（姓名）、role（主角/配角/反派）、identity（身份/职业）、tags（性格标签 3-5 个的数组）、description（人物关系与核心动机，2-3 句）。',
    ),
    { role: 'user', content: `例文：\n${source}` },
  ]
}

export function personReviseMessages(source: string, current: PersonItem[], opinion: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '用户会对人物设定提出修改意见。请基于意见调整人物，返回调整后的完整 JSON 数组（字段同初始解析）。可增删人物。',
    ),
    { role: 'user', content: `例文：\n${source}\n\n当前人物：\n${JSON.stringify(current, null, 2)}\n\n修改意见：${opinion}` },
  ]
}

// ---------- 步骤 3：文风样例（PRD §8.3） ----------

export function styleParseMessages(source: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '请分析例文的文风并生成文风样例笔记（Markdown 格式）。结构：先逐条简析描写手法、句式特点、用词风格、对话风格；然后给出 3-5 段代表性文风样例片段（引用或仿照例文笔法，覆盖环境/动作/心理/对话场景类型），每段配一句「手法：」点评。直接输出 Markdown 正文。',
    },
    { role: 'user', content: `例文：\n${source}` },
  ]
}

export function styleReviseMessages(source: string, current: string, opinion: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: '用户会对文风样例提出调整意见。请基于意见重写文风样例笔记，保持 Markdown 结构与原有分析框架，直接输出调整后的完整 Markdown 正文。',
    },
    { role: 'user', content: `例文：\n${source}\n\n当前文风样例笔记：\n${current}\n\n调整意见：${opinion}` },
  ]
}

// ---------- 步骤 4：大纲 + 场景树（PRD §8.4） ----------

export interface SceneItem {
  title: string
  desc: string
}

export interface OutlineItem {
  chapter: string
  summary: string
  scenes: SceneItem[]
}

export function outlineParseMessages(source: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '请为用户提供的例文生成大纲与场景树。返回 JSON 数组，每个元素包含：chapter（章节标题，如「第一章 · 坠落」）、summary（本章概要，1-2 句）、scenes（场景数组，每个场景含 title（场景标题）和 desc（场景描述，100 字内，具体可执行）），每章 2-4 个场景。大纲按原文章节/大情节划分，4-8 章。',
    ),
    { role: 'user', content: `例文：\n${source}` },
  ]
}

export function outlineReviseMessages(source: string, current: OutlineItem[], opinion: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '用户会对大纲结构提出修改意见（如合并场景、增加转折、调整顺序）。请基于意见调整大纲，返回调整后的完整 JSON 数组（字段同初始生成）。',
    ),
    { role: 'user', content: `例文：\n${source}\n\n当前大纲：\n${JSON.stringify(current, null, 2)}\n\n修改意见：${opinion}` },
  ]
}

// ---------- 骨架编辑：AI 优化（PRD §8.5） ----------

export function polishMessages(kind: string, content: string, styleNote: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `请对用户的${kind}内容进行润色优化。要求：保持核心信息不变；提升表达质量；增加细节和画面感；符合提供的文风样例。直接输出优化后的内容，不要解释。`,
    },
    { role: 'user', content: `文风样例：\n${styleNote}\n\n待优化内容：\n${content}` },
  ]
}

// ---------- 骨架编辑：批量修改（PRD §8.6） ----------

export function batchWorldMessages(items: WorldItem[], opinion: string, styleNote: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '用户要对一批世界观条目做整体调整。返回 JSON 数组（元素含 name、detail），条目数量与输入一致、顺序一致，仅按用户意见调整内容，保持条目之间的逻辑一致性。',
    ),
    {
      role: 'user',
      content: `世界观条目：\n${JSON.stringify(items, null, 2)}\n\n整体调整要求：${opinion}\n\n文风样例（供参考）：\n${styleNote}`,
    },
  ]
}

export function batchPersonMessages(items: PersonItem[], opinion: string, styleNote: string): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '用户要对一批人物设定做整体调整。返回 JSON 数组，字段同输入（name/role/identity/tags/description），数量与顺序一致，仅按用户意见调整。',
    ),
    {
      role: 'user',
      content: `人物设定：\n${JSON.stringify(items, null, 2)}\n\n整体调整要求：${opinion}\n\n文风样例（供参考）：\n${styleNote}`,
    },
  ]
}

// ---------- 骨架编辑：重新生成大纲（PRD §8.7，保留锁定章） ----------

export function regenOutlineMessages(
  world: WorldItem[],
  persons: PersonItem[],
  styleNote: string,
  lockedChapters: OutlineItem[],
  opinion: string,
): ChatMessage[] {
  return [
    jsonSystemPrompt(
      '基于世界观、人物库、文风样例重新生成大纲。返回 JSON 数组（chapter/summary/scenes）。要求：lockedChapters 中的章节原样保留（内容不得改动，顺序位置保持在原索引）；其余章节按用户要求（可留空=默认逻辑）重新生成或调整；每章 2-4 个场景。输出完整大纲数组（含锁定章）。',
    ),
    {
      role: 'user',
      content: `世界观：\n${JSON.stringify(world, null, 2)}\n\n人物库：\n${JSON.stringify(persons, null, 2)}\n\n文风样例：\n${styleNote}\n\n必须原样保留的章节：\n${JSON.stringify(lockedChapters, null, 2)}\n\n新大纲的方向/要求（可留空）：${opinion}`,
    },
  ]
}

// ---------- 生成文章（PRD §8.8，带锁定机制） ----------

function skeletonContext(args: {
  world: { item: WorldItem; locked: boolean }[]
  persons: { item: PersonItem; locked: boolean }[]
  styleNote: string
  outline: { item: OutlineItem; locked: boolean }[]
}): string {
  const worlds = args.world.filter((w) => w.locked).map((w) => `- ${w.item.name}：${w.item.detail}`)
  const persons = args.persons
    .filter((p) => p.locked)
    .map((p) => `- ${p.item.name}（${p.item.role}，${p.item.identity}）：${p.item.description}`)
  const chapters = args.outline
    .filter((o) => o.locked)
    .map((o) => `- ${o.item.chapter}：${o.item.summary}`)
  return [
    '【必须严格遵循的设定（已锁定，不得篡改）】',
    worlds.length ? `世界观：\n${worlds.join('\n')}` : '世界观：（无锁定条目）',
    persons.length ? `人物：\n${persons.join('\n')}` : '人物：（无锁定人物）',
    chapters.length ? `章节走向：\n${chapters.join('\n')}` : '章节走向：（无锁定章节）',
    '',
    '【参考设定（未锁定，可合理发挥）】',
    args.world.filter((w) => !w.locked).map((w) => `- ${w.item.name}：${w.item.detail}`).join('\n'),
    args.persons
      .filter((p) => !p.locked)
      .map((p) => `- ${p.item.name}（${p.item.role}）：${p.item.description}`)
      .join('\n'),
    '',
    `【文风样例】\n${args.styleNote}`,
  ].join('\n')
}

/** 一次性生成某一章 */
export function chapterGenerateMessages(
  outlineItem: OutlineItem,
  args: Parameters<typeof skeletonContext>[0],
): ChatMessage[] {
  const scenes = outlineItem.scenes.map((s, i) => `${i + 1}. ${s.title}：${s.desc}`).join('\n')
  return [
    {
      role: 'system',
      content:
        '你是中文小说写手。根据给定的骨架信息生成本章正文（Markdown，一级标题为章节标题）。要求：严格按场景顺序展开，每个场景扩写成完整段落；模仿文风样例的笔法；锁定设定严格遵循。直接输出正文，不要解释。',
    },
    {
      role: 'user',
      content: `${skeletonContext(args)}\n\n【本章要求】\n章节：${outlineItem.chapter}\n概要：${outlineItem.summary}\n场景：\n${scenes}`,
    },
  ]
}

/** 逐段生成：当前章节（可能带用户已写的修改基础） */
export function segmentGenerateMessages(
  outlineItem: OutlineItem,
  userBase: string,
  args: Parameters<typeof skeletonContext>[0],
): ChatMessage[] {
  const scenes = outlineItem.scenes.map((s, i) => `${i + 1}. ${s.title}：${s.desc}`).join('\n')
  const base = userBase.trim()
  return [
    {
      role: 'system',
      content:
        '你是中文小说写手。根据骨架信息生成本章正文（Markdown，一级标题为章节标题）。严格按场景顺序、模仿文风样例笔法、遵循锁定设定。直接输出正文，不要解释。',
    },
    {
      role: 'user',
      content: `${skeletonContext(args)}\n\n【本章要求】\n章节：${outlineItem.chapter}\n概要：${outlineItem.summary}\n场景：\n${scenes}${
        base ? `\n\n【用户已写的基础稿（以其为基调续写/整合）】\n${base}` : ''
      }`,
    },
  ]
}

/** 逐段：对当前段落提修改意见 */
export function segmentReviseMessages(
  outlineItem: OutlineItem,
  currentText: string,
  opinion: string,
  args: Parameters<typeof skeletonContext>[0],
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: '用户会对当前章节草稿提出修改意见。请基于意见重写本章，保持骨架与文风要求不变。直接输出重写后的完整正文。',
    },
    {
      role: 'user',
      content: `${skeletonContext(args)}\n\n【本章】${outlineItem.chapter}：${outlineItem.summary}\n\n当前草稿：\n${currentText}\n\n修改意见：${opinion}`,
    },
  ]
}
