import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Label.module.css";

type Variant = "section" | "field";
type Size = "sm" | "md";
type As = "div" | "label" | "h2" | "h3" | "span" | "p";

interface Props extends HTMLAttributes<HTMLElement> {
  variant?: Variant;
  size?: Size;
  as?: As;
  htmlFor?: string | undefined;
  children: ReactNode;
}

export function Label({
  variant = "section",
  size = "md",
  as: Tag = "div",
  htmlFor,
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    styles[variant],
    variant === "section" ? styles[size] : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // `htmlFor` is only meaningful when Tag === "label"; pass it through
  const labelProps =
    Tag === "label" && htmlFor !== undefined ? { htmlFor } : {};

  return (
    <Tag className={cls} {...labelProps} {...rest}>
      {children}
    </Tag>
  );
}
