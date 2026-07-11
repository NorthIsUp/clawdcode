import { asDeliverySource } from "../../shared/deliverySources";
import type { DeliveryField, DeliveryKeys } from "../../shared/deliveryTypes";
import type { PluginInitFn } from "../plugins";
import type { SourcePlugin } from "./sources";
import type { WebhookSpec } from "./webhookEnvelope";

/**
 * A generic, token-authenticated webhook SOURCE plugin — the existence proof
 * for the open (plugin) tier of the source registry, before the `SourcePlugin`
 * interface freezes.
 *
 * It is deliberately minimal but real: shared-token auth (header or `?token=`
 * query param, like Datadog), a configurable event-name field, and top-level
 * field extraction for the deliveries table. It has no routine-config trigger
 * (`configKeys: []`) — a delivery is recorded + enriched but fires no routine —
 * which is enough to exercise the full inbound lifecycle (route → verify →
 * parse → record → evaluate) through the generic dispatcher.
 *
 * Register one via `PluginManager.registerSource` (see app/plugins.ts) or the
 * ready-made {@link genericWebhookPlugin} init function.
 */

export interface GenericWebhookConfig {
  /** Source id (branded into the plugin tier on registration). Also the event
   *  namespace: an event with no explicit name becomes `<id>:event`, and the
   *  source `ownsEvent` for `<id>:*`. Default `"generic"`. */
  id?: string;
  /** Env var holding the shared token. Empty/unset ⇒ verification disabled
   *  (accept as-is), matching the opt-in posture of the core sources.
   *  Default `ERRANDD_GENERIC_WEBHOOK_TOKEN`. */
  tokenEnv?: string;
  /** Header the token may arrive in (a `?token=` query param is always
   *  accepted too). Default `x-errandd-token`. */
  tokenHeader?: string;
  /** Top-level payload field naming the event/type. Default `event`. */
  eventField?: string;
  /** Top-level payload field to dedup on. Default `id`. */
  idField?: string;
}

interface ResolvedConfig {
  id: string;
  tokenEnv: string;
  tokenHeader: string;
  eventField: string;
  idField: string;
}

function resolve(config: GenericWebhookConfig): ResolvedConfig {
  return {
    id: config.id ?? "generic",
    tokenEnv: config.tokenEnv ?? "ERRANDD_GENERIC_WEBHOOK_TOKEN",
    tokenHeader: config.tokenHeader ?? "x-errandd-token",
    eventField: config.eventField ?? "event",
    idField: config.idField ?? "id",
  };
}

/** Read a top-level string/number field off the payload. */
function readField(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const v = (payload as Record<string, unknown>)[field];
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return null;
}

/** Build a `SourcePlugin` for a token-authenticated generic webhook source. */
export function createGenericWebhookSource(config: GenericWebhookConfig = {}): SourcePlugin {
  const c = resolve(config);
  const eventPrefix = `${c.id}:`;
  // The id is branded into the DeliverySource space here; `registerSource`
  // re-validates it (rejecting a core-id collision) on registration.
  const sourceId = asDeliverySource(c.id);

  const buildSpec = (): WebhookSpec => ({
    source: sourceId,
    auth: { kind: "token", header: c.tokenHeader, secret: process.env[c.tokenEnv] ?? "" },
    deriveIdentity: (_req, payload) => {
      const name = readField(payload, c.eventField) || "event";
      const rawId = readField(payload, c.idField);
      return {
        event: `${eventPrefix}${name}`,
        id: rawId ? `${c.id}-${rawId}` : `${c.id}-${Date.now().toString(36)}`,
        summary: [c.id, name].filter(Boolean).join(" · "),
      };
    },
    // Minimal source: record + enrich, fire nothing (no routine-config trigger).
    match: () => [],
    recordAttempt: () => {
      // The envelope still 200/401/400s correctly; a generic source doesn't need
      // a bespoke failed-attempt row, so this is intentionally a no-op.
    },
  });

  return {
    id: sourceId,
    routePath: `/api/webhooks/${c.id}`,
    aliasPath: `/api/${c.id}/webhook`,
    webhookSpec: buildSpec,
    ownsEvent: (event: string) => event.startsWith(eventPrefix),
    extractFields: (_event, payload): DeliveryField[] => {
      const out: DeliveryField[] = [];
      const name = readField(payload, c.eventField);
      if (name) {
        out.push({ label: c.eventField, value: name });
      }
      const title = readField(payload, "title") ?? readField(payload, "message");
      if (title) {
        out.push({ label: "title", value: title });
      }
      return out;
    },
    extractKeys: (_event, payload): DeliveryKeys => ({
      key1Label: "event",
      key1: readField(payload, c.eventField) ?? "",
      key2Label: "id",
      key2: readField(payload, c.idField) ?? "",
    }),
    extractPk: (_event, payload): string => readField(payload, c.idField) ?? "",
    configKeys: [],
    providerStatus: (origin: string) => {
      const secret = process.env[c.tokenEnv] ?? "";
      return {
        configured: secret.length > 0,
        secret,
        url: `${origin}/api/webhooks/${c.id}`,
        secretEnv: c.tokenEnv,
        extra: {
          tokenUrl: secret
            ? `${origin}/api/webhooks/${c.id}?token=${encodeURIComponent(secret)}`
            : `${origin}/api/webhooks/${c.id}`,
        },
      };
    },
  };
}

/**
 * Ready-made plugin init that registers the default generic-webhook source.
 * Wire it into settings.json `plugins` like any other daemon plugin, or call it
 * with a `PluginApi` directly. Exists to prove `registerSource` end-to-end.
 */
export const genericWebhookPlugin: PluginInitFn = (api) => {
  api.registerSource(createGenericWebhookSource());
};
