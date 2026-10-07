/** 目录选择器封装：并发防护 + 可读的错误提示（原生选择器一次只能存在一个） */

let picking = false

export class PickerError extends Error {}

export function isPicking(): boolean {
  return picking
}

/** 打开系统文件夹选择器；失败时抛出带可读信息的 PickerError */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new PickerError('当前浏览器不支持文件夹选择（File System Access API）。请使用 Chrome / Edge，并在独立标签页中打开应用。')
  }
  if (picking) {
    throw new PickerError('已有一个文件夹选择窗口在等待。请先完成或取消它；若窗口未出现，刷新页面后重试。')
  }
  picking = true
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (err) {
    throw new PickerError(describePickerError(err))
  } finally {
    picking = false
  }
}

/** 把底层错误翻译成用户能看懂、能行动的提示 */
export function describePickerError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err)
  switch (name) {
    case 'AbortError':
      return '已取消选择文件夹。'
    case 'SecurityError':
      return '浏览器拒绝了文件夹选择（安全限制）。请在独立标签页中打开本应用（不要嵌入在预览窗格中）后重试。'
    case 'NotAllowedError':
      return '未获得文件夹读写授权，请重试并在弹窗中选择「允许」。'
    default:
      return `选择文件夹失败：${name || '未知错误'} — ${raw.slice(0, 120)}`
  }
}
