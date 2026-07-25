<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  AlignHorizontalJustifyCenter,
  ChevronDown,
  Maximize2,
  Redo2,
  Settings,
  Undo2,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import CanvasEditor from '@/components/CanvasEditor.vue'
import LeftPanel from '@/components/LeftPanel.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import TimelinePanel from '@/components/TimelinePanel.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { editorStore } from '@/store/editorStore'
import { ExportEngine } from '@/engine/ExportEngine'
import type { ExportProgress, Project } from '@/types/editor'
import { downloadBlob } from '@/utils/helpers'
import { alignSelected, changeCanvasRatio, type AlignMode } from '@/utils/editorCommands'

const canvas = ref<InstanceType<typeof CanvasEditor> | null>(null)
const currentTime = ref(0)
const playing = ref(false)
const loop = ref(false)
const zoom = ref(1)
const projectInput = ref<HTMLInputElement | null>(null)
const settingsOpen = ref(false)
const alignMenuOpen = ref(false)
const timelineHeight = ref(300)
const exportSupported = ref<boolean | null>(null)
const exportProgress = reactive<ExportProgress>({ active: false, percent: 0, title: '', detail: '' })
const exportEngine = new ExportEngine()
let timelineResize: { pointerId: number; startY: number; startHeight: number } | null = null

const ratioKey = computed(() => `${editorStore.project.width}x${editorStore.project.height}`)
const appStyle = computed(() => ({ '--timeline-height': `${timelineHeight.value}px` }))
const ratios = [
  { label: '9:16', width: 1080, height: 1920 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '16:9', width: 1920, height: 1080 },
  { label: '4:5', width: 1080, height: 1350 },
]
const alignOptions: Array<{ label: string; mode: AlignMode }> = [
  { label: '左对齐画布', mode: 'left' },
  { label: '水平居中', mode: 'hcenter' },
  { label: '右对齐画布', mode: 'right' },
  { label: '上对齐画布', mode: 'top' },
  { label: '垂直居中', mode: 'vcenter' },
  { label: '下对齐画布', mode: 'bottom' },
]

function seek(value: number) {
  currentTime.value = value
  canvas.value?.seek(value)
}

function frame(direction: -1 | 1) {
  seek(currentTime.value + direction / editorStore.project.fps)
}

function toggleLoop() {
  loop.value = !loop.value
  canvas.value?.setLoop(loop.value)
}

function setZoom(next: number) {
  zoom.value = Math.max(0.45, Math.min(2, next))
}

function syncSelected() {
  canvas.value?.syncSelected()
}

function preview(animationId: string) {
  canvas.value?.previewAnimation(animationId)
}

function applyAlignment(mode: AlignMode) {
  alignSelected(mode)
  alignMenuOpen.value = false
}

function saveProjectFile() {
  const json = JSON.stringify(editorStore.serializeProject(), null, 2)
  downloadBlob(new Blob([json], { type: 'application/json' }), `${editorStore.project.name}.json`)
  editorStore.notify('项目 JSON 已下载')
}

function onProjectInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  importProject(input.files?.[0])
}

function importProject(file?: File) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const project = JSON.parse(String(reader.result)) as Project
      if (!project.scenes || !project.width || !project.height) throw new Error('invalid')
      editorStore.replaceProject(project, '项目已导入，缺失素材会按 assetId 自动下载')
      currentTime.value = 0
    } catch {
      editorStore.notify('无法识别这个项目文件')
    }
  }
  reader.readAsText(file)
  if (projectInput.value) projectInput.value.value = ''
}

async function exportMp4() {
  exportProgress.active = true
  exportProgress.percent = 0
  exportProgress.title = '准备导出完整视频'
  exportProgress.detail = `将按场景列表顺序串联 ${editorStore.project.scenes.length} 个场景…`
  delete exportProgress.error
  canvas.value?.pause()
  try {
    await exportEngine.exportProject({
      project: editorStore.project,
      onProgress: (next) => Object.assign(exportProgress, next),
    })
  } catch (error) {
    console.error(error)
  }
}

function closeExport() {
  exportProgress.active = false
}

function startTimelineResize(event: PointerEvent) {
  if (event.button !== 0) return
  timelineResize = { pointerId: event.pointerId, startY: event.clientY, startHeight: timelineHeight.value }
  document.body.classList.add('timeline-resizing')
  window.addEventListener('pointermove', moveTimelineResize)
  window.addEventListener('pointerup', stopTimelineResize)
  window.addEventListener('pointercancel', stopTimelineResize)
  event.preventDefault()
}

function moveTimelineResize(event: PointerEvent) {
  if (!timelineResize || timelineResize.pointerId !== event.pointerId) return
  const maxHeight = Math.max(240, window.innerHeight * 0.6)
  timelineHeight.value = Math.round(Math.max(180, Math.min(maxHeight, timelineResize.startHeight + timelineResize.startY - event.clientY)))
}

function stopTimelineResize(event?: PointerEvent) {
  if (event && timelineResize && event.pointerId !== timelineResize.pointerId) return
  timelineResize = null
  document.body.classList.remove('timeline-resizing')
  window.removeEventListener('pointermove', moveTimelineResize)
  window.removeEventListener('pointerup', stopTimelineResize)
  window.removeEventListener('pointercancel', stopTimelineResize)
}

function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (event.code === 'Space') {
    event.preventDefault()
    canvas.value?.toggle()
  }
  if (event.key === 'Delete' || event.key === 'Backspace') editorStore.removeSelected()
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) editorStore.redo()
    else editorStore.undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    editorStore.duplicateSelected()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', keyboard)
  try {
    exportSupported.value = await exportEngine.canExport(editorStore.project.width, editorStore.project.height)
  } catch {
    exportSupported.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', keyboard)
  stopTimelineResize()
})
</script>

<template>
  <main class="app-shell capcut-shell" :style="appStyle">
    <header class="topbar capcut-topbar">
      <div class="brand compact-brand">
        <span class="brand-mark">M</span>
        <div><strong>MotionFrame</strong><small>动画编辑器</small></div>
      </div>
      <input v-model="editorStore.project.name" class="project-name" @change="editorStore.persist" />
      <div class="top-divider" />
      <button class="icon-button" :disabled="!editorStore.history.value.length" title="撤销" aria-label="撤销" @click="editorStore.undo"><Undo2 :size="16" /></button>
      <button class="icon-button" :disabled="!editorStore.future.value.length" title="重做" aria-label="重做" @click="editorStore.redo"><Redo2 :size="16" /></button>

      <div class="ratio-group">
        <button
          v-for="ratio in ratios"
          :key="ratio.label"
          :class="{ active: ratioKey === `${ratio.width}x${ratio.height}` }"
          @click="changeCanvasRatio(ratio.width, ratio.height)"
        >{{ ratio.label }}</button>
      </div>

      <div class="toolbar-popover-wrap">
        <button class="top-command-button" :disabled="!editorStore.selectedElement.value" @click="alignMenuOpen = !alignMenuOpen">
          <AlignHorizontalJustifyCenter :size="15" /><span>对齐</span><ChevronDown :size="13" />
        </button>
        <div v-if="alignMenuOpen" class="toolbar-popover align-popover">
          <button v-for="option in alignOptions" :key="option.mode" @click="applyAlignment(option.mode)">{{ option.label }}</button>
        </div>
      </div>

      <div class="top-icon-group top-zoom-group">
        <button class="compact-icon-button" title="缩小画布" @click="setZoom(zoom / 1.12)"><ZoomOut :size="15" /></button>
        <span>{{ Math.round(zoom * 100) }}%</span>
        <button class="compact-icon-button" title="放大画布" @click="setZoom(zoom * 1.12)"><ZoomIn :size="15" /></button>
        <button class="compact-icon-button" title="适配画布" @click="setZoom(1)"><Maximize2 :size="15" /></button>
      </div>

      <div class="top-spacer" />
      <input ref="projectInput" hidden type="file" accept="application/json" @change="onProjectInputChange" />
      <button class="top-button" @click="projectInput?.click()">导入</button>
      <button class="top-button" @click="saveProjectFile">项目</button>
      <button
        class="top-button export-button"
        :disabled="exportSupported === false"
        :title="exportSupported === false ? '当前浏览器不支持 H.264 WebCodecs' : '按场景顺序导出完整 MP4'"
        @click="exportMp4"
      >导出</button>
      <button class="settings-trigger" title="设置" aria-label="设置" @click="settingsOpen = true"><Settings :size="17" /></button>
    </header>

    <section class="workspace capcut-workspace">
      <LeftPanel :current-time="currentTime" />

      <section class="canvas-column">
        <CanvasEditor
          ref="canvas"
          :zoom="zoom"
          @time="currentTime = $event"
          @playing="playing = $event"
        />
      </section>

      <InspectorPanel @live="syncSelected" @preview="preview" />
    </section>

    <div class="timeline-resizer" title="拖动调整时间轴高度" @pointerdown="startTimelineResize"><i /></div>

    <TimelinePanel
      :current-time="currentTime"
      :playing="playing"
      :loop="loop"
      @seek="seek"
      @toggle="canvas?.toggle()"
      @frame="frame"
      @loop="toggleLoop"
      @preview="preview"
    />

    <div v-if="editorStore.toastMessage.value" class="toast">{{ editorStore.toastMessage.value }}</div>
    <ExportDialog :progress="exportProgress" @close="closeExport" />
    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
  </main>
</template>