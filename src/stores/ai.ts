import { defineStore } from 'pinia'
import type { AIProviderConfig, ChatMessage, ChatSession } from '../types'
import { idbDelete, idbGetAll, idbSet, lsGet, lsSet } from '../core/storage'
import { useProjectStore } from './project'

export const BUILTIN_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    builtin: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    builtin: true,
  },
]

export function loadProviders(): AIProviderConfig[] {
  const saved = lsGet<AIProviderConfig[]>('aiProviders', [])
  if (!saved.length) return BUILTIN_PROVIDERS.map((p) => ({ ...p }))
  // 保证内置供应商字段跟随版本更新；用户改过的 baseUrl / apiKey / model 保留
  return saved.map((p) => {
    const builtin = BUILTIN_PROVIDERS.find((b) => b.id === p.id)
    if (!builtin) return p
    return {
      ...builtin,
      baseUrl: p.baseUrl || builtin.baseUrl,
      apiKey: p.apiKey,
      model: p.model || builtin.model,
      models: p.models?.length ? p.models : builtin.models,
    }
  })
}

interface AIState {
  providers: AIProviderConfig[]
  activeProviderId: string
  sessions: ChatSession[]
  currentSessionId: string | null
  generating: boolean
  /** 聊天时手动勾选的上下文 */
  ctx: {
    currentDoc: boolean
    outline: boolean
    characters: boolean
    extraDocs: string[]
    /** 当前打开的资料（资料展示窗格） */
    libraryDocs: boolean
  }
}

export const useAIStore = defineStore('ai', {
  state: (): AIState => ({
    providers: loadProviders(),
    activeProviderId: lsGet<string>('aiActiveProvider', 'deepseek'),
    sessions: [],
    currentSessionId: null,
    generating: false,
    ctx: { currentDoc: true, outline: false, characters: false, extraDocs: [] as string[], libraryDocs: false },
  }),
  getters: {
    activeProvider: (s): AIProviderConfig | null =>
      s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0] ?? null,
    currentSession: (s): ChatSession | null =>
      s.sessions.find((x) => x.id === s.currentSessionId) ?? null,
  },
  actions: {
    persistProviders() {
      lsSet('aiProviders', this.providers)
      lsSet('aiActiveProvider', this.activeProviderId)
    },
    setActiveProvider(id: string) {
      this.activeProviderId = id
      this.persistProviders()
    },
    updateProvider(config: AIProviderConfig) {
      const i = this.providers.findIndex((p) => p.id === config.id)
      if (i >= 0) this.providers[i] = config
      else this.providers.push(config)
      this.persistProviders()
    },
    removeProvider(id: string) {
      this.providers = this.providers.filter((p) => p.id !== id || p.builtin)
      if (this.activeProviderId === id) this.activeProviderId = this.providers[0]?.id ?? ''
      this.persistProviders()
    },

    async loadSessions() {
      this.sessions = (await idbGetAll<ChatSession>('chat')).sort((a, b) => b.updatedAt - a.updatedAt)
      if (!this.currentSessionId && this.sessions.length) this.currentSessionId = this.sessions[0].id
    },
    newSession(): ChatSession {
      const provider = this.activeProvider
      const projectName = useProjectStore().isOpen ? useProjectStore().projectName : ''
      const s: ChatSession = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        title: '新会话',
        providerId: provider?.id ?? '',
        model: provider?.model ?? '',
        projectName,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      this.sessions.unshift(s)
      this.currentSessionId = s.id
      this.saveSession(s)
      return s
    },
    switchSession(id: string) {
      this.currentSessionId = id
    },
    async deleteSession(id: string) {
      this.sessions = this.sessions.filter((s) => s.id !== id)
      if (this.currentSessionId === id) this.currentSessionId = this.sessions[0]?.id ?? null
      await idbDelete('chat', id)
    },
    saveSession(s: ChatSession) {
      s.updatedAt = Date.now()
      void idbSet('chat', s.id, JSON.parse(JSON.stringify(s)))
    },
    addMessage(s: ChatSession, msg: ChatMessage) {
      s.messages.push(msg)
      if (msg.role === 'user' && s.title === '新会话') {
        s.title = msg.content.slice(0, 20) || '新会话'
      }
      this.saveSession(s)
    },
    updateLastMessage(s: ChatSession, patch: Partial<ChatMessage>) {
      const last = s.messages[s.messages.length - 1]
      if (last) Object.assign(last, patch)
      this.saveSession(s)
    },
  },
})

// ---------- OpenAI 兼容协议流式调用 ----------

export interface ChatOptions {
  messages: ChatMessage[]
  signal?: AbortSignal
  onDelta: (fullText: string, delta: string) => void
}

/**
 * 开发模式下把已知供应商的 baseUrl 改写成 dev server 的同源代理（见 vite.config.ts proxy）。
 * 手机浏览器直连第三方 API 可能被网络层拦截（iOS WebKit 报 "Load failed"），同源代理可绕开。
 */
export function resolveBaseUrl(baseUrl: string): string {
  if (import.meta.env.DEV) {
    if (baseUrl.startsWith('https://api.deepseek.com')) return baseUrl.replace('https://api.deepseek.com', '/__ds')
    if (baseUrl.startsWith('https://api.openai.com')) return baseUrl.replace('https://api.openai.com', '/__oa')
    if (baseUrl.startsWith('https://open.bigmodel.cn')) return baseUrl.replace('https://open.bigmodel.cn', '/__glm')
  }
  return baseUrl
}

/** 把 fetch 抛出的网络层原生错误（"Failed to fetch" / "Load failed"）包装成可读的中文错误 */
async function postChat(provider: AIProviderConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${resolveBaseUrl(provider.baseUrl).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `无法连接 API 服务器（${detail}）。如果用手机访问，请确认电脑上的 dev server 正在运行，或改用自定义供应商的同源代理地址。`,
    )
  }
  return res
}

export async function streamChat(provider: AIProviderConfig, opts: ChatOptions): Promise<string> {
  const res = await postChat(
    provider,
    {
      model: provider.model,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    },
    opts.signal,
  )
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败（${res.status}）：${text.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta: string = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          opts.onDelta(full, delta)
        }
      } catch {
        /* 忽略不完整 chunk */
      }
    }
  }
  return full
}

/** 测试连接：发一个最小请求，返回延迟 ms；失败抛错 */
export async function testConnection(provider: AIProviderConfig): Promise<number> {
  const started = Date.now()
  const res = await postChat(provider, {
    model: provider.model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`连接失败（${res.status}）：${text.slice(0, 200)}`)
  }
  return Date.now() - started
}
