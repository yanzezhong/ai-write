import type { FileInfo } from '../types'

/**
 * 文件系统抽象层。所有文件读写必须经此接口；
 * 将来接入云端 / harness 时新增实现即可，业务层零改动。
 */
export interface FSAdapter {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<FileInfo[]>
  exists(path: string): Promise<boolean>
  createFile(path: string, content?: string): Promise<void>
  createDir(path: string): Promise<void>
  delete(path: string): Promise<void>
  rename(path: string, newName: string): Promise<void>
}

/** 基于 File System Access API 的实现（Chrome / Edge） */
export class WebFSAdapter implements FSAdapter {
  constructor(private root: FileSystemDirectoryHandle) {}

  private async resolve(path: string): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return this.root
    let dir: FileSystemDirectoryHandle = this.root
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i])
    }
    const last = parts[parts.length - 1]
    try {
      return await dir.getFileHandle(last)
    } catch {
      return await dir.getDirectoryHandle(last)
    }
  }

  private async resolveDir(path: string): Promise<FileSystemDirectoryHandle> {
    const parts = path.split('/').filter(Boolean)
    let dir: FileSystemDirectoryHandle = this.root
    for (const p of parts) {
      dir = await dir.getDirectoryHandle(p)
    }
    return dir
  }

  private async resolveFile(path: string): Promise<FileSystemFileHandle> {
    const parts = path.split('/').filter(Boolean)
    const dir = await this.resolveDir(parts.slice(0, -1).join('/'))
    return dir.getFileHandle(parts[parts.length - 1])
  }

  async readFile(path: string): Promise<string> {
    const handle = await this.resolveFile(path)
    const file = await handle.getFile()
    return file.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const dir = await this.resolveDir(parts.slice(0, -1).join('/'))
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const dir = await this.resolveDir(path)
    const out: FileInfo[] = []
    for await (const entry of dir.values()) {
      const isFile = 'getFile' in (entry as object)
      out.push({
        name: entry.name,
        path: path ? `${path}/${entry.name}` : entry.name,
        kind: isFile ? 'file' : 'dir',
      })
    }
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN') : a.kind === 'dir' ? -1 : 1))
    return out
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.resolve(path)
      return true
    } catch {
      return false
    }
  }

  async createFile(path: string, content = ''): Promise<void> {
    return this.writeFile(path, content)
  }

  async createDir(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    let dir: FileSystemDirectoryHandle = this.root
    for (const p of parts) {
      dir = await dir.getDirectoryHandle(p, { create: true })
    }
  }

  async delete(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const dir = await this.resolveDir(parts.slice(0, -1).join('/'))
    await dir.removeEntry(parts[parts.length - 1], { recursive: true })
  }

  async rename(path: string, newName: string): Promise<void> {
    const content = await this.readFile(path)
    const target = path.split('/').slice(0, -1).concat(newName).join('/')
    await this.writeFile(target, content)
    await this.delete(path)
  }
}

let current: FSAdapter | null = null

export function setFS(adapter: FSAdapter | null): void {
  current = adapter
}

export function getFS(): FSAdapter {
  if (!current) throw new Error('尚未打开项目')
  return current
}

export function hasFS(): boolean {
  return current !== null
}

export function isFSAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}
