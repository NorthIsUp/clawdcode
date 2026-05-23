import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pikoloo/darwin-ui";
import { useMemo } from "react";
import { SectionFrame } from "../../components/SectionFrame";
import { useGitInfo } from "../../hooks/useGitInfo";

const ADAMS_QUOTES = [
  {
    text: "Don't Panic.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "The ships hung in the sky in much the same way that bricks don't.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "Time is an illusion. Lunchtime doubly so.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "I love deadlines. I love the whooshing noise they make as they go by.",
    source: "Douglas Adams",
  },
  {
    text: "Anyone who is capable of getting themselves made President should on no account be allowed to do the job.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move.",
    source: "The Restaurant at the End of the Universe",
  },
  {
    text: "Forty-two.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "The Answer to the Great Question… Of Life, the Universe and Everything… Is… Forty-two.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "Flying is learning how to throw yourself at the ground and miss.",
    source: "Life, the Universe and Everything",
  },
  {
    text: "For a moment, nothing happened. Then, after a second or so, nothing continued to happen.",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "We demand rigidly defined areas of doubt and uncertainty!",
    source: "The Hitchhiker's Guide to the Galaxy",
  },
  {
    text: "So long, and thanks for all the fish.",
    source: "So Long, and Thanks for All the Fish",
  },
];

export function AboutSection() {
  const git = useGitInfo();

  const quote = useMemo(() => {
    const idx = Math.floor(Math.random() * ADAMS_QUOTES.length);
    return (
      ADAMS_QUOTES[idx] ?? {
        text: "Don't Panic.",
        source: "The Hitchhiker's Guide to the Galaxy",
      }
    );
  }, []);

  return (
    <SectionFrame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "640px",
          margin: "0 auto",
          padding: "24px 16px",
        }}
      >
        {/* Card 1: ClaudeClaw */}
        <Card glass>
          <CardHeader>
            <CardTitle>🦞 ClaudeClaw</CardTitle>
          </CardHeader>
          <CardContent>
            <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>
              Daemon-driven Claude Code orchestration with chat threads,
              scheduled jobs, and git-backed plugin repos.
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Build info */}
        <Card glass>
          <CardHeader>
            <CardTitle>Build</CardTitle>
          </CardHeader>
          <CardContent>
            {git ? (
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "max-content 1fr",
                  gap: "6px 16px",
                  margin: 0,
                  fontSize: "13px",
                }}
              >
                {git.tag && (
                  <>
                    <dt style={{ color: "var(--muted)", fontWeight: 500 }}>
                      Tag
                    </dt>
                    <dd style={{ margin: 0 }}>
                      <code>{git.tag}</code>
                    </dd>
                  </>
                )}
                {git.describe && (
                  <>
                    <dt style={{ color: "var(--muted)", fontWeight: 500 }}>
                      Describe
                    </dt>
                    <dd style={{ margin: 0 }}>
                      <code>{git.describe}</code>
                    </dd>
                  </>
                )}
                <dt style={{ color: "var(--muted)", fontWeight: 500 }}>
                  Commit
                </dt>
                <dd style={{ margin: 0 }}>
                  {git.commitUrl ? (
                    <a
                      href={git.commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: "monospace" }}
                    >
                      {git.sha8}
                    </a>
                  ) : (
                    <code>{git.sha8}</code>
                  )}
                </dd>
                <dt style={{ color: "var(--muted)", fontWeight: 500 }}>
                  State
                </dt>
                <dd style={{ margin: 0 }}>
                  <Badge variant={git.dirty ? "warning" : "success"}>
                    {git.dirty ? "dirty" : "clean"}
                  </Badge>
                </dd>
              </dl>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: "13px", margin: 0 }}>
                Loading build info…
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Douglas Adams quote */}
        <Card glass>
          <CardHeader>
            <CardTitle>Thought for the day</CardTitle>
          </CardHeader>
          <CardContent>
            <blockquote
              style={{
                margin: 0,
                borderLeft: "3px solid var(--border)",
                paddingLeft: "14px",
              }}
            >
              <p
                style={{
                  fontStyle: "italic",
                  fontSize: "14px",
                  margin: "0 0 8px",
                  lineHeight: "1.6",
                }}
              >
                "{quote.text}"
              </p>
              <footer
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                }}
              >
                — Douglas Adams, <cite>{quote.source}</cite>
              </footer>
            </blockquote>
          </CardContent>
        </Card>
      </div>
    </SectionFrame>
  );
}
