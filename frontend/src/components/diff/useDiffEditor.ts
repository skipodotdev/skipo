import {useEffect, useRef} from "react"
import type {RefObject} from "react"
import {EditorState, StateEffect} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {LanguageDescription} from "@codemirror/language"
import {languages} from "@codemirror/language-data"
import {
  buildLineDecorations,
  diffEditorExtensions,
  diffGutter,
} from "@/lib/codemirror"
import type {FileDoc} from "@/lib/diff"

export interface DocLineSelection {
  from: number
  to: number
}

export interface DiffEditor {
  containerRef: RefObject<HTMLDivElement>
  /** 1-based doc line span of the current selection, or null when empty. */
  getSelectedDocLines: () => DocLineSelection | null
}

// loadLanguage appends the file's language support once its lazy chunk
// resolves. The view may have been destroyed meanwhile (collapse, refresh) —
// the isAlive guard skips the dispatch then. Files without a matching parser
// simply stay unhighlighted.
function loadLanguage(
  view: EditorView,
  filename: string,
  isAlive: () => boolean,
): void {
  const description = LanguageDescription.matchFilename(languages, filename)
  if (!description) {
    return
  }
  description
    .load()
    .then((support) => {
      if (isAlive()) {
        view.dispatch({effects: StateEffect.appendConfig.of(support.extension)})
      }
    })
    .catch(() => {})
}

// useDiffEditor owns one read-only CodeMirror view: created when the container
// mounts, destroyed on unmount or when the doc is replaced by a refresh.
export function useDiffEditor(doc: FileDoc, filename: string): DiffEditor {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) {
      return
    }
    const view = new EditorView({
      state: EditorState.create({
        doc: doc.text,
        extensions: [
          ...diffEditorExtensions(),
          diffGutter(doc.lineMeta),
          buildLineDecorations(doc.lineMeta),
        ],
      }),
      parent,
    })
    viewRef.current = view
    loadLanguage(view, filename, () => viewRef.current === view)
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [doc, filename])

  const getSelectedDocLines = (): DocLineSelection | null => {
    const view = viewRef.current
    if (!view) {
      return null
    }
    const {main} = view.state.selection
    if (main.empty) {
      return null
    }
    const from = view.state.doc.lineAt(main.from).number
    const toLine = view.state.doc.lineAt(main.to)
    // A selection ending exactly at a line's start doesn't include that line.
    const to = main.to === toLine.from ? toLine.number - 1 : toLine.number
    return to < from ? null : {from, to}
  }

  return {containerRef, getSelectedDocLines}
}
