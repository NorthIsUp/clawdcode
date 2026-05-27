export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Wrap an async handler so any thrown error becomes a uniform JSON 500
 * response — `{ ok: false, error: "<message>" }`. Previously each handler
 * had its own try/catch and most returned 200 with `ok:false`, which broke
 * client error handling (callers check `res.ok`, not the body).
 */
export async function withJson(
  handler: () => Promise<unknown>,
  errorStatus = 500,
): Promise<Response> {
  try {
    const body = await handler();
    return json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, errorStatus);
  }
}
