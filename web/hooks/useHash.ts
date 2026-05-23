import { useCallback, useEffect, useState } from "react";

const VALID_SECTIONS = ["home", "chats", "jobs", "settings"] as const;
type Section = (typeof VALID_SECTIONS)[number];

export interface HashState {
  section: Section;
  /** For `#jobs?file=X&repo=Y` — the `file` query param value (decoded). */
  file: string | null;
  /** For `#jobs?file=X&repo=Y` — the `repo` query param value (decoded). */
  repo: string | null;
}

function parseHash(): HashState {
  const raw = window.location.hash.slice(1); // strip leading '#'
  const qIdx = raw.indexOf("?");
  const sectionStr = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const section: Section = (VALID_SECTIONS as readonly string[]).includes(
    sectionStr,
  )
    ? (sectionStr as Section)
    : "home";

  if (qIdx === -1) return { section, file: null, repo: null };

  const params = new URLSearchParams(raw.slice(qIdx + 1));
  return {
    section,
    file: params.get("file"),
    repo: params.get("repo"),
  };
}

export function useHash(): HashState & { setHash: (name: Section) => void } {
  const [state, setState] = useState<HashState>(parseHash);

  useEffect(() => {
    function onHashChange() {
      setState(parseHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setHash = useCallback((name: Section) => {
    window.location.hash = name;
  }, []);

  return { ...state, setHash };
}
