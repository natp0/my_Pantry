import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export type CropBox = {
  top: number
  left: number
  bottom: number
  right: number
}

const MIN_SPAN = 80

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

export function PhotoCropper({
  src,
  box,
  onChange,
}: {
  src: string
  box: CropBox
  onChange: (box: CropBox) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    kind: Handle
    startX: number
    startY: number
    box: CropBox
  } | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    function move(event: PointerEvent) {
      const drag = dragRef.current
      const frame = frameRef.current
      if (!drag || !frame) {
        return
      }
      const rect = frame.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) {
        return
      }
      const dx = ((event.clientX - drag.startX) / rect.width) * 1000
      const dy = ((event.clientY - drag.startY) / rect.height) * 1000
      onChangeRef.current(applyDrag(drag.kind, drag.box, dx, dy))
    }

    function end() {
      dragRef.current = null
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
  }, [])

  function start(kind: Handle, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      box,
    }
  }

  return (
    <div ref={frameRef} className="relative max-w-md touch-none select-none overflow-hidden rounded-xl">
      <img src={src} alt="" draggable={false} className="block w-full" />
      <div
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          top: `${box.top / 10}%`,
          left: `${box.left / 10}%`,
          width: `${(box.right - box.left) / 10}%`,
          height: `${(box.bottom - box.top) / 10}%`,
        }}
        onPointerDown={(event) => start('move', event)}
      >
        <CropHandle className="left-0 top-0 cursor-nwse-resize" onPointerDown={(event) => start('nw', event)} />
        <CropHandle className="right-0 top-0 cursor-nesw-resize" onPointerDown={(event) => start('ne', event)} />
        <CropHandle className="bottom-0 left-0 cursor-nesw-resize" onPointerDown={(event) => start('sw', event)} />
        <CropHandle className="bottom-0 right-0 cursor-nwse-resize" onPointerDown={(event) => start('se', event)} />
      </div>
    </div>
  )
}

function CropHandle({
  className,
  onPointerDown,
}: {
  className: string
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  return (
    <span
      className={`absolute h-6 w-6 rounded-full border-2 border-white bg-pantry-leaf ${className}`}
      onPointerDown={onPointerDown}
    />
  )
}

function applyDrag(kind: Handle, start: CropBox, dx: number, dy: number): CropBox {
  if (kind === 'move') {
    const height = start.bottom - start.top
    const width = start.right - start.left
    const top = clamp(start.top + dy, 0, 1000 - height)
    const left = clamp(start.left + dx, 0, 1000 - width)
    return { top, left, bottom: top + height, right: left + width }
  }
  const next = { ...start }
  if (kind === 'nw' || kind === 'ne') {
    next.top += dy
  }
  if (kind === 'sw' || kind === 'se') {
    next.bottom += dy
  }
  if (kind === 'nw' || kind === 'sw') {
    next.left += dx
  }
  if (kind === 'ne' || kind === 'se') {
    next.right += dx
  }
  return clampBox(next)
}

function clampBox(box: CropBox): CropBox {
  let top = clamp(box.top, 0, 1000)
  let left = clamp(box.left, 0, 1000)
  let bottom = clamp(box.bottom, 0, 1000)
  let right = clamp(box.right, 0, 1000)
  if (bottom < top) {
    ;[top, bottom] = [bottom, top]
  }
  if (right < left) {
    ;[left, right] = [right, left]
  }
  if (bottom - top < MIN_SPAN) {
    if (top + MIN_SPAN <= 1000) {
      bottom = top + MIN_SPAN
    } else {
      top = bottom - MIN_SPAN
    }
  }
  if (right - left < MIN_SPAN) {
    if (left + MIN_SPAN <= 1000) {
      right = left + MIN_SPAN
    } else {
      left = right - MIN_SPAN
    }
  }
  return { top, left, bottom, right }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
