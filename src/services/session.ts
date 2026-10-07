import { getFS } from '../core/fs'
import { idbGet, lsGet, lsRemove, lsSet } from '../core/storage'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'

/**
 * 会话记忆：记录最后打开的项目/演示模式与文档，刷新页面后自动恢复，
 * 避免每次刷新都回到首页。
 */

interface LastSession {
  demo: boolean
  dirName?: string
  docPath?: string
  at: number
}

export function recordSession(docPath?: string): void {
  const project = useProjectStore()
  if (!project.isOpen) return
  const s: LastSession = {
    demo: project.isDemo,
    dirName: project.isDemo ? undefined : project.rootHandle?.name,
    docPath: docPath ?? useEditorStore().doc?.path,
    at: Date.now(),
  }
  lsSet('lastSession', s)
}

export function clearSession(): void {
  lsRemove('lastSession')
}

/**
 * 尝试恢复上次会话。返回 true 表示项目已重新打开。
 * 真实项目依赖 IndexedDB 里保存的目录句柄 + 持久授权（Chrome 可记住授权）；
 * 授权不存在时静默失败，由调用方回退到首页。
 */
export async function restoreSession(): Promise<boolean> {
  const project = useProjectStore()
  if (project.isOpen) return true
  const s = lsGet<LastSession | null>('lastSession', null)
  if (!s) return false

  if (s.demo) {
    await project.openDemo()
    return true
  }

  if (!s.dirName) return false
  const handle = await idbGet<FileSystemDirectoryHandle>('handles', s.dirName).catch(() => undefined)
  if (!handle) return false
  const perm = await (
    handle as FileSystemDirectoryHandle & {
      queryPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    }
  )
    .queryPermission?.({ mode: 'readwrite' })
    .catch(() => 'prompt' as const)
  if (perm !== 'granted') return false

  try {
    await project.openWithHandle(handle)
  } catch {
    return false
  }

  // 恢复上次编辑的文档
  if (s.docPath) {
    const fs = getFS()
    const name = s.docPath.split('/').pop() ?? s.docPath
    const content = await fs.readFile(s.docPath).catch(() => null)
    if (content !== null) {
      useEditorStore().openDoc(s.docPath, name, content)
    }
  }
  return true
}
