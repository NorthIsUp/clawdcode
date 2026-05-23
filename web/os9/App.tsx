import { MenuBar, MenuItem, Window } from "@liiift-studio/mac-os9-ui";
import { useEffect, useState } from "react";
import { Os9Scroll } from "./components/Os9Scroll";
import { ChatsSection } from "./sections/ChatsSection";
import { HomeSection } from "./sections/HomeSection";
import { RoutinesSection } from "./sections/RoutinesSection";
import { SettingsSection } from "./sections/SettingsSection";

type SectionId = "home" | "chats" | "routines" | "settings";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "chats", label: "Chats" },
  { id: "routines", label: "Routines" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [section, setSection] = useState<SectionId>("home");
  const [viewportH, setViewportH] = useState(() => window.innerHeight);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const current = SECTIONS.find((s) => s.id === section);

  const menus = [
    {
      label: "🦞",
      items: (
        <>
          <MenuItem
            label="About ClaudeClaw…"
            onClick={() => alert("ClaudeClaw — Classic edition")}
          />
          <MenuItem
            label="Switch to Darwin UI"
            onClick={() => {
              window.location.href = "/darwin/";
            }}
          />
        </>
      ),
    },
    {
      label: "View",
      items: (
        <>
          {SECTIONS.map((s) => (
            <MenuItem
              key={s.id}
              label={s.label}
              checked={s.id === section}
              onClick={() => setSection(s.id)}
            />
          ))}
        </>
      ),
    },
  ];

  // Page menu bar (~28) + window title (~22) + borders + margin.
  const scrollHeight = Math.max(240, viewportH - 130);

  return (
    <div style={{ width: "100%" }}>
      <MenuBar menus={menus} />
      <div style={{ width: "100%", maxWidth: 980, margin: "16px auto 0" }}>
        <Window title={`🦞 ClaudeClaw — ${current?.label ?? ""}`}>
          <Os9Scroll height={scrollHeight}>
            <div style={{ padding: 8 }}>
              {section === "home" ? <HomeSection /> : null}
              {section === "chats" ? <ChatsSection /> : null}
              {section === "routines" ? <RoutinesSection /> : null}
              {section === "settings" ? <SettingsSection /> : null}
            </div>
          </Os9Scroll>
        </Window>
      </div>
    </div>
  );
}
