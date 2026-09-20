"use client";

import type { Editor } from "js-draw";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type HandwritingCanvasProps = {
  caseId: string;
  disabled: boolean;
  value: string;
  onChange: (svg: string) => void;
};

export function HandwritingCanvas({ caseId, disabled, value, onChange }: HandwritingCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const disabledRef = useRef(disabled);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
    editorRef.current?.setReadOnly(disabled);
  }, [disabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let editor: Editor | null = null;
    const listeners: Array<{ remove: () => void }> = [];

    void import("js-draw")
      .then(async ({ BackgroundComponentBackgroundType, Color4, Editor: JsDrawEditor, EditorEventType }) => {
        if (cancelled) return;
        host.replaceChildren();
        editor = new JsDrawEditor(host, {
          wheelEventsEnabled: "only-if-focused",
          appInfo: { name: "TTTG Recruiter Workstation" },
          pens: { filterPenTypes: (pen) => pen.id === "pressure-sensitive-pen" },
        });
        editorRef.current = editor;
        editor.getRootElement().style.height = "100%";
        editor.getRootElement().style.width = "100%";
        const toolbar = editor.addToolbar(false);
        toolbar.addUndoRedoButtons();
        toolbar.addWidgetsForPrimaryTools((tool) =>
          ["PenTool", "EraserTool", "TextTool"].includes(tool.constructor.name),
        );
        editor.setReadOnly(disabledRef.current);

        if (initialValueRef.current.trim()) await editor.loadFromSVG(initialValueRef.current, true);
        if (cancelled) return;

        // Notes are a continuous writing surface, not a fixed-size document page.
        // A fill-screen background follows the visible viewport when the Notes panel
        // is resized, while autoresize keeps strokes outside the old page bounds in
        // the exported SVG.
        editor.dispatchNoAnnounce(editor.setBackgroundStyle({
          color: Color4.white,
          type: BackgroundComponentBackgroundType.SolidColor,
          autoresize: true,
        }), false);
        editor.rerender();

        const saveDrawing = () => {
          if (!editor || disabledRef.current) return;
          onChangeRef.current(editor.toSVG({ minDimension: 1 }).outerHTML);
        };
        listeners.push(editor.notifier.on(EditorEventType.CommandDone, saveDrawing));
        listeners.push(editor.notifier.on(EditorEventType.CommandUndone, saveDrawing));
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("failed");
      });

    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove();
      editor?.remove();
      editorRef.current = null;
    };
  }, [caseId]);

  return (
    <div className="handwriting-canvas-shell" aria-label="Apple Pencil drawing notes">
      {loadState === "loading" ? <div className="handwriting-canvas-state"><LoaderCircle className="spin" /> Loading drawing tools</div> : null}
      {loadState === "failed" ? <div className="handwriting-canvas-state error">Drawing tools could not load. Typed notes are still available.</div> : null}
      <div ref={hostRef} className="handwriting-canvas" data-ready={loadState === "ready"} />
    </div>
  );
}
