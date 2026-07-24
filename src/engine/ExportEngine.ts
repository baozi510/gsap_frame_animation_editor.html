import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import type { ExportProgress, Project, Scene } from '@/types/editor'
import { clone, downloadBlob } from '@/utils/helpers'
import { PixiEditorRenderer } from './PixiEditorRenderer'
import { TimelineEngine } from './TimelineEngine'

export interface ExportOptions {
  project: Project
  onProgress: (progress: ExportProgress) => void
}

export class ExportEngine {
  async canExport(width: number, height: number) {
    if (!('VideoEncoder' in window)) return false
    const codec = await getFirstEncodableVideoCodec(['avc'], { width, height })
    return Boolean(codec)
  }

  async exportProject({ project, onProgress }: ExportOptions) {
    const exportProject = clone(project)
    const scenes = exportProject.scenes.map((scene) => clone(scene))
    if (!scenes.length) throw new Error('项目中没有可导出的场景。')
    const fps = exportProject.fps
    const totalFrames = scenes.reduce((total, scene) => total + Math.ceil(scene.duration * fps), 0)
    const totalDuration = scenes.reduce((total, scene) => total + scene.duration, 0)

    onProgress({
      active: true,
      percent: 0,
      title: '初始化完整视频',
      detail: `准备串联 ${scenes.length} 个场景，总时长 ${totalDuration.toFixed(2)} 秒…`,
    })

    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;'
    document.body.appendChild(host)

    let activeScene: Scene = scenes[0]
    const renderer = new PixiEditorRenderer(exportProject, () => activeScene, () => null)
    let timeline: TimelineEngine | null = null

    try {
      const format = new Mp4OutputFormat({ fastStart: 'in-memory' })
      const codec = await getFirstEncodableVideoCodec(['avc'], { width: exportProject.width, height: exportProject.height })
      if (!codec) throw new Error('当前浏览器没有可用的 H.264 WebCodecs 编码器，请使用最新版 Chrome 或 Edge。')

      await renderer.mount(host)
      renderer.setControlsVisible(false)
      timeline = new TimelineEngine(renderer, () => ({
        width: exportProject.width,
        height: exportProject.height,
      }))

      const output = new Output({ format, target: new BufferTarget() })
      const source = new CanvasSource(renderer.app!.canvas, {
        codec: 'avc',
        bitrate: 10_000_000,
      })
      output.addVideoTrack(source, { frameRate: fps })
      await output.start()

      const startedAt = performance.now()
      let processedFrames = 0
      let globalFrame = 0

      for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
        activeScene = scenes[sceneIndex]
        exportProject.currentSceneId = activeScene.id
        await renderer.renderScene()
        timeline.compile(activeScene, false)
        const sceneFrames = Math.ceil(activeScene.duration * fps)

        for (let frame = 0; frame < sceneFrames; frame += 1) {
          const sceneTime = frame / fps
          const outputTime = globalFrame / fps
          await timeline.prepareFrame(sceneTime)
          await source.add(outputTime, 1 / fps)
          globalFrame += 1
          processedFrames += 1

          const percent = (processedFrames / totalFrames) * 94
          const elapsed = (performance.now() - startedAt) / 1000
          onProgress({
            active: true,
            percent,
            title: `正在导出场景 ${sceneIndex + 1} / ${scenes.length}`,
            detail: `${activeScene.name} · 第 ${frame + 1} / ${sceneFrames} 帧 · 已用 ${elapsed.toFixed(1)} 秒`,
          })
          if (processedFrames % 3 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        }
      }

      onProgress({ active: true, percent: 96, title: '封装完整 MP4', detail: '所有场景已串联，正在写入 MP4 文件结构…' })
      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer) throw new Error('MP4 文件生成失败。')
      const blob = new Blob([buffer], { type: 'video/mp4' })
      downloadBlob(blob, `${project.name}.mp4`)
      onProgress({
        active: true,
        percent: 100,
        title: '完整视频导出完成',
        detail: `${scenes.length} 个场景 · ${totalDuration.toFixed(2)} 秒 · ${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      })
      return blob
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onProgress({ active: true, percent: 0, title: '导出失败', detail: message, error: message })
      throw error
    } finally {
      timeline?.destroy()
      renderer.destroy()
      host.remove()
    }
  }
}
