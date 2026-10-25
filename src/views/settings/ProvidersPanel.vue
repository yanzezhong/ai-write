<template>
  <div class="providers-panel">
    <h1 class="page-title">AI 供应商</h1>
    <p class="page-note">
      <AppIcon name="lock" :size="14" />
      所有供应商均走 OpenAI 兼容协议。API Key 仅保存在浏览器 localStorage，不会上传到任何服务器。
    </p>

    <!-- 供应商卡片行 -->
    <div class="provider-cards">
      <div
        v-for="p in store.providers"
        :key="p.id"
        class="provider-card"
        :class="{ active: p.id === store.activeProviderId, selected: p.id === editingId }"
        @click="selectProvider(p.id)"
      >
        <span v-if="p.id === store.activeProviderId" class="current-badge">当前使用</span>
        <div class="provider-name">{{ p.name || '未命名供应商' }}</div>
        <div class="provider-host">{{ hostOf(p.baseUrl) }}</div>
        <button
          v-if="p.id === editingId && !p.builtin"
          class="delete-btn"
          @click.stop="store.removeProvider(p.id)"
        >
          <AppIcon name="trash" :size="13" />
          删除
        </button>
      </div>

      <button class="provider-card add-card" @click="addCustom">
        <AppIcon name="plus" :size="18" />
        <span>自定义供应商</span>
      </button>
    </div>

    <!-- 配置面板 -->
    <div v-if="draft" class="config-card">
      <div class="config-head">
        <input
          v-model="draft.name"
          class="name-input"
          placeholder="供应商名称"
          @blur="draft.name = draft.name.trim() || '未命名供应商'"
        />
        <div class="head-right">
          <span v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'fail'">
            {{ testResult.ok ? `✓ 连接正常 · 延迟 ${testResult.latency}ms` : testResult.error }}
          </span>
          <button class="btn" :disabled="testing" @click="runTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
        </div>
      </div>

      <div class="field">
        <label>API Key</label>
        <div class="input-with-action">
          <input v-model="draft.apiKey" class="input" :type="showKey ? 'text' : 'password'" placeholder="sk-..." />
          <button class="mini-btn" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
      </div>

      <div class="field">
        <label>Base URL</label>
        <div class="input-with-action">
          <input v-model="draft.baseUrl" class="input" placeholder="https://api.example.com/v1" />
          <button v-if="draft.builtin" class="mini-btn" @click="restoreDefault">恢复默认</button>
        </div>
      </div>

      <div class="field">
        <label>
          模型
          <span class="hint">下拉选择，或手动输入模型名</span>
        </label>
        <div class="model-select">
          <button class="model-trigger" @click="modelOpen = !modelOpen">
            <span>{{ draft.model || '请选择模型' }}</span>
            <AppIcon name="chevron-down" :size="15" />
          </button>
          <div v-if="modelOpen" class="model-dropdown">
            <button
              v-for="m in draft.models"
              :key="m"
              class="model-option"
              :class="{ active: m === draft.model }"
              @click="chooseModel(m)"
            >
              <span>{{ m }}</span>
              <AppIcon v-if="m === draft.model" name="check" :size="15" />
            </button>
            <div v-if="addingModel" class="model-add">
              <input
                ref="modelInputRef"
                v-model="newModel"
                class="input"
                placeholder="输入模型名，回车确认"
                @keyup.enter="commitModel"
                @keyup.esc="cancelAddModel"
                @blur="cancelAddModel"
              />
            </div>
            <button v-else class="model-option add" @click="startAddModel">
              <AppIcon name="plus" :size="14" />
              <span>手动输入模型名…</span>
            </button>
          </div>
        </div>
      </div>

      <div class="config-foot">
        <p class="foot-note">切换供应商 / 模型即时生效；AI 会话记录存于浏览器 IndexedDB。</p>
        <button class="btn primary" :disabled="savedFlash" @click="save">
          {{ savedFlash ? '已保存 ✓' : '保存配置' }}
        </button>
      </div>
    </div>

    <div v-else class="config-card empty">请选择或新建一个供应商</div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { useAIStore, BUILTIN_PROVIDERS, testConnection } from '../../stores/ai'
import type { AIProviderConfig } from '../../types'

const store = useAIStore()

const editingId = ref('')
const draft = ref<AIProviderConfig | null>(null)
const showKey = ref(false)
const modelOpen = ref(false)
const addingModel = ref(false)
const newModel = ref('')
const modelInputRef = ref<HTMLInputElement | null>(null)
const testing = ref(false)
const testResult = ref<{ ok: boolean; latency: number; error: string } | null>(null)
const savedFlash = ref(false)

watch(
  () => store.activeProviderId,
  (id) => {
    editingId.value = id
    const p = store.providers.find((x) => x.id === id)
    draft.value = p ? JSON.parse(JSON.stringify(p)) as AIProviderConfig : null
    testResult.value = null
    modelOpen.value = false
  },
  { immediate: true },
)

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '') || '—'
}

function selectProvider(id: string) {
  store.setActiveProvider(id)
}

function addCustom() {
  const id = `custom-${Date.now()}`
  store.updateProvider({
    id,
    name: '',
    baseUrl: 'https://',
    apiKey: '',
    model: '',
    models: [],
  })
  store.setActiveProvider(id)
}

function chooseModel(m: string) {
  if (draft.value) draft.value.model = m
  modelOpen.value = false
}

function startAddModel() {
  addingModel.value = true
  newModel.value = ''
  void nextTick(() => modelInputRef.value?.focus())
}

function commitModel() {
  const name = newModel.value.trim()
  if (name && draft.value) {
    if (!draft.value.models.includes(name)) draft.value.models.push(name)
    draft.value.model = name
  }
  addingModel.value = false
  modelOpen.value = false
}

function cancelAddModel() {
  addingModel.value = false
}

function restoreDefault() {
  const builtin = BUILTIN_PROVIDERS.find((b) => b.id === draft.value?.id)
  if (builtin && draft.value) draft.value.baseUrl = builtin.baseUrl
}

async function runTest() {
  if (!draft.value || testing.value) return
  testing.value = true
  testResult.value = null
  try {
    const latency = await testConnection(draft.value)
    testResult.value = { ok: true, latency, error: '' }
  } catch (e) {
    testResult.value = { ok: false, latency: 0, error: (e as Error).message.slice(0, 100) }
  } finally {
    testing.value = false
  }
}

function save() {
  if (!draft.value) return
  store.updateProvider(JSON.parse(JSON.stringify(draft.value)) as AIProviderConfig)
  store.persistProviders()
  savedFlash.value = true
  setTimeout(() => (savedFlash.value = false), 1500)
}
</script>

<style scoped>
.providers-panel {
  max-width: 760px;
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

.provider-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.provider-card {
  position: relative;
  width: 200px;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s;
}

.provider-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}

.provider-card.active {
  border: 1.5px solid var(--accent);
  padding: 15.5px;
}

.current-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
}

.provider-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  padding-right: 64px;
}

.provider-host {
  color: var(--text-3);
  font-size: 12px;
  word-break: break-all;
}

.delete-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 12px;
  transition: all 0.15s;
}

.delete-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 200px;
  border: 1.5px dashed var(--border-strong);
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
}

.add-card:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: none;
}

.config-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
}

.config-card.empty {
  color: var(--text-3);
  text-align: center;
}

.config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.name-input {
  flex: 1;
  min-width: 200px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px 10px;
  margin-left: -10px;
  font-size: 20px;
  font-weight: 600;
  background: transparent;
  outline: none;
  transition: all 0.15s;
}

.name-input:hover {
  border-color: var(--border);
}

.name-input:focus {
  border-color: var(--accent);
  background: var(--panel-2);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.test-result {
  font-size: 13px;
  max-width: 320px;
}

.test-result.ok {
  color: var(--green);
}

.test-result.fail {
  color: var(--accent);
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

.field .hint {
  font-weight: 400;
  color: var(--text-3);
  font-size: 13px;
  margin-left: 8px;
}

.input-with-action {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mini-btn {
  flex: none;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 12px;
  border: 1px solid var(--border);
  transition: all 0.15s;
  white-space: nowrap;
}

.mini-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.model-select {
  position: relative;
}

.model-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  text-align: left;
  transition: border-color 0.15s;
}

.model-trigger:hover {
  border-color: var(--accent);
}

.model-dropdown {
  position: absolute;
  z-index: 10;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px;
  max-height: 280px;
  overflow-y: auto;
}

.model-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  text-align: left;
}

.model-option:hover {
  background: var(--panel-2);
}

.model-option.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.model-option.add {
  justify-content: flex-start;
  color: var(--text-2);
  border-top: 1px solid var(--border);
  border-radius: 0 0 8px 8px;
  margin-top: 4px;
  padding-top: 10px;
}

.model-option.add:hover {
  color: var(--accent);
}

.model-add {
  padding: 4px 2px;
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

.foot-note {
  color: var(--text-3);
  font-size: 12px;
}

/* ---------- 移动端（<768px）：卡片/表单/按钮全宽单列，触屏热区 ≥44px，输入字号 ≥16px 防 iOS 聚焦缩放 ---------- */
@media (max-width: 767.98px) {
  .provider-cards {
    flex-direction: column;
    gap: 10px;
  }

  .provider-card,
  .add-card {
    width: 100%;
  }

  .add-card {
    min-height: 52px;
  }

  .delete-btn {
    min-height: 44px;
    padding: 10px 14px;
  }

  .config-card {
    padding: 16px;
  }

  .config-head {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .name-input {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    font-size: 18px;
  }

  .head-right {
    width: 100%;
  }

  .head-right .btn {
    flex: 1;
    min-height: 44px;
  }

  .test-result {
    max-width: 100%;
    word-break: break-word;
  }

  .input {
    min-height: 44px;
    font-size: 16px;
  }

  .mini-btn {
    min-height: 44px;
    padding: 10px 14px;
  }

  .model-trigger {
    min-height: 44px;
  }

  .model-option {
    min-height: 44px;
  }

  .config-foot {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .config-foot .btn.primary {
    width: 100%;
    min-height: 48px;
  }
}
</style>
