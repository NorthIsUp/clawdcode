// ---------------------------------------------------------------------------
// Job frontmatter parsing — mirrors script.ts parseJobFrontmatter /
// summarizeFrontmatter for the React rewrite.
// ---------------------------------------------------------------------------

export interface JobFrontmatter {
  schedule: string;
  recurring?: string;
  notify?: string;
  model?: string;
  reuseSession?: string;
  retry?: string;
  retryDelay?: string;
  timeout?: string;
}

/**
 * Parse job frontmatter from raw file content.
 * Returns null if no valid frontmatter with a `schedule:` field is present.
 */
export function parseJobFrontmatter(content: string): JobFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return null;
  const lines = (match[1] ?? "").split("\n").map((l) => l.trim());

  function fmVal(prefix: string): string | null {
    const line = lines.find((l) => l.startsWith(prefix));
    if (!line) return null;
    return line
      .slice(prefix.length)
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  const schedule = fmVal("schedule:");
  if (!schedule) return null;

  const fm: JobFrontmatter = { schedule };
  const recurring = fmVal("recurring:");
  if (recurring !== null) fm.recurring = recurring;
  const notify = fmVal("notify:");
  if (notify !== null) fm.notify = notify;
  const model = fmVal("model:");
  if (model) fm.model = model;
  const reuseSession = fmVal("reuse_session:");
  if (reuseSession !== null) fm.reuseSession = reuseSession;
  const retry = fmVal("retry:");
  if (retry !== null) fm.retry = retry;
  const retryDelay = fmVal("retry_delay:");
  if (retryDelay !== null) fm.retryDelay = retryDelay;
  const timeout = fmVal("timeout:");
  if (timeout !== null) fm.timeout = timeout;
  return fm;
}

/** Produce a one-line human-friendly summary of a parsed frontmatter object. */
export function summarizeFrontmatter(fm: JobFrontmatter): string {
  const parts: string[] = [];
  parts.push(`schedule: ${fm.schedule}`);

  if (fm.recurring != null) {
    const r = fm.recurring.toLowerCase();
    if (r === "true" || r === "yes" || r === "1") {
      parts.push("recurring");
    } else {
      parts.push("recurring: off");
    }
  }

  if (fm.notify != null) {
    const n = fm.notify.toLowerCase();
    if (n === "false" || n === "no") {
      parts.push("notify: off");
    } else if (n === "error") {
      parts.push("notify: error");
    } else {
      parts.push("notify: on");
    }
  }

  if (fm.reuseSession != null) {
    const rs = fm.reuseSession.toLowerCase();
    if (rs === "true" || rs === "yes" || rs === "1") {
      parts.push("reuse_session: keep");
    }
  }

  if (fm.model) {
    parts.push(`model: ${fm.model}`);
  }

  if (fm.retry != null) {
    parts.push(`retry: ${fm.retry}`);
  }

  if (fm.timeout != null) {
    parts.push(`timeout: ${fm.timeout}m`);
  }

  return parts.join("  ·  ");
}
