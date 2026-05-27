import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { useEffect, useState } from "react";

/**
 * Syntax-highlighted markdown editor backed by @uiw/react-md-editor's
 * CodeMirror-powered text area. Preview pane is hidden — the parent owns
 * mode-switching between "edit" and "preview".
 *
 * The editor picks up daisyUI's `data-theme` light/dark from <html>; we
 * forward that to react-md-editor's own `data-color-mode` attribute on the
 * wrapper so its syntax colors invert correctly.
 */
export function MarkdownEditor({
  value,
  onChange,
  minHeight = 384,
}: {
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  const [colorMode, setColorMode] = useState<"light" | "dark">(getEffectiveMode);

  useEffect(() => {
    const apply = () => setColorMode(getEffectiveMode());
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return (
    <div data-color-mode={colorMode} className="md-editor-wrap">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        preview="edit"
        hideToolbar
        visibleDragbar={false}
        height={minHeight}
        textareaProps={{ spellCheck: false }}
      />
    </div>
  );
}

/**
 * Map the daisyUI theme on <html> to react-md-editor's light/dark binary.
 * Themes named with "dark", "night", "synthwave", etc are treated as dark;
 * everything else (lobster, light, cupcake, …) is treated as light.
 */
function getEffectiveMode(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  const dark = /(dark|night|coffee|dim|sunset|abyss|synthwave|dracula|black)/i.test(theme);
  return dark ? "dark" : "light";
}
