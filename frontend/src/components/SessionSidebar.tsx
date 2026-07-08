import { useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { useMatch } from "react-router-dom"
import { GitBranch, Plus, X } from "lucide-react"
import { Service as ProjectService } from "../../bindings/github.com/skipodotdev/skipo/internals/project"
import { cn } from "@/lib/utils"
import { shortenPath } from "@/lib/paths"
import { useProjects } from "@/lib/projects"
import { activeSessionId, sessionsOf, type Session } from "@/lib/sessions"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Sidebar width bounds in rem, matching the Tailwind v4 spacing scale. State and
// storage stay in rem; the pointer drag delta arrives in CSS pixels and is
// converted with the 16px root font size Tailwind assumes.
const REM_PX = 16
const MIN_WIDTH_REM = 12
const MAX_WIDTH_REM = 30
const DEFAULT_WIDTH_REM = 15
const WIDTH_STORAGE_KEY = "skipo.sidebar.width"

const clampWidth = (rem: number): number =>
  Math.min(MAX_WIDTH_REM, Math.max(MIN_WIDTH_REM, rem))

function readWidth(): number {
  const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
  return Number.isFinite(stored) && stored > 0
    ? clampWidth(stored)
    : DEFAULT_WIDTH_REM
}

// SessionCard is one session entry: a card showing the session label, the
// project's working directory, and the current git branch (when the project is
// a repo), with a close button on hover.
function SessionCard({
  session,
  path,
  branch,
  active,
  onSelect,
  onClose,
}: {
  session: Session
  path: string
  branch: string
  active: boolean
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "group relative flex w-full flex-col items-start gap-0.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:bg-accent/60",
              active &&
                "border-accent-foreground/20 bg-accent text-accent-foreground",
            )}
          />
        }
      >
        <span className="w-full truncate pr-5 text-sm font-medium text-foreground">
          {session.label}
        </span>
        <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
          {shortenPath(path)}
        </span>
        {branch && (
          <span className="flex max-w-full items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        )}
        <span
          role="button"
          aria-label={`Close ${session.label}`}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className="absolute right-2 top-2 flex size-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-foreground/15 group-hover:opacity-100"
        >
          <X className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{path}</TooltipContent>
    </Tooltip>
  )
}

// useProjectBranch resolves the current git branch of a directory through the
// backend. It re-resolves whenever the path changes; a checkout made while the
// project stays open is not reflected until then (no live watching yet).
function useProjectBranch(path: string): string {
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

// SessionSidebar lists the active project's sessions and can be drag-resized
// within a fixed pixel range. Width persists across restarts. It renders nothing
// when no project is active (Home, Settings), so it never competes with those
// screens.
//
// Resizing only changes this element's width; the terminal keeps its PTY in sync
// on its own via a ResizeObserver, so the sidebar does not need to know about it.
export function SessionSidebar() {
  const { projects, sessions, newSession, closeSession, activateSession } =
    useProjects()
  const match = useMatch("/projects/:projectId")
  const projectId = match?.params.projectId
  const path = projects.find((p) => p.id === projectId)?.path ?? ""
  const branch = useProjectBranch(path)
  const [width, setWidth] = useState(readWidth)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  if (!projectId) {
    return null
  }

  const list = sessionsOf(sessions, projectId)
  const activeId = activeSessionId(sessions, projectId)

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    setWidth(clampWidth(drag.startWidth + (event.clientX - drag.startX) / REM_PX))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const finalWidth = clampWidth(
      drag.startWidth + (event.clientX - drag.startX) / REM_PX,
    )
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setWidth(finalWidth)
    localStorage.setItem(WIDTH_STORAGE_KEY, String(finalWidth))
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-sidebar p-2"
      style={{ width: `${width}rem` }}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sessions
        </span>
        <button
          type="button"
          onClick={() => newSession(projectId)}
          title="New session"
          aria-label="New session"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {list.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            path={path}
            branch={branch}
            active={session.id === activeId}
            onSelect={() => activateSession(projectId, session.id)}
            onClose={() => closeSession(projectId, session.id)}
          />
        ))}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none transition-colors hover:bg-accent"
      />
    </aside>
  )
}
