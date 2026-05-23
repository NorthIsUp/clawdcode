import styles from "./ChatMessage.module.css";
import { formatClockTime } from "./formatClockTime";

export type MessageRole = "user" | "assistant" | "system" | "agent";

export interface ChatMessageData {
  role: MessageRole;
  text: string;
  timestamp?: string | null;
  streaming?: boolean;
  background?: boolean;
  agentId?: string;
  agentStatus?: "running" | "done";
}

interface Props {
  message: ChatMessageData;
  elapsedMs?: number;
}

export function ChatMessage({ message: msg, elapsedMs = 0 }: Props) {
  if (msg.role === "agent") {
    return (
      <div className={`${styles.msg} ${styles.msgAgent}`}>
        <div
          className={[
            styles.agentBubble,
            msg.agentStatus === "running" ? styles.running : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {msg.text}
          {msg.agentStatus === "running" && (
            <span className={styles.agentSpinner}>…</span>
          )}
        </div>
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <div className={`${styles.msg} ${styles.msgSystem}`}>
        {/* System messages contain limited HTML (e.g. a job link from /loop).
            All user-supplied content is HTML-escaped via escHtml in ChatPane before insertion. */}
        <SystemHtml html={msg.text} className={styles.bubbleSystem ?? ""} />
      </div>
    );
  }

  const isUser = msg.role === "user";
  const bubbleCls = [
    styles.bubble,
    isUser ? styles.bubbleUser : styles.bubbleAssistant,
    msg.streaming ? styles.streaming : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        styles.msg,
        isUser ? styles.msgUser : styles.msgAssistant,
        msg.streaming ? styles.streaming : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.role}>{isUser ? "You" : "Claude"}</div>
      <div className={bubbleCls}>{msg.text}</div>
      {msg.streaming && (
        <div className={styles.elapsed}>{fmtElapsed(elapsedMs)}</div>
      )}
      {!msg.streaming && msg.background && (
        <div className={styles.background}>⚙ working in background...</div>
      )}
      {!msg.streaming && msg.timestamp && (
        <div className={styles.timestamp}>{formatClockTime(msg.timestamp)}</div>
      )}
    </div>
  );
}

function SystemHtml({ html, className }: { html: string; className: string }) {
  // Content assembled from trusted sources with user-content escaped via escHtml
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled HTML; user input is pre-escaped
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
