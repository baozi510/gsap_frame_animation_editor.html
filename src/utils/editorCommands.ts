import { editorStore } from '@/store/editorStore'
import type { AnimationClip, EditorElement, ProjectAsset, Scene } from '@/types/editor'
import { clamp, clone, uid } from '@/utils/helpers'

function normalizeLayerOrder() {
  const ordered = [...editorStore.currentScene.value.elements].sort((a, b) => a.z - b.z)
  ordered.forEach((element, index) => { element.z = index + 1 })
  return ordered
}

export function clearCurrentScene() {
  if (!editorStore.currentScene.value.elements.length) return
  if (!window.confirm('确定清空当前场景中的全部元素吗？')) return
  editorStore.commit(() => {
    editorStore.currentScene.value.elements = []
    editorStore.selectedId.value = null
  }, '当前场景已清空')
}

export function moveSelectedLayer(direction: 'up' | 'down' | 'top' | 'bottom') {
  const selectedId = editorStore.selectedId.value
  if (!selectedId) return
  editorStore.commit(() => {
    const ordered = normalizeLayerOrder()
    const index = ordered.findIndex((element) => element.id === selectedId)
    if (index < 0) return
    let target = index
    if (direction === 'up') target = Math.min(ordered.length - 1, index + 1)
    if (direction === 'down') target = Math.max(0, index - 1)
    if (direction === 'top') target = ordered.length - 1
    if (direction === 'bottom') target = 0
    const [element] = ordered.splice(index, 1)
    ordered.splice(target, 0, element)
    ordered.forEach((item, order) => { item.z = order + 1 })
  }, '元素层级已调整')
}

export function moveScene(sceneId: string, direction: -1 | 1) {
  editorStore.commit(() => {
    const index = editorStore.project.scenes.findIndex((scene) => scene.id === sceneId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= editorStore.project.scenes.length) return
    const [scene] = editorStore.project.scenes.splice(index, 1)
    editorStore.project.scenes.splice(target, 0, scene)
  }, '场景顺序已调整')
}

export function addExitToAllElements(exitDuration = 0.5) {
  const scene = editorStore.currentScene.value
  if (!scene.elements.length) return
  editorStore.commit(() => {
    scene.elements.forEach((element) => {
      const remaining = Math.max(0.1, scene.duration - element.start)
      element.duration = remaining
      const duration = Math.min(exitDuration, remaining)
      const clip: AnimationClip = {
        id: uid('anim'),
        phase: 'exit',
        offset: Math.max(0, remaining - duration),
        duration,
        preset: 'fade',
        ease: 'power2.in',
        intensity: 100,
      }
      element.animations = element.animations.filter((item) => item.phase !== 'exit')
      element.animations.push(clip)
    })
  }, '已为当前场景全部元素添加统一退场')
}

function nextZ() {
  return Math.max(0, ...editorStore.currentScene.value.elements.map((element) => element.z)) + 1
}

export function addRemoteAssetToScene(asset: ProjectAsset, atTime = 0) {
  const scene = editorStore.currentScene.value
  const start = clamp(atTime, 0, Math.max(0, scene.duration - 0.1))
  const sourceDuration = asset.type === 'video' && asset.duration ? Math.max(0.1, asset.duration) : null
  const visibleDuration = sourceDuration ?? clamp(scene.duration - start, 0.5, 3)
  const requiredSceneDuration = start + visibleDuration
  const maxWidth = editorStore.project.width * 0.74
  const maxHeight = editorStore.project.height * 0.58
  const sourceWidth = Math.max(1, asset.width || 640)
  const sourceHeight = Math.max(1, asset.height || 360)
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  const element: EditorElement = {
    id: uid('el'),
    type: asset.type,
    name: asset.name.replace(/\.[^.]+$/, ''),
    assetId: asset.id,
    x: editorStore.project.width / 2,
    y: editorStore.project.height / 2,
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

  editorStore.commit(() => {
    const assetIndex = editorStore.project.assets.findIndex((item) => item.id === asset.id)
    if (assetIndex >= 0) editorStore.project.assets[assetIndex] = clone(asset)
    else editorStore.project.assets.push(clone(asset))
    if (sourceDuration && requiredSceneDuration > scene.duration) scene.duration = requiredSceneDuration
    scene.elements.push(element)
    editorStore.selectedId.value = element.id
  }, `${asset.type === 'video' ? '视频' : '图片'}素材已加入画布`)
}

export function getElementMaxDuration(element: EditorElement, scene: Scene) {
  if (element.type !== 'video' || !element.assetId) return Math.max(0.1, scene.duration - element.start)
  const asset = editorStore.project.assets.find((item) => item.id === element.assetId)
  return Math.max(0.1, Math.min(asset?.duration ?? scene.duration, scene.duration - element.start))
}

export function getProjectDuration() {
  return editorStore.project.scenes.reduce((total, scene) => total + scene.duration, 0)
}
