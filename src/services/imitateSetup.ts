import { getFS, isFSAccessSupported } from '../core/fs'
import { isDemoGlobalLibrary } from '../core/globalLibrary'
import { useImitateStore } from '../stores/imitate'
import { useProjectStore } from '../stores/project'
import { pickDirectory } from './picker'

/**
 * 一键仿写：从例文创建/打开仿写项目并启动解析流程。
 * - 演示模式（总资料库为演示库，或当前已是演示项目）：内存项目，不污染最近列表
 * - 真实模式：选父目录 → 创建仿写项目文件夹 → 写入 worldbuilding/例文原文.md
 */

function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/\.(md|txt)$/i, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  const full = `仿写-${cleaned || '未命名'}`
  return full.slice(0, 30)
}

export function imitateDemoSeed(name: string, exampleName: string, text: string): Record<string, string> {
  return {
    'project.json': JSON.stringify({ name, createdAt: Date.now(), schema: 1 }, null, 2),
    'outline.md': `# ${name} · 剧情大纲\n\n（骨架确认后由 AI 生成）\n`,
    'worldbuilding/例文原文.md': `# 例文：${exampleName}\n\n${text}\n`,
  }
}

export async function setupImitateProject(exampleName: string, text: string): Promise<void> {
  const project = useProjectStore()
  const imitate = useImitateStore()
  const name = sanitizeName(exampleName)

  if (project.isDemo || isDemoGlobalLibrary()) {
    await project.openDemoProject(name, imitateDemoSeed(name, exampleName, text))
  } else {
    if (!isFSAccessSupported()) {
      throw new Error('当前浏览器不支持文件夹选择。请使用 Chrome / Edge，或先在首页使用演示模式。')
    }
    const parent = await pickDirectory()
    await project.create(parent, name)
    const fs = getFS()
    await fs.createDir('worldbuilding')
    await fs.writeFile('worldbuilding/例文原文.md', `# 例文：${exampleName}\n\n${text}\n`)
    imitate.parentHandle = parent
  }

  imitate.start(exampleName, text)
  // 自动开始第 1 步解析；失败（如未配置 API Key）落在 store.error 与对话流里展示
  void imitate.runParse('world')
}
