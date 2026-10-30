import { defineStore } from 'pinia'
import { getFS } from '../core/fs'
import { lsGet, lsSet } from '../core/storage'
import { fingerPrint, packProject, readSyncJson, writeProjectFiles, writeSyncJson, type SyncBinding } from '../core/sync'
import { api, getSyncConfig } from '../services/api'
import { useProjectStore } from './project'
import type { ForkSummary } from '../services/api'

const BINDINGS_KEY = 'sync.bindings'

export interface SyncBindingSummary {
  cloudProjectId: string
  mainProjectId?: string
  status: SyncStatus
  version: number
  updatedAt: number
}

export type SyncStatus =
  | 'unbound'
  | 'synced'
  | 'dirty'
  | 'diverged'
  | 'pulling'
  | 'pushing'
  | 'forked'
  | 'offline'

interface SyncState {
  status: SyncStatus
  cloudProjectId: string | null
  mainProjectId: string | null
  baseVersion: number
  baseMd5: string
  cloudVersion: number
  cloudMd5: string
  cloudUpdatedAt: string
  forks: ForkSummary[]
  currentForkId: string | null
  lastError: string
  busy: boolean
}

const POLL_INTERVAL = 10 * 60 * 1000 // 10 分钟

export const useSyncStore = defineStore('sync', {
  state: (): SyncState => ({
    status: 'unbound',
    cloudProjectId: null,
    mainProjectId: null,
    baseVersion: 0,
    baseMd5: '',
    cloudVersion: 0,
    cloudMd5: '',
    cloudUpdatedAt: '',
    forks: [],
    currentForkId: null,
    lastError: '',
    busy: false,
  }),
  getters: {
    isBound: (s) => !!s.cloudProjectId,
    statusLabel(): string {
      const map: Record<SyncStatus, string> = {
        unbound: '未绑定',
        synced: '已同步',
        dirty: '待同步',
        diverged: '分叉前兆',
        pulling: '拉取中…',
        pushing: '推送中…',
        forked: '已分叉',
        offline: '离线',
      }
      return map[this.status]
    },
  },
  actions: {
    reset() {
      this.status = 'unbound'
      this.cloudProjectId = null
      this.mainProjectId = null
      this.baseVersion = 0
      this.baseMd5 = ''
      this.cloudVersion = 0
      this.cloudMd5 = ''
      this.cloudUpdatedAt = ''
      this.forks = []
      this.currentForkId = null
      this.lastError = ''
      this.busy = false
    },

    async loadBinding() {
      this.reset()
      const fs = getFS()
      const binding = await readSyncJson(fs)
      if (!binding) {
        this.status = 'unbound'
        return
      }
      this.cloudProjectId = binding.cloudProjectId
      this.mainProjectId = binding.mainProjectId ?? null
      this.baseVersion = binding.baseVersion
      this.baseMd5 = binding.baseMd5
      this.currentForkId = binding.mainProjectId ? binding.cloudProjectId : null
      await this.checkState()
      this.persistSummary({
        cloudProjectId: this.cloudProjectId,
        mainProjectId: this.mainProjectId ?? undefined,
        status: this.status,
        version: this.baseVersion,
        updatedAt: Date.now(),
      })
    },

    async saveBinding(patch?: Partial<SyncBinding>) {
      const fs = getFS()
      const cfg = getSyncConfig()
      const binding: SyncBinding = {
        cloudProjectId: this.cloudProjectId ?? '',
        baseVersion: this.baseVersion,
        baseMd5: this.baseMd5,
        deviceKey: cfg.deviceKey,
        mainProjectId: this.mainProjectId ?? undefined,
        ...patch,
      }
      if (!binding.cloudProjectId) {
        await writeSyncJson(fs, null)
        this.persistSummary(null)
        return
      }
      await writeSyncJson(fs, binding)
      this.persistSummary({
        cloudProjectId: binding.cloudProjectId,
        mainProjectId: binding.mainProjectId,
        status: this.status,
        version: this.baseVersion,
        updatedAt: Date.now(),
      })
    },

    persistSummary(summary: SyncBindingSummary | null) {
      const project = useProjectStore()
      const key = project.rootHandle?.name ?? project.projectName ?? '_'
      const map = lsGet<Record<string, SyncBindingSummary>>(BINDINGS_KEY, {})
      if (summary) {
        map[key] = summary
      } else {
        delete map[key]
      }
      lsSet(BINDINGS_KEY, map)
    },

    async bindToCloud(name?: string) {
      if (this.busy) return
      this.busy = true
      this.lastError = ''
      try {
        const project = useProjectStore()
        const cfg = getSyncConfig()
        if (!cfg.token) throw new Error('请先在设置中配置同步令牌')
        if (!cfg.deviceKey) throw new Error('请先在设置中生成设备 Key')
        await api.reportDevice({ deviceKey: cfg.deviceKey, name: cfg.deviceName || '未命名设备' })
        const res = await api.createProject({ name: name || project.projectName || '未命名项目', device: cfg.deviceName })
        this.cloudProjectId = res.id
        this.mainProjectId = null
        this.baseVersion = 0
        this.baseMd5 = ''
        this.currentForkId = null
        await this.saveBinding()
        // push 内部也检查 busy，先释放当前锁再交给它
        this.busy = false
        await this.push()
      } catch (err) {
        this.status = 'offline'
        this.lastError = err instanceof Error ? err.message : String(err)
      } finally {
        this.busy = false
      }
    },

    async unbind() {
      this.stopPolling()
      const fs = getFS()
      await writeSyncJson(fs, null)
      this.persistSummary(null)
      this.reset()
    },

    async computeLocalHash(): Promise<{ md5: string; files: Record<string, string> }> {
      const fs = getFS()
      const files = await packProject(fs)
      return { md5: fingerPrint(files), files }
    },

    async checkState(autoPull = false) {
      if (!this.cloudProjectId || this.busy) return
      this.busy = true
      this.lastError = ''
      try {
        const local = await this.computeLocalHash()
        const state = await api.getState(this.cloudProjectId)
        this.cloudVersion = state.version
        this.cloudMd5 = state.md5
        this.cloudUpdatedAt = state.updatedAt

        if (state.version === this.baseVersion && state.md5 === this.baseMd5) {
          // 云端没动
          if (local.md5 === this.baseMd5) {
            this.status = 'synced'
          } else {
            this.status = 'dirty'
          }
        } else if (state.version > this.baseVersion) {
          // 云端前进
          if (local.md5 === this.baseMd5) {
            if (autoPull) {
              this.busy = false
              await this.pull()
              return
            }
            this.status = 'synced'
          } else {
            this.status = 'diverged'
          }
        } else {
          // 云端版本反而更小：异常，保守当 dirty
          this.status = 'dirty'
        }
      } catch (err) {
        this.status = 'offline'
        this.lastError = err instanceof Error ? err.message : String(err)
      } finally {
        this.busy = false
      }
    },

    async pull() {
      if (!this.cloudProjectId || this.busy) return
      this.busy = true
      this.status = 'pulling'
      this.lastError = ''
      try {
        const res = await api.pull(this.cloudProjectId)
        const fs = getFS()
        await writeProjectFiles(fs, Object.fromEntries(res.files.map((f) => [f.path, f.content])))
        this.baseVersion = res.version
        this.baseMd5 = res.md5
        await this.saveBinding()
        const project = useProjectStore()
        await project.refresh()
        this.status = 'synced'
        this.persistSummary({
          cloudProjectId: this.cloudProjectId,
          mainProjectId: this.mainProjectId ?? undefined,
          status: this.status,
          version: this.baseVersion,
          updatedAt: Date.now(),
        })
      } catch (err) {
        this.status = 'offline'
        this.lastError = err instanceof Error ? err.message : String(err)
      } finally {
        this.busy = false
      }
    },

    async push() {
      if (!this.cloudProjectId || this.busy) return
      this.busy = true
      this.status = 'pushing'
      this.lastError = ''
      try {
        const cfg = getSyncConfig()
        const { md5, files } = await this.computeLocalHash()
        const res = await api.push(this.cloudProjectId, {
          baseVersion: this.baseVersion,
          baseMd5: this.baseMd5,
          device: cfg.deviceName,
          files: Object.entries(files).map(([path, content]) => ({ path, content })),
        })

        if (res.status === 'noop') {
          this.baseVersion = res.version
          this.baseMd5 = res.md5
          this.cloudVersion = res.version
          this.cloudMd5 = res.md5
          this.status = 'synced'
          await this.saveBinding()
        } else if (res.status === 'ok') {
          this.baseVersion = res.version
          this.baseMd5 = res.md5
          this.cloudVersion = res.version
          this.cloudMd5 = res.md5
          this.status = 'synced'
          await this.saveBinding()
        } else if (res.status === 'forked' && res.fork) {
          // 自动跟随分叉继续工作
          this.mainProjectId = this.cloudProjectId
          this.cloudProjectId = res.fork.id
          this.baseVersion = res.fork.version
          this.baseMd5 = md5 // fork 内容即本次推送，指纹就是本地 md5
          this.currentForkId = res.fork.id
          await this.saveBinding()
          this.status = 'forked'
        }
      } catch (err) {
        this.status = 'offline'
        this.lastError = err instanceof Error ? err.message : String(err)
      } finally {
        this.busy = false
      }
    },

    async autoSync() {
      if (!this.cloudProjectId) return
      await this.checkState(true)
    },

    async manualSync() {
      if (!this.cloudProjectId) return
      if (this.status === 'diverged') {
        await this.push()
      } else if (this.status === 'dirty') {
        await this.push()
      } else {
        await this.autoSync()
      }
    },

    async resolveFork(forkId: string, action: 'promote' | 'discard') {
      const mainId = this.mainProjectId ?? this.cloudProjectId
      if (!mainId || this.busy) return
      this.busy = true
      try {
        await api.resolveFork(mainId, { forkId, action })
        if (action === 'promote') {
          // promote 后回到主项目并拉取最新
          this.cloudProjectId = mainId
          this.mainProjectId = null
          this.currentForkId = null
          await this.saveBinding()
          this.busy = false
          await this.pull()
        } else {
          this.busy = false
          await this.checkState()
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
      } finally {
        this.busy = false
      }
    },

    /** 分叉被采用（可能在别的设备/窗口操作）后，把本地工作切回主项目并拉取 */
    async rebindTo(mainId: string) {
      this.cloudProjectId = mainId
      this.mainProjectId = null
      this.currentForkId = null
      await this.saveBinding()
      this.busy = false
      await this.pull()
    },

    /**
     * 从云端打开项目到本地继续工作。
     * mode: 'demo' 演示副本（内存）；'local' 真实文件夹（选父目录 → 建项目文件夹 → 落盘）。
     * 拉取内容 + 写 .sync.json 绑定后进入轮询。
     */
    async openFromCloud(projectId: string, name: string, mode: 'demo' | 'local') {
      if (this.busy) return
      this.busy = true
      this.lastError = ''
      try {
        const cfg = getSyncConfig()
        if (!cfg.token) throw new Error('请先在设置中配置同步令牌')
        await api.reportDevice({ deviceKey: cfg.deviceKey, name: cfg.deviceName || '未命名设备' })
        const res = await api.pull(projectId)
        const files = Object.fromEntries(res.files.map((f) => [f.path, f.content]))
        const project = useProjectStore()
        if (mode === 'demo') {
          await project.openDemoProject(name, files)
        } else {
          const { pickDirectory } = await import('../services/picker')
          const parent = await pickDirectory()
          const dirName = name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) || '云端项目'
          const dir = await parent.getDirectoryHandle(dirName, { create: true })
          const { WebFSAdapter } = await import('../core/fs')
          const fs = new WebFSAdapter(dir)
          await writeProjectFiles(fs, files)
          await project.openWithHandle(dir)
        }
        await writeSyncJson(getFS(), {
          cloudProjectId: projectId,
          baseVersion: res.version,
          baseMd5: res.md5,
          deviceKey: cfg.deviceKey,
        })
        await this.loadBinding()
        this.startPolling()
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        throw err
      } finally {
        this.busy = false
      }
    },

    startPolling() {
      this.stopPolling()
      if (!this.cloudProjectId) return
      void this.autoSync()
      const id = window.setInterval(() => {
        if (!document.hidden) void this.autoSync()
      }, POLL_INTERVAL)
      ;(this as unknown as { _pollId?: number })._pollId = id

      const handler = () => {
        if (!document.hidden && this.cloudProjectId) void this.autoSync()
      }
      ;(this as unknown as { _visHandler?: () => void })._visHandler = handler
      document.addEventListener('visibilitychange', handler)
    },

    stopPolling() {
      const self = this as unknown as { _pollId?: number; _visHandler?: () => void }
      if (self._pollId) {
        clearInterval(self._pollId)
        self._pollId = undefined
      }
      if (self._visHandler) {
        document.removeEventListener('visibilitychange', self._visHandler)
        self._visHandler = undefined
      }
    },

    async markDirty() {
      if (!this.cloudProjectId || this.busy) return
      if (this.status === 'forked' || this.status === 'diverged' || this.status === 'offline') return
      const local = await this.computeLocalHash()
      if (local.md5 !== this.baseMd5) {
        this.status = 'dirty'
      } else {
        this.status = 'synced'
      }
    },
  },
})
