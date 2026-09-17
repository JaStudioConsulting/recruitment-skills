"use client";

import type { OutputData } from "@editorjs/editorjs";
import { useEffect, useRef } from "react";

type EditorInstance = import("@editorjs/editorjs").default;

export function ResumeEditor({
  caseId,
  data,
  onChange,
}: {
  caseId: string;
  data: OutputData;
  onChange: (data: OutputData) => void;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    async function mountEditor() {
      if (!holderRef.current) return;
      const [{ default: EditorJS }, { default: Header }, { default: EditorjsList }] =
        await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
        ]);
      if (cancelled || !holderRef.current) return;

      const editor = new EditorJS({
        holder: holderRef.current,
        data,
        minHeight: 420,
        placeholder: "Add the candidate's saved resume content.",
        tools: {
          header: {
            class: Header,
            inlineToolbar: ["bold", "italic", "link"],
            config: { levels: [1, 2, 3, 4], defaultLevel: 2 },
          },
          list: {
            class: EditorjsList,
            inlineToolbar: ["bold", "italic", "link"],
            config: { defaultStyle: "unordered" },
          },
        },
        onChange: async () => {
          const saved = await editor.save();
          onChangeRef.current(saved);
        },
      });
      editorRef.current = editor;
      await editor.isReady;
    }

    void mountEditor();
    return () => {
      cancelled = true;
      const editor = editorRef.current;
      editorRef.current = null;
      if (editor && typeof editor.destroy === "function") editor.destroy();
    };
  // `data` is the case's mount snapshot. Editor.js owns later changes; rebuilding
  // on every save would destroy the active editor and cursor position.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  return <div className="resume-editor" ref={holderRef} />;
}
