/**
 * MCP server health parsing — maps the status suffix of `claude mcp list`
 * text output to status ("ok"|"warn"|"error"|"unknown") + issue label.
 * No subprocess: exercises the pure classify + line parser.
 */
import { test, expect } from "bun:test";

import { classifyMcpStatus, parseMcpListOutput } from "../mcp";

test("classifyMcpStatus maps the glyph statuses claude mcp list emits", () => {
  expect(classifyMcpStatus("✔ Connected")).toEqual({ status: "ok" });
  expect(classifyMcpStatus("✘ Failed to connect")).toEqual({
    status: "error",
    issue: "unreachable",
  });
  expect(classifyMcpStatus("! Needs authentication")).toEqual({
    status: "warn",
    issue: "needs auth",
  });
  expect(classifyMcpStatus("⏸ Pending approval")).toEqual({
    status: "warn",
    issue: "pending approval",
  });
});

test("classifyMcpStatus falls back to keywords and flags timeouts", () => {
  expect(classifyMcpStatus("Connection timed out").status).toBe("error");
  expect(classifyMcpStatus("Connection timed out").issue).toBe("timeout");
  // Empty / missing status → neutral, never crashes.
  expect(classifyMcpStatus("")).toEqual({ status: "unknown" });
  // Unrecognized text is surfaced verbatim in a neutral state.
  expect(classifyMcpStatus("something weird")).toEqual({
    status: "unknown",
    issue: "something weird",
  });
});

test("parseMcpListOutput extracts name, transport, target and status", () => {
  const sample = [
    "Checking MCP server health…",
    "",
    "context7: https://mcp.context7.com/mcp (HTTP) - ✔ Connected",
    "plugin:github:github: https://api.githubcopilot.com/mcp/ (HTTP) - ✘ Failed to connect",
    "plugin:linear:linear: https://mcp.linear.app/mcp (HTTP) - ! Needs authentication",
    "plugin:homeclaw:homekit: node /path/to/server.js - ✔ Connected",
  ].join("\n");

  const parsed = parseMcpListOutput(sample);
  expect(parsed).toHaveLength(4);

  const byName = Object.fromEntries(parsed.map((s) => [s.name, s]));

  expect(byName.context7).toMatchObject({
    transport: "http",
    target: "https://mcp.context7.com/mcp",
    status: "ok",
  });
  expect(byName.context7.issue).toBeUndefined();

  expect(byName["plugin:github:github"]).toMatchObject({
    status: "error",
    issue: "unreachable",
  });

  expect(byName["plugin:linear:linear"]).toMatchObject({
    status: "warn",
    issue: "needs auth",
  });

  expect(byName["plugin:homeclaw:homekit"]).toMatchObject({
    transport: "stdio",
    target: "node /path/to/server.js",
    status: "ok",
  });
});
