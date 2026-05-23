import { Button, ListView, Select, TextField } from "@liiift-studio/mac-os9-ui";
import { useCallback, useEffect, useState } from "react";
import {
  addMcpServer,
  listMcpServers,
  removeMcpServer,
  type McpListResponse,
  type McpServer,
} from "../../api/mcp";
import { listRepos, syncRepo, type RepoStatus } from "../../api/repos";
import {
  getSettings,
  updateSettings,
  type Settings,
} from "../../api/settings";
import { getState, type StateResponse } from "../../api/state";

const MODELS = [
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const SECURITY = [
  { value: "default", label: "Default" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "bypassPermissions", label: "Bypass Permissions" },
  { value: "plan", label: "Plan" },
];

export function SettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<StateResponse | null>(null);
  const [model, setModel] = useState("");
  const [security, setSecurity] = useState("default");
  const [tz, setTz] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [s, st] = await Promise.all([getSettings(), getState()]);
        setSettings(s);
        setState(st);
        setModel(st.model);
        setSecurity(s.security.level);
        setTz(s.timezone);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateSettings({
        model,
        security: { level: security },
        timezone: tz,
      });
      const [s, st] = await Promise.all([getSettings(), getState()]);
      setSettings(s);
      setState(st);
      alert("Settings saved.");
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [model, security, tz]);

  if (loading || !settings || !state) {
    return <p style={{ padding: 16 }}>Loading…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <fieldset style={{ padding: 8 }}>
        <legend>General</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Model</div>
            <Select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              options={MODELS}
            />
          </label>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Security</div>
            <Select
              value={security}
              onChange={(e) => setSecurity(e.target.value)}
              options={SECURITY}
            />
          </label>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Timezone</div>
            <TextField
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="America/New_York"
              fullWidth
            />
          </label>
          <div>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              loading={saving}
            >
              Save
            </Button>
          </div>
        </div>
      </fieldset>

      <ReposPanel />
      <McpsPanel />
    </div>
  );
}

function ReposPanel() {
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRepos(await listRepos());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSync = async (slug: string) => {
    setSyncing(slug);
    try {
      await syncRepo(slug);
      await reload();
    } finally {
      setSyncing(null);
    }
  };

  return (
    <fieldset style={{ padding: 8 }}>
      <legend>Plugin repos</legend>
      {loading ? (
        <p>Loading…</p>
      ) : repos.length === 0 ? (
        <p style={{ color: "#555" }}>No repos configured.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {repos.map((r) => (
            <div
              key={r.slug}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 4,
                border: "1px solid #888",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold" }}>{r.slug}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{r.url}</div>
              </div>
              <Button
                onClick={() => void handleSync(r.slug)}
                loading={syncing === r.slug}
              >
                Sync
              </Button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function McpsPanel() {
  const [list, setList] = useState<McpListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    transport: "stdio" as McpServer["transport"],
    target: "",
  });

  const reload = useCallback(async () => {
    try {
      setList(await listMcpServers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async () => {
    if (!draft.name.trim() || !draft.target.trim()) return;
    setAdding(true);
    try {
      await addMcpServer({
        name: draft.name.trim(),
        transport: draft.transport,
        target: draft.target.trim(),
        scope: "user",
      });
      setDraft({ name: "", transport: "stdio", target: "" });
      await reload();
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string, scope: McpServer["scope"]) => {
    await removeMcpServer(name, scope);
    await reload();
  };

  if (loading || !list) {
    return (
      <fieldset style={{ padding: 8 }}>
        <legend>MCP servers</legend>
        <p>Loading…</p>
      </fieldset>
    );
  }

  const all = [
    ...list.user.map((s) => ({ ...s, scope: "user" as const })),
    ...list.project.map((s) => ({ ...s, scope: "project" as const })),
  ];

  return (
    <fieldset style={{ padding: 8 }}>
      <legend>MCP servers</legend>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 2fr auto",
            gap: 6,
          }}
        >
          <TextField
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="name"
            fullWidth
          />
          <Select
            value={draft.transport}
            onChange={(e) =>
              setDraft({
                ...draft,
                transport: e.target.value as McpServer["transport"],
              })
            }
            options={[
              { value: "stdio", label: "stdio" },
              { value: "http", label: "http" },
              { value: "sse", label: "sse" },
            ]}
          />
          <TextField
            value={draft.target}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            placeholder={draft.transport === "stdio" ? "command args" : "https://…"}
            fullWidth
          />
          <Button
            variant="primary"
            onClick={() => void handleAdd()}
            loading={adding}
            disabled={!draft.name.trim() || !draft.target.trim()}
          >
            Add
          </Button>
        </div>

        {all.length === 0 ? (
          <p style={{ color: "#555" }}>No MCP servers configured.</p>
        ) : (
          <ListView
            columns={[
              { key: "name", label: "Name", width: "30%" },
              { key: "scope", label: "Scope", width: "15%" },
              { key: "transport", label: "Transport", width: "15%" },
              { key: "target", label: "Target", width: "40%" },
            ]}
            items={all.map((s) => ({
              id: `${s.scope}:${s.name}`,
              name: s.name,
              scope: s.scope,
              transport: s.transport,
              target: s.target,
            }))}
            onItemOpen={(item) => {
              const [scope, name] = String(item.id).split(":");
              if (scope && name) {
                void handleRemove(name, scope as McpServer["scope"]);
              }
            }}
          />
        )}
        <div style={{ color: "#555", fontSize: 11 }}>
          Double-click a server to remove it.
        </div>
      </div>
    </fieldset>
  );
}
