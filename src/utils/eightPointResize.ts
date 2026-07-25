export type ResizeHandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface ResizeSnapshot {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface ResizeResult {
  x: number
  y: number
  width: number
  height: number
}

const HANDLE_VECTOR: Record<ResizeHandleName, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

function rotateLocal(x: number, y: number, rotation: number) {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

export function resizeFromHandle(
  snapshot: ResizeSnapshot,
  handle: ResizeHandleName,
  pointerX: number,
  pointerY: number,
  minimumSize = 40,
): ResizeResult {
  const direction = HANDLE_VECTOR[handle]
  const cos = Math.cos(-snapshot.rotation)
  const sin = Math.sin(-snapshot.rotation)
  const dx = pointerX - snapshot.x
  const dy = pointerY - snapshot.y
  const localPointer = {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  }

  const anchor = {
    x: direction.x === 0 ? 0 : -direction.x * snapshot.width / 2,
    y: direction.y === 0 ? 0 : -direction.y * snapshot.height / 2,
  }

  let width = snapshot.width
  let height = snapshot.height
  let movingX = direction.x === 0 ? 0 : localPointer.x
  let movingY = direction.y === 0 ? 0 : localPointer.y

  if (direction.x !== 0 && direction.y !== 0) {
    const widthCandidate = Math.max(0, direction.x * (localPointer.x - anchor.x))
    const heightCandidate = Math.max(0, direction.y * (localPointer.y - anchor.y))
    const minimumScale = Math.max(minimumSize / snapshot.width, minimumSize / snapshot.height)
    const scale = Math.max(minimumScale, widthCandidate / snapshot.width, heightCandidate / snapshot.height)
    width = snapshot.width * scale
    height = snapshot.height * scale
    movingX = anchor.x + direction.x * width
    movingY = anchor.y + direction.y * height
  } else if (direction.x !== 0) {
    width = Math.max(minimumSize, direction.x * (localPointer.x - anchor.x))
    movingX = anchor.x + direction.x * width
  } else if (direction.y !== 0) {
    height = Math.max(minimumSize, direction.y * (localPointer.y - anchor.y))
    movingY = anchor.y + direction.y * height
  }

  const localCenter = {
    x: direction.x === 0 ? 0 : (anchor.x + movingX) / 2,
    y: direction.y === 0 ? 0 : (anchor.y + movingY) / 2,
  }
  const centerOffset = rotateLocal(localCenter.x, localCenter.y, snapshot.rotation)

  return {
    x: snapshot.x + centerOffset.x,
    y: snapshot.y + centerOffset.y,
    width,
    height,
  }
}
