import {describe, expect, it} from "vitest"

import {notificationsFrom} from "./notifications"
import type {PendingStatus} from "./session-status-store"
import type {SessionState} from "./sessions"

const projects = [
  {id: "p1", name: "alpha"},
  {id: "p2", name: "beta"},
]

const sessions: SessionState = {
  p1: {
    sessions: [{id: "s1", label: "Fix the bug", kind: "claude"}],
    activeId: "s1",
    nextSeq: 2,
  },
  p2: {
    sessions: [{id: "s2", label: "Write docs", kind: "codex"}],
    activeId: "s2",
    nextSeq: 2,
  },
}

describe("notificationsFrom", () => {
  it("resolves each pending status to its project and label", () => {
    const pending: PendingStatus[] = [
      {id: "s1", status: "waiting"},
      {id: "s2", status: "done"},
    ]
    expect(notificationsFrom(pending, projects, sessions)).toEqual([
      {
        id: "s1",
        status: "waiting",
        projectId: "p1",
        projectName: "alpha",
        sessionLabel: "Fix the bug",
      },
      {
        id: "s2",
        status: "done",
        projectId: "p2",
        projectName: "beta",
        sessionLabel: "Write docs",
      },
    ])
  })

  it("drops a status whose session no longer exists", () => {
    const pending: PendingStatus[] = [
      {id: "s1", status: "waiting"},
      {id: "closed", status: "done"},
    ]
    const result = notificationsFrom(pending, projects, sessions)
    expect(result.map((n) => n.id)).toEqual(["s1"])
  })

  it("returns nothing for an empty queue", () => {
    expect(notificationsFrom([], projects, sessions)).toEqual([])
  })
})
