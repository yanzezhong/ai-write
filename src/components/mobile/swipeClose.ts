import type { Directive } from 'vue'

/**
 * 下滑手势关闭（PRD §5.1）：在底部弹层/抽屉上向下滑动超过 80px 且以纵向为主时触发关闭。
 * 用法：v-swipe-close="closeHandler"
 */
export const vSwipeClose: Directive<HTMLElement, () => void> = {
  mounted(el, binding) {
    let startY = 0
    let startX = 0
    let active = false
    el.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0]
        startY = t.clientY
        startX = t.clientX
        active = true
      },
      { passive: true },
    )
    el.addEventListener(
      'touchend',
      (e) => {
        if (!active) return
        active = false
        const t = e.changedTouches[0]
        const dy = t.clientY - startY
        const dx = t.clientX - startX
        if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) binding.value?.()
      },
      { passive: true },
    )
  },
}
