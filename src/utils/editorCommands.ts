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
    refreshSceneDuration(editorStore.currentScene.value)
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
    editorStore.currentScene.value.elements.splice(0, editorStore.currentScene.value.elements.length, ...ordered)
  }, '元素层级已调整')
}

export type LayerDropPosition = 'before' | 'after'

export function reorderLayer(draggedId: string, targetId: string, position: LayerDropPosition = 'before') {
  if (draggedId === targetId) return
  const scene = editorStore.currentScene.value
  const frontToBack = [...scene.elements].sort((a, b) => b.z - a.z)
  const from = frontToBack.findIndex((item) => item.id === draggedId)
  if (from < 0) return

  const [moved] = frontToBack.splice(from, 1)
  const targetIndex = frontToBack.findIndex((item) => item.id === targetId)
  if (targetIndex < 0) return
  const insertIndex = targetIndex + (position === 'after' ? 1 : 0)
  frontToBack.splice(insertIndex, 0, moved)

  const backToFront = [...frontToBack].reverse()
  const unchanged = backToFront.every((item, index) => scene.elements[index]?.id === item.id)
  if (unchanged) return

  editorStore.commit(() => {
    backToFront.forEach((item, index) => { item.z = index + 1 })
    scene.elements.splice(0, scene.elements.length, ...backToFront)
  }, '图层顺序已调整')
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export function alignSelected(mode: AlignMode) {
  const element = editorStore.selectedElement.value
  if (!element) return
  editorStore.updateElement((target) => {
    if (mode === 'left') target.x = target.width / 2
    if (mode === 'hcenter') target.x = editorStore.project.width / 2
    if (mode === 'right') target.x = editorStore.project.width - target.width / 2
    if (mode === 'top') target.y = target.height / 2
    if (mode === 'vcenter') target.y = editorStore.project.height / 2
    if (mode === 'bottom') target.y = editorStore.project.height - target.height / 2
  }, '元素已对齐到画布')
}

export function changeCanvasRatio(width: number, height: number) {
  const project = editorStore.project
  const oldWidth = project.width
  const oldHeight = project.height
  if (oldWidth === width && oldHeight === height) return

  const scaleX = width / oldWidth
  const scaleY = height / oldHeight
  const containScale = Math.min(scaleX, scaleY)
  const coverScale = Math.max(scaleX, scaleY)

  editorStore.commit(() => {
    project.scenes.forEach((scene) => scene.elements.forEach((element) => {
      const coveredOldCanvas = Math.abs(element.x - oldWidth / 2) < 2
        && Math.abs(element.y - oldHeight / 2) < 2
        && element.width >= oldWidth - 2
        && element.height >= oldHeight - 2
      const elementScale = coveredOldCanvas ? coverScale : containScale

      element.x = coveredOldCanvas ? width / 2 : element.x * scaleX
      element.y = coveredOldCanvas ? height / 2 : element.y * scaleY
      element.width *= elementScale
      element.height *= elementScale
      if (typeof element.style.fontSize === 'number') element.style.fontSize *= elementScale
      if (typeof element.style.radius === 'number') element.style.radius *= elementScale
    }))
    project.width = width
    project.height = height
  }, '画布比例已切换，元素保持等比')
}

export function getSceneContentEnd(scene: Scene) {
  return scene.elements.reduce((end, element) => Math.max(end, element.start + element.duration), 0)
}

export function refreshSceneDuration(scene: Scene = editorStore.currentScene.value) {
  if (scene.autoDuration === false) return scene.duration
  const offset = Math.max(0, Number(scene.durationOffset ?? 0))
  scene.duration = Math.max(0.5, getSceneContentEnd(scene) + offset)
  return scene.duration
}

export function setSceneAutoDuration(enabled: boolean) {
  editorStore.commit(() => {
    const scene = editorStore.currentScene.value
    scene.autoDuration = enabled
    if (enabled) refreshSceneDuration(scene)
  }, enabled ? '场景时长已设为自动' : '场景时长已设为手动')
}

export function setSceneDurationOffset(value: number) {
  editorStore.commit(() => {
    const scene = editorStore.currentScene.value
    scene.durationOffset = Math.max(0, value || 0)
    refreshSceneDuration(scene)
  }, '场景尾部 offset 已更新')
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
    const contentEnd = Math.max(getSceneContentEnd(scene), scene.duration)
    scene.elements.forEach((element) => {
      const remaining = Math.max(0.1, contentEnd - element.start)
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
    refreshSceneDuration(scene)
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
  const maxWidth = editorStore.project.width * 0.74
  const maxHeight = editorStore.project.height * 0.58
  const sourceWidth = Math.max(1, asset.width || 640)
  const sourceHeight = Math.max(1, asset.height || 360)
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const element: EditorElement = {
    id: uid('el'),
    type: asset.type,
    name: asset.name.replace(/\.[^.]+$/, ''),
    assetId: asset.id,
    x: editorStore.project.width / 2,
    y: editorStore.project.height / 2,
    width,
    height,
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
    scene.elements.push(element)
    if (sourceDuration && scene.autoDuration === false && start + sourceDuration > scene.duration) {
      scene.duration = start + sourceDuration
    }
    refreshSceneDuration(scene)
    editorStore.selectedId.value = element.id
  }, `${asset.type === 'video' ? '视频' : '图片'}素材已加入画布`)
}

export function getElementMaxDuration(element: EditorElement, scene: Scene) {
  const manualLimit = Math.max(0.1, scene.duration - element.start)
  const timelineLimit = scene.autoDuration === false ? manualLimit : 600
  if (element.type !== 'video' || !element.assetId) return timelineLimit
  const asset = editorStore.project.assets.find((item) => item.id === element.assetId)
  const sourceDuration = Math.max(0.1, asset?.duration ?? timelineLimit)
  return scene.autoDuration === false ? Math.max(0.1, Math.min(sourceDuration, manualLimit)) : sourceDuration
}

export function getProjectDuration() {
  return editorStore.project.scenes.reduce((total, scene) => total + scene.duration, 0)
}
