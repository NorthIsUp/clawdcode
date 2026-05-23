import { ListView } from "@liiift-studio/mac-os9-ui";
import { useEffect, useState } from "react";
import { getUsage, type SessionUsage } from "../../api/usage";
import {
  getUsageTimeline,
  type UsageTimelineResponse,
} from "../../api/timeline";

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function HomeSection() {
  const [usage, setUsage] = useState<SessionUsage[]>([]);
  const [timeline, setTimeline] = useState<UsageTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [u, t] = await Promise.all([
          getUsage().catch(() => [] as SessionUsage[]),
          getUsageTimeline("24h").catch(() => null),
        ]);
        setUsage(Array.isArray(u) ? u : []);
        setTimeline(t);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalTokens = timeline
    ? timeline.buckets.reduce((s, b) => s + b.totalTokens, 0)
    : 0;
  const totalCost = timeline
    ? timeline.buckets.reduce((s, b) => s + b.totalCostUsd, 0)
    : 0;

  if (loading) {
    return <p style={{ padding: 16 }}>Loading…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <fieldset style={{ padding: 8 }}>
        <legend>Today (24h)</legend>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: "#555" }}>Tokens</div>
            <div style={{ fontSize: 20, fontWeight: "bold" }}>
              {fmtTokens(totalTokens)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555" }}>Cost</div>
            <div style={{ fontSize: 20, fontWeight: "bold" }}>
              {fmtUsd(totalCost)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#555" }}>Sessions</div>
            <div style={{ fontSize: 20, fontWeight: "bold" }}>{usage.length}</div>
          </div>
        </div>
      </fieldset>

      <fieldset style={{ padding: 8 }}>
        <legend>Recent sessions</legend>
        <ListView
          columns={[
            { key: "label", label: "Session", width: "60%" },
            { key: "channel", label: "Channel", width: "15%" },
            { key: "turns", label: "Turns", width: "10%" },
            { key: "cost", label: "Cost", width: "15%" },
          ]}
          items={usage.slice(0, 20).map((s) => ({
            id: s.sessionId,
            label: s.label,
            channel: s.channel,
            turns: String(s.turnCount),
            cost: fmtUsd(s.estimatedCostUsd),
          }))}
        />
      </fieldset>
    </div>
  );
}
