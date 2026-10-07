import type { FSAdapter } from './fs'
import { WebFSAdapter } from './fs'
import { MemoryFSAdapter } from './memoryFS'
import { idbGet, idbSet, lsGet, lsSet } from './storage'

/**
 * 总资料库：独立的全局文件夹，首次使用时由用户选定位置。
 * - 文件存于库内 files/（只读：允许删除、同名替换，不允许编辑内容）
 * - meta.json 存于库根：标签组 / 标签 / 文件-标签映射，随文件夹迁移
 *
 * 演示模式下使用独立内存 FS（种子数据见 demoGlobalLibraryFiles）。
 */

const HANDLE_KEY = 'global-library'
const DEMO_KEY = '__demo__'

// ---------- 数据模型（对应 V2 需求 §1.4） ----------

export interface TagGroup {
  id: string
  name: string
  type: 'normal' | 'exclusive'
  parentGroupId: string | null // 预留嵌套，当前恒为 null
  builtin?: boolean
}

export interface LibraryTag {
  id: string
  name: string
  groupId: string
}

export interface LibraryDoc {
  id: string
  file: string
  tagIds: string[]
  archivedAt?: string
}

export interface LibraryMeta {
  tagGroups: TagGroup[]
  tags: LibraryTag[]
  docs: LibraryDoc[]
}

export function emptyMeta(): LibraryMeta {
  return {
    tagGroups: [
      { id: 'g_default', name: '未整理', type: 'normal', parentGroupId: null, builtin: true },
      { id: 'g_source', name: '来源项目', type: 'exclusive', parentGroupId: null, builtin: true },
    ],
    tags: [],
    docs: [],
  }
}

export function isTextLike(name: string): boolean {
  return /\.(md|txt)$/i.test(name)
}

// ---------- 句柄 / FS 获取 ----------

let cached: { key: string; fs: FSAdapter } | null = null

export function getGlobalLibraryFS(): FSAdapter | null {
  return cached?.fs ?? null
}

export async function hasGlobalLibrary(): Promise<boolean> {
  if (cached) return true
  if (typeof window === 'undefined') return false
  return (await idbGet('handles', HANDLE_KEY).catch(() => undefined)) !== undefined
}

/** 确保总资料库可用：有缓存/句柄直接返回；否则抛错让调用方走"首次选定"流程 */
export async function ensureGlobalLibrary(): Promise<FSAdapter> {
  if (cached) return cached.fs
  const handle = await idbGet<FileSystemDirectoryHandle>('handles', HANDLE_KEY).catch(() => undefined)
  if (!handle) throw new Error('总资料库尚未设置')
  const perm = await (
    handle as FileSystemDirectoryHandle & {
      queryPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    }
  )
    .queryPermission?.({ mode: 'readwrite' })
    .catch(() => 'prompt' as const)
  if (perm !== 'granted') {
    const req = await (
      handle as FileSystemDirectoryHandle & {
        requestPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
      }
    ).requestPermission?.({ mode: 'readwrite' }).catch(() => 'prompt')
    if (req !== 'granted') throw new Error('未获得总资料库文件夹的读写授权')
  }
  cached = { key: HANDLE_KEY, fs: new WebFSAdapter(handle) }
  return cached.fs
}

/** 首次使用：用户选定总资料库文件夹 */
export async function setupGlobalLibrary(handle: FileSystemDirectoryHandle): Promise<FSAdapter> {
  const fs = new WebFSAdapter(handle)
  await fs.createDir('files')
  if (!(await fs.exists('meta.json'))) {
    await fs.writeFile('meta.json', JSON.stringify(emptyMeta(), null, 2))
  }
  await idbSet('handles', HANDLE_KEY, handle)
  cached = { key: HANDLE_KEY, fs }
  return fs
}

/** 演示模式：使用内存总资料库（不入最近列表、不写磁盘） */
export function setupDemoGlobalLibrary(): FSAdapter {
  const fs = new MemoryFSAdapter(demoGlobalLibraryFiles())
  cached = { key: DEMO_KEY, fs }
  lsSet('globalLibraryDemo', true)
  return fs
}

export function isDemoGlobalLibrary(): boolean {
  return cached?.key === DEMO_KEY
}

// ---------- meta.json ----------

export async function readMeta(fs: FSAdapter): Promise<LibraryMeta> {
  try {
    const raw = await fs.readFile('meta.json')
    const parsed = JSON.parse(raw) as LibraryMeta
    // 保证预置组存在（旧数据迁移）
    for (const g of emptyMeta().tagGroups) {
      if (!parsed.tagGroups.some((x) => x.id === g.id)) parsed.tagGroups.unshift(g)
    }
    return parsed
  } catch {
    return emptyMeta()
  }
}

export async function writeMeta(fs: FSAdapter, meta: LibraryMeta): Promise<void> {
  await fs.writeFile('meta.json', JSON.stringify(meta, null, 2))
}

// ---------- 文件操作 ----------

/** 列出 files/ 下的文件（平铺） */
export async function listLibraryFiles(fs: FSAdapter): Promise<string[]> {
  try {
    const entries = await fs.listDir('files')
    return entries.filter((e) => e.kind === 'file').map((e) => e.name)
  } catch {
    return []
  }
}

/** 导入文件（同名覆盖）；返回文件名 */
export async function importFile(fs: FSAdapter, name: string, data: Uint8Array): Promise<string> {
  const safe = name.split(/[\\/]/).pop() ?? name
  if (!safe || safe === '.' || safe === '..') throw new Error('文件名不合法')
  await fs.writeBinary(`files/${safe}`, data)
  return safe
}

/** 归档 note：复制到总资料库 files/ 并删除原 note（移动语义），自动打「来源项目·项目名」标签 */
export async function archiveNote(
  notePath: string,
  projectName: string,
): Promise<{ file: string; tagName: string }> {
  const fs = await ensureGlobalLibrary()
  const name = notePath.split('/').pop() ?? notePath
  const { getFS } = await import('./fs')
  const data = await getFS().readBinary(notePath)
  await importFile(fs, name, data)

  // 自动建档：排他组「来源项目」下按项目名建/复用标签
  const meta = await readMeta(fs)
  let group = meta.tagGroups.find((g) => g.id === 'g_source')
  if (!group) {
    group = { id: 'g_source', name: '来源项目', type: 'exclusive', parentGroupId: null, builtin: true }
    meta.tagGroups.push(group)
  }
  let tag = meta.tags.find((t) => t.groupId === group.id && t.name === projectName)
  if (!tag) {
    tag = { id: `t_${Date.now().toString(36)}`, name: projectName, groupId: group.id }
    meta.tags.push(tag)
  }
  let doc = meta.docs.find((d) => d.file === name)
  if (!doc) {
    doc = { id: `d_${Date.now().toString(36)}`, file: name, tagIds: [] }
    meta.docs.push(doc)
  }
  doc.archivedAt = new Date().toISOString().slice(0, 10)
  if (!doc.tagIds.includes(tag.id)) {
    // 排他组：替换同组旧标签
    const siblingIds = new Set(meta.tags.filter((t) => t.groupId === group!.id).map((t) => t.id))
    doc.tagIds = doc.tagIds.filter((id) => !siblingIds.has(id))
    doc.tagIds.push(tag.id)
  }
  await writeMeta(fs, meta)

  // 删除原 note（移动语义）
  await getFS().delete(notePath)
  return { file: name, tagName: projectName }
}

// ---------- 演示种子 ----------

export function demoGlobalLibraryFiles(): Record<string, string> {
  const meta = emptyMeta()
  meta.tags.push(
    { id: 't_scifi', name: '科幻设定', groupId: 'g_default' },
    { id: 't_scene', name: '场景素材', groupId: 'g_default' },
    { id: 't_char', name: '人物素材', groupId: 'g_default' },
    { id: 't_common', name: '常用', groupId: 'g_default' },
    { id: 't_todo', name: '待整理', groupId: 'g_default' },
    { id: 't_xinghai', name: '星海纪元', groupId: 'g_source' },
  )
  meta.docs.push(
    { id: 'd_1', file: '星舰型号设定.md', tagIds: ['t_scifi', 't_common', 't_xinghai'], archivedAt: '2026-10-05' },
    { id: 'd_2', file: '赛博朋克城市影像集.md', tagIds: ['t_scifi', 't_todo'], archivedAt: '2026-10-05' },
    { id: 'd_3', file: '废港地图参考.md', tagIds: ['t_scene', 't_common', 't_xinghai'], archivedAt: '2026-10-06' },
    { id: 'd_4', file: '老周台词集.md', tagIds: ['t_char', 't_common', 't_xinghai'], archivedAt: '2026-10-06' },
    { id: 'd_5', file: '雨夜氛围参考.md', tagIds: ['t_scene', 't_todo'], archivedAt: '2026-10-07' },
  )
  return {
    'meta.json': JSON.stringify(meta, null, 2),
    'files/星舰型号设定.md':
      '「猎犬级」巡逻艇：全长 84 米，双联磁轨炮，信标管理局制式装备。装甲薄弱但跃迁引擎出色，常用于近港缉查。林霁的「锈羽号」正是猎犬级的退役改装型——拆掉了武器挂架，换装了打捞臂与货舱。\n\n「泰坦级」母舰：全长 1,400 米，旧时代舰队旗舰。卷二七号船坞中沉睡的完整星舰即为此型，其信标仍可被铜币钥匙唤醒……\n',
    'files/赛博朋克城市影像集.md': '待整理：霓虹雨夜、高架轻轨、旧式广告牌的城市影像描述集。\n',
    'files/废港地图参考.md':
      '废港平面：栈桥区 → 七号船坞 → 沉船坟场。栈桥尽头有废弃吊机，是第三章追逐戏的主要场景。\n',
    'files/老周台词集.md':
      '「船是死的，海是活的。人夹在中间，得自己会浮。」\n\n「从海上来的人，都有不肯说的过去。我不问，你也别问。」\n',
    'files/雨夜氛围参考.md': '雨夜 = 追踪的天然幕布。雨声盖脚步，雷声盖枪声。\n',
  }
}

export function resetGlobalLibraryCache(): void {
  cached = null
  lsSet('globalLibraryDemo', false)
}
