import MarkdownIt from 'markdown-it'

/** 共享的 Markdown 渲染器：代码块带一键复制按钮 */
function createMd(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight(code: string): string {
      const escaped = md.utils.escapeHtml(code)
      const encoded = encodeURIComponent(code)
      return `<div class="code-block"><button class="code-copy" data-code="${encoded}">复制</button><pre><code>${escaped}</code></pre></div>`
    },
  })
}

const md = createMd()

export function renderMd(content: string): string {
  return md.render(content || ' ')
}

/** 事件委托：点击渲染结果里的 .code-copy 时复制代码（绑在容器上） */
export function handleMdClick(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest('.code-copy') as HTMLElement | null
  if (!btn) return
  const code = decodeURIComponent(btn.dataset.code ?? '')
  void navigator.clipboard.writeText(code).catch(() => {})
  btn.textContent = '已复制'
  setTimeout(() => (btn.textContent = '复制'), 1200)
}
