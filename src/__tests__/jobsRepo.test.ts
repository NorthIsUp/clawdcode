import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runGit, parseStatus } from "../jobsRepo";

async function tmp(): Promise<string> { return mkdtemp(join(tmpdir(), "ccjr-")); }

test("runGit reports failure for a bad command", async () => {
  const dir = await tmp();
  const res = await runGit(dir, ["status"]); // not a repo
  expect(res.ok).toBe(false);
  await rm(dir, { recursive: true, force: true });
});

test("parseStatus detects clean vs dirty", () => {
  expect(parseStatus("").dirty).toBe(false);
  expect(parseStatus(" M jobs/a.md\n").dirty).toBe(true);
});

test("clone + clean status round-trips", async () => {
  const remote = await tmp();
  await runGit(remote, ["init", "--bare"]);
  const work = await tmp();
  await runGit(work, ["init"]);
  await runGit(work, ["config", "user.email", "t@t"]);
  await runGit(work, ["config", "user.name", "t"]);
  await writeFile(join(work, "a.md"), "---\nschedule: \"0 9 * * *\"\n---\nhi\n");
  await runGit(work, ["add", "-A"]);
  await runGit(work, ["commit", "-m", "init"]);
  await runGit(work, ["branch", "-M", "main"]);
  await runGit(work, ["remote", "add", "origin", remote]);
  await runGit(work, ["push", "-u", "origin", "main"]);

  const clone = await tmp();
  await rm(clone, { recursive: true, force: true });
  const c = await runGit(process.cwd(), ["clone", "--branch", "main", remote, clone]);
  expect(c.ok).toBe(true);
  const st = await runGit(clone, ["status", "--porcelain"]);
  expect(parseStatus(st.stdout).dirty).toBe(false);

  for (const d of [remote, work, clone]) await rm(d, { recursive: true, force: true });
});
