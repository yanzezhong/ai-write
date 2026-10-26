import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// LAN HTTPS 证书：由 tools/mkcert.exe 生成（mkcert -install 写入系统证书库在本机被安全软件拦截会挂死，
// 所以改为手动生成 leaf 证书 + 各设备手动信任 rootCA.pem，见 tools/README）。
// 证书缺失时用 tools/mkcert.exe 重新生成：
//   CAROOT=%USERPROFILE%\.vite-plugin-mkcert tools\mkcert.exe -key-file ... -cert-file ... localhost 127.0.0.1 ::1 <局域网IP>
const certDir = join(homedir(), '.vite-plugin-mkcert')

// 新机器 / 未生成证书时自动退回 HTTP，不阻塞启动
function lanHttps() {
  const key = join(certDir, 'dev.pem')
  const cert = join(certDir, 'cert.pem')
  if (existsSync(key) && existsSync(cert)) {
    return { key: readFileSync(key), cert: readFileSync(cert) }
  }
  console.warn('[vite] 未找到 LAN HTTPS 证书（~/.vite-plugin-mkcert/dev.pem），本次以 HTTP 启动')
  return undefined
}

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    https: lanHttps(),
    proxy: {
      // 手机端浏览器直连第三方 API 容易出现网络层错误（iOS WebKit 表现为红字 "Load failed"）。
      // 开发服务器把这些已知供应商转成同源代理，手机只跟 dev server 通信，绕过跨域/证书/拦截问题。
      '/__ds': { target: 'https://api.deepseek.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/__ds/, '') },
      '/__oa': { target: 'https://api.openai.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/__oa/, '') },
      '/__glm': { target: 'https://open.bigmodel.cn', changeOrigin: true, rewrite: (p) => p.replace(/^\/__glm/, '') },
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
