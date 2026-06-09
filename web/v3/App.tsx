import { CircleHelp, Cog, MessagesSquare, Webhook, Workflow } from "lucide-react";
import {
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useState,
} from "react";
import { ChatPane } from "./components/ChatPane";
import { Sidebar } from "./components/Sidebar";
import type { V3View } from "./router";
import { selectedThreadId, useRoute } from "./router";
import { AboutView } from "./sections/AboutView";
import { DeliveriesView } from "./sections/DeliveriesView";
import { RoutinesView } from "./sections/RoutinesView";
import { SettingsView } from "./sections/SettingsView";

/**
 * v3 two-zone shell.
 *
 *   ┌──────────┬───────────────────────────────┐
 *   │ Sidebar  │            MainPane            │
 *   │ (hook    │  chat | deliveries | routines │
 *   │  tree +  │  | settings | about           │
 *   │  bottom  │                               │
 *   │  nav)    │                               │
 *   └──────────┴───────────────────────────────┘
 *
 * ──────────────────────────────────────────────────────────────────────────
 * EXTENSION POINTS for the parallel frontend agents (spec §11). App.tsx is
 * owned by Foundation; agents register their views WITHOUT editing each
 * other by replacing the placeholders below with their real modules:
 *
 *  (a) Sidebar agent  — replace `<SidebarPlaceholder/>` with
 *        `import { Sidebar } from "./components/Sidebar"`.
 *      Sidebar must call `selectThread(threadId)` (from useRoute) to select a
 *      thread and `goto(view)` to switch the main pane. It reads the selected
 *      thread via `selectedThreadId(route)`.
 *
 *  (b) Chat-pane agent — replace the `chat` branch of MAIN_VIEWS with
 *        `import { ChatPane } from "./components/ChatPane"` and render
 *        `<ChatPane threadId={threadId} />`. `threadId` is passed in props.
 *
 *  (c) Bottom-nav agent — replace the `deliveries` / `routines` / `settings`
 *        / `about` placeholders in MAIN_VIEWS with the real section views
 *        from `./sections/*`. Each is a zero-prop component.
 *
 * The contract between zones is the hash router (`router.ts`): selecting a
 * thread is `selectThread(id)` → `#/chat/<id>`; switching a bottom-nav view is
 * `goto(view)`. No cross-imports between agent modules are required.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Props every main-pane view receives. `threadId` is only set for `chat`. */
export type MainPaneProps = {
  threadId: string | null;
};

/**
 * Registry of main-pane views keyed by route. Frontend agents swap each
 * placeholder for their real component (same `ComponentType<MainPaneProps>`
 * signature) during integration — no other file needs to change.
 */
const MAIN_VIEWS: Record<V3View, ComponentType<MainPaneProps>> = {
  chat: ChatPane,
  deliveries: DeliveriesView,
  routines: RoutinesView,
  settings: SettingsView,
  about: AboutView,
};

/** Bottom-nav items shown in the sidebar footer. */
export const BOTTOM_NAV: {
  view: V3View;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { view: "chat", label: "Chat", Icon: MessagesSquare },
  { view: "deliveries", label: "Deliveries", Icon: Webhook },
  { view: "routines", label: "Routines", Icon: Workflow },
  { view: "settings", label: "Settings", Icon: Cog },
  { view: "about", label: "About", Icon: CircleHelp },
];

const SIDEBAR_W_KEY = "clawdcode:v3:sidebarW";
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 560;

function loadSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_W_KEY));
    if (v >= SIDEBAR_MIN && v <= SIDEBAR_MAX) {
      return v;
    }
  } catch {
    // ignore
  }
  return 288;
}

export default function App() {
  const { route, goto, selectThread } = useRoute();
  const threadId = selectedThreadId(route);
  const MainView = MAIN_VIEWS[route.view];

  const [sidebarW, setSidebarW] = useState(loadSidebarWidth);
  // Drag-to-resize the sidebar (the divider between the two zones). Width is
  // clamped and persisted so it survives reloads.
  const onResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      setSidebarW(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      setSidebarW((w) => {
        try {
          localStorage.setItem(SIDEBAR_W_KEY, String(w));
        } catch {
          // ignore
        }
        return w;
      });
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div className="v3-shell h-screen flex overflow-hidden text-base-content">
      {/* Zone 1: sidebar (hook tree + bottom nav). */}
      <aside
        style={{ width: sidebarW }}
        className="shrink-0 max-w-[85vw] border-r border-base-300 bg-base-100/85 backdrop-blur-sm flex flex-col overflow-hidden"
      >
        <Sidebar
          activeView={route.view}
          activeThreadId={threadId}
          onSelectThread={selectThread}
          onSelectView={goto}
        />
      </aside>

      {/* Drag handle between the zones. */}
      <button
        type="button"
        aria-label="Resize sidebar"
        onMouseDown={onResizeStart}
        className="w-1 shrink-0 cursor-col-resize border-0 bg-base-300/30 p-0 transition-colors hover:bg-primary/50"
      />

      {/* Zone 2: main pane. */}
      <main className="v3-main flex-1 min-w-0 flex flex-col overflow-hidden">
        <MainView threadId={threadId} />
      </main>
    </div>
  );
}
