import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join, basename } from "path";
import { getSettings, getJobsRepoDir } from "./config";

export interface JobsRepoPlugin {
  name: string;    // from .claude-plugin/plugin.json "name", or directory basename
  dir: string;     // absolute path to the plugin directory
  skills: string[]; // skill names (skills/<name>/SKILL.md)
  commands: string[]; // command names (commands/<name>.md)
}

/** Check if a directory contains a .claude-plugin/plugin.json file. */
async function isPluginDir(dir: string): Promise<boolean> {
  return existsSync(join(dir, ".claude-plugin", "plugin.json"));
}

/** Read plugin metadata from a directory. */
async function readPlugin(dir: string): Promise<JobsRepoPlugin> {
  let name = basename(dir);
  try {
    const raw = await readFile(join(dir, ".claude-plugin", "plugin.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      name = parsed.name.trim();
    }
  } catch {}

  // List skills: skills/*/SKILL.md → skill name is the directory name
  const skills: string[] = [];
  const skillsDir = join(dir, "skills");
  if (existsSync(skillsDir)) {
    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md"))) {
          skills.push(entry.name);
        }
      }
      skills.sort();
    } catch {}
  }

  // List commands: commands/*.md → command name is the file stem
  const commands: string[] = [];
  const commandsDir = join(dir, "commands");
  if (existsSync(commandsDir)) {
    try {
      const entries = await readdir(commandsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          commands.push(entry.name.slice(0, -3));
        }
      }
      commands.sort();
    } catch {}
  }

  return { name, dir, skills, commands };
}

/**
 * Scan the jobs repo for plugin directories (bounded — no deep recursion).
 * A plugin directory is one containing .claude-plugin/plugin.json.
 *
 * Scan locations:
 *   - the repo root itself
 *   - each immediate subdirectory of the repo root
 *   - each immediate subdirectory of a plugins/ folder if one exists
 *
 * Returns [] when jobsRepo.url is unset or the clone is missing.
 */
export async function discoverJobsRepoPlugins(): Promise<JobsRepoPlugin[]> {
  const { jobsRepo } = getSettings();
  if (!jobsRepo.url) return [];

  const repoDir = getJobsRepoDir();
  if (!existsSync(join(repoDir, ".git"))) return [];

  const seen = new Set<string>();
  const plugins: JobsRepoPlugin[] = [];

  async function tryAdd(dir: string): Promise<void> {
    if (seen.has(dir)) return;
    seen.add(dir);
    if (await isPluginDir(dir)) {
      plugins.push(await readPlugin(dir));
    }
  }

  // Check the repo root itself
  await tryAdd(repoDir);

  // Check each immediate subdirectory of the repo root
  try {
    const rootEntries = await readdir(repoDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await tryAdd(join(repoDir, entry.name));
      }
    }

    // Check each immediate subdirectory of plugins/ if it exists
    const pluginsSubdir = join(repoDir, "plugins");
    if (existsSync(pluginsSubdir)) {
      const pluginEntries = await readdir(pluginsSubdir, { withFileTypes: true });
      for (const entry of pluginEntries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await tryAdd(join(pluginsSubdir, entry.name));
        }
      }
    }
  } catch {}

  // Sort by dir for deterministic ordering
  plugins.sort((a, b) => a.dir.localeCompare(b.dir));

  return plugins;
}

/**
 * Build the spawn flags to pass to a claude subprocess.
 *
 * - If plugins found → ["--plugin-dir", p.dir, ...] for each plugin
 * - Else if root .claude/skills/ exists → ["--add-dir", repoRoot]
 * - Else → []
 *
 * Returns [] when unconfigured / not cloned, so zero-jobs-repo deployments
 * are byte-identical to today.
 */
export async function getJobsRepoSpawnArgs(): Promise<string[]> {
  const { jobsRepo } = getSettings();
  if (!jobsRepo.url) return [];

  const repoDir = getJobsRepoDir();
  if (!existsSync(join(repoDir, ".git"))) return [];

  const plugins = await discoverJobsRepoPlugins();

  if (plugins.length > 0) {
    const args: string[] = [];
    for (const plugin of plugins) {
      args.push("--plugin-dir", plugin.dir);
    }
    return args;
  }

  // Fallback: if a .claude/skills/ directory exists at the repo root
  if (existsSync(join(repoDir, ".claude", "skills"))) {
    return ["--add-dir", repoDir];
  }

  return [];
}
