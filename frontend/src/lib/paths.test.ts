import { describe, expect, it } from "vitest"
import { shortenPath } from "./paths"

describe("shortenPath", () => {
  it("keeps the last two segments and prefixes an ellipsis", () => {
    expect(shortenPath("/home/meopedevts/try/skipo")).toBe(".../try/skipo")
  })

  it("returns paths with two or fewer segments unchanged", () => {
    expect(shortenPath("/skipo")).toBe("/skipo")
    expect(shortenPath("try/skipo")).toBe("try/skipo")
    expect(shortenPath("")).toBe("")
  })

  it("splits Windows separators", () => {
    expect(shortenPath("C:\\Users\\me\\try\\skipo")).toBe(".../try/skipo")
  })
})
