import {useEffect, useState} from "react"
import {Service as ProjectService} from "../../bindings/github.com/omartelo/lich/internal/project"
import type {PullRequest} from "../../bindings/github.com/omartelo/lich/internal/project/models"

export type {PullRequest}

// usePullRequest resolves the open GitHub PR for a path's current branch via the
// gh CLI. Unlike git status it is not polled: a PR is opened once and rarely
// changes, and each lookup is a network round-trip. It refetches only when the
// path or branch changes — enough to pick up a checkout or a freshly opened PR
// on the next branch switch. Returns null while loading, on any error, or when
// no PR exists, so the caller hides the badge. No poll: if a PR opened on the
// current branch must appear without a branch switch, add a slow interval
// (~30s) or a window-focus refetch.
export function usePullRequest(path: string, branch: string): PullRequest | null {
  const [pr, setPr] = useState<PullRequest | null>(null)
  useEffect(() => {
    if (!path) {
      setPr(null)
      return
    }
    let alive = true
    ProjectService.PullRequest(path)
      .then((result) => {
        if (alive) setPr(result)
      })
      .catch(() => {
        if (alive) setPr(null)
      })
    return () => {
      alive = false
    }
  }, [path, branch])
  return pr
}
