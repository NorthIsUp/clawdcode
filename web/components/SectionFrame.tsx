import type { ReactNode } from "react";
import { useEffect } from "react";
import { AppShellContext } from "./AppShellContext";
import { useContext } from "react";
import styles from "./SectionFrame.module.css";

interface Props {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

/**
 * SectionFrame — registers the section title + actions into the AppShell
 * topbar (via AppShellContext) and provides the scrollable body region.
 *
 * The per-section header strip (Header component) is gone; the topbar is
 * now the single owner of the title + actions row.
 */
export function SectionFrame({
  title,
  actions,
  children,
  bodyClassName,
}: Props) {
  const { setSlot } = useContext(AppShellContext);

  useEffect(() => {
    setSlot({ title, actions: actions ?? null });
    return () => {
      setSlot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSlot, title, actions]);

  return (
    <div className={styles.frame}>
      <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}
