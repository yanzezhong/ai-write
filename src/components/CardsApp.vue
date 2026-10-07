<template>
  <div class="cards-app">
    <div class="search-row">
      <AppIcon name="search" :size="15" class="search-icon" />
      <input v-model="keyword" class="search-input" :placeholder="`搜索${title}（名字 / 身份 / 标签）`" />
    </div>

    <div class="cards">
      <div v-if="!filtered.length" class="empty">{{ keyword ? '没有匹配的条目' : `还没有${title}条目，点击下方新建` }}</div>
      <div v-for="card in filtered" :key="card.filePath" class="card">
        <div class="card-top">
          <div class="avatar" :class="avatarClass(card.role)">{{ firstChar(card.name) }}</div>
          <div class="card-head-text">
            <div class="name-row">
              <span class="name">{{ card.name }}</span>
              <span class="role-pill" :class="roleClass(card.role)">{{ card.role || '其他' }}</span>
            </div>
            <div class="identity">{{ card.identity || '—' }}</div>
          </div>
          <button class="icon-btn edit-btn" title="编辑" @click="editCard(card)">
            <AppIcon name="edit" :size="14" />
          </button>
          <button class="icon-btn edit-btn del-btn" title="删除" @click="deleteCard(card)">
            <AppIcon name="trash" :size="14" />
          </button>
        </div>
        <div v-if="card.tags.length" class="tags">
          <span v-for="tag in card.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="desc">{{ card.description || '暂无描述' }}</div>
        <div class="meta">{{ folder }}/{{ fileName(card.filePath) }}</div>
      </div>
    </div>

    <div class="footer">
      <div v-if="formOpen" class="form">
        <input v-model="form.name" class="input" :placeholder="nameLabel" />
        <div class="form-row">
          <select v-model="form.role" class="input role-select">
            <option v-for="r in roleOptions" :key="r">{{ r }}</option>
          </select>
          <input v-model="form.identity" class="input" :placeholder="`身份（如：${identityHint}）`" />
        </div>
        <input v-model="form.tagsText" class="input" placeholder="标签（逗号分隔）" />
        <textarea v-model="form.description" class="input form-desc" rows="3" placeholder="描述"></textarea>
        <div class="form-actions">
          <button class="btn ghost" @click="formOpen = false">取消</button>
          <button class="btn primary" @click="submitForm">{{ editingPath ? '保存' : '创建' }}</button>
        </div>
      </div>
      <button v-else class="new-btn" @click="openCreate">
        <AppIcon name="plus" :size="15" />
        新建{{ title }}条目
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getFS } from '../core/fs'
import { cardMdTemplate, useProjectStore } from '../stores/project'
import type { InfoCard } from '../types'

const props = defineProps<{
  /** 卡片目录：characters / worldview（数据结构共用，仅目录与文案不同） */
  folder: 'characters' | 'worldview'
  /** 展示名：人物 / 世界观 */
  title: string
  /** md 里的名称字段：姓名 / 名称 */
  nameLabel: string
  /** md 里的分类字段：角色 / 类别 */
  roleLabel: string
  roleOptions: string[]
  identityHint: string
}>()

const project = useProjectStore()

const keyword = ref('')
const formOpen = ref(false)
const editingPath = ref<string | null>(null)
const form = reactive({ name: '', role: '', identity: '', tagsText: '', description: '' })

const cards = computed<InfoCard[]>(() => project[props.folder])

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return cards.value
  return cards.value.filter(
    (c) =>
      c.name.toLowerCase().includes(kw) ||
      c.identity.toLowerCase().includes(kw) ||
      c.tags.some((t) => t.toLowerCase().includes(kw)),
  )
})

function firstChar(name: string): string {
  return (name.trim()[0] || '?').toUpperCase()
}
function fileName(path: string): string {
  return path.split('/').pop() ?? path
}
function avatarClass(role: string): string {
  if (role === props.roleOptions[0]) return 'lead'
  if (role === props.roleOptions[2]) return 'villain'
  return ''
}
function roleClass(role: string): string {
  return avatarClass(role)
}

function openCreate() {
  editingPath.value = null
  Object.assign(form, { name: '', role: props.roleOptions[0], identity: '', tagsText: '', description: '' })
  formOpen.value = true
}

function editCard(card: InfoCard) {
  editingPath.value = card.filePath
  Object.assign(form, {
    name: card.name,
    role: props.roleOptions.includes(card.role) ? card.role : props.roleOptions[props.roleOptions.length - 1],
    identity: card.identity,
    tagsText: card.tags.join('，'),
    description: card.description,
  })
  formOpen.value = true
}

async function submitForm() {
  const name = form.name.trim()
  if (!name) return
  const tags = form.tagsText
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
  const content = cardMdTemplate(
    {
      name,
      role: form.role,
      identity: form.identity.trim(),
      tags,
      description: form.description.trim(),
    },
    { name: props.nameLabel, role: props.roleLabel },
  )
  const fs = getFS()
  if (editingPath.value) {
    await fs.writeFile(editingPath.value, content)
  } else {
    let path = `${props.folder}/${name}.md`
    if (await fs.exists(path)) {
      path = `${props.folder}/${name}-${Date.now().toString(36)}.md`
    }
    await fs.writeFile(path, content)
  }
  formOpen.value = false
  await project.loadCards(props.folder)
}

async function deleteCard(card: InfoCard) {
  if (!window.confirm(`删除${props.title}条目「${card.name}」？\n将删除文件 ${card.filePath}，不可恢复。`)) return
  await getFS().delete(card.filePath)
  await project.loadCards(props.folder)
}
</script>

<style scoped>
.cards-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-row {
  position: relative;
  padding: 10px 12px 6px;
}
.search-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(calc(-50% + 2px));
  color: var(--text-3);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  outline: none;
  font-size: 13px;
  transition: border-color 0.15s;
}
.search-input:focus {
  border-color: var(--accent);
}
.search-input::placeholder {
  color: var(--text-3);
}

.cards {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 6px 12px 12px;
}
.empty {
  padding: 20px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

.card {
  position: relative;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.card-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-serif);
  font-size: 20px;
}
.avatar.lead {
  background: var(--accent-soft);
  color: var(--accent);
}
.avatar.villain {
  background: var(--purple-soft);
  color: var(--purple);
}
.card-head-text {
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-pill {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--bg-deep);
  color: var(--text-2);
}
.role-pill.lead {
  background: var(--accent);
  color: #fff;
}
.role-pill.villain {
  background: var(--purple);
  color: #fff;
}
.identity {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-btn {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  opacity: 0;
  transition: opacity 0.15s;
}
.card:hover .edit-btn {
  opacity: 1;
}
.del-btn:hover {
  color: var(--accent);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.desc {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
.meta {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-3);
}

.footer {
  position: sticky;
  bottom: 0;
  padding: 8px 12px 10px;
  background: var(--panel);
}
.new-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 13px;
  transition: all 0.15s;
}
.new-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.form .input {
  font-size: 13px;
  padding: 7px 10px;
}
.form-row {
  display: flex;
  gap: 8px;
}
.role-select {
  width: 88px;
  flex-shrink: 0;
}
.form-desc {
  resize: vertical;
  min-height: 60px;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.form-actions .btn {
  padding: 6px 14px;
  font-size: 13px;
}
</style>
