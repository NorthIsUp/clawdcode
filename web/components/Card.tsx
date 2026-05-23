import type { ReactNode } from "react";
import styles from "./Card.module.css";
import { Label } from "./Label";

interface Props {
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Card({ title, className, children }: Props) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(" ")}>
      {title !== undefined && (
        <Label variant="section" as="h2">
          {title}
        </Label>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
