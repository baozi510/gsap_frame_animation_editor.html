<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import CanvasEditor from '@/components/CanvasEditor.vue'
import LeftPanel from '@/components/LeftPanel.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import TimelinePanel from '@/components/TimelinePanel.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { editorStore } from '@/store/editorStore'
import { ExportEngine } from '@/engine/ExportEngine'
import type { AnimationPhase, ExportProgress, Project } from '@/types/editor'
import { downloadBlob } from '@/utils/helpers'
import { alignSelected, clearCurrentScene } from '@/utils/editorCommands'

const canvas = ref<InstanceType<typeof CanvasEditor> | null>(null)
const currentTime = ref(0)
const playing = ref(false)
const loop = ref(false)
const zoom = ref(1)
const projectInput = ref<HTMLInputElement | null>(null)
const settingsOpen = ref(false)
const exportSupported = ref<boolean | null>(null)
const exportProgress = reactive<ExportProgress>({ active: false, percent: 0, title: '', detail: '' })
const exportEngine = new ExportEngine()

const ratioKey = computed(() => `${editorStore.project.width}x${editorStore.project.height}`)
const ratios = [
  { label: '9:16', width: 1080, height: 1920 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '16:9', width: 1920, height: 1080 },
  { label: '4:5', width: 1080, height: 1350 },
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

function preview(phase: AnimationPhase) {
  canvas.value?.previewSegment(phase)
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

onUnmounted(() => window.removeEventListener('keydown', keyboard))
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">M</span>
        <div><strong>MotionFrame</strong><small>PixiJS 动画编辑器</small></div>
      </div>
      <input v-model="editorStore.project.name" class="project-name" @change="editorStore.persist" />
      <div class="top-divider" />
      <button class="icon-button" :disabled="!editorStore.history.value.length" title="撤销" @click="editorStore.undo">↶</button>
      <button class="icon-button" :disabled="!editorStore.future.value.length" title="重做" @click="editorStore.redo">↷</button>
      <div class="ratio-group">
        <button
          v-for="ratio in ratios"
          :key="ratio.label"
          :class="{ active: ratioKey === `${ratio.width}x${ratio.height}` }"
          @click="editorStore.changeRatio(ratio.width, ratio.height)"
        >{{ ratio.label }}</button>
      </div>
      <div class="top-spacer" />
      <input ref="projectInput" hidden type="file" accept="application/json" @change="onProjectInputChange" />
      <button class="top-button" @click="projectInput?.click()">导入</button>
      <button class="top-button" @click="saveProjectFile">项目 JSON</button>
      <button
        class="top-button export-button"
        :disabled="exportSupported === false"
        :title="exportSupported === false ? '当前浏览器不支持 H.264 WebCodecs' : '按场景顺序导出完整 MP4'"
        @click="exportMp4"
      >导出完整 MP4</button>
      <button class="settings-trigger" title="设置" aria-label="设置" @click="settingsOpen = true">⚙</button>
    </header>

    <section class="workspace">
      <LeftPanel :current-time="currentTime" />

      <section class="canvas-column">
        <div class="canvas-toolbar">
          <div class="toolbar-group alignment-toolbar">
            <span class="toolbar-label">对齐到画布</span>
            <button title="左对齐" @click="alignSelected('left')">左</button>
            <button title="水平居中" @click="alignSelected('hcenter')">水平中</button>
            <button title="右对齐" @click="alignSelected('right')">右</button>
            <button title="上对齐" @click="alignSelected('top')">上</button>
            <button title="垂直居中" @click="alignSelected('vcenter')">垂直中</button>
            <button title="下对齐" @click="alignSelected('bottom')">下</button>
          </div>
          <div class="toolbar-group">
            <button @click="editorStore.duplicateSelected">复制</button>
            <button @click="editorStore.removeSelected">删除</button>
            <button class="danger-toolbar" @click="clearCurrentScene">清空画布</button>
          </div>
          <div class="toolbar-group zoom-group">
            <button @click="setZoom(zoom / 1.12)">－</button>
            <span>{{ Math.round(zoom * 100) }}%</span>
            <button @click="setZoom(zoom * 1.12)">＋</button>
            <button @click="setZoom(1)">适配</button>
          </div>
        </div>
        <CanvasEditor
          ref="canvas"
          :zoom="zoom"
          @time="currentTime = $event"
          @playing="playing = $event"
        />
      </section>

      <InspectorPanel @live="syncSelected" @preview="preview" />
    </section>

    <TimelinePanel
      :current-time="currentTime"
      :playing="playing"
      :loop="loop"
      @seek="seek"
      @toggle="canvas?.toggle()"
      @frame="frame"
      @loop="toggleLoop"
    />

    <div v-if="editorStore.toastMessage.value" class="toast">{{ editorStore.toastMessage.value }}</div>
    <ExportDialog :progress="exportProgress" @close="closeExport" />
    <SettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
  </main>
</template>
