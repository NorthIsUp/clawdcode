import { useEffect, useState } from "react";
import styles from "./GitFooter.module.css";

interface GitInfo {
  sha8: string;
  dirty: boolean;
  commitUrl: string;
}

/** Read token from URL once, stash in module-level var for the session. */
let cachedToken: string | null = null;
function getToken(): string {
  if (cachedToken !== null) return cachedToken;
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) {
    cachedToken = fromUrl;
    try {
      sessionStorage.setItem("cc_token", fromUrl);
    } catch {
      // ignore
    }
    return cachedToken;
  }
  try {
    cachedToken = sessionStorage.getItem("cc_token") ?? "";
  } catch {
    cachedToken = "";
  }
  return cachedToken;
}

export function GitFooter() {
  const [git, setGit] = useState<GitInfo | null>(null);

  useEffect(() => {
    const token = getToken();
    const url = token
      ? `/api/state?token=${encodeURIComponent(token)}`
      : "/api/state";
    fetch(url)
      .then(
        (r) =>
          r.json() as Promise<{
            runtime?: {
              git?: { sha8?: string; dirty?: boolean; commitUrl?: string };
            };
          }>,
      )
      .then((data) => {
        const g = data?.runtime?.git;
        if (g?.sha8) {
          setGit({
            sha8: g.sha8,
            dirty: g.dirty ?? false,
            commitUrl: g.commitUrl ?? "",
          });
        }
      })
      .catch(() => {
        // no git info, stay hidden
      });
  }, []);

  if (!git) return null;

  const label = git.dirty ? `${git.sha8}*` : git.sha8;

  return (
    <a
      href={git.commitUrl || undefined}
      target="_blank"
      rel="noreferrer"
      className={styles.footer}
      title={`Commit ${label}`}
    >
      {label}
    </a>
  );
}
