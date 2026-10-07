<template>
  <CardsApp
    folder="characters"
    title="人物"
    name-label="姓名"
    role-label="角色"
    :role-options="['主角', '配角', '反派', '其他']"
    identity-hint="剑客"
  />
</template>

<script setup lang="ts">
import CardsApp from '../components/CardsApp.vue'
</script>
