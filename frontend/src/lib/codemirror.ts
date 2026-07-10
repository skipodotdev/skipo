// Shared CodeMirror 6 building blocks. The diff viewer is the first consumer;
// future editors should grow their own extension sets here instead of
// configuring views inline.

import {EditorState, RangeSetBuilder, type Extension} from "@codemirror/state"
import {syntaxHighlighting} from "@codemirror/language"
import {classHighlighter} from "@lezer/highlight"
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
  lineNumbers,
} from "@codemirror/view"
import {gutterNumber, type DiffLine} from "./diff"

// diffTheme styles the editor with the app's CSS variables, so the `.dark`
// class on <html> restyles every view without any JS synchronization.
const diffTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "12px",
  },
  ".cm-content": {
    fontFamily: "'FiraCode Nerd Font Mono', monospace",
    padding: "0",
  },
  ".cm-line": {padding: "0 0.5rem"},
  "&.cm-focused": {outline: "none"},
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--muted-foreground)",
    fontFamily: "'FiraCode Nerd Font Mono', monospace",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 0.75rem 0 0.5rem",
    minWidth: "2.25rem",
  },
})

// diffEditorExtensions is the base set for a read-only diff viewer.
// EditorState.readOnly (not EditorView.editable) blocks edits while keeping
// the DOM contenteditable, which CodeMirror needs to track text selection.
// classHighlighter emits tok-* classes; the palette lives in index.css.
export function diffEditorExtensions(): Extension[] {
  return [
    EditorState.readOnly.of(true),
    EditorView.lineWrapping,
    syntaxHighlighting(classHighlighter),
    diffTheme,
  ]
}

const lineClasses: Partial<Record<DiffLine["kind"], Decoration>> = {
  add: Decoration.line({class: "cm-diff-add"}),
  del: Decoration.line({class: "cm-diff-del"}),
  meta: Decoration.line({class: "cm-diff-sep"}),
}

// gutterLineClass markers carry only an elementClass — the colored strip and
// tinted background of changed lines' gutter cells.
class LineClassMarker extends GutterMarker {
  constructor(readonly elementClass: string) {
    super()
  }
}

const gutterMarkers: Partial<Record<DiffLine["kind"], LineClassMarker>> = {
  add: new LineClassMarker("cm-diff-gutter-add"),
  del: new LineClassMarker("cm-diff-gutter-del"),
}

// buildLineDecorations colors added/deleted lines and hunk separators, in the
// content area and in the gutter. The doc of a diff view never changes (a
// refresh replaces the whole view), so static RangeSets are enough — no
// ViewPlugin or StateField needed.
export function buildLineDecorations(lineMeta: DiffLine[]): Extension {
  const lines = new RangeSetBuilder<Decoration>()
  const gutters = new RangeSetBuilder<GutterMarker>()
  let pos = 0
  for (const meta of lineMeta) {
    const decoration = lineClasses[meta.kind]
    if (decoration) {
      lines.add(pos, pos, decoration)
    }
    const marker = gutterMarkers[meta.kind]
    if (marker) {
      gutters.add(pos, pos, marker)
    }
    pos += meta.text.length + 1 // +1 for the newline
  }
  return [
    EditorView.decorations.of(lines.finish()),
    gutterLineClass.of(gutters.finish()),
  ]
}

// diffGutter is the single-column line gutter: numbers come from lineMeta
// (old-file for deletions, new-file otherwise), not from doc line numbers.
// lineNumbers' internal spacer probes formatNumber with out-of-range numbers
// to size the gutter; those get the widest real number so it never collapses.
export function diffGutter(lineMeta: DiffLine[]): Extension {
  const widest = String(
    Math.max(1, ...lineMeta.map((meta) => meta.newLine ?? meta.oldLine ?? 0)),
  )
  return lineNumbers({
    formatNumber: (lineNo) => {
      const meta = lineMeta[lineNo - 1]
      return meta ? gutterNumber(meta) : widest
    },
  })
}
