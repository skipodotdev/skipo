// ghostty-web 0.4.0 drops two families of key sequences: Shift+Tab is
// hardcoded to plain "\t" (never CSI Z / backtab) and the key encoder never
// enables ALT_ESC_PREFIX, so Alt+<char> loses its ESC prefix and arrives as
// the bare character. missingKeySequence supplies what the terminal fails to
// produce; TerminalView writes it straight to the PTY via
// attachCustomKeyEventHandler. Delete this once ghostty-web fixes both.

// The subset of KeyboardEvent the matcher needs — lets tests pass plain
// objects. getModifierState and code are optional so fabricated events can
// omit them.
export type TermKeyState = Pick<
  KeyboardEvent,
  "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "key"
> & { code?: string; getModifierState?: (key: string) => boolean }

export function missingKeySequence(event: TermKeyState): string | null {
  // ghostty-web encodes Ctrl+Backspace as a plain backspace; send ETB (Ctrl+W,
  // readline's unix-word-rubout) so line editors erase the whole word.
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key === "Backspace"
  )
    return "\x17"
  // ghostty-web swallows Ctrl+V so the browser's text-only paste event fires,
  // which hides the keypress from TUIs that read the clipboard themselves on
  // ^V (Claude Code image attach). Deliver SYN like a real terminal; text
  // paste moves to Ctrl+Shift+V (isTextPasteChord).
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === "KeyV" || event.key.toLowerCase() === "v")
  )
    return "\x16"
  if (event.ctrlKey || event.metaKey) return null
  // AltGr (ISO Level3) also reports altKey on some layouts; it is composing a
  // character, not an Alt chord — let the terminal handle it.
  if (event.getModifierState?.("AltGraph")) return null
  // WebKitGTK reports Shift+Tab with the GTK keysym name "ISO_Left_Tab" in
  // event.key; the physical event.code stays "Tab". Match both.
  const isTab = event.key === "Tab" || event.code === "Tab"
  if (isTab && event.shiftKey && !event.altKey) return "\x1b[Z"
  // ghostty-web also encodes Shift+Enter as plain "\r", indistinguishable from
  // Enter. ESC+CR is what TUIs (Claude Code, etc.) accept as "insert newline"
  // without needing kitty-protocol negotiation.
  if (event.key === "Enter" && event.shiftKey && !event.altKey) return "\x1b\r"
  if (event.altKey) {
    if (event.key === "Backspace") return "\x1b\x7f"
    if (event.key.length === 1) return "\x1b" + event.key
  }
  return null
}

/**
 * Ctrl+Shift+V — the terminal-convention text-paste chord. Handled outside
 * missingKeySequence because pasting needs the async Wails clipboard read,
 * not a fixed byte sequence.
 */
export function isTextPasteChord(event: TermKeyState): boolean {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.code === "KeyV" || event.key.toLowerCase() === "v")
  )
}
