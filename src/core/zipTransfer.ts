import JSZip from 'jszip'
import type { FSAdapter } from './fs'
import { createMobileProject, openMobileProject, type MobileProjectMeta } from './mobileFS'

/**
 * 项目 zip 导入/导出（TODO V4-0.3，PRD §2.1/§六）。
 *
 * 导出：把任意 FSAdapter 指向的项目目录整体打包下载（.zip）。
 * 导入：解压缩上传的 zip，写入 OPFS 成为一个新的手机端项目。
 * 这是手机端与桌面端交换数据的第一版方式（WebDAV 留待后续）。
 */

/** 递归把目录内容写入 zip */
async function addDirToZip(zip: JSZip, fs: FSAdapter, dir: string): Promise<void> {
  const entries = await fs.listDir(dir)
  for (const e of entries) {
    if (e.kind === 'dir') {
      // JSZip 会在添加文件时自动创建父目录，目录本身无需显式写入
      await addDirToZip(zip, fs, e.path)
    } else {
      const isBinary = /\.(png|jpe?g|gif|webp|pdf|zip|docx?|xlsx?)$/i.test(e.name)
      if (isBinary) {
        zip.file(e.path, await fs.readBinary(e.path))
      } else {
        zip.file(e.path, await fs.readFile(e.path))
      }
    }
  }
}

/** 导出项目为 zip，触发浏览器下载。返回生成的文件名。 */
export async function exportProjectZip(fs: FSAdapter, projectName: string): Promise<string> {
  const zip = new JSZip()
  await addDirToZip(zip, fs, '')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const fileName = `${projectName.replace(/[\\/:*?"<>|]/g, '_')}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return fileName
}

/** 解压 zip 文件为 路径 → 文本/二进制 映射（目录项忽略） */
async function unzipToMap(file: File | Blob): Promise<Map<string, string | Uint8Array>> {
  const zip = await JSZip.loadAsync(file)
  const out = new Map<string, string | Uint8Array>()
  const tasks: Promise<void>[] = []
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    // 去掉可能存在的顶层包裹目录（如 zip 直接把项目文件夹作为根）
    const path = relativePath.replace(/^[^/]+\//, '')
    if (!path) return
    tasks.push(
      (async () => {
        if (/\.(png|jpe?g|gif|webp|pdf|zip|docx?|xlsx?)$/i.test(path)) {
          out.set(path, await entry.async('uint8array'))
        } else {
          out.set(path, await entry.async('string'))
        }
      })(),
    )
  })
  await Promise.all(tasks)
  return out
}

/** 从 zip 导入项目到 OPFS。返回新项目的元信息。 */
export async function importProjectZip(file: File | Blob, fallbackName = '导入项目'): Promise<MobileProjectMeta> {  const files = await unzipToMap(file)
  if (!files.size) throw new Error('zip 中没有可导入的文件')

  // 项目名：优先 project.json 里的 name，其次 zip 文件名
  let name = fallbackName
  const pj = files.get('project.json')
  if (typeof pj === 'string') {
    try {
      const parsed = JSON.parse(pj) as { name?: string }
      if (parsed.name) name = parsed.name
    } catch {
      /* 忽略解析失败 */
    }
  }

  const { meta } = await createMobileProject(name)
  const fs = await openMobileProject(meta.id)
  if (!fs) throw new Error('导入失败：无法打开新建的项目目录')
  for (const [path, content] of files) {
    if (typeof content === 'string') {
      await fs.writeFile(path, content)
    } else {
      await fs.writeBinary(path, content)
    }
  }
  return meta
}

/* ---------- 全量备份（首页常驻入口，PRD §2.3 风险对策） ---------- */

const BACKUP_TIME_KEY = 'mobileLastBackupAt'

export function getLastBackupAt(): number | null {
  const raw = localStorage.getItem(BACKUP_TIME_KEY)
  return raw ? Number(raw) : null
}

/** 把 OPFS 内全部项目打包成一个 zip 下载，并记录备份时间。返回文件名。 */
export async function exportAllProjectsZip(): Promise<string> {
  const { listMobileProjects, openMobileProject } = await import('./mobileFS')
  const metas = listMobileProjects()
  if (!metas.length) throw new Error('还没有项目，无需备份')
  const zip = new JSZip()
  for (const meta of metas) {
    const fs = await openMobileProject(meta.id)
    if (!fs) continue
    const folder = zip.folder(`${meta.name.replace(/[\\/:*?"<>|]/g, '_')}-${meta.id}`)!
    const entries = await fs.listDir('')
    for (const e of entries) {
      if (e.kind === 'file') {
        if (/\.(png|jpe?g|gif|webp|pdf|zip|docx?|xlsx?)$/i.test(e.name)) {
          folder.file(e.name, await fs.readBinary(e.path))
        } else {
          folder.file(e.name, await fs.readFile(e.path))
        }
      }
    }
    // 二级目录（chapters/notes/characters/worldview 等）
    for (const e of entries) {
      if (e.kind !== 'dir') continue
      const sub = folder.folder(e.name)!
      for (const f of await fs.listDir(e.path)) {
        if (f.kind !== 'file') continue
        if (/\.(png|jpe?g|gif|webp|pdf|zip|docx?|xlsx?)$/i.test(f.name)) {
          sub.file(f.name, await fs.readBinary(f.path))
        } else {
          sub.file(f.name, await fs.readFile(f.path))
        }
      }
    }
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const fileName = `ai-write-backup-${new Date().toISOString().slice(0, 10)}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  localStorage.setItem(BACKUP_TIME_KEY, String(Date.now()))
  return fileName
}
