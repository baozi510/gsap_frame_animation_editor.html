<script setup lang="ts">
import { computed, ref } from 'vue'
import { editorStore } from '@/store/editorStore'
import type { AnimationPhase, EditorElement } from '@/types/editor'

const emit = defineEmits<{
  live: []
  preview: [phase: AnimationPhase]
}>()

const tab = ref<'element' | 'animation' | 'scene'>('element')
const animationPhase = ref<AnimationPhase>('enter')
const animationPhases: AnimationPhase[] = ['enter', 'hold', 'exit']

const selected = computed(() => editorStore.selectedElement.value)
const enterPresets = [
  ['fade','淡入'], ['left','左侧滑入'], ['right','右侧滑入'], ['up','下方上浮'], ['down','上方落入'], ['pop','弹性放大'], ['zoom','镜头推进'], ['rotate','旋转进入'],
]
const holdPresets = [
  ['none','静止'], ['float','轻微漂浮'], ['pulse','呼吸缩放'], ['swing','左右摇摆'], ['shake','轻微抖动'], ['zoom','缓慢推进'],
]
const exitPresets = [
  ['fade','淡出'], ['left','向左退出'], ['right','向右退出'], ['up','向上退出'], ['down','向下退出'], ['pop','缩小退出'], ['zoom','放大消失'], ['rotate','旋转退出'],
]
const eases = ['none','power1.out','power2.out','power3.out','power2.in','power3.in','back.out(1.7)','elastic.out(1,0.45)','sine.inOut']

function mutate(mutator: (element: EditorElement) => void) {
  editorStore.updateElementLive(mutator)
  emit('live')
}

function commit(mutator: (element: EditorElement) => void) {
  editorStore.updateElement(mutator)
}

function eventValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
}

function eventNumber(event: Event) {
  return Number(eventValue(event))
}

function updateNumber(key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha' | 'start', value: string) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return
  commit((element) => { element[key] = numberValue })
}

function setPreset(phase: AnimationPhase, preset: string) {
  commit((element) => {
    element[phase].preset = preset as never
  })
}

function segmentPresets(phase: AnimationPhase) {
  if (phase === 'enter') return enterPresets
  if (phase === 'hold') return holdPresets
  return exitPresets
}

function phaseLabel(phase: AnimationPhase) {
  if (phase === 'enter') return '进场'
  if (phase === 'hold') return '停留'
  return '退场'
}
</script>

<template>
  <aside class="right-panel panel">
    <div class="panel-tabs">
      <button :class="{ active: tab === 'element' }" @click="tab = 'element'">元素</button>
      <button :class="{ active: tab === 'animation' }" @click="tab = 'animation'">动画</button>
      <button :class="{ active: tab === 'scene' }" @click="tab = 'scene'">场景</button>
    </div>

    <div class="panel-scroll inspector-scroll">
      <template v-if="tab === 'scene'">
        <section class="inspector-section">
          <header><strong>场景设置</strong><small>当前画面</small></header>
          <label class="field-row"><span>名称</span><input v-model="editorStore.currentScene.value.name" @change="editorStore.persist" /></label>
          <label class="field-row"><span>时长</span><input type="number" min="1" max="30" step="0.1" v-model.number="editorStore.currentScene.value.duration" @change="editorStore.persist" /></label>
          <label class="field-row"><span>背景色</span><input type="color" v-model="editorStore.currentScene.value.background" @change="editorStore.persist" /></label>
          <label class="field-row"><span>帧率</span><select v-model.number="editorStore.project.fps" @change="editorStore.persist"><option :value="25">25 FPS</option><option :value="30">30 FPS</option><option :value="60">60 FPS</option></select></label>
        </section>
      </template>

      <template v-else-if="!selected">
        <div class="empty-inspector">
          <div class="empty-icon">◇</div>
          <strong>选择一个画布元素</strong>
          <span>可以调整位置、尺寸和动画效果。</span>
        </div>
      </template>

      <template v-else-if="tab === 'element'">
        <section class="inspector-section">
          <header><strong>基础属性</strong><small>{{ selected.type }}</small></header>
          <label class="field-row"><span>名称</span><input :value="selected.name" @change="commit(el => el.name = eventValue($event))" /></label>
          <div class="field-grid">
            <label><span>X</span><input type="number" :value="Math.round(selected.x)" @change="updateNumber('x', eventValue($event))" /></label>
            <label><span>Y</span><input type="number" :value="Math.round(selected.y)" @change="updateNumber('y', eventValue($event))" /></label>
            <label><span>宽</span><input type="number" :value="Math.round(selected.width)" @change="updateNumber('width', eventValue($event))" /></label>
            <label><span>高</span><input type="number" :value="Math.round(selected.height)" @change="updateNumber('height', eventValue($event))" /></label>
          </div>
          <label class="field-row"><span>旋转</span><input type="number" :value="selected.rotation" @change="updateNumber('rotation', eventValue($event))" /></label>
          <label class="field-row"><span>透明度</span><input type="range" min="0" max="1" step="0.01" :value="selected.alpha" @input="mutate(el => el.alpha = eventNumber($event))" /></label>
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
          <button @click="editorStore.centerSelected">居中</button>
          <button @click="editorStore.duplicateSelected">复制</button>
          <button class="danger" @click="editorStore.removeSelected">删除</button>
        </section>
      </template>

      <template v-else>
        <section class="inspector-section">
          <header><strong>时间位置</strong><small>元素何时开始</small></header>
          <label class="field-row"><span>开始时间</span><input type="number" min="0" :max="editorStore.currentScene.value.duration" step="0.05" :value="selected.start" @change="updateNumber('start', eventValue($event))" /></label>
        </section>

        <div class="animation-phase-tabs">
          <button
            v-for="phase in animationPhases"
            :key="phase"
            :class="{ active: animationPhase === phase }"
            @click="animationPhase = phase"
          >{{ phaseLabel(phase) }}</button>
        </div>

        <section class="inspector-section animation-section">
          <header>
            <strong>{{ phaseLabel(animationPhase) }}动画</strong>
            <button class="preview-link" @click="emit('preview', animationPhase)">预览</button>
          </header>
          <div class="preset-grid">
            <button
              v-for="preset in segmentPresets(animationPhase)"
              :key="preset[0]"
              :class="{ active: selected[animationPhase].preset === preset[0] }"
              @click="setPreset(animationPhase, preset[0])"
            >{{ preset[1] }}</button>
          </div>
          <label class="field-row"><span>持续时间</span><input type="number" min="0.1" max="10" step="0.05" :value="selected[animationPhase].duration" @change="commit(el => el[animationPhase].duration = eventNumber($event))" /></label>
          <label class="field-row"><span>效果力度</span><input type="range" min="0" max="160" step="1" :value="selected[animationPhase].intensity" @input="mutate(el => el[animationPhase].intensity = eventNumber($event))" /></label>
          <label class="field-row"><span>缓动曲线</span><select :value="selected[animationPhase].ease" @change="commit(el => el[animationPhase].ease = eventValue($event))"><option v-for="ease in eases" :key="ease" :value="ease">{{ ease }}</option></select></label>
        </section>
      </template>
    </div>
  </aside>
</template>
