import { computed, reactive, ref } from 'vue'
import type {
  AnimationClip,
  AnimationPhase,
  EditorElement,
  Project,
  ProjectAsset,
  Scene,
} from '@/types/editor'
import { clamp, clone, uid } from '@/utils/helpers'
import { demoAssets } from '@/utils/assets'

const STORAGE_KEY = 'motionframe-vue-v2'
const LEGACY_STORAGE_KEY = 'motionframe-vue-v1'

function animationClip(
  phase: AnimationPhase,
  offset: number,
  duration: number,
  preset: AnimationClip['preset'],
  ease: string,
  intensity: number,
): AnimationClip {
  return {
    id: uid('anim'),
    phase,
    offset,
    duration,
    preset,
    ease,
    intensity,
    ...(phase === 'hold' ? { iterations: 2, loop: true } : {}),
  }
}

function defaultElementDuration(sceneDuration: number, atTime: number) {
  return clamp(sceneDuration - atTime, 0.5, 3)
}

function getSceneContentEnd(scene: Scene) {
  return scene.elements.reduce((end, element) => Math.max(end, element.start + element.duration), 0)
}

function refreshAutoSceneDuration(scene: Scene) {
  if (scene.autoDuration === false) return
  scene.duration = Math.max(0.5, getSceneContentEnd(scene) + Math.max(0, Number(scene.durationOffset ?? 0)))
}

function elementStart(scene: Scene, atTime: number) {
  const upper = scene.autoDuration === false
    ? Math.max(0, scene.duration - 0.1)
    : Math.max(0, scene.duration)
  return clamp(atTime, 0, upper)
}

export function makeImage(
  name: string,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
  z: number,
  start = 0,
  duration = 3,
): EditorElement {
  return {
    id: uid('el'),
    type: 'image',
    name,
    src,
    x,
    y,
    width,
    height,
    rotation: 0,
    alpha: 1,
    z,
    visible: true,
    locked: false,
    start,
    duration,
    animations: [],
    style: {},
  }
}

export function makeShape(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  z: number,
  start = 0,
  duration = 3,
): EditorElement {
  return {
    id: uid('el'),
    type: 'shape',
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    alpha: 1,
    z,
    visible: true,
    locked: false,
    start,
    duration,
    animations: [],
    style: { fill, radius: 24 },
  }
}

export function makeText(
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  z: number,
  start = 0,
  duration = 3,
): EditorElement {
  return {
    id: uid('el'),
    type: 'text',
    name,
    text,
    x,
    y,
    width,
    height,
    rotation: 0,
    alpha: 1,
    z,
    visible: true,
    locked: false,
    start,
    duration,
    animations: [],
    style: {
      color: '#171923',
      fontSize: 64,
      fontWeight: '800',
      align: 'center',
      fontFamily: 'Microsoft YaHei',
    },
  }
}

function defaultProject(): Project {
  const room = demoAssets.find((item) => item.id === 'room')!
  const productAsset = demoAssets.find((item) => item.id === 'product')!
  const cardAsset = demoAssets.find((item) => item.id === 'card')!
  const badgeAsset = demoAssets.find((item) => item.id === 'badge')!

  const background = makeImage('空间背景', room.src, 540, 960, 1080, 1920, 1, 0, 5)
  background.animations = [
    animationClip('enter', 0, 1, 'zoom', 'power2.out', 14),
    animationClip('hold', 1, 3.45, 'zoom', 'none', 5),
    animationClip('exit', 4.45, 0.55, 'fade', 'power2.in', 100),
  ]

  const glass = makeShape('标题玻璃底板', 540, 405, 850, 250, '#ffffff', 2, 0.18, 4.82)
  glass.alpha = 0.93
  glass.style.radius = 48
  glass.animations = [
    animationClip('enter', 0, 0.68, 'left', 'power3.out', 110),
    animationClip('exit', 4.32, 0.5, 'up', 'power3.in', 70),
  ]

  const title = makeText('主标题', '让图片动起来', 540, 380, 760, 100, 5, 0.48, 4.52)
  title.style.fontSize = 72
  title.animations = [
    animationClip('enter', 0, 0.56, 'up', 'power3.out', 80),
    animationClip('hold', 0.56, 3.58, 'pulse', 'sine.inOut', 2.5),
    animationClip('exit', 4.14, 0.38, 'fade', 'power2.in', 100),
  ]

  const subtitle = makeText('副标题', '无需学习专业剪辑软件', 540, 485, 760, 64, 5, 0.72, 4.28)
  subtitle.style.fontSize = 34
  subtitle.style.fontWeight = '500'
  subtitle.style.color = '#626978'
  subtitle.animations = [
    animationClip('enter', 0, 0.5, 'up', 'power3.out', 55),
    animationClip('exit', 3.93, 0.35, 'fade', 'power2.in', 100),
  ]

  const product = makeImage('产品主体', productAsset.src, 540, 1050, 700, 505, 4, 0.6, 4.4)
  product.animations = [
    animationClip('enter', 0, 0.8, 'pop', 'back.out(1.65)', 45),
    animationClip('hold', 0.8, 3.1, 'float', 'sine.inOut', 18),
    animationClip('exit', 3.9, 0.5, 'down', 'power3.in', 100),
  ]

  const card = makeImage('功能卖点', cardAsset.src, 540, 1515, 760, 282, 6, 1.08, 3.92)
  card.animations = [
    animationClip('enter', 0, 0.64, 'right', 'power3.out', 120),
    animationClip('exit', 3.44, 0.48, 'left', 'power3.in', 110),
  ]

  const badge = makeImage('推荐徽章', badgeAsset.src, 822, 880, 245, 245, 7, 1.38, 3.62)
  badge.rotation = 8
  badge.animations = [
    animationClip('enter', 0, 0.65, 'rotate', 'back.out(1.8)', 85),
    animationClip('hold', 0.65, 2.59, 'swing', 'sine.inOut', 5),
    animationClip('exit', 3.24, 0.38, 'zoom', 'power2.in', 55),
  ]

  return {
    version: 2,
    name: '运营短视频模板',
    width: 1080,
    height: 1920,
    fps: 30,
    currentSceneId: 'scene_1',
    assets: [],
    scenes: [{
      id: 'scene_1',
      name: '产品展示',
      duration: 5,
      autoDuration: true,
      durationOffset: 0,
      background: '#ece9e4',
      elements: [background, glass, product, title, subtitle, card, badge],
    }],
  }
}

function legacyAnimations(element: Record<string, unknown>) {
  const enter = element.enter as Record<string, unknown> | undefined
  const hold = element.hold as Record<string, unknown> | undefined
  const exit = element.exit as Record<string, unknown> | undefined
  const enterDuration = Number(enter?.duration ?? 0)
  const holdDuration = Number(hold?.duration ?? 0)
  const exitDuration = Number(exit?.duration ?? 0)
  const duration = Math.max(0.5, enterDuration + holdDuration + exitDuration)
  const animations: AnimationClip[] = []

  if (enter && enterDuration > 0) {
    animations.push(animationClip(
      'enter', 0, enterDuration,
      String(enter.preset ?? 'fade') as AnimationClip['preset'],
      String(enter.ease ?? 'power2.out'),
      Number(enter.intensity ?? 100),
    ))
  }
  if (hold && holdDuration > 0 && hold.preset !== 'none') {
    animations.push(animationClip(
      'hold', enterDuration, holdDuration,
      String(hold.preset ?? 'float') as AnimationClip['preset'],
      String(hold.ease ?? 'sine.inOut'),
      Number(hold.intensity ?? 18),
    ))
  }
  if (exit && exitDuration > 0) {
    animations.push(animationClip(
      'exit', Math.max(0, duration - exitDuration), exitDuration,
      String(exit.preset ?? 'fade') as AnimationClip['preset'],
      String(exit.ease ?? 'power2.in'),
      Number(exit.intensity ?? 100),
    ))
  }
  return { duration, animations }
}

function normalizeElement(raw: Record<string, unknown>, sceneDuration: number): EditorElement {
  const legacy = legacyAnimations(raw)
  const start = clamp(Number(raw.start ?? 0), 0, sceneDuration)
  const duration = clamp(Number(raw.duration ?? legacy.duration), 0.1, Math.max(0.1, sceneDuration - start))
  const animations = Array.isArray(raw.animations)
    ? raw.animations.map((item) => {
      const clip = item as Partial<AnimationClip>
      const phase = clip.phase ?? 'hold'
      const clipDuration = clamp(Number(clip.duration ?? 0.5), 0.05, duration)
      return {
        id: clip.id || uid('anim'),
        phase,
        offset: clamp(Number(clip.offset ?? 0), 0, Math.max(0, duration - clipDuration)),
        duration: clipDuration,
        preset: clip.preset ?? 'fade',
        ease: clip.ease ?? 'power2.out',
        intensity: Number(clip.intensity ?? 100),
        ...(phase === 'hold' ? {
          iterations: clamp(Math.round(Number(clip.iterations ?? 2)), 1, 50),
          loop: clip.loop !== false,
        } : {}),
      } satisfies AnimationClip
    })
    : legacy.animations

  const type = raw.type === 'video' ? 'video' : raw.type === 'shape' ? 'shape' : raw.type === 'text' ? 'text' : 'image'
  return {
    id: String(raw.id ?? uid('el')),
    type,
    name: String(raw.name ?? '未命名元素'),
    src: typeof raw.src === 'string' ? raw.src : undefined,
    assetId: typeof raw.assetId === 'string' ? raw.assetId : undefined,
    text: typeof raw.text === 'string' ? raw.text : undefined,
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    width: Math.max(1, Number(raw.width ?? 100)),
    height: Math.max(1, Number(raw.height ?? 100)),
    rotation: Number(raw.rotation ?? 0),
    alpha: clamp(Number(raw.alpha ?? 1), 0, 1),
    z: Number(raw.z ?? 1),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    start,
    duration,
    animations,
    style: (raw.style as EditorElement['style']) ?? {},
  }
}

export function normalizeProject(rawProject: Project | Record<string, unknown>): Project {
  const raw = rawProject as Record<string, unknown>
  const width = Math.max(1, Number(raw.width ?? 1080))
  const height = Math.max(1, Number(raw.height ?? 1920))
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : []
  const scenes: Scene[] = rawScenes.map((sceneValue, index) => {
    const scene = sceneValue as Record<string, unknown>
    const duration = Math.max(0.5, Number(scene.duration ?? 5))
    const elements = Array.isArray(scene.elements)
      ? scene.elements.map((element) => normalizeElement(element as Record<string, unknown>, duration))
      : []
    const normalized: Scene = {
      id: String(scene.id ?? uid('scene')),
      name: String(scene.name ?? `场景 ${index + 1}`),
      duration,
      autoDuration: scene.autoDuration !== false,
      durationOffset: Math.max(0, Number(scene.durationOffset ?? 0)),
      background: String(scene.background ?? '#eef0f4'),
      elements,
    }
    refreshAutoSceneDuration(normalized)
    return normalized
  })
  if (!scenes.length) scenes.push({
    id: uid('scene'),
    name: '场景 1',
    duration: 0.5,
    autoDuration: true,
    durationOffset: 0,
    background: '#eef0f4',
    elements: [],
  })

  const assets = Array.isArray(raw.assets) ? raw.assets as ProjectAsset[] : []
  const currentSceneId = scenes.some((scene) => scene.id === raw.currentSceneId)
    ? String(raw.currentSceneId)
    : scenes[0].id

  return {
    version: 2,
    name: String(raw.name ?? '未命名项目'),
    width,
    height,
    fps: Number(raw.fps ?? 30),
    currentSceneId,
    assets: clone(assets),
    scenes,
  }
}

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) return normalizeProject(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    // Ignore broken local data.
  }
  return defaultProject()
}

const project = reactive<Project>(loadProject())
const selectedId = ref<string | null>(project.scenes[0]?.elements.at(-1)?.id ?? null)
const history = ref<string[]>([])
const future = ref<string[]>([])
const revision = ref(0)
const toastMessage = ref('')
let toastTimer = 0

const currentScene = computed<Scene>(() => project.scenes.find((scene) => scene.id === project.currentSceneId) ?? project.scenes[0])
const selectedElement = computed<EditorElement | null>(() => currentScene.value.elements.find((element) => element.id === selectedId.value) ?? null)

function notify(message: string) {
  toastMessage.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMessage.value = '' }, 1800)
}

function serializeProject() {
  const output = clone(project)
  output.scenes.forEach((scene) => scene.elements.forEach((element) => {
    if (element.assetId) delete element.src
  }))
  return output
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()))
}

function bump() {
  revision.value += 1
  persist()
}

function snapshot() {
  history.value.push(JSON.stringify(serializeProject()))
  if (history.value.length > 70) history.value.shift()
  future.value = []
}

function commit(mutator: () => void, message?: string) {
  snapshot()
  mutator()
  bump()
  if (message) notify(message)
}

function replaceProject(next: Project | Record<string, unknown>, message?: string) {
  snapshot()
  const normalized = normalizeProject(next)
  Object.keys(project).forEach((key) => delete (project as unknown as Record<string, unknown>)[key])
  Object.assign(project, normalized)
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
  if (message) notify(message)
}

function undo() {
  const previous = history.value.pop()
  if (!previous) return
  future.value.push(JSON.stringify(serializeProject()))
  const parsed = normalizeProject(JSON.parse(previous) as Record<string, unknown>)
  Object.keys(project).forEach((key) => delete (project as unknown as Record<string, unknown>)[key])
  Object.assign(project, parsed)
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
}

function redo() {
  const next = future.value.pop()
  if (!next) return
  history.value.push(JSON.stringify(serializeProject()))
  const parsed = normalizeProject(JSON.parse(next) as Record<string, unknown>)
  Object.keys(project).forEach((key) => delete (project as unknown as Record<string, unknown>)[key])
  Object.assign(project, parsed)
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
}

function select(id: string | null) {
  selectedId.value = id
}

function nextZ() {
  return Math.max(0, ...currentScene.value.elements.map((element) => element.z)) + 1
}

function addDemoAsset(assetId: string, atTime = 0) {
  const asset = demoAssets.find((item) => item.id === assetId)
  if (!asset) return
  const scene = currentScene.value
  const start = elementStart(scene, atTime)
  const duration = defaultElementDuration(scene.duration, start)
  const isBackground = asset.id === 'room'
  const width = isBackground ? project.width : Math.min(700, project.width * 0.72)
  const height = isBackground ? project.height : Math.min(520, project.height * 0.38)
  const element = makeImage(asset.name, asset.src, project.width / 2, project.height / 2, width, height, nextZ(), start, isBackground ? Math.max(0.5, scene.duration - start) : duration)
  commit(() => {
    scene.elements.push(element)
    refreshAutoSceneDuration(scene)
    selectedId.value = element.id
  }, '素材已加入画布')
}

function addShape(kind: 'rect' | 'circle' | 'text' | 'star', atTime = 0) {
  const scene = currentScene.value
  const x = project.width / 2
  const y = project.height / 2
  const start = elementStart(scene, atTime)
  const duration = defaultElementDuration(scene.duration, start)
  let element: EditorElement
  if (kind === 'rect') element = makeShape('矩形色块', x, y, 420, 250, '#7a61ff', nextZ(), start, duration)
  else if (kind === 'circle') {
    element = makeShape('圆形挂件', x, y, 260, 260, '#36d49d', nextZ(), start, duration)
    element.style.radius = 999
  } else if (kind === 'star') {
    element = makeText('星形贴纸', '★', x, y, 240, 240, nextZ(), start, duration)
    element.style.color = '#ffb347'
    element.style.fontSize = 200
  } else element = makeText('基础文字', '输入文字', x, y, 650, 130, nextZ(), start, duration)
  commit(() => {
    scene.elements.push(element)
    refreshAutoSceneDuration(scene)
    selectedId.value = element.id
  }, '挂件已添加')
}

function upsertProjectAsset(asset: ProjectAsset) {
  const index = project.assets.findIndex((item) => item.id === asset.id)
  if (index >= 0) project.assets[index] = clone(asset)
  else project.assets.push(clone(asset))
}

function addLibraryAsset(asset: ProjectAsset, atTime = 0) {
  const scene = currentScene.value
  const start = elementStart(scene, atTime)
  const sourceDuration = asset.type === 'video' && asset.duration ? Math.max(0.1, asset.duration) : null
  const visibleDuration = sourceDuration
    ? scene.autoDuration === false
      ? clamp(sourceDuration, 0.1, Math.max(0.1, scene.duration - start))
      : sourceDuration
    : defaultElementDuration(scene.duration, start)
  const maxWidth = project.width * 0.74
  const maxHeight = project.height * 0.58
  const sourceWidth = Math.max(1, asset.width || 640)
  const sourceHeight = Math.max(1, asset.height || 360)
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  const element: EditorElement = {
    id: uid('el'),
    type: asset.type,
    name: asset.name.replace(/\.[^.]+$/, ''),
    assetId: asset.id,
    x: project.width / 2,
    y: project.height / 2,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
    rotation: 0,
    alpha: 1,
    z: nextZ(),
    visible: true,
    locked: false,
    start,
    duration: visibleDuration,
    animations: [],
    style: {},
  }
  commit(() => {
    upsertProjectAsset(asset)
    scene.elements.push(element)
    refreshAutoSceneDuration(scene)
    selectedId.value = element.id
  }, `${asset.type === 'video' ? '视频' : '图片'}素材已加入画布`)
}

function removeSelected() {
  if (!selectedId.value) return
  const id = selectedId.value
  const scene = currentScene.value
  commit(() => {
    scene.elements = scene.elements.filter((element) => element.id !== id)
    refreshAutoSceneDuration(scene)
    selectedId.value = scene.elements.at(-1)?.id ?? null
  }, '元素已删除')
}

function duplicateSelected() {
  if (!selectedElement.value) return
  const copy = clone(selectedElement.value)
  copy.id = uid('el')
  copy.animations.forEach((clip) => { clip.id = uid('anim') })
  copy.name += ' 副本'
  copy.x += 34
  copy.y += 34
  copy.z = nextZ()
  commit(() => {
    currentScene.value.elements.push(copy)
    refreshAutoSceneDuration(currentScene.value)
    selectedId.value = copy.id
  }, '元素已复制')
}

function centerSelected() {
  if (!selectedElement.value) return
  commit(() => {
    selectedElement.value!.x = project.width / 2
    selectedElement.value!.y = project.height / 2
  }, '元素已居中')
}

function updateElement(mutator: (element: EditorElement) => void, message?: string) {
  if (!selectedElement.value) return
  commit(() => mutator(selectedElement.value!), message)
}

function updateElementLive(mutator: (element: EditorElement) => void) {
  if (!selectedElement.value) return
  mutator(selectedElement.value)
}

function finishLiveEdit(before: string) {
  if (!before || before === JSON.stringify(serializeProject())) return
  history.value.push(before)
  if (history.value.length > 70) history.value.shift()
  future.value = []
  bump()
}

function switchScene(id: string) {
  project.currentSceneId = id
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
}

function addScene() {
  commit(() => {
    const id = uid('scene')
    project.scenes.push({
      id,
      name: `场景 ${project.scenes.length + 1}`,
      duration: 0.5,
      autoDuration: true,
      durationOffset: 0,
      background: '#eef0f4',
      elements: [],
    })
    project.currentSceneId = id
    selectedId.value = null
  }, '场景已添加')
}

function duplicateScene() {
  const copy = clone(currentScene.value)
  copy.id = uid('scene')
  copy.name += ' 副本'
  copy.elements.forEach((element) => {
    element.id = uid('el')
    element.animations.forEach((clip) => { clip.id = uid('anim') })
  })
  commit(() => {
    project.scenes.push(copy)
    project.currentSceneId = copy.id
    selectedId.value = copy.elements.at(-1)?.id ?? null
  }, '场景已复制')
}

function deleteScene() {
  if (project.scenes.length <= 1) {
    notify('至少保留一个场景')
    return
  }
  commit(() => {
    const index = project.scenes.findIndex((scene) => scene.id === project.currentSceneId)
    project.scenes.splice(index, 1)
    project.currentSceneId = project.scenes[Math.max(0, index - 1)].id
    selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  }, '场景已删除')
}

function changeRatio(width: number, height: number) {
  const oldWidth = project.width
  const oldHeight = project.height
  const positionScaleX = width / oldWidth
  const positionScaleY = height / oldHeight
  const containScale = Math.min(positionScaleX, positionScaleY)
  const coverScale = Math.max(positionScaleX, positionScaleY)

  commit(() => {
    project.scenes.forEach((scene) => scene.elements.forEach((element) => {
      const fillsCanvas = Math.abs(element.x - oldWidth / 2) < 2
        && Math.abs(element.y - oldHeight / 2) < 2
        && Math.abs(element.width - oldWidth) < 2
        && Math.abs(element.height - oldHeight) < 2
      element.x *= positionScaleX
      element.y *= positionScaleY
      const scale = fillsCanvas ? coverScale : containScale
      element.width *= scale
      element.height *= scale
    }))
    project.width = width
    project.height = height
  }, '画布比例已切换')
}

export const editorStore = {
  project,
  selectedId,
  currentScene,
  selectedElement,
  history,
  future,
  revision,
  toastMessage,
  commit,
  replaceProject,
  normalizeProject,
  serializeProject,
  persist,
  undo,
  redo,
  select,
  addDemoAsset,
  addShape,
  addLibraryAsset,
  upsertProjectAsset,
  removeSelected,
  duplicateSelected,
  centerSelected,
  updateElement,
  updateElementLive,
  finishLiveEdit,
  switchScene,
  addScene,
  duplicateScene,
  deleteScene,
  changeRatio,
  notify,
}
