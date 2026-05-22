import { existsSync } from "fs";
import { join } from "path";
import { getSettings, getJobsRepoDir } from "./config";
import { discoverJobsRepoPlugins, type JobsRepoPlugin } from "./jobsRepoPlugins";

export interface GitResult { ok: boolean; stdout: string; stderr: string; code: number; }

export interface JobsRepoStatus {
  configured: boolean;
  cloned: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  branch: string;
  lastPullAt: string | null;
  lastError: string | null;
  plugins: JobsRepoPlugin[];
}

export interface SyncResult {
  ok: boolean;
  committed: boolean;
  pushed: boolean;
  message: string;
  error: string | null;
}

let lastPullAt: string | null = null;
let lastError: string | null = null;

/** Run a git command in `cwd`. Never throws — returns ok=false on failure. */
export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    return { ok: code === 0, stdout, stderr, code };
  } catch (e) {
    return { ok: false, stdout: "", stderr: String(e), code: -1 };
  }
}

/** Parse `git status --porcelain` output. */
export function parseStatus(porcelain: string): { dirty: boolean } {
  return { dirty: porcelain.trim().length > 0 };
}

function repoDir(): string { return getJobsRepoDir(); }
function isCloned(): boolean { return existsSync(join(repoDir(), ".git")); }

/** Clone the jobs repo if configured and not yet present. */
export async function ensureJobsRepo(): Promise<void> {
  const { jobsRepo } = getSettings();
  if (!jobsRepo.url) return;
  if (isCloned()) return;
  const res = await runGit(process.cwd(), [
    "clone", "--branch", jobsRepo.branch, jobsRepo.url, repoDir(),
  ]);
  if (!res.ok) {
    lastError = `clone failed: ${res.stderr.trim()}`;
    console.warn(`[jobsRepo] ${lastError}`);
  } else {
    console.log(`[jobsRepo] cloned ${jobsRepo.url} (${jobsRepo.branch})`);
  }
}

/** Fast-forward pull — only when the working tree is clean. */
export async function pullJobsRepo(): Promise<JobsRepoStatus> {
  const { jobsRepo } = getSettings();
  if (!jobsRepo.url || !isCloned()) return getJobsRepoStatus();
  const st = await runGit(repoDir(), ["status", "--porcelain"]);
  if (parseStatus(st.stdout).dirty) {
    lastError = "local job edits not synced — pull skipped";
    return getJobsRepoStatus();
  }
  const fetched = await runGit(repoDir(), ["fetch", "origin", jobsRepo.branch]);
  if (!fetched.ok) {
    lastError = `fetch failed: ${fetched.stderr.trim()}`;
    return getJobsRepoStatus();
  }
  const merged = await runGit(repoDir(), ["merge", "--ff-only", `origin/${jobsRepo.branch}`]);
  if (!merged.ok) {
    lastError = `merge failed: ${merged.stderr.trim()}`;
    return getJobsRepoStatus();
  }
  lastError = null;
  lastPullAt = new Date().toISOString();
  return getJobsRepoStatus();
}

/** Current jobs-repo status snapshot. */
export async function getJobsRepoStatus(): Promise<JobsRepoStatus> {
  const { jobsRepo } = getSettings();
  const cloned = isCloned();
  let dirty = false, ahead = 0, behind = 0;
  if (cloned) {
    const st = await runGit(repoDir(), ["status", "--porcelain"]);
    dirty = parseStatus(st.stdout).dirty;
    const counts = await runGit(repoDir(), [
      "rev-list", "--left-right", "--count", `HEAD...origin/${jobsRepo.branch}`,
    ]);
    if (counts.ok) {
      const [a, b] = counts.stdout.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
      ahead = a ?? 0; behind = b ?? 0;
    }
  }
  const plugins = await discoverJobsRepoPlugins();
  return {
    configured: !!jobsRepo.url,
    cloned, dirty, ahead, behind,
    branch: jobsRepo.branch,
    lastPullAt, lastError,
    plugins,
  };
}

/** Auto-generated commit message for a UI-triggered sync. */
export function buildCommitMessage(now: Date = new Date()): string {
  return `claudeclaw: sync jobs (${now.toISOString().replace("T", " ").slice(0, 19)} UTC)`;
}

/** Stage everything, commit (if there are changes), and push. */
export async function syncJobsRepo(): Promise<SyncResult> {
  const { jobsRepo } = getSettings();
  if (!jobsRepo.url || !isCloned()) {
    return { ok: false, committed: false, pushed: false, message: "", error: "jobs repo not configured" };
  }
  await runGit(repoDir(), ["add", "-A"]);
  const status = await runGit(repoDir(), ["status", "--porcelain"]);
  const message = buildCommitMessage();
  let committed = false;
  if (parseStatus(status.stdout).dirty) {
    const commit = await runGit(repoDir(), ["commit", "-m", message]);
    if (!commit.ok) {
      return { ok: false, committed: false, pushed: false, message, error: commit.stderr.trim() };
    }
    committed = true;
  }
  const push = await runGit(repoDir(), ["push", "origin", jobsRepo.branch]);
  if (!push.ok) {
    return { ok: false, committed, pushed: false, message, error: push.stderr.trim() };
  }
  lastError = null;
  return { ok: true, committed, pushed: true, message, error: null };
}
