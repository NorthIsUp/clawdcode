import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  CircularProgress,
} from "@pikoloo/darwin-ui";
import { FolderOpen, Puzzle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { JobFileEntry } from "../../api/jobs";
import { listJobFiles } from "../../api/jobs";
import type { RepoStatus } from "../../api/repos";
import { listRepos } from "../../api/repos";
import styles from "./JobFileList.module.css";

export interface FileKey {
  path: string;
  repo: string | null; // null = first/default local dir
}

interface Props {
  activeFile: FileKey | null;
  onSelect: (key: FileKey) => void;
  /** Incremented externally to trigger a refresh. */
  refreshTick: number;
}

interface GroupEntry {
  label: string;
  slug: string | null; // null = local / no-repo
  files: JobFileEntry[];
  plugins: number;
}

export function JobFileList({ activeFile, onSelect, refreshTick }: Props) {
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      let repos: RepoStatus[] = [];
      try {
        repos = await listRepos();
        if (!Array.isArray(repos)) repos = [];
      } catch {
        repos = [];
      }

      if (repos.length === 0) {
        // No repos — flat list from default local dir
        const files = await listJobFiles();
        setGroups([
          {
            label: "Local",
            slug: null,
            files: Array.isArray(files) ? files : [],
            plugins: 0,
          },
        ]);
      } else {
        // Grouped by repo + local
        const result: GroupEntry[] = [];
        for (const repo of repos) {
          let files: JobFileEntry[] = [];
          try {
            files = await listJobFiles(repo.slug);
            if (!Array.isArray(files)) files = [];
          } catch {
            files = [];
          }
          result.push({
            label: repo.slug || repo.url || "repo",
            slug: repo.slug,
            files,
            plugins: Array.isArray(repo.plugins) ? repo.plugins.length : 0,
          });
        }
        // Local files
        let localFiles: JobFileEntry[] = [];
        try {
          localFiles = await listJobFiles("__local__");
          if (!Array.isArray(localFiles)) localFiles = [];
        } catch {
          localFiles = [];
        }
        result.push({
          label: "Local",
          slug: "__local__",
          files: localFiles,
          plugins: 0,
        });
        setGroups(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTick is the intentional refresh trigger
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshTick]);

  const totalFiles = groups.reduce((n, g) => n + g.files.length, 0);
  const showGroupHeaders = groups.length > 1;

  if (loading) {
    return (
      <div className={styles.loading}>
        <CircularProgress indeterminate size={14} strokeWidth={2} />
      </div>
    );
  }

  if (error) {
    return <div className={styles.empty}>{error}</div>;
  }

  if (totalFiles === 0 && groups.every((g) => g.files.length === 0)) {
    return (
      <div className={styles.empty}>No job files yet. Click + New to create one.</div>
    );
  }

  // When only one group, skip accordion — just render a flat list.
  if (!showGroupHeaders) {
    const group = groups[0];
    if (!group) return null;
    return (
      <div className={styles.list}>
        {group.files.length === 0 ? (
          <div className={styles.groupEmpty}>No files</div>
        ) : (
          group.files.map((f) => {
            const isActive =
              activeFile !== null &&
              f.path === activeFile.path &&
              (group.slug ?? null) === activeFile.repo;
            return (
              <Button
                key={f.path}
                variant="ghost"
                className={[styles.fileRow, isActive ? styles.active : undefined]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect({ path: f.path, repo: group.slug ?? null })}
              >
                {f.isJob && (
                  <Badge
                    variant="success"
                    className="text-[9px] px-[5px] py-[1px] font-mono uppercase tracking-widest border border-current"
                  >
                    job
                  </Badge>
                )}
                <span className={styles.fileName}>{f.path}</span>
              </Button>
            );
          })
        )}
      </div>
    );
  }

  // Multiple groups — use Accordion, first expanded by default.
  const defaultOpen = groups[0]?.slug ?? "local";

  return (
    <div className={styles.list}>
      <Accordion type="single" defaultValue={defaultOpen}>
        {groups.map((group) => {
          const groupKey = group.slug ?? "local";
          const count = group.files.length;
          return (
            <AccordionItem key={groupKey} value={groupKey}>
              <AccordionTrigger itemValue={groupKey} className={styles.groupTrigger ?? ""}>
                <span className={styles.groupTriggerInner}>
                  {group.plugins > 0 ? (
                    <Puzzle size={13} className={styles.groupIcon} />
                  ) : (
                    <FolderOpen size={13} className={styles.groupIcon} />
                  )}
                  <span className={styles.groupLabel}>{group.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-[5px] py-0 ml-1">
                    {count}
                  </Badge>
                </span>
              </AccordionTrigger>

              <AccordionContent itemValue={groupKey}>
                {count === 0 ? (
                  <div className={styles.groupEmpty}>No files</div>
                ) : (
                  group.files.map((f) => {
                    const isActive =
                      activeFile !== null &&
                      f.path === activeFile.path &&
                      (group.slug ?? null) === activeFile.repo;
                    return (
                      <Button
                        key={f.path}
                        variant="ghost"
                        className={[
                          styles.fileRow,
                          isActive ? styles.active : undefined,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          onSelect({ path: f.path, repo: group.slug ?? null })
                        }
                      >
                        {f.isJob && (
                          <Badge
                            variant="success"
                            className="text-[9px] px-[5px] py-[1px] font-mono uppercase tracking-widest border border-current"
                          >
                            job
                          </Badge>
                        )}
                        <span className={styles.fileName}>{f.path}</span>
                      </Button>
                    );
                  })
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
