<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { applyCurrentTheme } from './stores/prefs'

// 恢复持久化的主题（应用 <html data-theme>）
onMounted(() => {
  applyCurrentTheme()
})
</script>
