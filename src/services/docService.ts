import { getFS } from '../core/fs'
import { countWords } from '../core/storage'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'

/** 在编辑区打开项目内文档（侧边栏"文档/本地文件"共用入口） */
export async function openDocInEditor(path: string): Promise<void> {
  const fs = getFS()
  const name = path.split('/').pop() ?? path
  const content = await fs.readFile(path)
  const editor = useEditorStore()
  editor.openDoc(path, name, content)
  // 刷新列表里的字数统计
  const project = useProjectStore()
  const entry = project.docs.find((d) => d.path === path)
  if (entry) entry.wordCount = countWords(content)
  // 记住当前文档，刷新页面后可恢复到同一篇
  const { recordSession } = await import('./session')
  recordSession(path)
}

/** 新建文档并打开。folder 如 'chapters' */
export async function createDoc(folder: string, name: string): Promise<void> {
  const fs = getFS()
  const path = `${folder}/${name}`
  if (!/\.(md|txt)$/i.test(name)) {
    await fs.createFile(`${path}.md`, `# ${name}\n\n`)
    await openDocInEditor(`${path}.md`)
  } else {
    await fs.createFile(path, '')
    await openDocInEditor(path)
  }
  await useProjectStore().refresh()
}
