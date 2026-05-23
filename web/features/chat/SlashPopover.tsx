import type { SlashEntry } from "../../api/slash";
import styles from "./SlashPopover.module.css";

interface Props {
  entries: SlashEntry[];
  selectedIdx: number;
  onSelect: (entry: SlashEntry) => void;
}

/**
 * The content area of the slash command popover.
 * Rendered inside a Radix Popover.Content (positioned by the parent ChatInput).
 */
export function SlashPopoverContent({ entries, selectedIdx, onSelect }: Props) {
  return (
    <div className={styles.popoverContent} role="listbox">
      {entries.length === 0 ? (
        <div className={styles.empty}>No skills or commands found</div>
      ) : (
        entries.map((entry, idx) => {
          const meta = `[${entry.source}]${entry.plugin ? ` · ${entry.plugin}` : entry.description ? ` · ${entry.description}` : ""}`;
          return (
            <div
              key={`${entry.name}-${entry.source}`}
              className={[
                styles.option,
                idx === selectedIdx ? styles.optionSelected : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              role="option"
              tabIndex={-1}
              aria-selected={idx === selectedIdx}
              // mousedown prevents blur on the textarea
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(entry);
              }}
            >
              <span className={styles.optionName}>/{entry.name}</span>
              <span className={styles.optionMeta}>{meta}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
