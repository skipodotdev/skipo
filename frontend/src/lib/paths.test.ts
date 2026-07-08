import { describe, expect, it } from "vitest"
import { displayPath } from "./paths"

describe("displayPath", () => {
  it("collapses a POSIX home prefix to ~", () => {
    expect(displayPath("/home/meopedevts/try/skipo")).toBe("~/try/skipo")
  })

  it("collapses a macOS home prefix to ~", () => {
    expect(displayPath("/Users/me/try/skipo")).toBe("~/try/skipo")
  })

  it("collapses a Windows user profile prefix to ~", () => {
    expect(displayPath("C:\\Users\\me\\try\\skipo")).toBe("~\\try\\skipo")
  })

  it("leaves paths outside a home directory unchanged", () => {
    expect(displayPath("/opt/app/data")).toBe("/opt/app/data")
    expect(displayPath("/home")).toBe("/home")
    expect(displayPath("")).toBe("")
  })
})
