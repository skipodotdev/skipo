const EXTENSION_SOURCE = "lich-zoom-extension"
const APP_SOURCE = "lich-app"
const REQUEST_TIMEOUT_MS = 500

type ZoomMessageType = "get-zoom" | "set-zoom"

interface ZoomResponse {
  source?: string
  id?: string
  type?: string
  ok?: boolean
  zoom?: number
}

let nextRequestId = 0

function requestZoom(type: ZoomMessageType, zoom?: number): Promise<number> {
  const id = `zoom-${nextRequestId++}`
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      reject(new Error("native zoom extension did not respond"))
    }, REQUEST_TIMEOUT_MS)

    const onMessage = (event: MessageEvent<ZoomResponse>) => {
      if (event.source !== window) return
      if (event.data?.source !== EXTENSION_SOURCE || event.data.id !== id) return
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      if (event.data.ok && typeof event.data.zoom === "number") {
        resolve(event.data.zoom)
        return
      }
      reject(new Error("native zoom extension rejected request"))
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ source: APP_SOURCE, type, id, zoom }, window.location.origin)
  })
}

export function getNativeZoom(): Promise<number> {
  return requestZoom("get-zoom")
}

export function setNativeZoom(zoom: number): Promise<number> {
  return requestZoom("set-zoom", zoom)
}

export function onNativeZoomChange(listener: (zoom: number) => void): () => void {
  const onMessage = (event: MessageEvent<ZoomResponse>) => {
    if (event.source !== window) return
    if (event.data?.source !== EXTENSION_SOURCE) return
    if (event.data.type !== "zoom-changed") return
    if (typeof event.data.zoom !== "number") return
    listener(event.data.zoom)
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}
