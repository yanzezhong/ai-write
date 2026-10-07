import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Buffer } from 'buffer'
import App from './App.vue'
import { router } from './router'
import './styles/base.css'

// isomorphic-git 在浏览器里需要 Buffer 全局对象
if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  ;(globalThis as { Buffer?: unknown }).Buffer = Buffer
}

createApp(App).use(createPinia()).use(router).mount('#app')
