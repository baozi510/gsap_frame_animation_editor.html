<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { demoAssets } from '@/utils/assets'
import { editorStore } from '@/store/editorStore'
import type { AssetFolder, ProjectAsset } from '@/types/editor'
import {
  cacheAssetBlob,
  createAssetFolder,
  getAssetApiBase,
  getAssetApiToken,
  hasCachedAsset,
  listAssetFolders,
  listRemoteAssets,
  setAssetApiBase,
  setAssetApiToken,
  uploadRemoteAsset,
} from '@/services/assets'

const props = defineProps<{ currentTime: number }>()
const tab = ref<'assets' | 'scenes' | 'layers'>('assets')
const fileInput = ref<HTMLInputElement | null>(null)
const apiBase = ref(getAssetApiBase())
const apiToken = ref(getAssetApiToken())
const showApiSettings = ref(!apiBase.value)
const loadingAssets = ref(false)
const uploading = ref(false)
const folders = ref<AssetFolder[]>([])
const assets = ref<ProjectAsset[]>([])
const currentFolderId = ref<string | null>(null)
const newFolderName = ref('')
const cachedMap = ref<Record<string, boolean>>({})

const currentFolder = computed(() => folders.value.find((folder) => folder.id === currentFolderId.value) ?? null)

function onUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  void uploadFiles(Array.from(input.files ?? []))
}

async function saveApiSettings() {
  setAssetApiBase(apiBase.value)
  setAssetApiToken(apiToken.value)
  showApiSettings.value = false
  await loadLibrary()
}

async function loadLibrary() {
  if (!getAssetApiBase()) return
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
    showApiSettings.value = true
    editorStore.notify('请先设置素材 API 地址')
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
  editorStore.addLibraryAsset(asset, props.currentTime)
}

onMounted(() => {
  if (apiBase.value) void loadLibrary()
})
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
        <div><strong>素材库</strong><small>{{ apiBase ? '远程 API + 本地缓存' : '尚未连接素材接口' }}</small></div>
        <button @click="showApiSettings = !showApiSettings">设置</button>
      </div>

      <div v-if="showApiSettings" class="asset-api-settings">
        <label><span>API 地址</span><input v-model="apiBase" placeholder="https://nas.example.com" /></label>
        <label><span>访问令牌</span><input v-model="apiToken" type="password" placeholder="可选 Bearer Token" /></label>
        <button @click="saveApiSettings">保存并连接</button>
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
      <div v-else-if="!assets.length" class="asset-empty">当前文件夹暂无素材</div>
      <div v-else class="asset-grid remote-asset-grid">
        <button v-for="asset in assets" :key="asset.id" class="asset-card remote-asset-card" @click="addAsset(asset)">
          <img v-if="asset.type === 'image' && (asset.thumbnailUrl || asset.downloadUrl)" :src="asset.thumbnailUrl || asset.downloadUrl" :alt="asset.name" />
          <div v-else class="video-thumb">▶</div>
          <span>{{ asset.name }}</span>
          <small :class="{ cached: cachedMap[asset.id] }">{{ cachedMap[asset.id] ? '本地已缓存' : asset.type === 'video' ? '远程视频' : '远程图片' }}</small>
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
      <button
        v-for="(scene, index) in editorStore.project.scenes"
        :key="scene.id"
        class="scene-row"
        :class="{ active: scene.id === editorStore.project.currentSceneId }"
        @click="editorStore.switchScene(scene.id)"
      >
        <span class="scene-index">{{ index + 1 }}</span>
        <span class="scene-copy"><strong>{{ scene.name }}</strong><small>{{ scene.elements.length }} 个元素</small></span>
        <span class="scene-duration">{{ scene.duration.toFixed(1) }}s</span>
      </button>
      <div class="scene-actions">
        <button @click="editorStore.addScene">＋ 新场景</button>
        <button @click="editorStore.duplicateScene">复制</button>
        <button @click="editorStore.deleteScene">删除</button>
      </div>
    </div>

    <div v-else class="panel-scroll layer-panel">
      <button
        v-for="element in [...editorStore.currentScene.value.elements].sort((a,b) => b.z-a.z)"
        :key="element.id"
        class="layer-row"
        :class="{ active: element.id === editorStore.selectedId.value }"
        @click="editorStore.select(element.id)"
      >
        <span class="layer-eye" @click.stop="editorStore.commit(() => element.visible = !element.visible)">{{ element.visible ? '◉' : '○' }}</span>
        <span class="layer-type">{{ element.type === 'image' ? '图' : element.type === 'video' ? '视' : element.type === 'shape' ? '形' : '字' }}</span>
        <span class="layer-name">{{ element.name }}</span>
        <span class="layer-lock" @click.stop="editorStore.commit(() => element.locked = !element.locked)">{{ element.locked ? '锁' : '开' }}</span>
      </button>
    </div>
  </aside>
</template>
