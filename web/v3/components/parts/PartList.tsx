import type { ChatPart } from "../../lib/transcriptParts";
import { InfoPart } from "./InfoPart";
import { ReasoningPart } from "./ReasoningPart";
import { SourcesPart } from "./SourcesPart";
import { SystemPart } from "./SystemPart";
import { TextPart } from "./TextPart";
import { ToolPart } from "./ToolPart";

/** Render a single transcript part with its kind-specific component (spec §5/§6). */
export function Part({ part }: { part: ChatPart }) {
  const at = part.at == null ? {} : { at: part.at };
  switch (part.kind) {
    case "system":
      // FYI / not-in-context blocks (pre-filtered hooks, suppressed bot bodies,
      // full payloads, [skip:fyi] reasons) render in the blue InfoPart; real
      // triggers / [skip]/[ok] outcomes stay in the base-palette SystemPart.
      return part.notInContext ? (
        <InfoPart text={part.text} {...at} />
      ) : (
        <SystemPart text={part.text} {...at} />
      );
    case "text":
      // A not-in-context text block (e.g. a surfaced payload echoed as prose)
      // also reads as FYI — route it through the blue InfoPart shell.
      return part.notInContext ? (
        <InfoPart text={part.markdown} {...at} />
      ) : (
        <TextPart id={part.id} role={part.role} markdown={part.markdown} />
      );
    case "reasoning":
      return <ReasoningPart markdown={part.markdown} />;
    case "tool":
      return <ToolPart tool={part.tool} />;
    case "sources":
      return <SourcesPart sources={part.sources} />;
  }
}

/** The full ordered list of transcript parts. */
export function PartList({ parts }: { parts: ChatPart[] }) {
  return (
    <div className="flex flex-col gap-4">
      {parts.map((part) => (
        <Part key={part.id} part={part} />
      ))}
    </div>
  );
}
