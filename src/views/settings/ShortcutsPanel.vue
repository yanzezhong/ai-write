<template>
  <div class="panel">
    <h1 class="page-title">快捷键</h1>

    <div class="card">
      <table class="shortcut-table">
        <thead>
          <tr>
            <th>功能</th>
            <th>快捷键</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in shortcuts" :key="s.action">
            <td>{{ s.action }}</td>
            <td>
              <kbd v-for="(k, i) in s.keys" :key="i">{{ k }}</kbd>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
const shortcuts = [
  { action: '保存', keys: ['⌘', 'S'] },
  { action: '切换编辑模式', keys: ['⌘', 'E'] },
  { action: '唤起 AI', keys: ['⌘', 'J'] },
]
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

.shortcut-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.shortcut-table th,
.shortcut-table td {
  text-align: left;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}

.shortcut-table tr:last-child td {
  border-bottom: none;
}

.shortcut-table th {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

kbd {
  display: inline-block;
  min-width: 22px;
  padding: 3px 7px;
  margin-right: 4px;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--panel-2);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: center;
}
</style>
