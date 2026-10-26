import { lsGet } from '../core/storage'

export interface ApiError {
  status: number
  message: string
}

export interface CreateProjectReq {
  name: string
  device: string
}

export interface CreatedResp {
  id: string
  version: number
}

export interface ForkSummary {
  id: string
  name: string
  version: number
  forkBaseVersion: number
  sourceDevice: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  name: string
  version: number
  md5: string
  fileCount: number
  totalBytes: number
  sourceDevice: string
  updatedAt: string
  forks: ForkSummary[]
}

export interface ProjectsResp {
  projects: ProjectSummary[]
}

export interface StateResp {
  version: number
  md5: string
  updatedAt: string
  forks: number
}

export interface FilePayload {
  path: string
  content: string
}

export interface PullResp {
  version: number
  md5: string
  files: FilePayload[]
}

export interface PushReq {
  baseVersion: number
  baseMd5: string
  device: string
  files: FilePayload[]
}

export interface PushResp {
  status: 'ok' | 'noop' | 'forked'
  version: number
  md5: string
  fork?: ForkSummary
  main?: ProjectSummary
}

export interface ResolveReq {
  forkId: string
  action: 'promote' | 'discard'
}

export interface ResolveResp {
  version: number
  md5: string
}

export interface DeviceReq {
  deviceKey: string
  name: string
}

interface SyncConfig {
  serverUrl: string
  token: string
  deviceKey: string
  deviceName: string
}

export function getSyncConfig(): SyncConfig {
  return {
    serverUrl: lsGet<string>('sync.serverUrl', 'http://localhost:8787'),
    token: lsGet<string>('sync.token', ''),
    deviceKey: lsGet<string>('sync.deviceKey', ''),
    deviceName: lsGet<string>('sync.deviceName', ''),
  }
}

function baseUrl(): string {
  const url = getSyncConfig().serverUrl.replace(/\/$/, '')
  return url || 'http://localhost:8787'
}

function headers(): Record<string, string> {
  const cfg = getSyncConfig()
  return {
    'Content-Type': 'application/json',
    ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: headers(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'message' in data ? String((data as { message?: unknown }).message) : text) || `${method} ${path} failed`
    throw { status: res.status, message: msg } as ApiError
  }
  return (data ?? {}) as T
}

export const api = {
  health: () => request<{ ok: boolean; name: string; time: string }>('GET', '/api/health'),
  me: () => request<{ user: string; note: string }>('GET', '/api/me'),

  listProjects: () => request<ProjectsResp>('GET', '/api/projects'),
  createProject: (req: CreateProjectReq) => request<CreatedResp>('POST', '/api/projects', req),
  deleteProject: (id: string) => request<{ ok: boolean }>('DELETE', `/api/projects/${id}`),

  getState: (id: string) => request<StateResp>('GET', `/api/projects/${id}/state`),
  pull: (id: string) => request<PullResp>('POST', `/api/projects/${id}/pull`, {}),
  push: (id: string, req: PushReq) => request<PushResp>('POST', `/api/projects/${id}/push`, req),
  resolveFork: (id: string, req: ResolveReq) => request<ResolveResp>('POST', `/api/projects/${id}/resolve`, req),

  reportDevice: (req: DeviceReq) => request<{ ok: boolean }>('POST', '/api/devices', req),
}
