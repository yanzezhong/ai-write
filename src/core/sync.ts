import type { FSAdapter, FileInfo } from './fs'

export interface SyncBinding {
  cloudProjectId: string
  baseVersion: number
  baseMd5: string
  deviceKey: string
  /** 当前若工作在分叉上，记录主项目 id（解决分叉时需要） */
  mainProjectId?: string
}

export interface SyncFiles {
  [path: string]: string
}

const SYNC_JSON = '.sync.json'

/** 参与同步的文本扩展名；其余视为二进制跳过 */
const TEXT_EXTS = new Set(['.md', '.txt', '.json'])

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.gz', '.tar', '.mp3', '.mp4', '.webm',
  '.woff', '.woff2', '.ttf', '.otf',
])

function isTextPath(path: string): boolean {
  const lower = path.toLowerCase()
  const ext = lower.slice(lower.lastIndexOf('.'))
  if (BINARY_EXTS.has(ext)) return false
  if (TEXT_EXTS.has(ext)) return true
  return false
}

/** 递归打包项目内全部文本文件，.sync.json 不参与指纹 */
export async function packProject(fs: FSAdapter): Promise<SyncFiles> {
  const files: SyncFiles = {}
  const entries = await fs.listDir('')
  await walk(fs, '', entries, files)
  return files
}

async function walk(
  fs: FSAdapter,
  prefix: string,
  entries: FileInfo[],
  out: SyncFiles,
): Promise<void> {
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (rel === SYNC_JSON) continue
    if (e.kind === 'dir') {
      const children = await fs.listDir(rel)
      await walk(fs, rel, children, out)
    } else if (isTextPath(rel)) {
      try {
        out[rel] = await fs.readFile(rel)
      } catch {
        /* 跳过读失败的文件 */
      }
    }
  }
}

/** 把云端内容写回项目；会创建缺失目录，不会写 .sync.json */
export async function writeProjectFiles(fs: FSAdapter, files: SyncFiles): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    if (path === SYNC_JSON) continue
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent) await fs.createDir(parent)
    await fs.writeFile(path, content)
  }
}

export async function readSyncJson(fs: FSAdapter): Promise<SyncBinding | null> {
  try {
    return JSON.parse(await fs.readFile(SYNC_JSON)) as SyncBinding
  } catch {
    return null
  }
}

export async function writeSyncJson(fs: FSAdapter, binding: SyncBinding | null): Promise<void> {
  if (!binding) {
    try {
      await fs.delete(SYNC_JSON)
    } catch {
      /* 不存在也 OK */
    }
    return
  }
  await fs.writeFile(SYNC_JSON, JSON.stringify(binding, null, 2) + '\n')
}

// ---------- 指纹算法：与服务端 server/internal/sync/fingerprint.go 严格一致 ----------

export function fingerPrint(files: SyncFiles): string {
  const paths = Object.keys(files).sort()
  const outer = md5create()
  for (const p of paths) {
    const inner = md5create()
    inner.update(p)
    inner.update('\0')
    inner.update(files[p])
    inner.update('\0')
    outer.updateBytes(inner.digest())
  }
  return bytesToHex(outer.digest())
}

/** MD5 hex，供内部使用 */
export function md5hex(input: string): string {
  const m = md5create()
  m.update(input)
  return bytesToHex(m.digest())
}

// ---------- 极简 MD5 ----------

function md5create() {
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476
  let pending = new Uint8Array(0)
  let totalBytes = 0

  function feed(data: Uint8Array) {
    if (data.length === 0) return
    const merged = new Uint8Array(pending.length + data.length)
    merged.set(pending)
    merged.set(data, pending.length)
    const chunkLen = Math.floor(merged.length / 64) * 64
    if (chunkLen > 0) {
      const state = cycle(a, b, c, d, merged.subarray(0, chunkLen))
      a = state.a
      b = state.b
      c = state.c
      d = state.d
    }
    pending = merged.subarray(chunkLen)
  }

  return {
    update(s: string) {
      const bytes = new TextEncoder().encode(s)
      totalBytes += bytes.length
      feed(bytes)
    },
    updateBytes(bytes: Uint8Array) {
      totalBytes += bytes.length
      feed(bytes)
    },
    digest(): Uint8Array {
      const totalBits = totalBytes * 8
      // 填充：1 + 0*，使长度 ≡ 56 (mod 64)，然后追加 64-bit 小端长度
      const padLen = (totalBytes % 64) < 56 ? 55 - (totalBytes % 64) : 119 - (totalBytes % 64)
      const pad = new Uint8Array(padLen + 1)
      pad[0] = 0x80
      const final = new Uint8Array(pending.length + pad.length + 8)
      final.set(pending)
      final.set(pad, pending.length)
      const view = new DataView(final.buffer, final.byteOffset + pending.length + pad.length, 8)
      view.setUint32(0, totalBits & 0xffffffff, true)
      view.setUint32(4, Math.floor(totalBits / 0x100000000), true)
      const state = cycle(a, b, c, d, final)
      const out = new Uint8Array(16)
      const v = new DataView(out.buffer)
      v.setUint32(0, state.a, true)
      v.setUint32(4, state.b, true)
      v.setUint32(8, state.c, true)
      v.setUint32(12, state.d, true)
      return out
    },
  }
}

function cycle(a0: number, b0: number, c0: number, d0: number, bytes: Uint8Array) {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ])

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < bytes.byteLength; i += 64) {
    let a = a0, b = b0, c = c0, d = d0
    const M = new Uint32Array(16)
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true)

    for (let j = 0; j < 64; j++) {
      let f = 0, g = 0
      if (j < 16) {
        f = (b & c) | (~b & d)
        g = j
      } else if (j < 32) {
        f = (d & b) | (~d & c)
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        f = b ^ c ^ d
        g = (3 * j + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * j) % 16
      }
      const temp = d
      d = c
      c = b
      b = (b + leftRotate((a + f + K[j] + M[g]) | 0, s[j])) | 0
      a = temp
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  return { a: a0, b: b0, c: c0, d: d0 }
}

function leftRotate(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) | 0
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
