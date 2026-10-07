import type { Component } from 'vue'

/**
 * 插件定义。应用之间不直接 import，一切协作走 ServiceRegistry。
 * 迁移 deepseek-harness 时，provides/inject 对应 Provider / Consumer 模型。
 */
export interface AppPlugin {
  id: string
  name: string
  /** 侧边栏图标（svg 路径名，见 components/icons.ts） */
  icon: string
  provides?: string[]
  inject?: string[]
  /** 同步组件或异步加载器（() => import('...vue')) */
  component: Component | (() => Promise<Component>)
}

/** 服务注册表：插件 provides 的服务挂在这里，其他插件 inject 后通过 registry.get 调用 */
export class ServiceRegistry {
  private services = new Map<string, unknown>()

  register<T>(name: string, service: T): void {
    this.services.set(name, service)
  }

  unregister(name: string): void {
    this.services.delete(name)
  }

  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  has(name: string): boolean {
    this.services.has(name)
    return this.services.has(name)
  }
}

export const registry = new ServiceRegistry()
