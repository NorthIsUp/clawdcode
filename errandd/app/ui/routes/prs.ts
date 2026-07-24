import { getCachedOpenPRs } from "../../pr-poller";
import { getPrStates } from "../../pr-state";
import { json } from "../http";
import type { RouteHandler } from "./types";

/**
 * GET /api/prs/open — flat list of all open PRs from the reconciliation poller,
 * plus `states`: the per-PR git-state map (`repo#num` → open/merged/closed/
 * conflicted) accumulated from GitHub `pull_request` webhooks. The sidebar
 * overlays `states` onto every PR row (queue-derived and polled alike).
 */
export const openPRsList: RouteHandler = () => {
  const { prs, fetchedAt } = getCachedOpenPRs();
  return json({ prs, fetchedAt, states: getPrStates() });
};
