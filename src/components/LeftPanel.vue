<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  Clapperboard,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers3,
  Lock,
  Maximize2,
  Plus,
  RotateCw,
  Shapes,
  Sparkles,
  Square,
  Star,
  Trash2,
  Type,
  Unlock,
  Upload,
} from '@lucide/vue'
import { demoAssets } from '@/utils/assets'
import { editorStore } from '@/store/editorStore'
import type { AssetFolder, MotionClip, ProjectAsset } from '@/types/editor'
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
  clearCurrentScene,
  getProjectDuration,
  moveScene,
  reorderLayer,
  type LayerDropPosition,
} from '@/utils/editorCommands'
import { createMotionClip, ensureMotionClips, reflowMotionClips } from '@/utils/motionClips'

interface LayerPointerDrag {
  sourceId: string
  targetId: string
  position: LayerDropPosition
  pointerId: number
  startY: number
  moved: boolean
}

type LeftSection = 'assets' | 'text' | 'shapes' | 'animation' | 'scenes' | 'layers'

const props = defineProps<{ currentTime: number }>()
const section = ref<LeftSection>('assets')
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
const dragOverLayerId = ref<string | null>(null)
const dragOverPosition = ref<LayerDropPosition>('before')
let layerPointerDrag: LayerPointerDrag | null = null

const navItems = [
  { id: 'assets' as const, label: '素材', icon: ImageIcon },
  { id: 'text' as const, label: '文字', icon: Type },
  { id: 'shapes' as const, label: '图形', icon: Shapes },
  { id: 'animation' as const, label: '动画', icon: Sparkles },
  { id: 'scenes' as const, label: '场景', icon: Clapperboard },
  { id: 'layers' as const, label: '图层', icon: Layers3 },
]
const sectionTitle = computed(() => navItems.find((item) => item.id === section.value)?.label ?? '素材')
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

function addTextVariant(kind: 'title' | 'subtitle' | 'caption') {
  editorStore.addShape('text', props.currentTime)
  editorStore.updateElement((element) => {
    if (kind === 'title') {
      element.name = '主标题'
      element.text = '输入主标题'
      element.style.fontSize = 76
      element.style.fontWeight = '800'
    } else if (kind === 'subtitle') {
      element.name = '副标题'
      element.text = '输入副标题'
      element.style.fontSize = 42
      element.style.fontWeight = '600'
    } else {
      element.name = '说明文字'
      element.text = '输入说明文字'
      element.style.fontSize = 30
      element.style.fontWeight = '500'
    }
  })
}

function addQuickMotion(kind: 'right' | 'left' | 'up' | 'down' | 'grow' | 'rotate') {
  if (!editorStore.selectedElement.value) {
    editorStore.notify('请先选择一个元素')
    return
  }
  editorStore.updateElement((element) => {
    const clips = ensureMotionClips(element)
    const anchor = clips.at(-1)
    const clip = createMotionClip(element, anchor ? 'chain' : 'free', anchor)
    clip.name = kind === 'right' ? '向右移动' : kind === 'left' ? '向左移动' : kind === 'up' ? '向上移动' : kind === 'down' ? '向下移动' : kind === 'grow' ? '放大' : '旋转'
    clip.x = kind === 'right' ? 200 : kind === 'left' ? -200 : 0
    clip.y = kind === 'up' ? -200 : kind === 'down' ? 200 : 0
    clip.scale = kind === 'grow' ? 125 : 100
    clip.rotation = kind === 'rotate' ? 90 : 0
    clips.push(clip as MotionClip)
    reflowMotionClips(element)
  }, '普通动画已添加')
}

function startLayerPointer(id: string, event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('.layer-row-actions')) return
  event.preventDefault()
  editorStore.select(id)
  layerPointerDrag = {
    sourceId: id,
    targetId: id,
    position: 'before',
    pointerId: event.pointerId,
    startY: event.clientY,
    moved: false,
  }
  draggedLayerId.value = id
  dragOverLayerId.value = id
  dragOverPosition.value = 'before'
  document.body.classList.add('layer-reordering')
  window.addEventListener('pointermove', moveLayerPointer)
  window.addEventListener('pointerup', finishLayerPointer)
  window.addEventListener('pointercancel', cancelLayerPointer)
}

function moveLayerPointer(event: PointerEvent) {
  const drag = layerPointerDrag
  if (!drag || drag.pointerId !== event.pointerId) return
  if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return
  drag.moved = true
  event.preventDefault()
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-layer-id]')
  const targetId = row?.dataset.layerId
  if (!row || !targetId) return
  const rect = row.getBoundingClientRect()
  drag.targetId = targetId
  drag.position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  dragOverLayerId.value = targetId
  dragOverPosition.value = drag.position
}

function cleanupLayerPointer() {
  layerPointerDrag = null
  draggedLayerId.value = null
  dragOverLayerId.value = null
  dragOverPosition.value = 'before'
  document.body.classList.remove('layer-reordering')
  window.removeEventListener('pointermove', moveLayerPointer)
  window.removeEventListener('pointerup', finishLayerPointer)
  window.removeEventListener('pointercancel', cancelLayerPointer)
}

function finishLayerPointer(event: PointerEvent) {
  const drag = layerPointerDrag
  if (!drag || drag.pointerId !== event.pointerId) return
  if (drag.moved && drag.sourceId !== drag.targetId) reorderLayer(drag.sourceId, drag.targetId, drag.position)
  cleanupLayerPointer()
}

function cancelLayerPointer() {
  cleanupLayerPointer()
}

function selectLayer(id: string) {
  editorStore.select(id)
}

function onAssetSettingsChanged() {
  currentFolderId.value = null
  void loadLibrary()
}

onMounted(() => {
  window.addEventListener('motionframe:asset-settings', onAssetSettingsChanged)
  if (apiConfigured.value) void loadLibrary()
})

onBeforeUnmount(() => {
  window.removeEventListener('motionframe:asset-settings', onAssetSettingsChanged)
  cleanupLayerPointer()
})
</script>

<template>
  <aside class="left-panel panel capcut-left-panel">
    <nav class="media-nav-rail" aria-label="编辑资源">
      <button
        v-for="item in navItems"
        :key="item.id"
        :class="{ active: section === item.id }"
        :title="item.label"
        @click="section = item.id"
      >
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <section class="left-content-panel">
      <header class="resource-panel-header">
        <strong>{{ sectionTitle }}</strong>
        <small v-if="section === 'assets'">{{ apiConfigured ? '素材服务器已连接' : '未配置素材服务器' }}</small>
        <small v-else-if="section === 'scenes'">{{ editorStore.project.scenes.length }} 个场景 · {{ totalDuration.toFixed(1) }}s</small>
        <small v-else-if="section === 'layers'">{{ orderedLayers.length }} 个图层</small>
      </header>

      <div v-if="section === 'assets'" class="panel-scroll asset-panel capcut-resource-panel">
        <input ref="fileInput" hidden multiple type="file" accept="image/*,video/*" @change="onUploadChange" />
        <button class="compact-upload-button" :disabled="uploading" @click="fileInput?.click()">
          <Upload :size="15" />
          <span>{{ uploading ? '正在上传…' : '上传图片或视频' }}</span>
        </button>

        <div class="folder-toolbar">
          <button :class="{ active: currentFolderId === null }" @click="openFolder(null)">全部</button>
          <span v-if="currentFolder">/ {{ currentFolder.name }}</span>
        </div>
        <div class="folder-create">
          <input v-model="newFolderName" placeholder="新文件夹" @keyup.enter="createFolder" />
          <button @click="createFolder"><Plus :size="14" /></button>
        </div>
        <div v-if="folders.length" class="folder-list">
          <button v-for="folder in folders" :key="folder.id" :class="{ active: folder.id === currentFolderId }" @click="openFolder(folder.id)"><span>{{ folder.name }}</span></button>
        </div>

        <div class="section-label">素材库</div>
        <div v-if="loadingAssets" class="asset-empty">正在读取素材库…</div>
        <div v-else-if="!apiConfigured" class="asset-empty">从右上角设置素材服务器</div>
        <div v-else-if="!assets.length" class="asset-empty">当前文件夹暂无素材</div>
        <div v-else class="asset-grid remote-asset-grid">
          <button v-for="asset in assets" :key="asset.id" class="asset-card remote-asset-card" @click="addAsset(asset)">
            <img v-if="asset.type === 'image' && (asset.thumbnailUrl || asset.downloadUrl)" :src="asset.thumbnailUrl || asset.downloadUrl" :alt="asset.name" />
            <div v-else class="video-thumb"><Clapperboard :size="22" /></div>
            <span>{{ asset.name }}</span>
            <small :class="{ cached: cachedMap[asset.id] }">{{ cachedMap[asset.id] ? '已缓存' : asset.type === 'video' ? `${asset.duration?.toFixed(1) ?? '--'}s` : '图片' }}</small>
          </button>
        </div>

        <div class="section-label">演示素材</div>
        <div class="asset-grid">
          <button v-for="asset in demoAssets" :key="asset.id" class="asset-card" @click="editorStore.addDemoAsset(asset.id, currentTime)">
            <img :src="asset.src" :alt="asset.name" />
            <span>{{ asset.name }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="section === 'text'" class="panel-scroll capcut-resource-panel resource-choice-panel">
        <button class="resource-choice large" @click="addTextVariant('title')"><Type :size="25" /><strong>添加主标题</strong><small>大字号、粗体</small></button>
        <button class="resource-choice" @click="addTextVariant('subtitle')"><Type :size="20" /><strong>添加副标题</strong><small>中等字号</small></button>
        <button class="resource-choice" @click="addTextVariant('caption')"><Type :size="17" /><strong>添加说明文字</strong><small>适合注释和卖点</small></button>
      </div>

      <div v-else-if="section === 'shapes'" class="panel-scroll capcut-resource-panel">
        <div class="resource-grid">
          <button @click="editorStore.addShape('rect', currentTime)"><Square :size="28" /><span>矩形</span></button>
          <button @click="editorStore.addShape('circle', currentTime)"><Circle :size="28" /><span>圆形</span></button>
          <button @click="editorStore.addShape('star', currentTime)"><Star :size="29" /><span>贴纸</span></button>
        </div>
      </div>

      <div v-else-if="section === 'animation'" class="panel-scroll capcut-resource-panel">
        <div class="resource-note"><Sparkles :size="17" /><div><strong>快速普通动画</strong><small>会接在当前元素最后一段普通动画之后。</small></div></div>
        <div class="animation-resource-grid">
          <button @click="addQuickMotion('right')"><ArrowRight :size="19" /><span>向右</span></button>
          <button @click="addQuickMotion('left')"><ArrowLeft :size="19" /><span>向左</span></button>
          <button @click="addQuickMotion('up')"><ArrowUp :size="19" /><span>向上</span></button>
          <button @click="addQuickMotion('down')"><ArrowDown :size="19" /><span>向下</span></button>
          <button @click="addQuickMotion('grow')"><Maximize2 :size="19" /><span>放大</span></button>
          <button @click="addQuickMotion('rotate')"><RotateCw :size="19" /><span>旋转</span></button>
        </div>
        <p class="resource-help">添加后可在右侧“普通”中组合位移、缩放、旋转和透明度，也能继续设置接续或并列。</p>
      </div>

      <div v-else-if="section === 'scenes'" class="panel-scroll scene-panel capcut-resource-panel">
        <div v-for="(sceneItem, index) in editorStore.project.scenes" :key="sceneItem.id" class="scene-row-wrap">
          <button class="scene-row" :class="{ active: sceneItem.id === editorStore.project.currentSceneId }" @click="editorStore.switchScene(sceneItem.id)">
            <span class="scene-index">{{ index + 1 }}</span>
            <span class="scene-copy"><strong>{{ sceneItem.name }}</strong><small>{{ sceneItem.elements.length }} 个元素</small></span>
            <span class="scene-duration">{{ sceneItem.duration.toFixed(1) }}s</span>
          </button>
          <div class="scene-order-actions">
            <button :disabled="index === 0" title="场景上移" @click="moveScene(sceneItem.id, -1)"><ArrowUp :size="13" /></button>
            <button :disabled="index === editorStore.project.scenes.length - 1" title="场景下移" @click="moveScene(sceneItem.id, 1)"><ArrowDown :size="13" /></button>
          </div>
        </div>
        <div class="scene-transition-actions">
          <button @click="addExitToAllElements(0.5)">当前场景全体淡出</button>
          <small>在场景最后 0.5 秒统一退场。</small>
        </div>
        <div class="scene-actions capcut-scene-actions">
          <button @click="editorStore.addScene"><Plus :size="13" />新场景</button>
          <button @click="editorStore.duplicateScene"><Copy :size="13" />复制</button>
          <button @click="editorStore.deleteScene"><Trash2 :size="13" />删除</button>
        </div>
        <button class="clear-scene-button" :disabled="!editorStore.currentScene.value.elements.length" @click="clearCurrentScene">清空当前场景画布</button>
      </div>

      <div v-else class="panel-scroll layer-panel capcut-resource-panel">
        <div class="layer-drag-tip">按住图层名称上下拖动。列表越靠上，画布层级越高。</div>
        <div
          v-for="element in orderedLayers"
          :key="element.id"
          :data-layer-id="element.id"
          class="layer-row layer-row-v5"
          :class="{
            active: element.id === editorStore.selectedId.value,
            dragging: element.id === draggedLayerId,
            'drop-before': element.id === dragOverLayerId && element.id !== draggedLayerId && dragOverPosition === 'before',
            'drop-after': element.id === dragOverLayerId && element.id !== draggedLayerId && dragOverPosition === 'after',
          }"
          role="button"
          tabindex="0"
          :aria-label="`图层 ${element.name}`"
          @pointerdown="startLayerPointer(element.id, $event)"
          @click="selectLayer(element.id)"
          @keydown.enter="selectLayer(element.id)"
          @keydown.space.prevent="selectLayer(element.id)"
        >
          <span class="layer-name">{{ element.name }}</span>
          <div class="layer-row-actions">
            <button type="button" :title="element.visible ? '隐藏图层' : '显示图层'" @click.stop="editorStore.commit(() => element.visible = !element.visible)"><Eye v-if="element.visible" :size="14" /><EyeOff v-else :size="14" /></button>
            <button type="button" :title="element.locked ? '解锁图层' : '锁定图层'" @click.stop="editorStore.commit(() => element.locked = !element.locked)"><Lock v-if="element.locked" :size="14" /><Unlock v-else :size="14" /></button>
          </div>
        </div>
      </div>
    </section>
  </aside>
</template>