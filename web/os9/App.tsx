import {
  MenuBar,
  MenuItem,
  TabPanel,
  Tabs,
  Window,
} from "@liiift-studio/mac-os9-ui";
import { useState } from "react";
import { ChatsSection } from "./sections/ChatsSection";
import { HomeSection } from "./sections/HomeSection";
import { RoutinesSection } from "./sections/RoutinesSection";
import { SettingsSection } from "./sections/SettingsSection";

export default function App() {
  const [activeTab, setActiveTab] = useState(0);

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
          <MenuItem label="Home" onClick={() => setActiveTab(0)} />
          <MenuItem label="Chats" onClick={() => setActiveTab(1)} />
          <MenuItem label="Routines" onClick={() => setActiveTab(2)} />
          <MenuItem label="Settings" onClick={() => setActiveTab(3)} />
        </>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 980 }}>
        <Window title="ClaudeClaw">
          <MenuBar menus={menus} />
          <div style={{ padding: 8, minHeight: 480 }}>
            <Tabs activeTab={activeTab} onChange={setActiveTab}>
              <TabPanel label="Home">
                <HomeSection />
              </TabPanel>
              <TabPanel label="Chats">
                <ChatsSection />
              </TabPanel>
              <TabPanel label="Routines">
                <RoutinesSection />
              </TabPanel>
              <TabPanel label="Settings">
                <SettingsSection />
              </TabPanel>
            </Tabs>
          </div>
        </Window>
      </div>
    </div>
  );
}
