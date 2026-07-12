import { useEffect, useState } from "react"
import { Service as Store } from "../../../bindings/github.com/omartelo/lich/internal/store"
import { useProjects } from "@/lib/projects"
import { SettingBlock } from "./SettingBlock"

// Same key as the global section; the scope (project id) is what differs. An
// empty override inherits the global value — the backend resolves project →
// global → $PATH in store.ClaudeBin.
const GLOBAL_SCOPE = ""
const CLAUDE_BIN_KEY = "claude.bin"

export function ProjectClaudeCodeSettings() {
  const { projects } = useProjects()
  const [globalBin, setGlobalBin] = useState("")
  const [bins, setBins] = useState<Record<string, string>>({})

  useEffect(() => {
    void Store.GetSetting(CLAUDE_BIN_KEY, GLOBAL_SCOPE).then(setGlobalBin)
    for (const project of projects) {
      void Store.GetSetting(CLAUDE_BIN_KEY, project.id).then((value) =>
        setBins((prev) => ({ ...prev, [project.id]: value })),
      )
    }
  }, [projects])

  const persist = (projectId: string, value: string) => {
    setBins((prev) => ({ ...prev, [projectId]: value }))
    void Store.SetSetting(CLAUDE_BIN_KEY, projectId, value.trim())
  }

  if (projects.length === 0) {
    return (
      <p className="py-5 text-sm text-muted-foreground">
        No open projects. Open a project to configure its overrides.
      </p>
    )
  }

  return (
    <>
      {projects.map((project) => (
        <SettingBlock
          key={project.id}
          title={project.name}
          description={project.path}
        >
          <input
            value={bins[project.id] ?? ""}
            onChange={(event) => persist(project.id, event.target.value)}
            placeholder={globalBin || "claude"}
            spellCheck={false}
            aria-label={`Claude Code path for ${project.name}`}
            className="h-9 w-96 max-w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </SettingBlock>
      ))}
    </>
  )
}
