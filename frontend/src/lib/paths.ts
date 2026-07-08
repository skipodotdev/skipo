// displayPath collapses a user's home directory prefix to "~", the way most
// shells and terminals render paths: "/home/me/try/skipo" -> "~/try/skipo".
// Paths outside a home directory are returned unchanged.
//
// ponytail: heuristic on the conventional home roots (/home, /Users,
// C:\Users) rather than the real $HOME, so a personal single-user harness
// needs no backend round-trip. Upgrade path: pass the actual home dir from Go
// (os.UserHomeDir) if this ever runs where home lives elsewhere.
const HOME_ROOTS = /^(?:\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/

export function displayPath(path: string): string {
  return path.replace(HOME_ROOTS, "~")
}
