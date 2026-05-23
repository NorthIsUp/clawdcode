import {
  Sidebar,
  Topbar,
  useToast,
} from "@pikoloo/darwin-ui";
import { FolderOpen, Home, MessageSquare, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useHash } from "../hooks/useHash";
import styles from "./AppShell.module.css";
import { GitFooter } from "./GitFooter";

type Section = "home" | "chats" | "jobs" | "settings";

const NAV_ITEMS = [
  { id: "home" as Section, label: "Home", Icon: Home },
  { id: "chats" as Section, label: "Chats", Icon: MessageSquare },
  { id: "jobs" as Section, label: "Jobs", Icon: FolderOpen },
  { id: "settings" as Section, label: "Settings", Icon: Settings },
] as const;

interface Props {
  children: ReactNode;
}

/**
 * AppShell — composes Darwin's Topbar (logo + actions) and Sidebar (nav + collapse).
 *
 * Darwin's `Sidebar` has a fixed surface — no brand slot, no footer slot,
 * no side/position prop, and `onLogout` is required.  So the brand 🦞 and the
 * build-sha link live in the Topbar's `logo`/`actions` slots, which Darwin
 * provides for exactly that purpose.  `onLogout` is wired to a toast.
 */
export function AppShell({ children }: Props) {
  const { section, setHash } = useHash();
  const { showToast } = useToast();
  const brandRef = useRef<HTMLButtonElement>(null);

  const wiggle = () => {
    const el = brandRef.current;
    if (!el) return;
    const cls = styles.brandWiggle;
    if (!cls) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart on rapid clicks
    el.classList.add(cls);
  };

  const sidebarItems = NAV_ITEMS.map((item) => ({
    label: item.label,
    onClick: () => setHash(item.id),
    icon: item.Icon,
  }));

  const activeLabel =
    NAV_ITEMS.find((item) => item.id === section)?.label ?? "Home";

  return (
    <div className={styles.shell}>
      {/* Topbar — Darwin's slot-based header. Logo on left (lobster brand),
          actions on right (build sha link).  items=[] keeps the Topbar
          purely a chrome header — Sidebar owns navigation. */}
      <Topbar
        items={[]}
        glass
        sticky
        logo={
          <button
            ref={brandRef}
            type="button"
            className={styles.brand}
            onClick={wiggle}
            aria-label="ClaudeClaw"
          >
            🦞
          </button>
        }
        actions={<GitFooter />}
      />

      <div className={styles.bodyRow}>
        {/* Sidebar — Darwin's nav rail. Used as-designed. */}
        <Sidebar
          items={sidebarItems}
          activeItem={activeLabel}
          onLogout={() => {
            showToast("Daemon-managed session — no logout flow.", {
              type: "info",
              title: "FYI",
              duration: 2500,
            });
          }}
          collapsible
          glass
        />

        <main className={styles.sectionHost}>{children}</main>
      </div>
    </div>
  );
}
