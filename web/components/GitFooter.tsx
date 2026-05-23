import { useGitInfo } from "../hooks/useGitInfo";
import styles from "./GitFooter.module.css";

export function GitFooter() {
  const git = useGitInfo();

  if (!git) return null;

  const label = git.dirty ? `${git.sha8}*` : git.sha8;

  return (
    <a
      href={git.commitUrl || undefined}
      target="_blank"
      rel="noreferrer"
      className={styles.footer}
      title={`Commit ${label}`}
    >
      {label}
    </a>
  );
}
