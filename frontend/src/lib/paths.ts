// shortenPath compresses a filesystem path to its last two segments, prefixing
// an ellipsis when earlier segments were dropped:
// "/home/meopedevts/try/skipo" -> ".../try/skipo". Paths with two or fewer
// segments are returned unchanged. Both POSIX and Windows separators are split.
const TAIL_SEGMENTS = 2

export function shortenPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  if (parts.length <= TAIL_SEGMENTS) {
    return path
  }
  return `.../${parts.slice(-TAIL_SEGMENTS).join("/")}`
}
