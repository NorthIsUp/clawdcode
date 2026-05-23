// Wrapper around Darwin UI Dialog used as a mobile slide-in drawer.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@pikoloo/darwin-ui";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible title (visually hidden but required for a11y) */
  title: string;
  children: ReactNode;
}

// Pin the dialog to the LEFT side as a narrow side-sheet (instead of Darwin's
// default centered modal) — `!` Tailwind utilities override Darwin's compiled
// centering classes so the same glass-morphism card style now sits at left.
const SIDE_SHEET_CLASSES = [
  "!fixed",
  "!left-3",
  "!top-3",
  "!bottom-3",
  "!translate-x-0",
  "!translate-y-0",
  "!w-72",
  "!max-w-[85vw]",
  "!max-h-none",
  "!h-auto",
  "!rounded-2xl",
].join(" ");

export function Drawer({ open, onClose, title, children }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent glass size="sm" className={SIDE_SHEET_CLASSES}>
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
