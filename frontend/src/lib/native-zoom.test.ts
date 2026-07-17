import { afterEach, describe, expect, it, vi } from "vitest"
import { getNativeZoom, onNativeZoomChange, setNativeZoom } from "./native-zoom"

type Listener = (event: { source: unknown; data: unknown }) => void

function stubWindow(responseZoom: number) {
  const listeners: Listener[] = []
  let posted: unknown = null
  const win = {
    location: { origin: "http://127.0.0.1:47821" },
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn((_type: string, next: Listener) => {
      listeners.push(next)
    }),
    removeEventListener: vi.fn((_type: string, next: Listener) => {
      const index = listeners.indexOf(next)
      if (index >= 0) listeners.splice(index, 1)
    }),
    postMessage: vi.fn((message: { id: string }, _targetOrigin: string) => {
      posted = message
      listeners.forEach((listener) => listener({
        source: win,
        data: {
          source: "lich-zoom-extension",
          id: message.id,
          ok: true,
          zoom: responseZoom,
        },
      }))
    }),
  }
  vi.stubGlobal("window", win)
  return { win, posted: () => posted, listeners }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("native zoom bridge", () => {
  it("requests the current Chromium zoom", async () => {
    const { posted } = stubWindow(1.25)

    await expect(getNativeZoom()).resolves.toBe(1.25)
    expect(posted()).toMatchObject({ source: "lich-app", type: "get-zoom" })
  })

  it("requests a Chromium zoom change", async () => {
    const { posted } = stubWindow(1.1)

    await expect(setNativeZoom(1.1)).resolves.toBe(1.1)
    expect(posted()).toMatchObject({
      source: "lich-app",
      type: "set-zoom",
      zoom: 1.1,
    })
  })

  it("subscribes to native zoom changes", () => {
    const { win, listeners } = stubWindow(1)
    const listener = vi.fn()

    const unsubscribe = onNativeZoomChange(listener)
    listeners.forEach((onMessage) => onMessage({
      source: win,
      data: { source: "lich-zoom-extension", type: "zoom-changed", zoom: 1.5 },
    }))

    expect(listener).toHaveBeenCalledWith(1.5)
    unsubscribe()
    expect(win.removeEventListener).toHaveBeenCalled()
  })
})
