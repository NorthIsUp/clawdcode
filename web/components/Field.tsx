import type { ReactNode } from "react";
import styles from "./Field.module.css";
import { Label } from "./Label";

interface Props {
  label: string;
  htmlFor?: string;
  layout?: "row" | "col";
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  layout = "row",
  className,
  children,
}: Props) {
  return (
    <div
      className={[
        styles.field,
        layout === "col" ? styles.col : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Label
        variant="field"
        as="label"
        {...(htmlFor !== undefined ? { htmlFor } : {})}
        className={styles.label}
      >
        {label}
      </Label>
      <div className={styles.control}>{children}</div>
    </div>
  );
}
