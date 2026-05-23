import { Button, ListView, TextField } from "@liiift-studio/mac-os9-ui";
import { useCallback, useEffect, useState } from "react";
import { resetChatSession, streamChat } from "../../api/chat";
import {
  getSessionMessages,
  listSessions,
  type ChatMessage,
  type SessionInfo,
} from "../../api/sessions";

export function ChatsSection() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  if (sessionId) {
    return <ChatView sessionId={sessionId} onBack={() => setSessionId(null)} />;
  }
  return <ChatList onOpen={setSessionId} />;
}

function ChatList({ onOpen }: { onOpen: (id: string) => void }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await listSessions(false);
      setSessions(list.filter((s) => s.channel === "web"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await resetChatSession();
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      streamChat(
        { message },
        {
          onChunk: () => {},
          onDone: () => resolve(),
          onError: () => resolve(),
        },
      );
      setTimeout(resolve, 800);
    });
    const list = await listSessions(false);
    const web = list.filter((s) => s.channel === "web");
    const newest = web[0]?.id;
    setDraft("");
    setSending(false);
    if (newest) onOpen(newest);
    else void reload();
  }, [draft, sending, onOpen, reload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <fieldset style={{ padding: 8 }}>
        <legend>New chat</legend>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <TextField
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              fullWidth
            />
          </div>
          <Button
            variant="primary"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || sending}
            loading={sending}
          >
            Send
          </Button>
        </div>
      </fieldset>

      <fieldset style={{ padding: 8 }}>
        <legend>Sessions</legend>
        {loading ? (
          <p>Loading…</p>
        ) : sessions.length === 0 ? (
          <p style={{ color: "#555", padding: 8 }}>No chat sessions yet.</p>
        ) : (
          <ListView
            columns={[
              { key: "title", label: "Title", width: "55%" },
              { key: "turns", label: "Turns", width: "15%" },
              { key: "lastUsed", label: "Last used", width: "30%" },
            ]}
            items={sessions.map((s) => ({
              id: s.id,
              title: s.title || s.firstMessage || "Untitled",
              turns: String(s.turnCount),
              lastUsed: new Date(s.lastUsedAt).toLocaleString(),
            }))}
            onItemOpen={(item) => onOpen(item.id)}
          />
        )}
      </fieldset>
    </div>
  );
}

function ChatView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await getSessionMessages(sessionId, 50, 0);
      setMessages(res.messages);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: message, timestamp: new Date().toISOString() },
    ]);
    let acc = "";
    setStreamingText("");
    await new Promise<void>((resolve) => {
      streamChat(
        { message, sessionId },
        {
          onChunk: (text) => {
            acc += text;
            setStreamingText(acc);
          },
          onDone: () => resolve(),
          onError: () => resolve(),
        },
      );
    });
    setStreamingText("");
    setSending(false);
    void reload();
  }, [draft, sending, sessionId, reload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <Button onClick={onBack}>‹ Back to sessions</Button>
      </div>

      <fieldset style={{ padding: 8 }}>
        <legend>Messages</legend>
        <div
          style={{
            maxHeight: 400,
            overflowY: "auto",
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {loading ? (
            <p>Loading…</p>
          ) : messages.length === 0 && !streamingText ? (
            <p style={{ color: "#555" }}>No messages yet.</p>
          ) : (
            <>
              {messages.map((m, i) => (
                <MessageBubble key={`${m.timestamp}-${i}`} role={m.role} text={m.text} />
              ))}
              {streamingText ? (
                <MessageBubble role="assistant" text={streamingText} />
              ) : null}
            </>
          )}
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply…"
            fullWidth
          />
        </div>
        <Button
          variant="primary"
          onClick={() => void handleSend()}
          disabled={!draft.trim() || sending}
          loading={sending}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        padding: "6px 10px",
        border: "1px solid #888",
        background: isUser ? "#cce0ff" : "#f0f0f0",
        whiteSpace: "pre-wrap",
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}
