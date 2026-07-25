<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Folder,
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

interface UploadQueueItem {
  id: string
  file: File
  status: QueueStatus
  error?: string
  assetId?: string
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

const configured = computed(() => Boolean(getAssetApiBase()))
const pendingCount = computed(() => queue.value.filter((item) => item.status === 'pending' || item.status === 'error').length)
const successCount = computed(() => queue.value.filter((item) => item.status === 'success').length)
const progress = computed(() => queue.value.length ? Math.round((successCount.value / queue.value.length) * 100) : 0)

watch(() => props.open, (open) => {
  if (open && configured.value) void loadFolderTree()
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

async function collectFolders(
  parentId: string | null,
  depth: number,
  seen: Set<string>,
  output: FolderOption[],
) {
  if (depth > 5) return
  const children = await listAssetFolders(parentId)
  for (const folder of children) {
    if (!folder?.id || seen.has(folder.id)) continue
    seen.add(folder.id)
    output.push({ id: folder.id, name: folder.name || '未命名目录', depth })
    await collectFolders(folder.id, depth + 1, seen, output)
  }
}

async function loadFolderTree() {
  if (!configured.value) {
    folderOptions.value = []
    return
  }
  folderLoading.value = true
  try {
    const output: FolderOption[] = []
    await collectFolders(null, 0, new Set<string>(), output)
    folderOptions.value = output
    if (selectedFolderId.value && !output.some((folder) => folder.id === selectedFolderId.value)) {
      selectedFolderId.value = ''
    }
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
    item.error = error instanceof Error ? error.message : '上传失败'
    return false
  }
}

async function startUpload() {
  if (!configured.value) {
    emit('settings')
    return
  }
  if (!pendingCount.value || uploading.value) return
  uploading.value = true
  let changed = false
  try {
    for (const item of queue.value) {
      if (item.status !== 'pending' && item.status !== 'error') continue
      changed = (await uploadItem(item)) || changed
    }
    if (changed) {
      editorStore.persist()
      window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    }
    if (queue.value.every((item) => item.status === 'success')) editorStore.notify('全部素材上传完成')
  } finally {
    uploading.value = false
  }
}

async function retryItem(item: UploadQueueItem) {
  if (uploading.value || item.status !== 'error') return
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

function clearFinished() {
  if (uploading.value) return
  queue.value = queue.value.filter((item) => item.status !== 'success')
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
  if (item.status === 'error') return '上传失败'
  return '等待上传'
}
</script>

<template>
  <div v-if="open" class="upload-modal-backdrop" @mousedown.self="close">
    <section class="upload-dialog" role="dialog" aria-modal="true" aria-label="上传素材">
      <header class="upload-dialog-head">
        <div>
          <strong>上传素材</strong>
          <small>多选文件后，按列表顺序逐个上传</small>
        </div>
        <button :disabled="uploading" title="关闭" @click="close"><X :size="18" /></button>
      </header>

      <div v-if="!configured" class="upload-server-empty">
        <Upload :size="34" />
        <strong>尚未配置素材服务器</strong>
        <span>先设置 API 地址和访问令牌，再上传素材。</span>
        <button @click="emit('settings')">打开素材服务器设置</button>
      </div>

      <template v-else>
        <div class="upload-target-row">
          <label>
            <span>上传到目录</span>
            <select v-model="selectedFolderId" :disabled="folderLoading || uploading">
              <option value="">根目录</option>
              <option v-for="folder in folderOptions" :key="folder.id" :value="folder.id">{{ '　'.repeat(folder.depth) }}{{ folder.name }}</option>
            </select>
          </label>
          <button class="refresh-folders" :disabled="folderLoading || uploading" title="刷新目录" @click="loadFolderTree"><RefreshCw :size="15" /></button>
        </div>

        <div class="upload-folder-create">
          <FolderPlus :size="17" />
          <input v-model="newFolderName" :disabled="creatingFolder || uploading" placeholder="在当前目录中新建文件夹" @keyup.enter="createFolder" />
          <button :disabled="!newFolderName.trim() || creatingFolder || uploading" @click="createFolder"><Plus :size="14" />新建</button>
        </div>

        <input ref="fileInput" hidden multiple type="file" accept="image/*,video/*" @change="onFileChange" />
        <button
          class="upload-drop-zone"
          :class="{ active: dragActive }"
          :disabled="uploading"
          @click="fileInput?.click()"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <Upload :size="25" />
          <strong>选择图片或视频</strong>
          <span>支持一次选择多张，也可以把文件拖到这里</span>
        </button>

        <div class="upload-queue-head">
          <div><strong>上传列表</strong><small>{{ queue.length }} 个文件 · {{ successCount }} 个已完成</small></div>
          <button :disabled="!successCount || uploading" @click="clearFinished">清除已完成</button>
        </div>

        <div v-if="!queue.length" class="upload-queue-empty">
          <Folder :size="28" />
          <strong>还没有待上传文件</strong>
          <span>添加文件后会先进入列表，不会立即上传。</span>
        </div>

        <div v-else class="upload-queue-list">
          <article v-for="item in queue" :key="item.id" class="upload-queue-item" :class="item.status">
            <div class="upload-file-icon"><ImageIcon v-if="item.file.type.startsWith('image/')" :size="20" /><Video v-else :size="20" /></div>
            <div class="upload-file-copy">
              <strong>{{ item.file.name }}</strong>
              <small>{{ formatBytes(item.file.size) }} · {{ statusLabel(item) }}</small>
              <span v-if="item.error">{{ item.error }}</span>
            </div>
            <div class="upload-item-actions">
              <button v-if="item.status === 'error'" :disabled="uploading" title="重试" @click="retryItem(item)"><RefreshCw :size="14" /></button>
              <button v-if="item.status !== 'uploading'" :disabled="uploading" title="移除" @click="removeItem(item.id)"><Trash2 :size="14" /></button>
              <i v-else class="upload-spinner" />
            </div>
          </article>
        </div>

        <div class="upload-progress-row">
          <div class="upload-progress-track"><i :style="{ width: `${progress}%` }" /></div>
          <span>{{ progress }}%</span>
        </div>

        <footer class="upload-dialog-actions">
          <button :disabled="uploading" @click="close">关闭</button>
          <button class="primary" :disabled="!pendingCount || uploading" @click="startUpload">
            <Upload :size="15" />{{ uploading ? '正在逐个上传…' : `开始上传（${pendingCount}）` }}
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>
