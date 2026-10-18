/** 生成完成通知：用户切后台后回来时可见结果。权限未授予时静默跳过。 */

export async function ensureNotifyPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function notifyDone(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, silent: true })
  } catch {
    /* 某些环境（如无窗 Worker 上下文）不支持，忽略 */
  }
}
