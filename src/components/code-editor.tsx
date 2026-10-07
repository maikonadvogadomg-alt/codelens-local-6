import React, { useEffect, useRef, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";

// ─── Language resolver ────────────────────────────────────────────────────────

function getLanguage(lang: string | undefined, path: string | undefined) {
  const ext = path?.split(".").pop()?.toLowerCase();
  const l = (lang ?? ext ?? "").toLowerCase();
  switch (l) {
    case "js":
    case "jsx":
    case "javascript":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
    case "typescript":
      return javascript({ jsx: true, typescript: true });
    case "py":
    case "python":
      return python();
    case "html":
    case "htm":
    case "svg":
      return html();
    case "css":
    case "scss":
    case "sass":
      return css();
    case "json":
    case "jsonc":
      return json();
    case "md":
    case "markdown":
      return markdown();
    case "rs":
    case "rust":
      return rust();
    case "sql":
      return sql();
    default:
      return null;
  }
}

// ─── Custom dark theme tweaks ─────────────────────────────────────────────────

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    background: "#0d1117",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "1.625",
  },
  ".cm-content": {
    paddingTop: "12px",
    paddingBottom: "12px",
    caretColor: "#e6edf3",
  },
  ".cm-focused": { outline: "none" },
  ".cm-editor": { height: "100%" },
  ".cm-gutters": {
    background: "#0d1117",
    borderRight: "1px solid #30363d",
    color: "#8b949e",
    minWidth: "3ch",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": { background: "#161b22" },
  ".cm-activeLine": { background: "#161b22" },
  ".cm-selectionBackground, ::selection": {
    background: "#264f78 !important",
  },
  ".cm-cursor": { borderLeftColor: "#e6edf3" },
  "&.cm-focused .cm-selectionBackground": { background: "#264f78" },
  ".cm-foldPlaceholder": {
    background: "#30363d",
    border: "none",
    color: "#8b949e",
  },
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  path?: string;
  onSave?: () => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeEditor({
  value,
  onChange,
  language,
  path,
  onSave,
  onCancel,
  readOnly = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);

  // Keep refs current without recreating the editor
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  // ── Create editor once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const lang = getLanguage(language, path);

    const saveKeymap = [
      {
        key: "Mod-s",
        run: () => { onSaveRef.current?.(); return true; },
      },
      {
        key: "Escape",
        run: () => { onCancelRef.current?.(); return true; },
      },
    ];

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        editorTheme,
        ...(lang ? [lang] : []),
        keymap.of([
          ...saveKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !readOnly) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorState.readOnly.of(readOnly),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally NOT including `value` — we sync it below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, path, readOnly]);

  // ── Sync external value changes (e.g. file switch) ───────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ background: "#0d1117" }}
    />
  );
}
