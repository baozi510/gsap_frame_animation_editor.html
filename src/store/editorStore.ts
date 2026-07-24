import { computed, reactive, ref } from 'vue'
import type { EditorElement, Project, Scene } from '@/types/editor'
import { clone, uid } from '@/utils/helpers'
import { demoAssets } from '@/utils/assets'

const STORAGE_KEY = 'motionframe-vue-v1'

const animationDefaults = () => ({
  enter: { preset: 'fade' as const, duration: 0.55, ease: 'power2.out', intensity: 100 },
  hold: { preset: 'none' as const, duration: 3.7, ease: 'sine.inOut', intensity: 18 },
  exit: { preset: 'fade' as const, duration: 0.55, ease: 'power2.in', intensity: 100 },
})

export function makeImage(name: string, src: string, x: number, y: number, width: number, height: number, z: number, start = 0.2): EditorElement {
  return {
    id: uid('el'), type: 'image', name, src, x, y, width, height,
    rotation: 0, alpha: 1, z, visible: true, locked: false, start,
    ...animationDefaults(), style: {},
  }
}

export function makeShape(name: string, x: number, y: number, width: number, height: number, fill: string, z: number, start = 0.4): EditorElement {
  return {
    id: uid('el'), type: 'shape', name, x, y, width, height,
    rotation: 0, alpha: 1, z, visible: true, locked: false, start,
    ...animationDefaults(), style: { fill, radius: 24 },
  }
}

export function makeText(name: string, text: string, x: number, y: number, width: number, height: number, z: number, start = 0.8): EditorElement {
  return {
    id: uid('el'), type: 'text', name, text, x, y, width, height,
    rotation: 0, alpha: 1, z, visible: true, locked: false, start,
    ...animationDefaults(),
    style: { color: '#171923', fontSize: 64, fontWeight: '800', align: 'center', fontFamily: 'Microsoft YaHei' },
  }
}

function defaultProject(): Project {
  const room = demoAssets.find((item) => item.id === 'room')!
  const productAsset = demoAssets.find((item) => item.id === 'product')!
  const cardAsset = demoAssets.find((item) => item.id === 'card')!
  const badgeAsset = demoAssets.find((item) => item.id === 'badge')!

  const background = makeImage('空间背景', room.src, 540, 960, 1080, 1920, 1, 0)
  background.enter = { preset: 'zoom', duration: 1, ease: 'power2.out', intensity: 14 }
  background.hold = { preset: 'zoom', duration: 4, ease: 'none', intensity: 5 }
  background.exit = { preset: 'fade', duration: 0.55, ease: 'power2.in', intensity: 100 }

  const glass = makeShape('标题玻璃底板', 540, 405, 850, 250, '#ffffff', 2, 0.18)
  glass.alpha = 0.93
  glass.style.radius = 48
  glass.enter = { preset: 'left', duration: 0.68, ease: 'power3.out', intensity: 110 }
  glass.hold = { preset: 'none', duration: 3.8, ease: 'none', intensity: 0 }
  glass.exit = { preset: 'up', duration: 0.5, ease: 'power3.in', intensity: 70 }

  const title = makeText('主标题', '让图片动起来', 540, 380, 760, 100, 5, 0.48)
  title.style.fontSize = 72
  title.enter = { preset: 'up', duration: 0.56, ease: 'power3.out', intensity: 80 }
  title.hold = { preset: 'pulse', duration: 3.5, ease: 'sine.inOut', intensity: 2.5 }
  title.exit = { preset: 'fade', duration: 0.38, ease: 'power2.in', intensity: 100 }

  const subtitle = makeText('副标题', '无需学习专业剪辑软件', 540, 485, 760, 64, 5, 0.72)
  subtitle.style.fontSize = 34
  subtitle.style.fontWeight = '500'
  subtitle.style.color = '#626978'
  subtitle.enter = { preset: 'up', duration: 0.5, ease: 'power3.out', intensity: 55 }
  subtitle.hold = { preset: 'none', duration: 3.25, ease: 'none', intensity: 0 }
  subtitle.exit = { preset: 'fade', duration: 0.35, ease: 'power2.in', intensity: 100 }

  const product = makeImage('产品主体', productAsset.src, 540, 1050, 700, 505, 4, 0.6)
  product.enter = { preset: 'pop', duration: 0.8, ease: 'back.out(1.65)', intensity: 45 }
  product.hold = { preset: 'float', duration: 3.2, ease: 'sine.inOut', intensity: 18 }
  product.exit = { preset: 'down', duration: 0.5, ease: 'power3.in', intensity: 100 }

  const card = makeImage('功能卖点', cardAsset.src, 540, 1515, 760, 282, 6, 1.08)
  card.enter = { preset: 'right', duration: 0.64, ease: 'power3.out', intensity: 120 }
  card.hold = { preset: 'none', duration: 2.76, ease: 'none', intensity: 0 }
  card.exit = { preset: 'left', duration: 0.48, ease: 'power3.in', intensity: 110 }

  const badge = makeImage('推荐徽章', badgeAsset.src, 822, 880, 245, 245, 7, 1.38)
  badge.rotation = 8
  badge.enter = { preset: 'rotate', duration: 0.65, ease: 'back.out(1.8)', intensity: 85 }
  badge.hold = { preset: 'swing', duration: 2.6, ease: 'sine.inOut', intensity: 5 }
  badge.exit = { preset: 'zoom', duration: 0.38, ease: 'power2.in', intensity: 55 }

  return {
    version: 1,
    name: '运营短视频模板',
    width: 1080,
    height: 1920,
    fps: 30,
    currentSceneId: 'scene_1',
    scenes: [{ id: 'scene_1', name: '产品展示', duration: 5, background: '#ece9e4', elements: [background, glass, product, title, subtitle, card, badge] }],
  }
}

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Project
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

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

function bump() {
  revision.value += 1
  persist()
}

function snapshot() {
  history.value.push(JSON.stringify(project))
  if (history.value.length > 70) history.value.shift()
  future.value = []
}

function commit(mutator: () => void, message?: string) {
  snapshot()
  mutator()
  bump()
  if (message) notify(message)
}

function replaceProject(next: Project, message?: string) {
  snapshot()
  Object.keys(project).forEach((key) => delete (project as unknown as Record<string, unknown>)[key])
  Object.assign(project, clone(next))
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
  if (message) notify(message)
}

function undo() {
  const previous = history.value.pop()
  if (!previous) return
  future.value.push(JSON.stringify(project))
  const parsed = JSON.parse(previous) as Project
  Object.keys(project).forEach((key) => delete (project as unknown as Record<string, unknown>)[key])
  Object.assign(project, parsed)
  selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  bump()
}

function redo() {
  const next = future.value.pop()
  if (!next) return
  history.value.push(JSON.stringify(project))
  const parsed = JSON.parse(next) as Project
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
  const isBackground = asset.id === 'room'
  const width = isBackground ? project.width : Math.min(700, project.width * 0.72)
  const height = isBackground ? project.height : Math.min(520, project.height * 0.38)
  const element = makeImage(asset.name, asset.src, project.width / 2, project.height / 2, width, height, nextZ(), atTime)
  commit(() => {
    currentScene.value.elements.push(element)
    selectedId.value = element.id
  }, '素材已加入画布')
}

function addShape(kind: 'rect' | 'circle' | 'text' | 'star', atTime = 0) {
  const x = project.width / 2
  const y = project.height / 2
  let element: EditorElement
  if (kind === 'rect') element = makeShape('矩形色块', x, y, 420, 250, '#7a61ff', nextZ(), atTime)
  else if (kind === 'circle') {
    element = makeShape('圆形挂件', x, y, 260, 260, '#36d49d', nextZ(), atTime)
    element.style.radius = 999
  } else if (kind === 'star') {
    element = makeText('星形贴纸', '★', x, y, 240, 240, nextZ(), atTime)
    element.style.color = '#ffb347'
    element.style.fontSize = 200
  } else element = makeText('基础文字', '输入文字', x, y, 650, 130, nextZ(), atTime)
  commit(() => {
    currentScene.value.elements.push(element)
    selectedId.value = element.id
  }, '挂件已添加')
}

function addUploadedImage(file: File, atTime = 0) {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const maxWidth = project.width * 0.74
        const maxHeight = project.height * 0.58
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
        const element = makeImage(file.name.replace(/\.[^.]+$/, ''), String(reader.result), project.width / 2, project.height / 2, image.width * scale, image.height * scale, nextZ(), atTime)
        commit(() => {
          currentScene.value.elements.push(element)
          selectedId.value = element.id
        }, '图片已上传')
        resolve()
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function removeSelected() {
  if (!selectedId.value) return
  const id = selectedId.value
  commit(() => {
    currentScene.value.elements = currentScene.value.elements.filter((element) => element.id !== id)
    selectedId.value = currentScene.value.elements.at(-1)?.id ?? null
  }, '元素已删除')
}

function duplicateSelected() {
  if (!selectedElement.value) return
  const copy = clone(selectedElement.value)
  copy.id = uid('el')
  copy.name += ' 副本'
  copy.x += 34
  copy.y += 34
  copy.z = nextZ()
  commit(() => {
    currentScene.value.elements.push(copy)
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
    project.scenes.push({ id, name: `场景 ${project.scenes.length + 1}`, duration: 5, background: '#eef0f4', elements: [] })
    project.currentSceneId = id
    selectedId.value = null
  }, '场景已添加')
}

function duplicateScene() {
  const copy = clone(currentScene.value)
  copy.id = uid('scene')
  copy.name += ' 副本'
  copy.elements.forEach((element) => { element.id = uid('el') })
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
  const scaleX = width / project.width
  const scaleY = height / project.height
  commit(() => {
    project.scenes.forEach((scene) => scene.elements.forEach((element) => {
      element.x *= scaleX
      element.y *= scaleY
      element.width *= scaleX
      element.height *= scaleY
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
  persist,
  undo,
  redo,
  select,
  addDemoAsset,
  addShape,
  addUploadedImage,
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
