import { useCallback, useEffect, useState } from "react";

const VALID_SECTIONS = ["home", "chats", "jobs", "settings"] as const;
type Section = (typeof VALID_SECTIONS)[number];

function parseHash(): Section {
  const raw = window.location.hash.slice(1); // strip leading '#'
  if ((VALID_SECTIONS as readonly string[]).includes(raw)) {
    return raw as Section;
  }
  return "home";
}

export function useHash(): {
  section: Section;
  setHash: (name: Section) => void;
} {
  const [section, setSection] = useState<Section>(parseHash);

  useEffect(() => {
    function onHashChange() {
      setSection(parseHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setHash = useCallback((name: Section) => {
    window.location.hash = name;
  }, []);

  return { section, setHash };
}
