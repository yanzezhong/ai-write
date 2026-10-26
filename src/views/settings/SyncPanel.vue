<template>
  <div class="panel">
    <h1 class="page-title">云同步</h1>
    <p class="page-note">
      <AppIcon name="cloud" :size="14" />
      多端同步基于自托管后端；令牌与地址仅保存在浏览器本地。
    </p>

    <div class="config-card">
      <div class="field">
        <label>服务端地址</label>
        <input v-model="draft.serverUrl" class="input" placeholder="http://localhost:8787" />
      </div>

      <div class="field">
        <label>访问令牌</label>
        <div class="input-with-action">
          <input v-model="draft.token" class="input" :type="showToken ? 'text' : 'password'" placeholder="aiwrite-dev-token" />
          <button class="mini-btn" @click="showToken = !showToken">{{ showToken ? '隐藏' : '显示' }}</button>
        </div>
      </div>

      <div class="field">
        <label>设备名</label>
        <input v-model="draft.deviceName" class="input" placeholder="MacBook" />
      </div>

      <div class="field">
        <label>设备 Key</label>
        <div class="device-key">
          <code>{{ draft.deviceKey || '未生成' }}</code>
          <button class="mini-btn" @click="regenKey">重新生成</button>
        </div>
        <p class="field-hint">设备 Key 用于分叉命名；修改后请重新绑定项目。</p>
      </div>

      <div class="config-foot">
        <span v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'fail'">
          {{ testResult.ok ? `✓ 连接正常 · ${testResult.latency}ms` : testResult.error }}
        </span>
        <span v-else></span>
        <div class="btns">
          <button class="btn" :disabled="testing" @click="runTest">{{ testing ? '测试中…' : '测试连接' }}</button>
          <button class="btn primary" :disabled="savedFlash" @click="save">{{ savedFlash ? '已保存 ✓' : '保存配置' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { api } from '../../services/api'
import { usePrefsStore } from '../../stores/prefs'

const prefs = usePrefsStore()

const draft = ref({
  serverUrl: prefs.syncServerUrl,
  token: prefs.syncToken,
  deviceName: prefs.syncDeviceName,
  deviceKey: prefs.syncDeviceKey || makeDeviceKey(),
})
const showToken = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; latency: number; error: string } | null>(null)
const savedFlash = ref(false)

function makeDeviceKey(): string {
  const arr = new Uint8Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

function regenKey() {
  draft.value.deviceKey = makeDeviceKey()
}

async function runTest() {
  testing.value = true
  testResult.value = null
  const start = Date.now()
  try {
    // 临时写进 storage，让 api 使用当前草稿地址/令牌
    prefs.update({
      syncServerUrl: draft.value.serverUrl,
      syncToken: draft.value.token,
      syncDeviceName: draft.value.deviceName,
      syncDeviceKey: draft.value.deviceKey,
    })
    await api.me()
    testResult.value = { ok: true, latency: Date.now() - start, error: '' }
  } catch (e) {
    testResult.value = { ok: false, latency: 0, error: (e as Error).message.slice(0, 120) }
  } finally {
    testing.value = false
  }
}

function save() {
  prefs.update({
    syncServerUrl: draft.value.serverUrl,
    syncToken: draft.value.token,
    syncDeviceName: draft.value.deviceName,
    syncDeviceKey: draft.value.deviceKey,
  })
  savedFlash.value = true
  setTimeout(() => (savedFlash.value = false), 1500)
}
</script>

<style scoped>
.panel {
  max-width: 680px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 10px;
}
.page-note {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 13px;
  margin-bottom: 24px;
}
.config-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.field {
  margin-bottom: 18px;
}
.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.field-hint {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
}
.input {
  width: 100%;
}
.input-with-action {
  display: flex;
  gap: 8px;
}
.input-with-action .input {
  flex: 1;
}
.mini-btn {
  flex: none;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 12px;
  border: 1px solid var(--border);
}
.mini-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.device-key {
  display: flex;
  align-items: center;
  gap: 8px;
}
.device-key code {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 10px;
  background: var(--panel-2);
  border-radius: var(--radius);
  color: var(--text-2);
}
.config-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.btns {
  display: flex;
  gap: 8px;
}
.test-result {
  font-size: 13px;
}
.test-result.ok {
  color: var(--green);
}
.test-result.fail {
  color: var(--accent);
}

@media (max-width: 767.98px) {
  .config-card {
    padding: 16px;
  }
  .config-foot {
    flex-direction: column;
    align-items: stretch;
  }
  .btns {
    width: 100%;
  }
  .btns .btn {
    flex: 1;
    min-height: 44px;
  }
  .input {
    min-height: 44px;
    font-size: 16px;
  }
}
</style>
