<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editorStore } from '@/store/editorStore'
import { PixiEditorRenderer } from '@/engine/PixiEditorRenderer'
import { TimelineEngine } from '@/engine/TimelineEngine'
import type { AnimationPhase } from '@/types/editor'

const props = defineProps<{ zoom: number }>()
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
  const maxWidth = Math.max(120, rect.width - 72)
  const maxHeight = Math.max(120, rect.height - 72)
  fitScale.value = Math.min(maxWidth / editorStore.project.width, maxHeight / editorStore.project.height)
}

async function initialize() {
  if (!host.value) return
  renderer = new PixiEditorRenderer(editorStore.project, () => editorStore.currentScene.value, () => editorStore.selectedId.value)
  renderer.callbacks = {
    onSelect: (id) => editorStore.select(id),
    onTransformStart: () => JSON.stringify(editorStore.project),
    onTransformLive: (id, updater) => {
      const element = editorStore.currentScene.value.elements.find((item) => item.id === id)
      if (element) updater(element)
    },
    onTransformEnd: (before) => editorStore.finishLiveEdit(before),
  }
  await renderer.mount(host.value)
  timeline = new TimelineEngine(renderer)
  timeline.onTimeChange = (value) => emit('time', value)
  timeline.onPlayingChange = (value) => emit('playing', value)
  timeline.compile(editorStore.currentScene.value, false)
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

function seek(time: number) { timeline?.seek(time) }
function play() { timeline?.play() }
function pause() { timeline?.pause() }
function toggle() { timeline?.toggle() }
function previewSegment(phase: AnimationPhase) {
  const element = editorStore.selectedElement.value
  if (element) timeline?.previewSegment(element, phase)
}
function setLoop(value: boolean) { if (timeline) timeline.loop = value }

watch(() => editorStore.revision.value, () => {
  if (ready.value) void refreshAll(false)
})
watch(() => editorStore.selectedId.value, () => renderer?.updateSelection())

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

defineExpose({ refreshAll, syncSelected, seek, play, pause, toggle, previewSegment, setLoop })
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
