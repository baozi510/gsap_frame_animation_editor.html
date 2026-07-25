<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft,
  CheckCircle2,
  FolderPlus,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  X,
} from '@lucide/vue'
import { editorStore } from '@/store/editorStore'
import type { AssetFolder } from '@/types/editor'
import {
  cacheAssetBlob,
  createAssetFolder,
  getAssetApiBase,
  listAssetFolders,
  uploadRemoteAsset,
} from '@/services/assets'
import { uid } from '@/utils/helpers'

type QueueStatus = 'pending' | 'uploading' | 'success' | 'error'
type UploadStep = 'select' | 'progress'

interface UploadQueueItem {
  id: string
  file: File
  status: QueueStatus
  error?: string
  assetId?: string
  retryable?: boolean
}

interface FolderOption {
  id: string
  name: string
  depth: number
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  settings: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const queue = ref<UploadQueueItem[]>([])
const folderOptions = ref<FolderOption[]>([])
const selectedFolderId = ref('')
const newFolderName = ref('')
const folderLoading = ref(false)
const creatingFolder = ref(false)
const uploading = ref(false)
const dragActive = ref(false)
const configured = ref(Boolean(getAssetApiBase()))
const step = ref<UploadStep>('select')

const uploadableCount = computed(() => queue.value.filter((item) => item.status === 'pending' || (item.status === 'error' && item.retryable)).length)
const successCount = computed(() => queue.value.filter((item) => item.status === 'success').length)
const errorCount = computed(() => queue.value.filter((item) => item.status === 'error').length)
const completedCount = computed(() => queue.value.filter((item) => item.status === 'success' || item.status === 'error').length)
const progress = computed(() => queue.value.length ? Math.round((completedCount.value / queue.value.length) * 100) : 0)
const targetFolderName = computed(() => folderOptions.value.find((folder) => folder.id === selectedFolderId.value)?.name ?? '根目录')

watch(() => props.open, (open) => {
  if (!open) return
  configured.value = Boolean(getAssetApiBase())
  if (configured.value) void loadFolderTree()
  if (uploading.value || queue.value.some((item) => item.status === 'uploading' || item.status === 'success' || (item.status === 'error' && item.retryable))) step.value = 'progress'
  else step.value = 'select'
})

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function addFiles(files: File[]) {
  const existing = new Set(queue.value.map((item) => fileKey(item.file)))
  for (const file of files) {
    const key = fileKey(file)
    if (existing.has(key)) continue
    existing.add(key)
    const supported = file.type.startsWith('image/') || file.type.startsWith('video/')
    queue.value.push({
      id: uid('upload'),
      file,
      status: supported ? 'pending' : 'error',
      retryable: false,
      error: supported ? undefined : '仅支持图片和视频文件',
    })
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

async function collectFolders(parentId: string | null, depth: number, seen: Set<string>, output: FolderOption[]) {
  if (depth > 8) return
  const children = await listAssetFolders(parentId)
  for (const folder of children) {
    if (!folder?.id || seen.has(folder.id)) continue
    seen.add(folder.id)
    output.push({ id: folder.id, name: folder.name || '未命名目录', depth })
    await collectFolders(folder.id, depth + 1, seen, output)
  }
}

async function loadFolderTree() {
  configured.value = Boolean(getAssetApiBase())
  if (!configured.value) {
    folderOptions.value = []
    return
  }
  folderLoading.value = true
  try {
    const output: FolderOption[] = []
    await collectFolders(null, 0, new Set<string>(), output)
    folderOptions.value = output
    if (selectedFolderId.value && !output.some((folder) => folder.id === selectedFolderId.value)) selectedFolderId.value = ''
  } catch (error) {
    folderOptions.value = []
    editorStore.notify(error instanceof Error ? error.message : '读取素材目录失败')
  } finally {
    folderLoading.value = false
  }
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name || creatingFolder.value) return
  creatingFolder.value = true
  try {
    const folder = await createAssetFolder(name, selectedFolderId.value || null) as AssetFolder
    newFolderName.value = ''
    await loadFolderTree()
    if (folder?.id) selectedFolderId.value = folder.id
    window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    editorStore.notify('素材目录已创建')
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '创建素材目录失败')
  } finally {
    creatingFolder.value = false
  }
}

async function uploadItem(item: UploadQueueItem) {
  if (item.status === 'uploading') return false
  item.status = 'uploading'
  item.error = undefined
  item.retryable = false
  try {
    const asset = await uploadRemoteAsset(item.file, selectedFolderId.value || null)
    if (!asset?.id) throw new Error('上传接口没有返回素材信息')
    await cacheAssetBlob(asset, item.file)
    editorStore.upsertProjectAsset(asset)
    item.assetId = asset.id
    item.status = 'success'
    return true
  } catch (error) {
    item.status = 'error'
    item.retryable = true
    item.error = error instanceof Error ? error.message : '上传失败'
    return false
  }
}

async function startUpload() {
  if (!configured.value) {
    emit('settings')
    return
  }
  if (!uploadableCount.value || uploading.value) return
  uploading.value = true
  let changed = false
  try {
    for (const item of queue.value) {
      if (item.status !== 'pending' && !(item.status === 'error' && item.retryable)) continue
      changed = (await uploadItem(item)) || changed
    }
    if (changed) {
      editorStore.persist()
      window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    }
    if (queue.value.length && queue.value.every((item) => item.status === 'success')) editorStore.notify('全部素材上传完成')
  } finally {
    uploading.value = false
  }
}

function beginUpload() {
  if (!configured.value) {
    emit('settings')
    return
  }
  if (!uploadableCount.value) return
  step.value = 'progress'
  void startUpload()
}

async function retryItem(item: UploadQueueItem) {
  if (uploading.value || item.status !== 'error' || !item.retryable) return
  uploading.value = true
  try {
    const changed = await uploadItem(item)
    if (changed) {
      editorStore.persist()
      window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    }
  } finally {
    uploading.value = false
  }
}

function removeItem(id: string) {
  if (uploading.value) return
  queue.value = queue.value.filter((item) => item.id !== id)
}

function resetBatch() {
  if (uploading.value) return
  queue.value = []
  step.value = 'select'
}

function backToSelection() {
  if (uploading.value) return
  queue.value = queue.value.filter((item) => item.status !== 'success')
  queue.value.forEach((item) => {
    if (item.status === 'error' && item.retryable) {
      item.status = 'pending'
      item.retryable = false
      item.error = undefined
    }
  })
  step.value = 'select'
}

function close() {
  if (!uploading.value) emit('close')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusLabel(item: UploadQueueItem) {
  if (item.status === 'uploading') return '上传中'
  if (item.status === 'success') return '已完成'
  if (item.status === 'error') return item.retryable ? '上传失败' : '文件不支持'
  return '等待上传'
}
</script>

<template>
  <div v-if="open" class="upload-modal-backdrop" @mousedown.self="close">
    <section class="upload-dialog upload-dialog-steps" role="dialog" aria-modal="true" aria-label="上传素材">
      <header class="upload-dialog-head">
        <div><strong>上传素材</strong><small>{{ step === 'select' ? '选择文件和目标目录' : '按列表顺序逐个上传' }}</small></div>
        <div class="upload-step-indicator">
          <span :class="{ active: step === 'select', done: step === 'progress' }"><i>1</i>选择文件</span>
          <b />
          <span :class="{ active: step === 'progress' }"><i>2</i>上传进度</span>
        </div>
        <button :disabled="uploading" title="关闭" @click="close"><X :size="18" /></button>
      </header>

      <div v-if="!configured" class="upload-server-empty">
        <Upload :size="34" />
        <strong>尚未配置素材服务器</strong>
        <span>先设置 API 地址和访问令牌，再上传素材。</span>
        <button @click="emit('settings')">打开素材服务器设置</button>
      </div>

      <template v-else-if="step === 'select'">
        <div class="upload-step-body select-step">
          <section class="upload-target-card">
            <div class="upload-target-row">
              <label><span>上传到目录</span><select v-model="selectedFolderId" :disabled="folderLoading"><option value="">根目录</option><option v-for="folder in folderOptions" :key="folder.id" :value="folder.id">{{ '　'.repeat(folder.depth) }}{{ folder.name }}</option></select></label>
              <button class="refresh-folders" :disabled="folderLoading" title="刷新目录" @click="loadFolderTree"><RefreshCw :size="15" /></button>
            </div>
            <div class="upload-folder-create"><FolderPlus :size="17" /><input v-model="newFolderName" :disabled="creatingFolder" placeholder="在当前目录中新建文件夹" @keyup.enter="createFolder" /><button :disabled="!newFolderName.trim() || creatingFolder" @click="createFolder"><Plus :size="14" />新建</button></div>
          </section>

          <input ref="fileInput" hidden multiple type="file" accept="image/*,video/*" @change="onFileChange" />
          <button class="upload-drop-zone large" :class="{ active: dragActive }" @click="fileInput?.click()" @dragenter.prevent="dragActive = true" @dragover.prevent="dragActive = true" @dragleave.prevent="dragActive = false" @drop.prevent="onDrop">
            <Upload :size="32" /><strong>拖拽文件到这里，或点击选择</strong><span>支持一次选择多张图片和多个视频</span>
          </button>

          <div class="upload-selection-head"><div><strong>已选择 {{ queue.length }} 个文件</strong><small>确认后进入上传进度页面</small></div><button v-if="queue.length" @click="resetBatch">清空</button></div>
          <div v-if="!queue.length" class="upload-selection-empty">还没有选择文件</div>
          <div v-else class="upload-selection-list">
            <article v-for="item in queue" :key="item.id" :class="['upload-selection-item', { invalid: item.status === 'error' && !item.retryable }]">
              <div class="upload-file-icon"><ImageIcon v-if="item.file.type.startsWith('image/')" :size="20" /><Video v-else :size="20" /></div>
              <div class="upload-file-copy"><strong>{{ item.file.name }}</strong><small>{{ formatBytes(item.file.size) }}</small><span v-if="item.error">{{ item.error }}</span></div>
              <button title="移除" @click="removeItem(item.id)"><Trash2 :size="14" /></button>
            </article>
          </div>
        </div>
        <footer class="upload-dialog-actions"><button @click="close">取消</button><button class="primary" :disabled="!uploadableCount" @click="beginUpload"><Upload :size="15" />开始上传（{{ uploadableCount }}）</button></footer>
      </template>

      <template v-else>
        <div class="upload-step-body progress-step">
          <div class="upload-progress-summary">
            <button :disabled="uploading" @click="backToSelection"><ArrowLeft :size="15" />返回选择</button>
            <div><strong>正在上传到：{{ targetFolderName }}</strong><small>{{ successCount }} 个成功 · {{ errorCount }} 个失败 · 共 {{ queue.length }} 个</small></div>
            <span>{{ progress }}%</span>
          </div>
          <div class="upload-progress-track wide"><i :style="{ width: `${progress}%` }" /></div>

          <div v-if="!queue.length" class="upload-queue-empty"><CheckCircle2 :size="30" /><strong>上传列表为空</strong><span>返回第一步添加文件。</span></div>
          <div v-else class="upload-queue-list progress-list">
            <article v-for="item in queue" :key="item.id" class="upload-queue-item" :class="item.status">
              <div class="upload-file-icon"><ImageIcon v-if="item.file.type.startsWith('image/')" :size="20" /><Video v-else :size="20" /></div>
              <div class="upload-file-copy"><strong>{{ item.file.name }}</strong><small>{{ formatBytes(item.file.size) }} · {{ statusLabel(item) }}</small><span v-if="item.error">{{ item.error }}</span></div>
              <div class="upload-item-actions"><button v-if="item.status === 'error' && item.retryable" :disabled="uploading" title="重试" @click="retryItem(item)"><RefreshCw :size="14" /></button><button v-if="item.status !== 'uploading' && item.status !== 'success'" :disabled="uploading" title="移除" @click="removeItem(item.id)"><Trash2 :size="14" /></button><i v-if="item.status === 'uploading'" class="upload-spinner" /><CheckCircle2 v-else-if="item.status === 'success'" class="upload-success-icon" :size="19" /></div>
            </article>
          </div>
        </div>
        <footer class="upload-dialog-actions"><button :disabled="uploading" @click="resetBatch">上传另一批</button><button class="primary" :disabled="uploading" @click="close">完成</button></footer>
      </template>
    </section>
  </div>
</template>
