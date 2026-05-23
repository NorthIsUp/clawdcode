import {
  Button,
  Checkbox,
  Dialog,
  ListView,
  TextField,
} from "@liiift-studio/mac-os9-ui";
import { useCallback, useEffect, useState } from "react";
import {
  createJobFile,
  deleteJobFile,
  getJobFile,
  listJobFiles,
  writeJobFile,
  type JobFileEntry,
} from "../../api/jobs";
import { listRepos, type RepoStatus } from "../../api/repos";

interface FlatJob {
  source: string;
  repoSlug: string | null;
  path: string;
  name: string;
}

function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return (slash === -1 ? path : path.slice(slash + 1)).replace(/\.md$/, "");
}

interface ParsedFm {
  enabled: boolean;
  schedule: string;
  recurring: boolean;
  notify: boolean;
}

function parseFm(content: string): { fm: ParsedFm; body: string } {
  const empty: ParsedFm = {
    enabled: true,
    schedule: "",
    recurring: false,
    notify: true,
  };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { fm: empty, body: content };
  const raw = match[1] ?? "";
  const body = match[2] ?? "";
  const fm: ParsedFm = { ...empty };
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    const key = (m[1] ?? "").toLowerCase();
    const val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key === "enabled") fm.enabled = !/^(false|no|0|off)$/i.test(val);
    else if (key === "schedule") fm.schedule = val;
    else if (key === "recurring") fm.recurring = /^(true|yes|1|on)$/i.test(val);
    else if (key === "notify" || key === "notification")
      fm.notify = !/^(false|no|0|off)$/i.test(val);
  }
  return { fm, body };
}

function serializeFm(fm: ParsedFm, body: string): string {
  const lines = [
    "---",
    `enabled: ${fm.enabled}`,
    fm.schedule ? `schedule: "${fm.schedule}"` : "",
    `recurring: ${fm.recurring}`,
    `notify: ${fm.notify}`,
    "---",
    "",
  ].filter(Boolean);
  return `${lines.join("\n")}\n${body.replace(/^\n+/, "")}`;
}

export function RoutinesSection() {
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [local, setLocal] = useState<JobFileEntry[]>([]);
  const [repoFiles, setRepoFiles] = useState<Record<string, JobFileEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FlatJob | null>(null);

  const reload = useCallback(async () => {
    try {
      const [r, lf] = await Promise.all([
        listRepos().catch(() => [] as RepoStatus[]),
        listJobFiles(null).catch(() => [] as JobFileEntry[]),
      ]);
      setRepos(r);
      setLocal(lf);
      const per: Record<string, JobFileEntry[]> = {};
      await Promise.all(
        r.map(async (repo) => {
          if (!repo.cloned) return;
          try {
            per[repo.slug] = await listJobFiles(repo.slug);
          } catch {
            per[repo.slug] = [];
          }
        }),
      );
      setRepoFiles(per);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flat: FlatJob[] = [
    ...local
      .filter((f) => f.isJob)
      .map((f) => ({
        source: "Local",
        repoSlug: null,
        path: f.path,
        name: baseName(f.path),
      })),
    ...repos.flatMap((r) =>
      (repoFiles[r.slug] ?? [])
        .filter((f) => f.isJob)
        .map((f) => ({
          source: r.slug,
          repoSlug: r.slug,
          path: f.path,
          name: baseName(f.path),
        })),
    ),
  ];

  if (loading) {
    return <p style={{ padding: 16 }}>Loading routines…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <fieldset style={{ padding: 8 }}>
        <legend>All routines ({flat.length})</legend>
        {flat.length === 0 ? (
          <p style={{ color: "#555", padding: 8 }}>No routines configured.</p>
        ) : (
          <ListView
            columns={[
              { key: "name", label: "Name", width: "60%" },
              { key: "source", label: "Source", width: "40%" },
            ]}
            items={flat.map((j, i) => ({
              id: `${j.source}:${j.path}:${i}`,
              name: j.name,
              source: j.source,
            }))}
            onItemOpen={(item) => {
              const found = flat.find(
                (j, i) => `${j.source}:${j.path}:${i}` === item.id,
              );
              if (found) setEditing(found);
            }}
          />
        )}
        <div style={{ marginTop: 8, color: "#555", fontSize: 11 }}>
          Double-click a row to edit.
        </div>
      </fieldset>

      {editing ? (
        <JobEditorDialog
          job={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

function JobEditorDialog({
  job,
  onClose,
  onSaved,
}: {
  job: FlatJob;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fm, setFm] = useState<ParsedFm | null>(null);
  const [body, setBody] = useState("");
  const [name, setName] = useState(job.name);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getJobFile(job.path, job.repoSlug);
        if (cancelled) return;
        const parsed = parseFm(res.content);
        setFm(parsed.fm);
        setBody(parsed.body);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.path, job.repoSlug]);

  const handleSave = useCallback(async () => {
    if (!fm) return;
    setSaving(true);
    try {
      const content = serializeFm(fm, body);
      const cleanName = name.trim().replace(/\.md$/i, "");
      if (cleanName !== job.name) {
        const newPath = `${dirOf(job.path)}${cleanName}.md`;
        await createJobFile(newPath, job.repoSlug);
        await writeJobFile(newPath, content, job.repoSlug);
        await deleteJobFile(job.path, job.repoSlug);
      } else {
        await writeJobFile(job.path, content, job.repoSlug);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [fm, body, name, job, onSaved]);

  return (
    <Dialog open onClose={onClose} title={`Edit routine: ${job.name}`}>
      {loading || !fm ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Name</div>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Checkbox
              checked={fm.enabled}
              onChange={(e) => setFm({ ...fm, enabled: e.target.checked })}
              label="Enabled"
            />
            <Checkbox
              checked={fm.recurring}
              onChange={(e) => setFm({ ...fm, recurring: e.target.checked })}
              label="Recurring"
            />
            <Checkbox
              checked={fm.notify}
              onChange={(e) => setFm({ ...fm, notify: e.target.checked })}
              label="Notify"
            />
          </div>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Schedule (cron)</div>
            <TextField
              value={fm.schedule}
              onChange={(e) => setFm({ ...fm, schedule: e.target.value })}
              placeholder="*/15 * * * *"
              fullWidth
            />
          </label>
          <label>
            <div style={{ fontSize: 11, marginBottom: 2 }}>Prompt</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 12,
                resize: "vertical",
              }}
            />
          </label>
          <div
            style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
          >
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              loading={saving}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
