<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editorStore } from '@/store/editorStore'
import { PixiEditorRenderer } from '@/engine/PixiEditorRenderer'
import { TimelineEngine } from '@/engine/TimelineEngine'

const props = withDefaults(defineProps<{ zoom: number; initialTime?: number }>(), { initialTime: 0 })
const emit = defineEmits<{
  ready: []
  time: [value: number]
  playing: [value: boolean]
}>()

const viewport = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const ready = ref(false)
const fitScale = ref(0.34)
let resizeObserver: ResizeObserver | null = null
let renderer: PixiEditorRenderer | null = null
let timeline: TimelineEngine | null = null
let knownSceneId = ''
let knownElementIds = new Set<string>()
let transformAspect: { elementId: string; width: number; height: number } | null = null

const shellStyle = computed(() => {
  const scale = Math.max(0.08, fitScale.value * props.zoom)
  return {
    width: `${editorStore.project.width * scale}px`,
    height: `${editorStore.project.height * scale}px`,
  }
})

function updateFitScale() {
  if (!viewport.value) return
  const rect = viewport.value.getBoundingClientRect()
  const maxWidth = Math.max(120, rect.width - 40)
  const maxHeight = Math.max(120, rect.height - 40)
  fitScale.value = Math.min(maxWidth / editorStore.project.width, maxHeight / editorStore.project.height)
}

function rememberCurrentElements() {
  knownSceneId = editorStore.currentScene.value.id
  knownElementIds = new Set(editorStore.currentScene.value.elements.map((element) => element.id))
}

function visibleSeekTime(time: number) {
  const duration = editorStore.currentScene.value.duration
  const clamped = Math.min(Math.max(0, Number(time || 0)), duration)
  return clamped <= 0 ? Math.min(duration, 0.000001) : Math.min(duration, clamped + 0.000001)
}

function beginTransform() {
  const element = editorStore.selectedElement.value
  transformAspect = element && (element.type === 'image' || element.type === 'video')
    ? { elementId: element.id, width: Math.max(1, element.width), height: Math.max(1, element.height) }
    : null
  return JSON.stringify(editorStore.project)
}

function applyTransform(id: string, updater: (element: typeof editorStore.currentScene.value.elements[number]) => void) {
  const element = editorStore.currentScene.value.elements.find((item) => item.id === id)
  if (!element) return

  const previousWidth = element.width
  const previousHeight = element.height
  updater(element)

  const source = transformAspect
  const dimensionsChanged = Math.abs(element.width - previousWidth) > 0.001 || Math.abs(element.height - previousHeight) > 0.001
  if (!source || source.elementId !== id || !dimensionsChanged) return

  const widthScale = Math.max(0.001, element.width / source.width)
  const heightScale = Math.max(0.001, element.height / source.height)
  const minimumScale = Math.max(40 / source.width, 40 / source.height)
  const scale = Math.max(minimumScale, widthScale, heightScale)
  element.width = source.width * scale
  element.height = source.height * scale
}

async function initialize() {
  if (!host.value) return
  renderer = new PixiEditorRenderer(editorStore.project, () => editorStore.currentScene.value, () => editorStore.selectedId.value)
  renderer.callbacks = {
    onSelect: (id) => editorStore.select(id),
    onTransformStart: beginTransform,
    onTransformLive: applyTransform,
    onTransformEnd: (before) => {
      transformAspect = null
      if (before !== JSON.stringify(editorStore.project)) editorStore.finishLiveEdit(before)
    },
    onAssetError: (message) => editorStore.notify(message),
  }
  await renderer.mount(host.value)
  timeline = new TimelineEngine(renderer, () => ({
    width: editorStore.project.width,
    height: editorStore.project.height,
  }))
  timeline.onTimeChange = (value) => emit('time', value)
  timeline.onPlayingChange = (value) => emit('playing', value)
  timeline.compile(editorStore.currentScene.value, false)
  timeline.seek(visibleSeekTime(props.initialTime))
  rememberCurrentElements()
  ready.value = true
  emit('ready')
  await nextTick()
  updateFitScale()
}

async function refreshAll(keepTime = false) {
  if (!renderer || !timeline) return
  timeline.pause()
  await renderer.resize()
  timeline.compile(editorStore.currentScene.value, keepTime)
  updateFitScale()
}

function syncSelected() {
  const element = editorStore.selectedElement.value
  if (!renderer || !timeline || !element) return
  renderer.syncElement(element)
  timeline.compile(editorStore.currentScene.value, true)
}

function seek(time: number) { timeline?.seek(time <= 0 ? visibleSeekTime(time) : time) }
function play() { timeline?.play() }
function pause() { timeline?.pause() }
function toggle() { timeline?.toggle() }
function previewAnimation(animationId: string) {
  const element = editorStore.selectedElement.value
  if (element) timeline?.previewAnimation(element, animationId)
}
function setLoop(value: boolean) { if (timeline) timeline.loop = value }

watch(() => editorStore.revision.value, async () => {
  if (!ready.value) return
  const scene = editorStore.currentScene.value
  const selected = editorStore.selectedElement.value
  const newlyAdded = scene.id === knownSceneId && Boolean(selected && !knownElementIds.has(selected.id))
  await refreshAll(true)
  if (newlyAdded && selected) timeline?.seek(visibleSeekTime(selected.start))
  rememberCurrentElements()
})

watch(() => editorStore.selectedId.value, () => {
  const selected = editorStore.selectedElement.value
  if (selected && timeline) {
    const end = selected.start + selected.duration
    if (timeline.time < selected.start || timeline.time >= end) timeline.seek(visibleSeekTime(selected.start))
  }
  renderer?.updateSelection()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(updateFitScale)
  if (viewport.value) resizeObserver.observe(viewport.value)
  void initialize()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  timeline?.destroy()
  renderer?.destroy()
})

defineExpose({ refreshAll, syncSelected, seek, play, pause, toggle, previewAnimation, setLoop })
</script>

<template>
  <section ref="viewport" class="canvas-viewport">
    <div class="stage-center">
      <div class="pixi-shell" :style="shellStyle">
        <div ref="host" class="pixi-host" />
        <div v-if="!ready" class="canvas-loading">正在初始化 PixiJS 场景…</div>
      </div>
    </div>
    <div class="canvas-status">
      <span>{{ editorStore.project.width }} × {{ editorStore.project.height }}</span>
      <span>{{ editorStore.project.fps }} FPS</span>
      <span>WebGL</span>
    </div>
  </section>
</template>
