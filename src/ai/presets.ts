/** 选中文字 AI 操作的预设指令 */

export interface AIPresetAction {
  id: string
  label: string
  buildPrompt: (selected: string, custom?: string) => string
}

export const PRESET_ACTIONS: AIPresetAction[] = [
  {
    id: 'continue',
    label: '续写',
    buildPrompt: (s) =>
      `请根据以下段落的文风和情节，直接续写后续内容（只输出续写正文，不要解释）：\n\n${s}`,
  },
  {
    id: 'imitate',
    label: '仿写',
    buildPrompt: (s) =>
      `请模仿以下段落的文风、节奏与笔触另写一段新的内容（只输出正文，不要解释）：\n\n${s}`,
  },
  {
    id: 'polish',
    label: '润色',
    buildPrompt: (s) =>
      `请对以下文字进行润色：让表达更凝练、节奏更流畅，保持原意与文风不变。只输出润色后的文字：\n\n${s}`,
  },
  {
    id: 'expand',
    label: '扩写',
    buildPrompt: (s) =>
      `请将以下文字扩写，补充细节、感官描写与层次，保持原有文风。只输出扩写后的文字：\n\n${s}`,
  },
  {
    id: 'shorten',
    label: '缩写',
    buildPrompt: (s) =>
      `请将以下文字压缩为更精炼的版本，保留核心信息与文风。只输出缩写后的文字：\n\n${s}`,
  },
  {
    id: 'translate',
    label: '翻译',
    buildPrompt: (s) =>
      `请将以下文字翻译成流畅自然的中文（如原文已是中文，则翻译成英文）。只输出译文：\n\n${s}`,
  },
  {
    id: 'custom',
    label: '自定义',
    buildPrompt: (s, custom) => `${custom ?? '请处理以下文字：'}\n\n${s}`,
  },
]

export function getPreset(id: string): AIPresetAction {
  return PRESET_ACTIONS.find((a) => a.id === id) ?? PRESET_ACTIONS[6]
}
