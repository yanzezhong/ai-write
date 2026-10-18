<template>
  <Teleport to="body">
    <div class="sheet-mask" @click.self="emit('close')">
      <div class="sheet" role="dialog" aria-label="选择例文">
        <div class="grabber"></div>
        <header class="sheet-head">
          <h3>选择例文</h3>
          <p>选择后自动创建项目「仿写-{{ pasteName.trim() || '例文标题' }}」</p>
        </header>

        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'library' }" @click="tab = 'library'">从资料库选择</button>
          <button class="tab" :class="{ active: tab === 'paste' }" @click="tab = 'paste'">粘贴例文</button>
        </div>

        <!-- 从资料库选择 -->
        <div v-if="tab === 'library'" class="pane lib-pane">
          <template v-if="library.ready">
            <button
              v-for="f in library.files"
              :key="f"
              class="file-row"
              :class="{ off: !library.isText(f), picked: picked === f }"
              :disabled="!library.isText(f)"
              @click="picked = f"
            >
              <span class="file-icon">📚</span>
              <span class="file-name">{{ f.replace(/\.(md|txt)$/i, '') }}</span>
              <span class="file-count">{{ counts[f] ? `${counts[f].toLocaleString()} 字` : library.isText(f) ? '…' : '不支持' }}</span>
            </button>
            <p v-if="!library.files.length" class="list-empty">资料库还没有文件</p>
          </template>
          <template v-else-if="!library.setupDone">
            <div class="setup-mini">
              <p>总资料库尚未设置。手机端无法选择本地文件夹，可以使用演示资料库，或切换到「粘贴例文」。</p>
              <button class="btn primary wide" :disabled="busy" @click="useDemoLib">使用演示资料库</button>
            </div>
          </template>
          <template v-else><p class="list-empty">正在打开资料库…</p></template>
        </div>

        <!-- 粘贴例文 -->
        <div v-else class="pane paste-pane">
          <input v-model="pasteName" class="input" placeholder="例文标题，如：星海纪元 第一章" />
          <textarea
            v-model="pasteText"
            class="input paste-area"
            placeholder="把例文全文粘贴到这里（建议 1000 字以上，100 字以下无法解析）"
          ></textarea>
          <p class="paste-count">已粘贴 {{ pasteText.length }} 字</p>
        </div>

        <p v-if="error" class="error">⚠ {{ error }}</p>

        <footer class="sheet-foot">
          <button class="btn ghost big" @click="emit('close')">取消</button>
          <button class="btn primary big" :disabled="!canStart || busy" @click="start">
            {{ busy ? '解析例文中…' : '开始解析 →' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLibraryStore } from '../../stores/library'

const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const library = useLibraryStore()

const tab = ref<'library' | 'paste'>('paste')
const picked = ref<string | null>(null)
const pasteName = ref('')
const pasteText = ref('')
const busy = ref(false)
const error = ref('')
const counts = ref<Record<string, number>>({})

onMounted(async () => {
  if (!library.ready && library.setupDone) await library.init()
})

// 资料库就绪后预取每个文件的字数
watch(
  () => library.ready,
  async (ready) => {
    if (!ready) return
    for (const f of library.files) {
      if (!library.isText(f)) continue
      library
        .readFileText(f)
        .then((t) => {
          counts.value[f] = t.replace(/\s/g, '').length
        })
        .catch(() => {})
    }
  },
  { immediate: true },
)

const canStart = computed(() => {
  if (tab.value === 'library') return !!picked.value
  return pasteText.value.trim().length > 0
})

async function useDemoLib() {
  busy.value = true
  error.value = ''
  try {
    await library.setup(null, true)
    tab.value = 'library'
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function start() {
  busy.value = true
  error.value = ''
  try {
    let name: string
    let text: string
    if (tab.value === 'library') {
      const f = picked.value!
      name = f.replace(/\.(md|txt)$/i, '')
      text = await library.readFileText(f)
    } else {
      name = pasteName.value.trim() || '粘贴例文'
      text = pasteText.value
    }
    if (text.trim().length < 100) {
      error.value = '例文过短，建议提供 1000 字以上文章以获得更好效果'
      return
    }
    const { setupImitateProject } = await import('../../services/imitateSetup')
    await setupImitateProject(name, text)
    emit('close')
    await router.push({ name: 'imitate' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(30, 22, 15, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 90;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: 18px 18px 0 0;
  box-shadow: var(--shadow-lg);
  padding-bottom: env(safe-area-inset-bottom);
}
.grabber {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-strong);
  margin: 8px auto 4px;
}
.sheet-head {
  padding: 6px 18px 10px;
}
.sheet-head h3 {
  font-size: 17px;
  font-weight: 700;
}
.sheet-head p {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 2px;
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 0 18px 12px;
}
.tab {
  flex: 1;
  min-height: 44px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--text-2);
  background: var(--panel-2);
}
.tab.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.pane {
  flex: 1;
  min-height: 220px;
  overflow-y: auto;
  padding: 4px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  font-size: 14.5px;
  text-align: left;
}
.file-row.picked {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.file-row.off {
  opacity: 0.55;
}
.file-icon {
  flex: none;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.file-count {
  flex: none;
  font-size: 12.5px;
  color: var(--text-3);
}
.list-empty {
  padding: 30px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
.setup-mini {
  padding: 18px 6px;
  text-align: center;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.8;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wide {
  width: 100%;
  min-height: 46px;
}

.paste-pane {
  gap: 10px;
}
.paste-area {
  flex: 1;
  min-height: 180px;
  resize: none;
  font-size: 14px;
  line-height: 1.7;
}
.paste-count {
  font-size: 12px;
  color: var(--text-3);
  text-align: right;
}

.error {
  padding: 4px 18px;
  color: var(--accent);
  font-size: 12.5px;
}
.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}
.big {
  flex: 1;
  min-height: 48px;
  font-size: 15px;
  border-radius: var(--radius-lg);
}
</style>
