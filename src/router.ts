import { createRouter, createWebHashHistory } from 'vue-router'
import { isMobileEnv } from './core/mobileFS'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 手机端（无 File System Access、支持 OPFS）使用移动端首页
    {
      path: '/',
      name: 'home',
      component: isMobileEnv()
        ? () => import('./views/MobileHomeView.vue')
        : () => import('./views/HomeView.vue'),
    },
    { path: '/workspace', name: 'workspace', component: isMobileEnv()
        ? () => import('./views/MobileWorkspaceView.vue')
        : () => import('./views/WorkspaceView.vue') },
    { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue') },
    { path: '/imitate', name: 'imitate', component: () => import('./views/ImitateView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
  ],
})
