import {useCallback, useEffect, useState} from "react"
import {ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen} from "lucide-react"
import {ProjectService, System, Terminal as TerminalService} from "@/lib/rpc"
import {useActiveSession} from "@/lib/useActiveSession"
import {useProjects} from "@/lib/projects"
import {queuePaste} from "@/lib/paste-queue"
import {useGitStatus} from "@/lib/useGitStatus"
import {buildTree, type TreeNode} from "@/lib/file-tree"
import {FileIcon} from "@/lib/file-icon"
import {DiffStat} from "@/components/DiffStat"
import {formatLineRef, parseDiff, type DiffFile} from "@/lib/diff"
import {errorText} from "@/lib/utils"
import type {DocLineSelection} from "@/lib/codemirror"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {useFileEditor} from "./useFileEditor"

// FilesPanel is the Files tab of the right dock: a read-only tree of the active
// session's tracked files, master-detail with an in-dock preview. It follows the
// active session like the review panel — a worktree session browses its
// checkout, not the project root — so clicking a file opens it beside the same
// terminal it belongs to. It never edits; clicks only navigate and inject
// path/line references into the session's PTY.
export function FilesPanel() {
  const {projectId, sessionId, path} = useActiveSession()
  const {newSession, activateSession} = useProjects()
  const status = useGitStatus(path)
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [stats, setStats] = useState<Map<string, DiffFile>>(new Map())
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!path) {
      return
    }
    try {
      // The diff feeds each row its +/- badge; a diff failure (nothing to diff)
      // just means no badges, never a broken tree — hence the swallowed catch.
      const [files, diffText] = await Promise.all([
        ProjectService.Tree(path),
        ProjectService.DiffText(path).catch(() => ""),
      ])
      setTree(buildTree(files ?? []))
      setStats(diffStatsByPath(parseDiff(diffText)))
      setFailed(false)
    } catch {
      setTree([])
      setStats(new Map())
      setFailed(true)
    }
  }, [path])

  // Same invalidation as the diff panel: the git-status poll doubles as the
  // signal, so a new or removed file shows up without a watcher.
  useEffect(() => {
    void refresh()
  }, [refresh, status?.files, status?.added, status?.deleted])

  // A worktree switch changes path; drop any preview from the old tree.
  useEffect(() => {
    setOpen(null)
  }, [path])

  if (!projectId) {
    return null
  }

  const inject = (text: string) => {
    if (sessionId) {
      void TerminalService.Write(sessionId, text)
    }
  }

  // Right-click → Open in editor. The backend either launched a GUI editor
  // detached (empty reply) or, for a terminal editor like vim, handed back the
  // command to run: spawn a shell session at this checkout and let the paste
  // queue deliver it once the PTY exists, the way the self-update flow does.
  const openInEditor = (rel: string) => {
    if (!path) {
      return
    }
    void System.OpenInEditor(path, rel)
      .then((command) => {
        if (!command) {
          return
        }
        const id = newSession(projectId, "shell", path)
        queuePaste(id, command + "\n")
        activateSession(projectId, id)
      })
      .catch(() => undefined)
  }

  if (open !== null) {
    return (
      <FilePreview
        path={path}
        rel={open}
        onBack={() => setOpen(null)}
        onInject={inject}
      />
    )
  }
  return (
    <TreeBody
      tree={tree}
      stats={stats}
      failed={failed}
      onOpen={setOpen}
      onEditor={openInEditor}
    />
  )
}

// diffStatsByPath keys each changed file's +/- counts by its current path so a
// tree row can look up its own line delta. parseDiff already computed the counts
// for the review panel; this only reshapes them for lookup.
function diffStatsByPath(files: DiffFile[]): Map<string, DiffFile> {
  const map = new Map<string, DiffFile>()
  for (const file of files) {
    const key = file.newPath || file.oldPath
    if (key) {
      map.set(key, file)
    }
  }
  return map
}

interface TreeBodyProps {
  tree: TreeNode[] | null
  stats: Map<string, DiffFile>
  failed: boolean
  onOpen: (rel: string) => void
  onEditor: (rel: string) => void
}

function TreeBody({tree, stats, failed, onOpen, onEditor}: TreeBodyProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (rel: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) {
        next.delete(rel)
      } else {
        next.add(rel)
      }
      return next
    })

  // Expand/collapse a directory and every directory beneath it, the scope a
  // right-click on that folder implies.
  const setSubtree = (node: TreeNode, expand: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      const walk = (n: TreeNode) => {
        if (n.type !== "dir") {
          return
        }
        if (expand) {
          next.add(n.path)
        } else {
          next.delete(n.path)
        }
        n.children.forEach(walk)
      }
      walk(node)
      return next
    })

  if (failed) {
    return <Notice>Not a git repository</Notice>
  }
  if (tree === null) {
    return <Notice>Loading…</Notice>
  }
  if (tree.length === 0) {
    return <Notice>No tracked files</Notice>
  }
  return (
    <div role="tree" className="h-full overflow-y-auto py-1 font-mono text-xs">
      {tree.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          stats={stats}
          expanded={expanded}
          onToggle={toggle}
          onExpandAll={(n) => setSubtree(n, true)}
          onCollapseAll={(n) => setSubtree(n, false)}
          onOpen={onOpen}
          onEditor={onEditor}
        />
      ))}
    </div>
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  stats: Map<string, DiffFile>
  expanded: Set<string>
  onToggle: (rel: string) => void
  onExpandAll: (node: TreeNode) => void
  onCollapseAll: (node: TreeNode) => void
  onOpen: (rel: string) => void
  onEditor: (rel: string) => void
}

function TreeRow({
  node,
  depth,
  stats,
  expanded,
  onToggle,
  onExpandAll,
  onCollapseAll,
  onOpen,
  onEditor,
}: TreeRowProps) {
  const isOpen = expanded.has(node.path)
  // The 0.5rem base keeps even top-level rows off the edge.
  const indent = {paddingLeft: `${depth * 0.75 + 0.5}rem`}
  if (node.type === "file") {
    const stat = stats.get(node.path)
    // A chevron-width spacer keeps file names aligned under their folder's name;
    // FileIcon draws the language's real logo (devicon).
    return (
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              onClick={() => onOpen(node.path)}
              style={indent}
              title={node.path}
              className="flex items-center gap-1.5 py-0.5 pr-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            />
          }
        >
          <span className="size-3.5 shrink-0" aria-hidden/>
          <FileIcon path={node.path}/>
          <span className="min-w-0 truncate">{node.name}</span>
          {stat && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 tabular-nums">
              <DiffStat added={stat.added} deleted={stat.deleted}/>
            </span>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onEditor(node.path)}>
            Open in editor
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }
  const Chevron = isOpen ? ChevronDown : ChevronRight
  const FolderIcon = isOpen ? FolderOpen : Folder
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              style={indent}
              aria-expanded={isOpen}
              className="flex items-center gap-1.5 py-0.5 pr-2 text-left font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            />
          }
        >
          <Chevron className="size-3.5 shrink-0 text-muted-foreground"/>
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground"/>
          <span className="truncate">{node.name}</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onExpandAll(node)}>
            Expand all
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCollapseAll(node)}>
            Collapse all
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isOpen &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            stats={stats}
            expanded={expanded}
            onToggle={onToggle}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            onOpen={onOpen}
            onEditor={onEditor}
          />
        ))}
    </>
  )
}

interface FilePreviewProps {
  path: string
  rel: string
  onBack: () => void
  onInject: (text: string) => void
}

function FilePreview({path, rel, onBack, onInject}: FilePreviewProps) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setText(null)
    setError(null)
    ProjectService.ReadFile(path, rel)
      .then((content) => {
        if (alive) {
          setText(content)
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(errorText(err))
        }
      })
    return () => {
      alive = false
    }
  }, [path, rel])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2 text-xs">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to file tree"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronLeft className="size-4"/>
        </button>
        <span className="truncate font-mono" title={rel}>
          {rel}
        </span>
        <span className="ml-auto shrink-0 text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
          read-only
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error !== null ? (
          <Notice>{error}</Notice>
        ) : text === null ? (
          <Notice>Loading…</Notice>
        ) : (
          <PreviewBody text={text} rel={rel} onInject={onInject}/>
        )}
      </div>
    </div>
  )
}

interface PreviewBodyProps {
  text: string
  rel: string
  onInject: (text: string) => void
}

// PreviewBody renders the file in a read-only CodeMirror view whose selection
// drives the same inject context menu as the diff review — file lines map
// straight through (doc line === file line), so the range needs no remap.
function PreviewBody({text, rel, onInject}: PreviewBodyProps) {
  const {containerRef, getSelectedLines} = useFileEditor(text, rel)
  const [range, setRange] = useState<DocLineSelection | null>(null)

  // Resolve the selection when the menu opens, not on every selection change.
  const onOpenChange = (menuOpen: boolean) => {
    if (menuOpen) {
      setRange(getSelectedLines())
    }
  }

  const lineRef = range && formatLineRef({start: range.from, end: range.to})
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger render={<div className="isolate py-1" ref={containerRef}/>}/>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onInject(`@${rel} `)}>
          Inject file
        </ContextMenuItem>
        <ContextMenuItem
          disabled={lineRef === null}
          onClick={() => lineRef && onInject(`${rel}:${lineRef} `)}
        >
          {lineRef === null ? "Inject lines" : `Inject lines ${lineRef}`}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function Notice({children}: {children: string}) {
  return <p className="px-3 py-4 text-xs text-muted-foreground">{children}</p>
}
