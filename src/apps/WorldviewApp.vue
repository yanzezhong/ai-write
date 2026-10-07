<template>
  <CardsApp
    folder="worldview"
    title="世界观"
    name-label="名称"
    role-label="类别"
    :role-options="['地点', '组织', '物品', '设定', '其他']"
    identity-hint="星港废墟"
  />
</template>

<script setup lang="ts">
import CardsApp from '../components/CardsApp.vue'
</script>
