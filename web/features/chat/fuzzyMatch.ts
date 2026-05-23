/**
 * Pure subsequence-match scorer for slash command autocomplete.
 * Ported from src/ui/page/script.ts `updateSlashAutocomplete` scoring block.
 *
 * Scoring:
 * - Prefix hit (name starts with query): score = 1000 - queryLength
 * - Subsequence hit:                     score = 500 - firstHit - (lastHit - firstHit)
 * - No match:                            returns null
 *
 * Higher score = better match.
 */
export interface ScoredItem<T> {
  item: T;
  score: number;
}

/**
 * Score a single query against a name. Returns null if the query is not a
 * subsequence of the name. Returns the score otherwise.
 */
export function scoreFuzzy(query: string, name: string): number | null {
  const q = query.toLowerCase();
  const n = name.toLowerCase();

  if (q.length === 0) return 0;

  // Prefix match
  if (n.startsWith(q)) return 1000 - q.length;

  // Subsequence match
  let idx = 0;
  let firstHit = -1;
  let lastHit = -1;
  for (const ch of q) {
    const found = n.indexOf(ch, idx);
    if (found === -1) return null;
    if (firstHit === -1) firstHit = found;
    lastHit = found;
    idx = found + 1;
  }
  return 500 - firstHit - (lastHit - firstHit);
}

/**
 * Filter and rank items by how well their `getName(item)` matches `query`.
 * Items that don't match are excluded. Results are sorted highest-score first.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getName: (item: T) => string,
): T[] {
  const scored: ScoredItem<T>[] = [];
  for (const item of items) {
    const score = scoreFuzzy(query, getName(item));
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
