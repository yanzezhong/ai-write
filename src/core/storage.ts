/** localStorage 封装 + 极简 IndexedDB 封装（AI 会话、目录句柄） */

const PREFIX = 'ai-writer:'

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function lsRemove(key: string): void {
  localStorage.removeItem(PREFIX + key)
}

// ---------- IndexedDB ----------

let dbPromise: Promise<IDBDatabase> | null = null

export function idbDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('ai-writer', 2)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles')
        if (!d.objectStoreNames.contains('chat')) d.createObjectStore('chat', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('gitfs')) d.createObjectStore('gitfs')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function idbSet(store: string, key: IDBValidKey, value: unknown): Promise<void> {
  const d = await idbDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const d = await idbDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const d = await idbDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const d = await idbDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

// ---------- 工具 ----------

export function countWords(text: string): number {
  // 中文按字、英文按词统计
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const words = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[a-zA-Z0-9_'-]+/g) || []).length
  return cjk + words
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 32415 -> "3.2 万字"；847 -> "847 字" */
export function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`
  return `${n} 字`
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function formatClock(ts: number | null): string {
  if (!ts) return '--:--'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
