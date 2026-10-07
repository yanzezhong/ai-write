import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // 编辑器与 git 依赖体积大，拆成独立 chunk：主包更小、按需加载、改动业务代码时缓存友好
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@milkdown') || id.includes('prosemirror') || id.includes('remark')) return 'editor-wysiwyg'
          if (id.includes('@codemirror')) return 'editor-source'
          if (id.includes('isomorphic-git') || id.includes('pako') || id.includes('/buffer/')) return 'git'
        },
      },
    },
  },
})
