<template>
  <div class="browser-app">
    <div class="toolbar">
      <button class="icon-btn" title="重新加载" @click="reload">
        <AppIcon name="refresh" :size="15" />
      </button>
      <input
        v-model="draft"
        class="url-input"
        placeholder="输入网址，回车打开（如 zh.wikipedia.org）"
        @keydown.enter="go"
      />
      <button class="icon-btn" title="在新窗口打开" :disabled="!currentUrl" @click="openExternal">
        <AppIcon name="external" :size="15" />
      </button>
    </div>

    <iframe
      v-if="currentUrl"
      :key="frameKey"
      :src="currentUrl"
      class="frame"
      referrerpolicy="no-referrer"
    ></iframe>

    <div v-else class="empty">
      <AppIcon name="globe" :size="30" />
      <p class="empty-title">内嵌浏览器</p>
      <p class="empty-desc">输入网址查资料，不打断写作。</p>
      <p class="empty-tip">部分网站禁止被内嵌（显示空白时），请点右上角在新窗口打开。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'

const draft = ref('')
const currentUrl = ref('')
const frameKey = ref(0)

function normalize(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  return `https://${text}`
}

function go() {
  const url = normalize(draft.value)
  if (!url) return
  currentUrl.value = url
  frameKey.value++
}

function reload() {
  if (!currentUrl.value) return
  frameKey.value++
}

function openExternal() {
  if (currentUrl.value) window.open(currentUrl.value, '_blank', 'noopener')
}
</script>

<style scoped>
.browser-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.url-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-2);
  font-size: 12.5px;
  outline: none;
}
.url-input:focus {
  border-color: var(--accent);
}

.frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  background: #fff;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  padding: 0 24px;
  text-align: center;
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-2);
}
.empty-desc {
  font-size: 13px;
}
.empty-tip {
  font-size: 12px;
  line-height: 1.7;
  max-width: 260px;
}
</style>
