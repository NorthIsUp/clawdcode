/**
 * Pure time formatter — respects 12/24h preference and timezone.
 * Ported from src/ui/page/script.ts `formatClockTime` + `use12Hour` + `clockTimezone`.
 */

export function formatClockTime(isoOrMs: string | number | Date): string {
  try {
    const d = new Date(isoOrMs as string | number);
    if (Number.isNaN(d.getTime())) return "";
    const use12Hour = localStorage.getItem("clock.format") === "12";
    const clockTimezone = localStorage.getItem("clock.timezone") ?? "UTC";
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: use12Hour,
      timeZone: clockTimezone,
    });
  } catch {
    return "";
  }
}

export function formatSessionTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const clockTimezone = localStorage.getItem("clock.timezone") ?? "UTC";
    const dateStr = d.toLocaleDateString([], { timeZone: clockTimezone });
    const nowStr = now.toLocaleDateString([], { timeZone: clockTimezone });
    if (dateStr === nowStr) {
      return formatClockTime(d);
    }
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      timeZone: clockTimezone,
    });
  } catch {
    return "";
  }
}
