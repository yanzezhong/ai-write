import git from 'isomorphic-git'
import { getFS } from './fs'
import { idbDb, idbDelete, idbGet, idbSet } from './storage'

/**
 * 浏览器内 Git（isomorphic-git）。
 *
 * 设计：.git 仓库数据（objects/index/refs，二进制）存浏览器 IndexedDB；
 * 工作树文件直接读写项目文件夹（走 FSAdapter，UTF-8 文本无损往返）。
 * 因此项目文件夹里不会出现 .git 目录，版本数据跟随浏览器本地存储。
 * 远程能力（clone/push/pull）需要 CORS 代理，本版本不提供。
 */

const DIR = '.'
const GIT_PREFIX = '.git/'

// ---------- IndexedDB 上的 .git 虚拟文件系统 ----------

interface GitNode {
  dir: boolean
  data?: Uint8Array
}

async function gitNode(path: string): Promise<GitNode | undefined> {
  return idbGet<GitNode>('gitfs', path)
}

async function putGitNode(path: string, node: GitNode): Promise<void> {
  await idbSet('gitfs', path, node)
}

/** 确保 .git 路径的父目录标记都存在 */
async function ensureGitParents(path: string): Promise<void> {
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const p = parts.slice(0, i).join('/')
    if (!(await gitNode(p))) await putGitNode(p, { dir: true })
  }
}

function isGitPath(path: string): boolean {
  return path === '.git' || path.startsWith(GIT_PREFIX)
}

function norm(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/$/, '') || '.'
}

function hashIno(path: string): number {
  let h = 0
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

function fakeStat(type: 'file' | 'dir', path: string) {
  const now = Date.now()
  return {
    type,
    mode: type === 'dir' ? 0o40755 : 0o100644,
    size: type === 'dir' ? 0 : -1, // size 取 -1：强制 isomorphic-git 认为缓存失效并重读内容，保证状态准确
    ino: hashIno(path),
    dev: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 4096,
    blocks: 0,
    atimeMs: now,
    mtimeMs: now,
    ctimeMs: now,
    birthtimeMs: now,
    atime: new Date(now),
    mtime: new Date(now),
    ctime: new Date(now),
    birthtime: new Date(now),
    isDirectory: () => type === 'dir',
    isFile: () => type === 'file',
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  }
}

const encoder = new TextEncoder()

async function lstatImpl(p: string) {
  if (p === '.' || p === '') return fakeStat('dir', '.')
  if (isGitPath(p)) {
    if (p === '.git') return fakeStat('dir', p)
    const node = await gitNode(p)
    if (!node) {
      const err = new Error(`ENOENT: ${p}`) as Error & { code: string }
      err.code = 'ENOENT'
      throw err
    }
    return fakeStat(node.dir ? 'dir' : 'file', p)
  }
  // 工作树：区分文件/目录（FSAdapter 没有 isDir，查父级列表）
  const idx = p.lastIndexOf('/')
  const parent = idx === -1 ? '' : p.slice(0, idx)
  const name = idx === -1 ? p : p.slice(idx + 1)
  let kind: 'file' | 'dir' | null = null
  try {
    const entries = await getFS().listDir(parent)
    kind = entries.find((e) => e.name === name)?.kind ?? null
  } catch {
    kind = null
  }
  if (kind === null) {
    const err = new Error(`ENOENT: ${p}`) as Error & { code: string }
    err.code = 'ENOENT'
    throw err
  }
  return fakeStat(kind, p)
}

/** isomorphic-git 需要的 fs 接口（promise 风格）：.git 走 IndexedDB，工作树走 FSAdapter */
function wrapFS() {
  return {
    async readFile(path: string, opts?: { encoding?: string | null }) {
      const p = norm(path)
      if (isGitPath(p)) {
        const node = await gitNode(p)
        if (!node || node.dir) throw new Error(`ENOENT: ${p}`)
        const buf = node.data ?? new Uint8Array()
        return opts?.encoding ? new TextDecoder().decode(buf) : buf
      }
      const fs = getFS()
      const text = await fs.readFile(p)
      return opts?.encoding ? text : encoder.encode(text)
    },

    async writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: string }) {
      const p = norm(path)
      if (isGitPath(p)) {
        await ensureGitParents(p)
        const buf = typeof data === 'string' ? encoder.encode(data) : data
        await putGitNode(p, { dir: false, data: buf })
        return
      }
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
      await getFS().writeFile(p, text)
    },

    async mkdir(path: string) {
      const p = norm(path)
      if (isGitPath(p)) {
        await ensureGitParents(p)
        await putGitNode(p, { dir: true })
        return
      }
      await getFS().createDir(p)
    },

    async rmdir(path: string) {
      const p = norm(path)
      if (isGitPath(p)) {
        await idbDelete('gitfs', p)
      }
    },

    async readdir(path: string) {
      const p = norm(path)
      if (isGitPath(p)) {
        const prefix = p === '.git' ? GIT_PREFIX : `${p}/`
        const names = new Set<string>()
        const db = await idbDb()
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('gitfs', 'readonly')
          const store = tx.objectStore('gitfs')
          const cursorReq = store.openCursor()
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor) return resolve()
            const key = String(cursor.key)
            if (key.startsWith(prefix)) {
              const rest = key.slice(prefix.length)
              if (rest) names.add(rest.split('/')[0])
            }
            cursor.continue()
          }
          cursorReq.onerror = () => reject(cursorReq.error)
        })
        return [...names]
      }
      const entries = await getFS().listDir(p === '.' ? '' : p)
      return entries.map((e) => e.name)
    },

    async stat(path: string) {
      return lstatImpl(norm(path))
    },

    async lstat(path: string) {
      return lstatImpl(norm(path))
    },

    async unlink(path: string) {
      const p = norm(path)
      if (isGitPath(p)) {
        await idbDelete('gitfs', p)
        return
      }
      await getFS().delete(p)
    },

    async readlink() {
      throw new Error('不支持符号链接')
    },

    async symlink() {
      throw new Error('不支持符号链接')
    },

    async chmod() {
      /* noop */
    },
  }
}

// ---------- 业务 API ----------

export interface GitStatusEntry {
  path: string
  status: '新增' | '修改' | '删除'
}

export interface GitCommitEntry {
  oid: string
  message: string
  author: string
  date: number
}

function fsOpts() {
  return { fs: wrapFS(), dir: DIR }
}

export async function isGitRepo(): Promise<boolean> {
  return (await gitNode('.git/HEAD')) !== undefined
}

export async function gitInit(): Promise<void> {
  await git.init({ ...fsOpts(), defaultBranch: 'main' })
}

export async function gitStatus(): Promise<GitStatusEntry[]> {
  const rows = await git.statusMatrix(fsOpts())
  const out: GitStatusEntry[] = []
  for (const [filepath, head, workdir, stage] of rows) {
    if (workdir === 0) out.push({ path: filepath, status: '删除' })
    else if (head === 0) out.push({ path: filepath, status: '新增' })
    else if (head !== workdir || workdir !== stage) out.push({ path: filepath, status: '修改' })
    // head === workdir === stage：未变更，不显示
  }
  return out
}

export async function gitCommitAll(message: string, author: { name: string; email: string }): Promise<string> {
  const opts = fsOpts()
  const rows = await git.statusMatrix(opts)
  for (const [filepath, , workdir] of rows) {
    if (workdir === 0) await git.remove({ ...opts, filepath })
    else await git.add({ ...opts, filepath })
  }
  return git.commit({ ...opts, message, author })
}

export async function gitLog(depth = 30): Promise<GitCommitEntry[]> {
  const opts = fsOpts()
  try {
    await git.resolveRef({ ...opts, ref: 'HEAD' })
  } catch {
    return [] // 仓库已初始化但还没有任何提交（unborn branch），视为无历史
  }
  const commits = await git.log({ ...opts, depth, force: true })
  return commits.map((c) => ({
    oid: c.oid,
    message: c.commit.message.trim(),
    author: c.commit.author.name,
    date: c.commit.author.timestamp * 1000,
  }))
}

export async function gitBranch(): Promise<string> {
  const b = await git.currentBranch({ ...fsOpts(), fullname: false })
  return b ?? 'main'
}

/** 把工作树恢复到指定提交（force checkout），会覆盖未提交的修改 */
export async function gitRestore(oid: string): Promise<void> {
  await git.checkout({ ...fsOpts(), ref: oid, force: true })
}
