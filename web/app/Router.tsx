import { EmptyState } from "../components/EmptyState";
import { SectionFrame } from "../components/SectionFrame";
import { useHash } from "../hooks/useHash";
import { ChatsSection } from "./sections/ChatsSection";
import { HomeSection } from "./sections/HomeSection";
import { JobsSection } from "./sections/JobsSection";

function Placeholder({ name }: { name: string }) {
  return (
    <SectionFrame title={name}>
      <EmptyState message={`${name} — Phase N will fill this in.`} />
    </SectionFrame>
  );
}

/**
 * Router reads the URL hash via useHash() and renders the matching section
 * inside a SectionFrame. Phases 7–8 will replace the remaining placeholder
 * bodies with real section components.
 */
export default function Router() {
  const { section, file, repo } = useHash();

  switch (section) {
    case "home":
      return <HomeSection />;
    case "chats":
      return <ChatsSection />;
    case "jobs":
      return <JobsSection initialFile={file} initialRepo={repo} />;
    case "settings":
      return <Placeholder name="Settings" />;
    default:
      return <HomeSection />;
  }
}
