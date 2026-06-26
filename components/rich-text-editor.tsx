"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import styles from "./rich-text-editor.module.css";

interface RichTextEditorProps {
  defaultContent?: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ defaultContent = "", onChange }: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: defaultContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} onMouseDown={(e) => e.preventDefault()}>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("bold") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("italic") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("underline") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <u>U</u>
        </button>
        <span className={styles.sep} />
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 2 }) ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("heading", { level: 3 }) ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Heading 3"
        >
          H3
        </button>
        <span className={styles.sep} />
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("bulletList") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          ≡
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${editor.isActive("orderedList") ? styles.active : ""}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          №
        </button>
      </div>
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}
