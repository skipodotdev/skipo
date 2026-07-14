// A hidden session keeps its render loop paused (render-pause.ts) but its
// canvas keeps a full-window backing store alive (~width × height × dpr² × 4
// bytes, several MB per session). Zeroing the canvas dimensions releases the
// bitmap; CSS size is left untouched so the layer keeps its layout under
// visibility:hidden. On show, no restore call is needed: ghostty-web's
// render() compares the canvas size against cols × metrics × dpr every frame
// and self-heals a mismatch with a full resize + redraw. patchScrollGate
// (scrollback-perf.ts) knows to never skip a render while the canvas is empty,
// so the self-heal always runs. Uses only the renderer's public getCanvas();
// fails open (no-op) if ghostty-web ever changes shape.

interface BackingCanvas {
  width: number
  height: number
}

interface CanvasTerminal {
  renderer?: {
    getCanvas?: () => BackingCanvas | null
  } | null
}

/**
 * Releases the canvas backing store of a hidden terminal. Idempotent; a
 * terminal without a renderer or an already-empty canvas is left untouched.
 */
export function releaseCanvasBacking(terminal: unknown): void {
  const renderer = (terminal as CanvasTerminal)?.renderer
  if (typeof renderer?.getCanvas !== "function") {
    return
  }
  const canvas = renderer.getCanvas()
  if (!canvas || (canvas.width === 0 && canvas.height === 0)) {
    return
  }
  canvas.width = 0
  canvas.height = 0
}
