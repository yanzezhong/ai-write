import type { FileInfo } from '../types'
import type { FSAdapter } from './fs'

/**
 * 手机端存储适配（PRD §2.1 / TODO V4-0.1）。
 *
 * 手机浏览器没有 File System Access API，项目改存 OPFS（Origin Private File System）：
 * 目录结构与桌面版完全一致（project.json / chapters/ / notes/ …），
 * 业务层通过统一的 FSAdapter 接口访问，零改动。
 *
 * OPFS 句柄与 File System Access 是同一套接口，这里复用同样的遍历逻辑；
 * 区别在于根目录由 navigator.storage.getDirectory() 提供，
 * 且每个项目是 OPFS 根下的一个子目录（projects/<id>/）。
 */

/** OPFS 内项目容器目录名 */
export const MOBILE_PROJECTS_ROOT = 'projects'

/** 当前环境是否支持 OPFS（Android Chrome 86+ / iOS Safari 17+） */
export function isOPFSSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage?.getDirectory
  )
}

/** 当前环境是否应走手机端存储（没有 File System Access，但有 OPFS） */
export function isMobileEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    !('showDirectoryPicker' in window) &&
    isOPFSSupported()
  )
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

/** 解析 OPFS 内的相对路径（不含 projects/<id> 前缀）到文件/目录句柄 */
async function resolve(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return root
  let dir = root
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

async function resolveDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(Boolean)
  let dir = root
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p)
  }
  return dir
}

async function resolveFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean)
  const dir = await resolveDir(root, parts.slice(0, -1).join('/'))
  return dir.getFileHandle(parts[parts.length - 1])
}

/** 基于 OPFS 的 FSAdapter 实现。构造参数是项目对应的 OPFS 目录句柄。 */
export class MobileFSAdapter implements FSAdapter {
  constructor(private projectRoot: FileSystemDirectoryHandle) {}

  /** 项目根目录句柄（写入 project store 的 rootHandle 用） */
  get root(): FileSystemDirectoryHandle {
    return this.projectRoot
  }

  async readFile(path: string): Promise<string> {
    const handle = await resolveFile(this.projectRoot, path)
    const file = await handle.getFile()
    return file.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const dir = await resolveDir(this.projectRoot, parts.slice(0, -1).join('/'))
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const dir = await resolveDir(this.projectRoot, path)
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
      await resolve(this.projectRoot, path)
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
    let dir = this.projectRoot
    for (const p of parts) {
      dir = await dir.getDirectoryHandle(p, { create: true })
    }
  }

  async delete(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const dir = await resolveDir(this.projectRoot, parts.slice(0, -1).join('/'))
    await dir.removeEntry(parts[parts.length - 1], { recursive: true })
  }

  async rename(path: string, newName: string): Promise<void> {
    const content = await this.readFile(path)
    const target = path.split('/').slice(0, -1).concat(newName).join('/')
    await this.writeFile(target, content)
    await this.delete(path)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const handle = await resolveFile(this.projectRoot, path)
    const file = await handle.getFile()
    return new Uint8Array(await file.arrayBuffer())
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const dir = await resolveDir(this.projectRoot, parts.slice(0, -1).join('/'))
    const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await handle.createWritable()
    await writable.write(new Blob([data as BlobPart]))
    await writable.close()
  }
}

/* ---------- 项目级操作（OPFS 内 projects/<id>/ 目录的增删改列） ---------- */

export interface MobileProjectMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** 最近打开时统计的文档数/字数（首页卡片展示用） */
  docCount?: number
  wordCount?: number
}

const REGISTRY_KEY = 'mobileProjects'

function loadRegistry(): MobileProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '[]') as MobileProjectMeta[]
  } catch {
    return []
  }
}

function saveRegistry(list: MobileProjectMeta[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list))
}

/** 列出 OPFS 内的全部手机端项目 */
export function listMobileProjects(): MobileProjectMeta[] {
  return loadRegistry().sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 在 OPFS 中新建项目目录，返回适配器实例与元信息 */
export async function createMobileProject(
  name: string,
  initialFiles?: Record<string, string>,
): Promise<{ fs: MobileFSAdapter; meta: MobileProjectMeta }> {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const root = await opfsRoot()
  const projects = await root.getDirectoryHandle(MOBILE_PROJECTS_ROOT, { create: true })
  const dir = await projects.getDirectoryHandle(id, { create: true })
  const fs = new MobileFSAdapter(dir)
  if (initialFiles) {
    for (const [path, content] of Object.entries(initialFiles)) {
      await fs.writeFile(path, content)
    }
  }
  const now = Date.now()
  const meta: MobileProjectMeta = { id, name, createdAt: now, updatedAt: now }
  saveRegistry([...loadRegistry(), meta])
  return { fs, meta }
}

/** 打开 OPFS 中已有的项目目录 */
export async function openMobileProject(id: string): Promise<MobileFSAdapter | null> {
  try {
    const root = await opfsRoot()
    const projects = await root.getDirectoryHandle(MOBILE_PROJECTS_ROOT)
    const dir = await projects.getDirectoryHandle(id)
    touchMobileProject(id)
    return new MobileFSAdapter(dir)
  } catch {
    return null
  }
}

/** 重命名项目（仅改登记名，目录 id 不变） */
export function renameMobileProject(id: string, name: string): void {
  saveRegistry(loadRegistry().map((m) => (m.id === id ? { ...m, name, updatedAt: Date.now() } : m)))
}

/** 删除 OPFS 中的项目目录及其登记 */
export async function deleteMobileProject(id: string): Promise<void> {
  try {
    const root = await opfsRoot()
    const projects = await root.getDirectoryHandle(MOBILE_PROJECTS_ROOT)
    await projects.removeEntry(id, { recursive: true })
  } catch {
    /* 目录不存在时视为已删除 */
  }
  saveRegistry(loadRegistry().filter((m) => m.id !== id))
}

/** 更新项目的最近使用时间 */
export function touchMobileProject(id: string): void {
  saveRegistry(loadRegistry().map((m) => (m.id === id ? { ...m, updatedAt: Date.now() } : m)))
}

/** 更新项目统计信息（打开项目后回写，供首页卡片展示） */
export function updateMobileProjectStats(id: string, stats: { docCount: number; wordCount: number }): void {
  saveRegistry(
    loadRegistry().map((m) =>
      m.id === id ? { ...m, docCount: stats.docCount, wordCount: stats.wordCount, updatedAt: Date.now() } : m,
    ),
  )
}
