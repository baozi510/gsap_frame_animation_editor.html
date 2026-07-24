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
  scene: Scene
  onProgress: (progress: ExportProgress) => void
}

export class ExportEngine {
  async canExport(width: number, height: number) {
    if (!('VideoEncoder' in window)) return false
    const codec = await getFirstEncodableVideoCodec(['avc'], { width, height })
    return Boolean(codec)
  }

  async exportCurrentScene({ project, scene, onProgress }: ExportOptions) {
    const exportProject = clone(project)
    exportProject.scenes = [clone(scene)]
    exportProject.currentSceneId = exportProject.scenes[0].id
    const exportScene = exportProject.scenes[0]
    const fps = exportProject.fps
    const totalFrames = Math.ceil(exportScene.duration * fps)

    onProgress({ active: true, percent: 0, title: '初始化导出器', detail: '创建隐藏的 PixiJS 导出画布…' })

    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;'
    document.body.appendChild(host)

    const renderer = new PixiEditorRenderer(exportProject, () => exportScene, () => null)
    let timeline: TimelineEngine | null = null

    try {
      const format = new Mp4OutputFormat({ fastStart: 'in-memory' })
      const codec = await getFirstEncodableVideoCodec(['avc'], { width: exportProject.width, height: exportProject.height })
      if (!codec) throw new Error('当前浏览器没有可用的 H.264 WebCodecs 编码器，请使用最新版 Chrome 或 Edge。')

      await renderer.mount(host)
      renderer.setControlsVisible(false)
      timeline = new TimelineEngine(renderer)
      timeline.compile(exportScene, false)

      const output = new Output({ format, target: new BufferTarget() })
      const source = new CanvasSource(renderer.app!.canvas, {
        codec: 'avc',
        bitrate: 10_000_000,
      })
      output.addVideoTrack(source, { frameRate: fps })
      await output.start()

      const startedAt = performance.now()
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const time = frame / fps
        timeline.seek(time)
        await source.add(time, 1 / fps)

        const percent = ((frame + 1) / totalFrames) * 94
        const elapsed = (performance.now() - startedAt) / 1000
        onProgress({
          active: true,
          percent,
          title: '逐帧渲染与编码',
          detail: `正在处理第 ${frame + 1} / ${totalFrames} 帧 · 已用 ${elapsed.toFixed(1)} 秒`,
        })
        if (frame % 3 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }

      onProgress({ active: true, percent: 96, title: '封装 MP4', detail: '画面帧已完成，正在写入 MP4 文件结构…' })
      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer) throw new Error('MP4 文件生成失败。')
      const blob = new Blob([buffer], { type: 'video/mp4' })
      downloadBlob(blob, `${project.name}-${scene.name}.mp4`)
      onProgress({
        active: true,
        percent: 100,
        title: '导出完成',
        detail: `文件大小 ${(blob.size / 1024 / 1024).toFixed(2)} MB，已触发下载。`,
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
