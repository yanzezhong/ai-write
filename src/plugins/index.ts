import type { AppPlugin } from '../core/pluginRegistry'

/**
 * 侧边栏应用清单（第一版）。每种应用全局单例，由 layout store 决定挂在左/右栏。
 * 组件按需加载；应用之间不互相 import，协作走 ServiceRegistry。
 */
export const APP_PLUGINS: AppPlugin[] = [
  {
    id: 'files',
    name: '本地文件',
    icon: 'folder',
    component: () => import('../apps/FilesApp.vue'),
  },
  {
    id: 'docs',
    name: '文档',
    icon: 'doc',
    component: () => import('../apps/DocsApp.vue'),
  },
  {
    id: 'git',
    name: '版本管理',
    icon: 'history',
    provides: ['git'],
    component: () => import('../apps/GitApp.vue'),
  },
  {
    id: 'library',
    name: '资料库',
    icon: 'layers',
    component: () => import('../apps/LibraryApp.vue'),
  },
  {
    id: 'notes',
    name: '笔记',
    icon: 'edit',
    component: () => import('../apps/NotesApp.vue'),
  },
  {
    id: 'outline',
    name: '剧情大纲',
    icon: 'outline',
    component: () => import('../apps/OutlineApp.vue'),
  },
  {
    id: 'characters',
    name: '人物库',
    icon: 'characters',
    component: () => import('../apps/CharactersApp.vue'),
  },
  {
    id: 'worldview',
    name: '世界观',
    icon: 'world',
    component: () => import('../apps/WorldviewApp.vue'),
  },
  {
    id: 'chat',
    name: 'AI 聊天',
    icon: 'sparkles',
    provides: ['ai.chat'],
    inject: ['editor'],
    component: () => import('../apps/ChatApp.vue'),
  },
  {
    id: 'browser',
    name: '浏览器',
    icon: 'globe',
    component: () => import('../apps/BrowserApp.vue'),
  },
]

export function getPlugin(id: string): AppPlugin | undefined {
  return APP_PLUGINS.find((p) => p.id === id)
}
