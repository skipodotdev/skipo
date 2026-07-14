import {describe, expect, it} from "vitest"
import {releaseCanvasBacking} from "./hidden-canvas"

function makeTerm(width = 800, height = 600) {
  const canvas = {width, height}
  return {
    canvas,
    term: {renderer: {getCanvas: () => canvas}},
  }
}

describe("releaseCanvasBacking", () => {
  it("zeroes the canvas backing store", () => {
    const {canvas, term} = makeTerm()
    releaseCanvasBacking(term)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it("is idempotent on an already-empty canvas", () => {
    const {canvas, term} = makeTerm(0, 0)
    releaseCanvasBacking(term)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it("fails open when the renderer shape does not match", () => {
    expect(() => releaseCanvasBacking(null)).not.toThrow()
    expect(() => releaseCanvasBacking({})).not.toThrow()
    expect(() => releaseCanvasBacking({renderer: null})).not.toThrow()
    expect(() => releaseCanvasBacking({renderer: {}})).not.toThrow()
    expect(() => releaseCanvasBacking({renderer: {getCanvas: () => null}})).not.toThrow()
  })
})
