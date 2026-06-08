import {
  CircleHelp,
  Cog,
  MessagesSquare,
  Webhook,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";
import { ChatPane } from "./components/ChatPane";
import { Sidebar } from "./components/Sidebar";
import { AboutView } from "./sections/AboutView";
import { DeliveriesView } from "./sections/DeliveriesView";
import { RoutinesView } from "./sections/RoutinesView";
import { SettingsView } from "./sections/SettingsView";
import { selectedThreadId, useRoute } from "./router";
import type { V3View } from "./router";

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

export default function App() {
  const { route, goto, selectThread } = useRoute();
  const threadId = selectedThreadId(route);
  const MainView = MAIN_VIEWS[route.view];

  return (
    <div className="h-screen flex overflow-hidden bg-base-200 text-base-content">
      {/* Zone 1: sidebar (hook tree + bottom nav). Owned by Sidebar agent. */}
      <aside className="shrink-0 w-72 max-w-[80vw] border-r border-base-300 bg-base-100 flex flex-col overflow-hidden">
        <Sidebar
          activeView={route.view}
          activeThreadId={threadId}
          onSelectThread={selectThread}
          onSelectView={goto}
        />
      </aside>

      {/* Zone 2: main pane. Owned by Chat-pane + Bottom-nav agents. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <MainView threadId={threadId} />
      </main>
    </div>
  );
}

