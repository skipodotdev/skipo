import { useEffect, useState } from "react"
import { Service as ProjectService } from "../../../bindings/github.com/skipodotdev/skipo/internals/project"

// useProjectBranch resolves the current git branch of a directory through the
// backend. It re-resolves whenever the path changes; a checkout made while the
// project stays open is not reflected until then (no live watching yet).
export function useProjectBranch(path: string): string {
  const [branch, setBranch] = useState("")
  useEffect(() => {
    if (!path) {
      setBranch("")
      return
    }
    let alive = true
    void ProjectService.Branch(path).then((value) => {
      if (alive) {
        setBranch(value)
      }
    })
    return () => {
      alive = false
    }
  }, [path])
  return branch
}
