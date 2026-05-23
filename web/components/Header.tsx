import type { ReactNode } from "react";
import styles from "./Header.module.css";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
}

/** Internal header row used inside SectionFrame. Not exported for direct section use. */
export function Header({ title, actions }: Props) {
  return (
    <div className={styles.header}>
      <div className={styles.title}>{title}</div>
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
