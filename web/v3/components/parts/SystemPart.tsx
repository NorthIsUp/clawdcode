import { SystemMessage } from "../prompt-kit/system-message";

/**
 * A `system` part — the hook trigger summary that opens a thread. Rendered as a
 * filled, icon-less action banner (prompt-kit `SystemMessage`).
 */
export function SystemPart({ text }: { text: string }) {
  return (
    <SystemMessage variant="action" fill>
      {text}
    </SystemMessage>
  );
}
