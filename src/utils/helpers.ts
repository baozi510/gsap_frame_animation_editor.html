export const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const radians = (degrees: number) => degrees * Math.PI / 180
export const degrees = (radiansValue: number) => radiansValue * 180 / Math.PI
export const formatTime = (seconds: number) => `${seconds.toFixed(2)}s`
export const svgData = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}
