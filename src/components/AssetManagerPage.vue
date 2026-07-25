<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowLeft,
  ChevronRight,
  Clapperboard,
  Folder,
  FolderKanban,
  FolderPlus,
  Grid2X2,
  Home,
  Image as ImageIcon,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
} from '@lucide/vue'
import { editorStore } from '@/store/editorStore'
import type { AssetFolder, ProjectAsset } from '@/types/editor'
import {
  createAssetFolder,
  deleteRemoteAsset,
  getAssetApiBase,
  listAssetFolders,
  listRemoteAssets,
  removeCachedAsset,
} from '@/services/assets'
import { addRemoteAssetToScene } from '@/utils/editorCommands'

interface FlatFolder extends AssetFolder {
  depth: number
}

type ViewMode = 'grid' | 'list'
type AssetFilter = 'all' | 'image' | 'video'

const props = defineProps<{ currentTime: number }>()
const emit = defineEmits<{
  back: []
  upload: []
  settings: []
}>()

const configured = ref(Boolean(getAssetApiBase()))
const folders = ref<FlatFolder[]>([])
const assets = ref<ProjectAsset[]>([])
const currentFolderId = ref<string | null>(null)
const loadingFolders = ref(false)
const loadingAssets = ref(false)
const creatingFolder = ref(false)
const newFolderName = ref('')
const query = ref('')
const viewMode = ref<ViewMode>('grid')
const assetFilter = ref<AssetFilter>('all')

const currentFolder = computed(() => folders.value.find((folder) => folder.id === currentFolderId.value) ?? null)
const currentChildren = computed(() => folders.value.filter((folder) => (folder.parentId ?? null) === currentFolderId.value))
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase())
const filteredFolders = computed(() => currentChildren.value.filter((folder) => !normalizedQuery.value || folder.name.toLocaleLowerCase().includes(normalizedQuery.value)))
const filteredAssets = computed(() => assets.value.filter((asset) => {
  if (assetFilter.value !== 'all' && asset.type !== assetFilter.value) return false
  return !normalizedQuery.value || asset.name.toLocaleLowerCase().includes(normalizedQuery.value)
}))
const totalItems = computed(() => currentChildren.value.length + assets.value.length)

const breadcrumbs = computed(() => {
  const result: AssetFolder[] = []
  let cursor: AssetFolder | null = currentFolder.value
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    const current = cursor
    seen.add(current.id)
    result.unshift(current)
    const parentId = current.parentId ?? null
    cursor = parentId ? folders.value.find((folder) => folder.id === parentId) ?? null : null
  }
  return result
})

async function collectFolders(parentId: string | null, depth: number, seen: Set<string>, output: FlatFolder[]) {
  if (depth > 8) return
  const children = await listAssetFolders(parentId)
  for (const folder of children) {
    if (!folder?.id || seen.has(folder.id)) continue
    seen.add(folder.id)
    output.push({ ...folder, parentId: folder.parentId ?? parentId, depth })
    await collectFolders(folder.id, depth + 1, seen, output)
  }
}

async function loadFolderTree() {
  if (!configured.value) {
    folders.value = []
    return
  }
  loadingFolders.value = true
  try {
    const output: FlatFolder[] = []
    await collectFolders(null, 0, new Set<string>(), output)
    folders.value = output
    if (currentFolderId.value && !output.some((folder) => folder.id === currentFolderId.value)) currentFolderId.value = null
  } catch (error) {
    folders.value = []
    editorStore.notify(error instanceof Error ? error.message : '读取素材目录失败')
  } finally {
    loadingFolders.value = false
  }
}

async function loadAssets() {
  if (!configured.value) {
    assets.value = []
    return
  }
  loadingAssets.value = true
  try {
    const result = await listRemoteAssets(currentFolderId.value)
    assets.value = Array.isArray(result) ? result.filter((asset) => Boolean(asset?.id)) : []
  } catch (error) {
    assets.value = []
    editorStore.notify(error instanceof Error ? error.message : '读取素材失败')
  } finally {
    loadingAssets.value = false
  }
}

async function reloadAll() {
  configured.value = Boolean(getAssetApiBase())
  if (!configured.value) {
    folders.value = []
    assets.value = []
    return
  }
  await loadFolderTree()
  await loadAssets()
}

async function openFolder(folderId: string | null) {
  currentFolderId.value = folderId
  query.value = ''
  await loadAssets()
}

async function createFolder() {
  const name = newFolderName.value.trim()
  if (!name || creatingFolder.value || !configured.value) return
  creatingFolder.value = true
  try {
    const folder = await createAssetFolder(name, currentFolderId.value)
    newFolderName.value = ''
    await loadFolderTree()
    if (folder?.id) await openFolder(folder.id)
    window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    editorStore.notify('素材目录已创建')
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '创建目录失败')
  } finally {
    creatingFolder.value = false
  }
}

function assetUsageCount(assetId: string) {
  return editorStore.project.scenes.reduce((total, scene) => total + scene.elements.filter((element) => element.assetId === assetId).length, 0)
}

function addToScene(asset: ProjectAsset) {
  addRemoteAssetToScene(asset, props.currentTime)
  editorStore.notify(`${asset.name} 已加入当前场景`)
}

async function removeAsset(asset: ProjectAsset) {
  const usage = assetUsageCount(asset.id)
  if (usage > 0) {
    editorStore.notify(`该素材正在 ${usage} 个场景元素中使用，不能删除`)
    return
  }
  if (!window.confirm(`确定删除素材“${asset.name}”吗？`)) return
  try {
    await deleteRemoteAsset(asset.id)
    await removeCachedAsset(asset.id).catch(() => undefined)
    editorStore.project.assets = editorStore.project.assets.filter((item) => item.id !== asset.id)
    editorStore.persist()
    await loadAssets()
    window.dispatchEvent(new CustomEvent('motionframe:asset-library-changed'))
    editorStore.notify('素材已删除')
  } catch (error) {
    editorStore.notify(error instanceof Error ? error.message : '删除素材失败')
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('zh-CN')
}

function folderIndent(folder: FlatFolder) {
  return `${12 + folder.depth * 16}px`
}

function onLibraryChanged() {
  void reloadAll()
}

function onAssetSettingsChanged() {
  currentFolderId.value = null
  void reloadAll()
}

onMounted(() => {
  window.addEventListener('motionframe:asset-library-changed', onLibraryChanged)
  window.addEventListener('motionframe:asset-settings', onAssetSettingsChanged)
  void reloadAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('motionframe:asset-library-changed', onLibraryChanged)
  window.removeEventListener('motionframe:asset-settings', onAssetSettingsChanged)
})
</script>

<template>
  <section class="asset-manager-page">
    <header class="asset-manager-topbar">
      <button class="asset-manager-back" @click="emit('back')"><ArrowLeft :size="17" />返回编辑器</button>
      <div class="asset-manager-title"><FolderKanban :size="20" /><div><strong>素材管理</strong><small>文件与目录</small></div></div>
      <div class="asset-manager-search"><Search :size="15" /><input v-model="query" placeholder="搜索当前目录" /></div>
      <div class="asset-manager-spacer" />
      <button class="asset-manager-command" :disabled="!configured" @click="reloadAll"><RefreshCw :size="15" />刷新</button>
      <button class="asset-manager-command" @click="emit('upload')"><Upload :size="15" />上传素材</button>
      <button class="asset-manager-settings" title="素材服务器设置" @click="emit('settings')"><Settings :size="17" /></button>
    </header>

    <div v-if="!configured" class="asset-manager-unconfigured">
      <FolderKanban :size="42" />
      <strong>尚未配置素材服务器</strong>
      <span>先设置素材 API 地址和访问令牌，再管理目录与文件。</span>
      <button @click="emit('settings')">打开素材服务器设置</button>
    </div>

    <div v-else class="asset-manager-layout">
      <aside class="asset-folder-sidebar">
        <div class="asset-sidebar-head"><strong>目录</strong><small>{{ folders.length }} 个</small></div>
        <button class="asset-folder-tree-row root" :class="{ active: currentFolderId === null }" @click="openFolder(null)"><Home :size="15" /><span>全部素材</span></button>
        <div v-if="loadingFolders" class="asset-sidebar-loading">正在读取目录…</div>
        <div v-else class="asset-folder-tree">
          <button v-for="folder in folders" :key="folder.id" class="asset-folder-tree-row" :class="{ active: folder.id === currentFolderId }" :style="{ paddingLeft: folderIndent(folder) }" @click="openFolder(folder.id)"><Folder :size="15" /><span>{{ folder.name }}</span></button>
        </div>
        <div class="asset-sidebar-create"><input v-model="newFolderName" :disabled="creatingFolder" placeholder="新建文件夹" @keyup.enter="createFolder" /><button :disabled="!newFolderName.trim() || creatingFolder" title="在当前目录新建" @click="createFolder"><FolderPlus :size="15" /></button></div>
      </aside>

      <main class="asset-file-area">
        <div class="asset-file-toolbar">
          <nav class="asset-breadcrumbs" aria-label="当前位置">
            <button @click="openFolder(null)"><Home :size="14" />全部素材</button>
            <template v-for="folder in breadcrumbs" :key="folder.id"><ChevronRight :size="13" /><button @click="openFolder(folder.id)">{{ folder.name }}</button></template>
          </nav>
          <div class="asset-file-toolbar-right"><select v-model="assetFilter"><option value="all">全部类型</option><option value="image">图片</option><option value="video">视频</option></select><div class="asset-view-switch"><button :class="{ active: viewMode === 'grid' }" title="网格视图" @click="viewMode = 'grid'"><Grid2X2 :size="15" /></button><button :class="{ active: viewMode === 'list' }" title="列表视图" @click="viewMode = 'list'"><List :size="15" /></button></div></div>
        </div>

        <div class="asset-file-summary"><span>{{ currentFolder?.name ?? '全部素材' }}</span><small>{{ totalItems }} 项</small></div>

        <div v-if="loadingAssets" class="asset-manager-empty">正在读取素材…</div>
        <div v-else-if="!filteredFolders.length && !filteredAssets.length" class="asset-manager-empty detailed"><Folder :size="34" /><strong>{{ query ? '没有匹配的文件' : '当前目录为空' }}</strong><span>{{ query ? '尝试更换搜索关键词或类型筛选。' : '可以新建目录，或上传图片和视频。' }}</span><button v-if="!query" @click="emit('upload')"><Upload :size="15" />上传素材</button></div>

        <div v-else-if="viewMode === 'grid'" class="asset-manager-grid">
          <button v-for="folder in filteredFolders" :key="folder.id" class="asset-folder-card" @click="openFolder(folder.id)"><Folder :size="38" /><strong>{{ folder.name }}</strong><small>文件夹</small></button>
          <article v-for="asset in filteredAssets" :key="asset.id" class="asset-manager-card">
            <div class="asset-manager-thumb"><img v-if="asset.type === 'image' && (asset.thumbnailUrl || asset.downloadUrl)" :src="asset.thumbnailUrl || asset.downloadUrl" :alt="asset.name" /><Clapperboard v-else :size="34" /></div>
            <div class="asset-manager-card-copy"><strong :title="asset.name">{{ asset.name }}</strong><small>{{ asset.type === 'video' ? `${asset.duration?.toFixed(1) ?? '--'}s` : `${asset.width || '--'} × ${asset.height || '--'}` }} · {{ formatBytes(asset.size) }}</small></div>
            <div class="asset-manager-card-actions"><button title="加入当前场景" @click="addToScene(asset)"><Plus :size="14" />加入</button><button class="danger" title="删除素材" @click="removeAsset(asset)"><Trash2 :size="14" /></button></div>
          </article>
        </div>

        <div v-else class="asset-manager-list">
          <div class="asset-list-head"><span>名称</span><span>类型</span><span>大小</span><span>创建时间</span><span>操作</span></div>
          <button v-for="folder in filteredFolders" :key="folder.id" class="asset-list-row folder" @click="openFolder(folder.id)"><span><Folder :size="17" />{{ folder.name }}</span><span>文件夹</span><span>--</span><span>{{ formatDate(folder.createdAt) }}</span><span>打开</span></button>
          <div v-for="asset in filteredAssets" :key="asset.id" class="asset-list-row asset"><span><ImageIcon v-if="asset.type === 'image'" :size="17" /><Clapperboard v-else :size="17" /><strong :title="asset.name">{{ asset.name }}</strong></span><span>{{ asset.type === 'image' ? '图片' : '视频' }}</span><span>{{ formatBytes(asset.size) }}</span><span>{{ formatDate(asset.createdAt) }}</span><span class="asset-list-actions"><button @click="addToScene(asset)">加入</button><button class="danger" @click="removeAsset(asset)"><Trash2 :size="14" /></button></span></div>
        </div>
      </main>
    </div>
  </section>
</template>
