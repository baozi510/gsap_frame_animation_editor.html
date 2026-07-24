<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { demoAssets } from '@/utils/assets'
import { editorStore } from '@/store/editorStore'
import type { AssetFolder, ProjectAsset } from '@/types/editor'
import {
  cacheAssetBlob,
  createAssetFolder,
  getAssetApiBase,
  hasCachedAsset,
  listAssetFolders,
  listRemoteAssets,
  uploadRemoteAsset,
} from '@/services/assets'
import {
  addExitToAllElements,
  addRemoteAssetToScene,
  getProjectDuration,
  moveScene,
  reorderLayer,
} from '@/utils/editorCommands'

const props = defineProps<{ currentTime: number }>()
const tab = ref<'assets' | 'scenes' | 'layers'>('assets')
const fileInput = ref<HTMLInputElement | null>(null)
const apiConfigured = ref(Boolean(getAssetApiBase()))
const loadingAssets = ref(false)
const uploading = ref(false)
const folders = ref<AssetFolder[]>([])
const assets = ref<ProjectAsset[]>([])
const currentFolderId = ref<string | null>(null)
const newFolderName = ref('')
const cachedMap = ref<Record<string, boolean>>({})
const draggedLayerId = ref<string | null>(null)

const currentFolder = computed(() => folders.value.find((folder) => folder.id === currentFolderId.value) ?? null)
const totalDuration = computed(() => getProjectDuration())
const orderedLayers = computed(() => [...editorStore.currentScene.value.elements].sort((a, b) => b.z - a.z))

function onUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  void uploadFiles(Array.from(input.files ?? []))
}

async function loadLibrary() {
  apiConfigured.value = Boolean(getAssetApiBase())
  if (!apiConfigured.value) {
    folders.value = []
    assets.value = []
    return
  }
  loadingAssets.value = true
  try {
    const [folderResult, assetResult] = await Promise.all([
      listAssetFolders(null),
      listRemoteAssets(currentFolderId.value),
    ])
    folders.value = folderResult
    assets.value = assetResult
    const states = await Promise.all(assetResult.map(async (asset) => [asset.id, await hasCachedAsset(asset)] as const))
    cachedMap.value = Object.fromEntries(states)
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '素材接口连接失败')
  } finally {
    loadingAssets.value = false
  }
}

async function openFolder(folderId: string | null) {
  currentFolderId.value = folderId
  await loadLibrary()
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  if (!apiConfigured.value) {
    editorStore.notify('请点击右上角设置素材服务器')
    return
  }
  try {
    await createAssetFolder(name, currentFolderId.value)
    newFolderName.value = ''
    await loadLibrary()
    editorStore.notify('素材文件夹已创建')
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '创建文件夹失败')
  }
}

async function uploadFiles(files: File[]) {
  if (!files.length) return
  if (!getAssetApiBase()) {
    editorStore.notify('请点击右上角设置素材服务器')
    return
  }
  uploading.value = true
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        editorStore.notify(`不支持的素材类型：${file.name}`)
        continue
      }
      const asset = await uploadRemoteAsset(file, currentFolderId.value)
      await cacheAssetBlob(asset, file)
      editorStore.upsertProjectAsset(asset)
    }
    await loadLibrary()
    editorStore.notify('素材上传完成')
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '素材上传失败')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function addAsset(asset: ProjectAsset) {
  addRemoteAssetToScene(asset, props.currentTime)
}

function startLayerDrag(id: string, event: DragEvent) {
  draggedLayerId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

function dropLayer(targetId: string) {
  if (draggedLayerId.value) reorderLayer(draggedLayerId.value, targetId)
  draggedLayerId.value = null
}

function onAssetSettingsChanged() {
  currentFolderId.value = null
  void loadLibrary()
}

onMounted(() => {
  window.addEventListener('motionframe:asset-settings', onAssetSettingsChanged)
  if (apiConfigured.value) void loadLibrary()
})

onBeforeUnmount(() => window.removeEventListener('motionframe:asset-settings', onAssetSettingsChanged))
</script>

<template>
  <aside class="left-panel panel">
    <div class="panel-tabs">
      <button :class="{ active: tab === 'assets' }" @click="tab = 'assets'">素材</button>
      <button :class="{ active: tab === 'scenes' }" @click="tab = 'scenes'">场景</button>
      <button :class="{ active: tab === 'layers' }" @click="tab = 'layers'">图层</button>
    </div>

    <div v-if="tab === 'assets'" class="panel-scroll asset-panel">
      <div class="asset-api-head">
        <div><strong>素材库</strong><small>{{ apiConfigured ? '远程 API + 本地缓存' : '请在右上角设置素材服务器' }}</small></div>
        <span class="server-state" :class="{ connected: apiConfigured }">{{ apiConfigured ? '已连接' : '未设置' }}</span>
      </div>

      <input ref="fileInput" hidden multiple type="file" accept="image/*,video/*" @change="onUploadChange" />
      <button class="upload-zone" :disabled="uploading" @click="fileInput?.click()">
        <strong>{{ uploading ? '正在上传素材…' : '上传图片或视频' }}</strong>
        <span>文件上传到自定义 API，同时保存到本地缓存</span>
      </button>

      <div class="folder-toolbar">
        <button :class="{ active: currentFolderId === null }" @click="openFolder(null)">全部素材</button>
        <span v-if="currentFolder">/ {{ currentFolder.name }}</span>
      </div>
      <div class="folder-create">
        <input v-model="newFolderName" placeholder="新文件夹名称" @keyup.enter="createFolder" />
        <button @click="createFolder">新建</button>
      </div>
      <div v-if="folders.length" class="folder-list">
        <button v-for="folder in folders" :key="folder.id" :class="{ active: folder.id === currentFolderId }" @click="openFolder(folder.id)">
          <i>▰</i><span>{{ folder.name }}</span>
        </button>
      </div>

      <div class="section-label">远程素材</div>
      <div v-if="loadingAssets" class="asset-empty">正在读取素材库…</div>
      <div v-else-if="!apiConfigured" class="asset-empty">点击右上角齿轮设置图片服务器</div>
      <div v-else-if="!assets.length" class="asset-empty">当前文件夹暂无素材</div>
      <div v-else class="asset-grid remote-asset-grid">
        <button v-for="asset in assets" :key="asset.id" class="asset-card remote-asset-card" @click="addAsset(asset)">
          <img v-if="asset.type === 'image' && (asset.thumbnailUrl || asset.downloadUrl)" :src="asset.thumbnailUrl || asset.downloadUrl" :alt="asset.name" />
          <div v-else class="video-thumb">▶</div>
          <span>{{ asset.name }}</span>
          <small :class="{ cached: cachedMap[asset.id] }">{{ cachedMap[asset.id] ? '本地已缓存' : asset.type === 'video' ? `${asset.duration?.toFixed(1) ?? '--'}s 视频` : '远程图片' }}</small>
        </button>
      </div>

      <div class="section-label">演示素材</div>
      <div class="asset-grid">
        <button v-for="asset in demoAssets" :key="asset.id" class="asset-card" @click="editorStore.addDemoAsset(asset.id, currentTime)">
          <img :src="asset.src" :alt="asset.name" />
          <span>{{ asset.name }}</span>
        </button>
      </div>
      <div class="section-label">基础挂件</div>
      <div class="asset-grid basic-grid">
        <button class="basic-card" @click="editorStore.addShape('rect', currentTime)"><i class="shape rect" /><span>矩形</span></button>
        <button class="basic-card" @click="editorStore.addShape('circle', currentTime)"><i class="shape circle" /><span>圆形</span></button>
        <button class="basic-card" @click="editorStore.addShape('text', currentTime)"><i class="text-icon">Aa</i><span>文字</span></button>
        <button class="basic-card" @click="editorStore.addShape('star', currentTime)"><i class="star-icon">★</i><span>贴纸</span></button>
      </div>
    </div>

    <div v-else-if="tab === 'scenes'" class="panel-scroll scene-panel">
      <div class="scene-sequence-summary">
        <strong>完整视频</strong>
        <span>{{ editorStore.project.scenes.length }} 个场景 · {{ totalDuration.toFixed(1) }}s</span>
        <small>列表顺序就是最终视频顺序，场景结束后自动进入下一场景。</small>
      </div>
      <div v-for="(scene, index) in editorStore.project.scenes" :key="scene.id" class="scene-row-wrap">
        <button class="scene-row" :class="{ active: scene.id === editorStore.project.currentSceneId }" @click="editorStore.switchScene(scene.id)">
          <span class="scene-index">{{ index + 1 }}</span>
          <span class="scene-copy"><strong>{{ scene.name }}</strong><small>{{ scene.elements.length }} 个元素</small></span>
          <span class="scene-duration">{{ scene.duration.toFixed(1) }}s</span>
        </button>
        <div class="scene-order-actions">
          <button :disabled="index === 0" title="场景上移" @click="moveScene(scene.id, -1)">↑</button>
          <button :disabled="index === editorStore.project.scenes.length - 1" title="场景下移" @click="moveScene(scene.id, 1)">↓</button>
        </div>
      </div>
      <div class="scene-transition-actions">
        <button @click="addExitToAllElements(0.5)">当前场景全体淡出</button>
        <small>会在场景最后 0.5 秒为所有元素添加统一退场。</small>
      </div>
      <div class="scene-actions">
        <button @click="editorStore.addScene">＋ 新场景</button>
        <button @click="editorStore.duplicateScene">复制</button>
        <button @click="editorStore.deleteScene">删除</button>
      </div>
    </div>

    <div v-else class="panel-scroll layer-panel">
      <div class="layer-drag-tip">拖动图层行调整层级，上方图层显示在最前面。</div>
      <button
        v-for="element in orderedLayers"
        :key="element.id"
        class="layer-row"
        :class="{ active: element.id === editorStore.selectedId.value, dragging: element.id === draggedLayerId }"
        draggable="true"
        @dragstart="startLayerDrag(element.id, $event)"
        @dragover.prevent
        @drop.prevent="dropLayer(element.id)"
        @dragend="draggedLayerId = null"
        @click="editorStore.select(element.id)"
      >
        <span class="layer-grip">⋮⋮</span>
        <span class="layer-eye" @click.stop="editorStore.commit(() => element.visible = !element.visible)">{{ element.visible ? '◉' : '○' }}</span>
        <span class="layer-type">{{ element.type === 'image' ? '图' : element.type === 'video' ? '视' : element.type === 'shape' ? '形' : '字' }}</span>
        <span class="layer-name">{{ element.name }}</span>
        <span class="layer-lock" @click.stop="editorStore.commit(() => element.locked = !element.locked)">{{ element.locked ? '锁' : '开' }}</span>
      </button>
    </div>
  </aside>
</template>
