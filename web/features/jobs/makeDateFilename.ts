/**
 * Generate a sortable date-stamp filename in the configured timezone.
 * Matches the vanilla `makeDateFilename` in script.ts.
 *
 * @param withSeconds - append seconds to avoid same-minute collisions
 */
export function makeDateFilename(withSeconds: boolean): string {
  const tz = localStorage.getItem("clock.timezone") ?? "UTC";
  const now = new Date();
  const parts: Record<string, string> = {};
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    for (const p of fmt.formatToParts(now)) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
  } catch {
    // Fallback to UTC
    parts.year = String(now.getUTCFullYear());
    parts.month = String(now.getUTCMonth() + 1).padStart(2, "0");
    parts.day = String(now.getUTCDate()).padStart(2, "0");
    parts.hour = String(now.getUTCHours()).padStart(2, "0");
    parts.minute = String(now.getUTCMinutes()).padStart(2, "0");
    parts.second = String(now.getUTCSeconds()).padStart(2, "0");
  }
  let base = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
  if (withSeconds) base += parts.second ?? "";
  return `${base}.md`;
}

/** Returns true when a basename is a date-stamp filename (e.g. `2025-01-23-1045.md`). */
export function isDateFilename(filename: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(filename);
}
