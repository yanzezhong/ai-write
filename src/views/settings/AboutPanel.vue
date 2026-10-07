<template>
  <div class="panel">
    <h1 class="page-title">关于</h1>

    <div class="card about-card">
      <div class="logo">
        <AppIcon name="logo" :size="44" />
      </div>
      <div class="name">AI 写作器</div>
      <div class="version">V0.1 · 本地优先的个人写作工具</div>
      <p class="desc">
        所有文档与数据均保存在本地，AI 供应商由你自由配置，写作过程无需上传任何服务器。
      </p>
      <div class="stack">
        <span v-for="t in ['Vue 3', 'TypeScript', 'Vite', 'Milkdown']" :key="t" class="tag">{{ t }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue'
</script>

<style scoped>
.panel {
  max-width: 680px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
}

.about-card {
  padding: 40px 32px;
  text-align: center;
}

.logo {
  color: var(--accent);
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.name {
  font-size: 18px;
  font-weight: 600;
}

.version {
  color: var(--text-2);
  font-size: 13px;
  margin-top: 4px;
}

.desc {
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.7;
  max-width: 420px;
  margin: 16px auto 0;
}

.stack {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 12px;
}
</style>
