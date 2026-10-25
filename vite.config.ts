import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// LAN HTTPS 证书：由 tools/mkcert.exe 生成（mkcert -install 写入系统证书库在本机被安全软件拦截会挂死，
// 所以改为手动生成 leaf 证书 + 各设备手动信任 rootCA.pem，见 tools/README）。
// 证书缺失时用 tools/mkcert.exe 重新生成：
//   CAROOT=%USERPROFILE%\.vite-plugin-mkcert tools\mkcert.exe -key-file ... -cert-file ... localhost 127.0.0.1 ::1 <局域网IP>
const certDir = join(homedir(), '.vite-plugin-mkcert')

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    https: {
      key: readFileSync(join(certDir, 'dev.pem')),
      cert: readFileSync(join(certDir, 'cert.pem')),
    },
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
