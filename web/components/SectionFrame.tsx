import type { ReactNode } from "react";
import { Header } from "./Header";
import styles from "./SectionFrame.module.css";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

/**
 * SectionFrame is the SOLE owner of:
 * - The section header row layout (title + actions via Header).
 * - The scrollable body region.
 * - The mobile safe-area top reserve (--burger-safe) so the burger never
 *   overlaps any content inside any section.
 *
 * Every section renders into a SectionFrame. No section solves the burger
 * safe-area or header layout on its own.
 */
export function SectionFrame({
  title,
  actions,
  children,
  bodyClassName,
}: Props) {
  return (
    <div className={styles.frame}>
      <Header title={title} actions={actions} />
      <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}
