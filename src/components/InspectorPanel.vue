<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { editorStore } from '@/store/editorStore'
import MotionAnimationEditor from '@/components/MotionAnimationEditor.vue'
import type { AnimationClip, AnimationPhase, EditorElement } from '@/types/editor'
import { clamp, uid } from '@/utils/helpers'
import { clampMotionClips } from '@/utils/motionClips'
import {
  getElementMaxDuration,
  getSceneContentEnd,
  refreshSceneDuration,
  setSceneAutoDuration,
  setSceneDurationOffset,
} from '@/utils/editorCommands'

const emit = defineEmits<{
  live: []
  preview: [animationId: string]
}>()

const tab = ref<'element' | 'motion' | 'animation' | 'scene'>('element')
const animationPhase = ref<AnimationPhase>('enter')
const animationPhases: AnimationPhase[] = ['enter', 'hold', 'exit']
let previewTimer = 0

const selected = computed(() => editorStore.selectedElement.value)
const selectedClip = computed(() => selected.value?.animations.find((clip) => clip.phase === animationPhase.value) ?? null)
const sceneContentEnd = computed(() => getSceneContentEnd(editorStore.currentScene.value))
const selectedDurationMax = computed(() => selected.value
  ? getElementMaxDuration(selected.value, editorStore.currentScene.value)
  : 0.1)
const selectedStartMax = computed(() => editorStore.currentScene.value.autoDuration === false
  ? Math.max(0, editorStore.currentScene.value.duration - 0.1)
  : 600)
const latestOtherEnd = computed(() => {
  const selectedId = selected.value?.id
  return editorStore.currentScene.value.elements.reduce((end, element) => {
    if (element.id === selectedId) return end
    return Math.max(end, element.start + element.duration)
  }, 0)
})
const durationToLast = computed(() => {
  if (!selected.value) return 0.1
  const requested = Math.max(0.1, latestOtherEnd.value - selected.value.start)
  return Math.min(requested, selectedDurationMax.value)
})
const canExtendToLast = computed(() => Boolean(
  selected.value
  && latestOtherEnd.value > selected.value.start + selected.value.duration + 0.001
  && durationToLast.value > selected.value.duration + 0.001,
))
const enterPresets = [
  ['fade','淡入'], ['left','左侧滑入'], ['right','右侧滑入'], ['up','下方上浮'], ['down','上方落入'], ['pop','弹性放大'], ['zoom','镜头推进'], ['rotate','旋转进入'],
]
const holdPresets = [
  ['float','轻微漂浮'], ['pulse','呼吸缩放'], ['swing','左右摇摆'], ['shake','轻微抖动'], ['zoom','缓慢推进'],
]
const exitPresets = [
  ['fade','淡出'], ['left','向左退出'], ['right','向右退出'], ['up','向上退出'], ['down','向下退出'], ['pop','缩小退出'], ['zoom','放大消失'], ['rotate','旋转退出'],
]
const eases = ['none','power1.out','power2.out','power3.out','power2.in','power3.in','back.out(1.7)','elastic.out(1,0.45)','sine.inOut']

function mutate(mutator: (element: EditorElement) => void) {
  editorStore.updateElementLive(mutator)
  emit('live')
}

function commit(mutator: (element: EditorElement) => void, updateDuration = false) {
  editorStore.updateElement((element) => {
    mutator(element)
    if (updateDuration) refreshSceneDuration(editorStore.currentScene.value)
  })
}

function eventValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
}

function eventNumber(event: Event) {
  return Number(eventValue(event))
}

function queuePreview(delay = 140) {
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    if (!selectedClip.value) return
    emit('preview', selectedClip.value.id)
  }, delay)
}

async function selectAnimationPhase(phase: AnimationPhase) {
  animationPhase.value = phase
  await nextTick()
  if (selectedClip.value) queuePreview(30)
}

function topLeftValue(key: 'x' | 'y') {
  if (!selected.value) return 0
  return key === 'x'
    ? selected.value.x - selected.value.width / 2
    : selected.value.y - selected.value.height / 2
}

function clampElementAnimations(element: EditorElement) {
  element.animations.forEach((clip) => {
    clip.duration = clamp(clip.duration, 0.05, element.duration)
    clip.offset = clamp(clip.offset, 0, Math.max(0, element.duration - clip.duration))
  })
  clampMotionClips(element)
}

function updateNumber(key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha' | 'start' | 'duration', value: string) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return
  commit((element) => {
    const scene = editorStore.currentScene.value
    if (key === 'x') {
      element.x = numberValue + element.width / 2
    } else if (key === 'y') {
      element.y = numberValue + element.height / 2
    } else if (key === 'width') {
      const left = element.x - element.width / 2
      element.width = Math.max(1, numberValue)
      element.x = left + element.width / 2
    } else if (key === 'height') {
      const top = element.y - element.height / 2
      element.height = Math.max(1, numberValue)
      element.y = top + element.height / 2
    } else if (key === 'start') {
      const maxStart = scene.autoDuration === false ? Math.max(0, scene.duration - 0.1) : 600
      element.start = clamp(numberValue, 0, maxStart)
      if (scene.autoDuration === false) {
        element.duration = clamp(element.duration, 0.1, Math.max(0.1, scene.duration - element.start))
        clampElementAnimations(element)
      }
    } else if (key === 'duration') {
      element.duration = clamp(numberValue, 0.1, getElementMaxDuration(element, scene))
      clampElementAnimations(element)
    } else {
      element[key] = numberValue
    }
  }, key === 'start' || key === 'duration')
}

function extendSelectedToLast() {
  if (!selected.value || !canExtendToLast.value) return
  commit((element) => {
    element.duration = durationToLast.value
    clampElementAnimations(element)
  }, true)
}

function updateManualSceneDuration(event: Event) {
  const value = Math.max(0.5, eventNumber(event))
  editorStore.commit(() => {
    editorStore.currentScene.value.duration = value
  }, '场景时长已更新')
}

function segmentPresets(phase: AnimationPhase) {
  if (phase === 'enter') return enterPresets
  if (phase === 'hold') return holdPresets
  return exitPresets
}

function phaseLabel(phase: AnimationPhase) {
  if (phase === 'enter') return '进场'
  if (phase === 'hold') return '强调'
  return '退场'
}

function addAnimation() {
  if (!selected.value || selectedClip.value) return
  const duration = Math.min(animationPhase.value === 'hold' ? 1.6 : 0.6, selected.value.duration)
  const offset = animationPhase.value === 'enter'
    ? 0
    : animationPhase.value === 'exit'
      ? Math.max(0, selected.value.duration - duration)
      : Math.max(0, (selected.value.duration - duration) / 2)
  const defaults: Record<AnimationPhase, Pick<AnimationClip, 'preset' | 'ease' | 'intensity'>> = {
    enter: { preset: 'fade', ease: 'power2.out', intensity: 100 },
    hold: { preset: 'float', ease: 'sine.inOut', intensity: 18 },
    exit: { preset: 'fade', ease: 'power2.in', intensity: 100 },
  }
  commit((element) => {
    const clip: AnimationClip = {
      id: uid('anim'),
      phase: animationPhase.value,
      offset,
      duration,
      ...defaults[animationPhase.value],
    }
    if (animationPhase.value === 'hold') {
      clip.loop = true
      clip.iterations = 2
    }
    element.animations.push(clip)
  })
  queuePreview()
}

function removeAnimation() {
  window.clearTimeout(previewTimer)
  commit((element) => {
    element.animations = element.animations.filter((clip) => clip.phase !== animationPhase.value)
  })
}

function setPreset(preset: string) {
  updateClip((clip) => { clip.preset = preset as AnimationClip['preset'] })
}

function updateClip(mutator: (clip: AnimationClip, element: EditorElement) => void, autoPreview = true) {
  commit((element) => {
    const clip = element.animations.find((item) => item.phase === animationPhase.value)
    if (!clip) return
    mutator(clip, element)
    clip.duration = clamp(clip.duration, 0.05, element.duration)
    clip.offset = clamp(clip.offset, 0, Math.max(0, element.duration - clip.duration))
    if (clip.phase === 'hold') {
      clip.iterations = clamp(Math.round(Number(clip.iterations ?? 1)), 1, 50)
      clip.loop = clip.loop !== false
    }
  })
  if (autoPreview) queuePreview()
}

function setHoldLoop(enabled: boolean) {
  updateClip((clip) => { clip.loop = enabled })
}

function setHoldIterations(value: number) {
  updateClip((clip) => { clip.iterations = clamp(Math.round(value || 1), 1, 50) })
}

onBeforeUnmount(() => window.clearTimeout(previewTimer))
</script>

<template>
  <aside class="right-panel panel">
    <div class="panel-tabs inspector-main-tabs">
      <button :class="{ active: tab === 'element' }" @click="tab = 'element'">元素</button>
      <button :class="{ active: tab === 'motion' }" @click="tab = 'motion'">普通</button>
      <button :class="{ active: tab === 'animation' }" @click="tab = 'animation'">特效</button>
      <button :class="{ active: tab === 'scene' }" @click="tab = 'scene'">场景</button>
    </div>

    <div class="panel-scroll inspector-scroll">
      <template v-if="tab === 'scene'">
        <section class="inspector-section">
          <header><strong>场景设置</strong><small>当前画面</small></header>
          <label class="field-row"><span>名称</span><input v-model="editorStore.currentScene.value.name" @change="editorStore.persist" /></label>
          <label class="field-row switch-field">
            <span>自动时长</span>
            <input type="checkbox" :checked="editorStore.currentScene.value.autoDuration !== false" @change="setSceneAutoDuration(($event.target as HTMLInputElement).checked)" />
          </label>
          <label class="field-row"><span>元素结束</span><output>{{ sceneContentEnd.toFixed(2) }}s</output></label>
          <label class="field-row"><span>尾部 offset</span><input type="number" min="0" max="30" step="0.05" :value="editorStore.currentScene.value.durationOffset ?? 0" @change="setSceneDurationOffset(eventNumber($event))" /></label>
          <label class="field-row"><span>场景时长</span><input type="number" min="0.5" max="600" step="0.05" :disabled="editorStore.currentScene.value.autoDuration !== false" :value="editorStore.currentScene.value.duration" @change="updateManualSceneDuration" /></label>
          <p class="field-help">自动时长 = 最后一个元素播放完成时间 + offset。</p>
          <label class="field-row"><span>背景色</span><input type="color" v-model="editorStore.currentScene.value.background" @change="editorStore.persist" /></label>
          <label class="field-row"><span>帧率</span><select v-model.number="editorStore.project.fps" @change="editorStore.persist"><option :value="25">25 FPS</option><option :value="30">30 FPS</option><option :value="60">60 FPS</option></select></label>
        </section>
      </template>

      <template v-else-if="!selected">
        <div class="empty-inspector">
          <div class="empty-icon">◇</div>
          <strong>选择一个画布元素</strong>
          <span>可以调整位置、显示时长和可选动画。</span>
        </div>
      </template>

      <template v-else-if="tab === 'element'">
        <section class="inspector-section">
          <header><strong>基础属性</strong><small>{{ selected.type }}</small></header>
          <label class="field-row"><span>名称</span><input :value="selected.name" @change="commit(el => el.name = eventValue($event))" /></label>
          <div class="field-grid">
            <label><span>X（左）</span><input type="number" :value="Math.round(topLeftValue('x'))" @change="updateNumber('x', eventValue($event))" /></label>
            <label><span>Y（上）</span><input type="number" :value="Math.round(topLeftValue('y'))" @change="updateNumber('y', eventValue($event))" /></label>
            <label><span>宽</span><input type="number" :value="Math.round(selected.width)" @change="updateNumber('width', eventValue($event))" /></label>
            <label><span>高</span><input type="number" :value="Math.round(selected.height)" @change="updateNumber('height', eventValue($event))" /></label>
          </div>
          <label class="field-row"><span>旋转</span><input type="number" :value="selected.rotation" @change="updateNumber('rotation', eventValue($event))" /></label>
          <label class="field-row"><span>透明度</span><input type="range" min="0" max="1" step="0.01" :value="selected.alpha" @input="mutate(el => el.alpha = eventNumber($event))" /></label>
        </section>

        <section class="inspector-section">
          <header><strong>时间范围</strong><small>独立于动画</small></header>
          <label class="field-row"><span>开始时间</span><input type="number" min="0" :max="selectedStartMax" step="0.05" :value="selected.start" @change="updateNumber('start', eventValue($event))" /></label>
          <div class="field-row duration-field-row">
            <span>显示时长</span>
            <div class="duration-field-control">
              <input type="number" min="0.1" :max="selectedDurationMax" step="0.05" :value="selected.duration" @change="updateNumber('duration', eventValue($event))" />
              <button type="button" :disabled="!canExtendToLast" :title="canExtendToLast ? `延长到最晚元素结束，时长 ${durationToLast.toFixed(2)} 秒` : '当前元素已经播放到最后'" @click="extendSelectedToLast">到最后 {{ durationToLast.toFixed(2) }}s</button>
            </div>
          </div>
          <p class="field-help">自动场景时长开启时，可直接输入超过当前场景长度的时长，场景会随之延长。</p>
        </section>

        <section v-if="selected.type === 'shape'" class="inspector-section">
          <header><strong>形状样式</strong></header>
          <label class="field-row"><span>填充色</span><input type="color" :value="selected.style.fill" @input="mutate(el => el.style.fill = eventValue($event))" /></label>
          <label class="field-row"><span>圆角</span><input type="range" min="0" max="160" :value="selected.style.radius" @input="mutate(el => el.style.radius = eventNumber($event))" /></label>
        </section>

        <section v-if="selected.type === 'text'" class="inspector-section">
          <header><strong>文字内容</strong></header>
          <label class="field-row"><span>内容</span><textarea :value="selected.text" @change="commit(el => el.text = eventValue($event))" /></label>
          <label class="field-row"><span>字号</span><input type="number" :value="selected.style.fontSize" @change="commit(el => el.style.fontSize = eventNumber($event))" /></label>
          <label class="field-row"><span>颜色</span><input type="color" :value="selected.style.color" @input="mutate(el => el.style.color = eventValue($event))" /></label>
        </section>

        <section class="inspector-section action-section">
          <button @click="editorStore.duplicateSelected">复制</button>
          <button class="danger" @click="editorStore.removeSelected">删除</button>
        </section>
      </template>

      <MotionAnimationEditor v-else-if="tab === 'motion'" @preview="emit('preview', $event)" />

      <template v-else>
        <div class="animation-phase-tabs">
          <button
            v-for="phase in animationPhases"
            :key="phase"
            :class="{ active: animationPhase === phase, configured: selected.animations.some(item => item.phase === phase) }"
            @click="selectAnimationPhase(phase)"
          >{{ phaseLabel(phase) }}</button>
        </div>

        <section v-if="!selectedClip" class="inspector-section animation-empty">
          <strong>这个元素没有{{ phaseLabel(animationPhase) }}动画</strong>
          <span>元素本身仍会在设置的时间范围内正常显示。</span>
          <button @click="addAnimation">＋ 添加{{ phaseLabel(animationPhase) }}动画</button>
        </section>

        <section v-else class="inspector-section animation-section">
          <header>
            <strong>{{ phaseLabel(animationPhase) }}动画</strong>
            <button class="preview-link" @click="emit('preview', selectedClip.id)">循环预览</button>
          </header>
          <div class="preset-grid">
            <button
              v-for="preset in segmentPresets(animationPhase)"
              :key="preset[0]"
              :class="{ active: selectedClip.preset === preset[0] }"
              @click="setPreset(preset[0])"
            >{{ preset[1] }}</button>
          </div>
          <label class="field-row"><span>相对开始</span><input type="number" min="0" :max="selected.duration" step="0.05" :value="selectedClip.offset" @change="updateClip(clip => clip.offset = eventNumber($event))" /></label>
          <label class="field-row"><span>持续时间</span><input type="number" min="0.05" :max="selected.duration" step="0.05" :value="selectedClip.duration" @change="updateClip(clip => clip.duration = eventNumber($event))" /></label>
          <label class="field-row range-with-value"><span>效果强度</span><input type="range" min="0" max="200" step="1" :value="selectedClip.intensity" @input="updateClip(clip => clip.intensity = eventNumber($event))" /><output>{{ Math.round(selectedClip.intensity) }}%</output></label>
          <p class="field-help animation-strength-help">位移动画 100% 表示元素完全位于画布外，超过 100% 会继续远离画布。</p>

          <template v-if="animationPhase === 'hold'">
            <label class="field-row switch-field"><span>循环</span><input type="checkbox" :checked="selectedClip.loop !== false" @change="setHoldLoop(($event.target as HTMLInputElement).checked)" /></label>
            <label class="field-row"><span>次数</span><input type="number" min="1" max="50" step="1" :disabled="selectedClip.loop !== false" :value="selectedClip.iterations ?? 1" @change="setHoldIterations(eventNumber($event))" /></label>
            <p class="field-help">开启循环：在强调时间段内自动重复。关闭循环：按指定次数均匀完成往返动画。</p>
          </template>

          <label class="field-row"><span>缓动曲线</span><select :value="selectedClip.ease" @change="updateClip(clip => clip.ease = eventValue($event))"><option v-for="ease in eases" :key="ease" :value="ease">{{ ease }}</option></select></label>
          <button class="remove-animation" @click="removeAnimation">删除这个动画</button>
        </section>
      </template>
    </div>
  </aside>
</template>
