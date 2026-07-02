/**
 * Sim report generator. Renders a full markdown report with:
 * - Run metadata (model, cost, duration, character)
 * - Per-turn conversation with full agent trace
 * - Tool call statistics
 * - Token/cost breakdown
 *
 * Format follows her-go's sim report pattern.
 */

import type { SimRunResult, SimTurnResult, SimToolCall } from "./types";
import { config } from "../config";

export function renderReport(result: SimRunResult): string {
  const lines: string[] = [];
  const ts = result.timestamp.toISOString().replace("T", " ").slice(0, 19);

  // ── Header ──────────────────────────────────────────────────
  lines.push(`# Simulation Report: ${result.suite.name}`);
  lines.push("");
  if (result.suite.description) {
    lines.push(`> ${result.suite.description}`);
    lines.push("");
  }

  const cacheRate = result.totalTokensIn > 0
    ? ((result.totalCachedTokens / result.totalTokensIn) * 100).toFixed(0)
    : "0";
  lines.push(`**Date:** ${ts} | **Model:** \`${result.model}\` | **Cost:** $${result.totalCost.toFixed(4)} | **Duration:** ${formatDuration(result.totalDurationMs)} | **Cache rate:** ${cacheRate}%`);
  lines.push("");

  // Character summary
  const ch = result.suite.character;
  lines.push("| Key | Value |");
  lines.push("|-----|-------|");
  lines.push(`| Character | ${ch.name} (${ch.race} ${ch.class}${ch.subclass ? ` — ${ch.subclass}` : ""}) |`);
  lines.push(`| Level | ${ch.level} |`);
  if (ch.stats) {
    lines.push(`| Stats | STR ${ch.stats.str} · DEX ${ch.stats.dex} · CON ${ch.stats.con} · INT ${ch.stats.int} · WIS ${ch.stats.wis} · CHA ${ch.stats.cha} |`);
  }
  lines.push(`| Turns | ${result.turns.length} |`);
  lines.push(`| Total tokens | ${result.totalTokensIn.toLocaleString()}↓ ${result.totalTokensOut.toLocaleString()}↑ |`);
  if (result.suite.tags?.length) {
    lines.push(`| Tags | ${result.suite.tags.join(", ")} |`);
  }
  lines.push("");

  // ── Scenario ────────────────────────────────────────────────
  if (result.suite.scenario) {
    lines.push("## Opening Scenario");
    lines.push("");
    lines.push(`> ${result.suite.scenario.trim().split("\n").join("\n> ")}`);
    lines.push("");
  }

  // ── Conversation ────────────────────────────────────────────
  lines.push("## Conversation");
  lines.push("");

  for (const turn of result.turns) {
    renderTurn(lines, turn, result.model);
  }

  // ── Tool Call Statistics ─────────────────────────────────────
  lines.push("## Tool Call Statistics");
  lines.push("");
  renderToolStats(lines, result);

  // ── Token & Cost Breakdown ──────────────────────────────────
  lines.push("## Cost Breakdown");
  lines.push("");
  renderCostBreakdown(lines, result);

  // ── Compliance Notes ────────────────────────────────────────
  lines.push("## Compliance Check");
  lines.push("");
  renderComplianceCheck(lines, result);

  return lines.join("\n");
}

// ── Per-Turn Rendering ────────────────────────────────────────

function renderTurn(lines: string[], turn: SimTurnResult, defaultModel: string): void {
  const toolCount = turn.toolCalls.length;
  const cost = turn.cost > 0 ? turn.cost : estimateTurnCost(turn);

  lines.push(`### Turn ${turn.turnNumber} *(${formatDuration(turn.durationMs)}, $${cost.toFixed(4)}, ${toolCount} tools)*`);
  lines.push("");

  // Player input
  lines.push(`**Player:** ${turn.input}`);
  lines.push("");

  // Agent trace — the full tool call sequence (Version B style)
  if (turn.toolCalls.length > 0) {
    lines.push(`<details><summary>Agent trace (${toolCount} tool calls)</summary>`);
    lines.push("");

    for (const tc of turn.toolCalls) {
      renderToolCall(lines, tc);
    }

    lines.push("</details>");
    lines.push("");
  }

  // Trace board (rolls, state changes, etc.)
  if (turn.traceLines.length > 0) {
    for (const line of turn.traceLines) {
      lines.push(`> ${line}`);
    }
    lines.push("");
  }

  // Narrator reply
  lines.push("**Narrator:**");
  lines.push("");
  lines.push(turn.reply || "*[no reply]*");
  lines.push("");

  // Forks
  if (turn.forks.length > 0) {
    lines.push("**Choices:**");
    for (let i = 0; i < turn.forks.length; i++) {
      lines.push(`${i + 1}. **${turn.forks[i]!.label}** — ${turn.forks[i]!.detail}`);
    }
    lines.push("");
  }

  // Errors
  if (turn.errors.length > 0) {
    for (const err of turn.errors) {
      lines.push(`> ⚠️ **Error:** ${err}`);
    }
    lines.push("");
  }

  // Per-turn metrics line
  const turnCost = turn.cost > 0 ? turn.cost : estimateTurnCost(turn);
  const cacheNote = turn.cachedTokens > 0 ? ` · ${turn.cachedTokens.toLocaleString()} cached` : "";
  lines.push(`*${turn.tokensIn.toLocaleString()}↓ ${turn.tokensOut.toLocaleString()}↑ tokens${cacheNote} · $${turnCost.toFixed(4)} · ${formatDuration(turn.durationMs)} · ${turn.model || defaultModel}*`);
  lines.push("");
  lines.push("---");
  lines.push("");
}

function renderToolCall(lines: string[], tc: SimToolCall): void {
  const argsStr = Object.keys(tc.args).length > 0
    ? formatToolArgs(tc)
    : "";

  lines.push(`**→ \`${tc.name}\`**`);

  if (argsStr) {
    // For reply tool, show the text more readably
    if (tc.name === "reply" && typeof tc.args.text === "string") {
      lines.push("");
      lines.push(`> ${(tc.args.text as string).slice(0, 200)}${(tc.args.text as string).length > 200 ? "..." : ""}`);
    } else if (tc.name === "think" && typeof tc.args.text === "string") {
      lines.push("");
      lines.push(`> *${(tc.args.text as string).slice(0, 300)}${(tc.args.text as string).length > 300 ? "..." : ""}*`);
    } else if (tc.name === "present_forks") {
      const forks = tc.args.forks as Array<{ label: string; detail: string }> | undefined;
      if (forks) {
        lines.push("");
        for (const f of forks) {
          lines.push(`> - **${f.label}**: ${f.detail}`);
        }
      }
    } else {
      lines.push("```json");
      lines.push(JSON.stringify(tc.args, null, 2));
      lines.push("```");
    }
  }

  // Show result for mechanical tools
  if (tc.name !== "think" && tc.name !== "reply" && tc.name !== "present_forks" && tc.name !== "done") {
    const resultStr = typeof tc.result === "object" ? JSON.stringify(tc.result) : String(tc.result);
    if (resultStr.length <= 200) {
      lines.push(`> *Result:* \`${resultStr}\``);
    } else {
      lines.push(`> *Result:* \`${resultStr.slice(0, 200)}...\``);
    }
  }

  lines.push("");
}

function formatToolArgs(tc: SimToolCall): string {
  if (tc.name === "done") return "";
  return JSON.stringify(tc.args);
}

// ── Statistics ────────────────────────────────────────────────

function renderToolStats(lines: string[], result: SimRunResult): void {
  // Count tool calls by name across all turns
  const counts = new Map<string, number>();
  let totalCalls = 0;

  for (const turn of result.turns) {
    for (const tc of turn.toolCalls) {
      counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
      totalCalls++;
    }
  }

  lines.push(`**Total tool calls:** ${totalCalls} across ${result.turns.length} turns (avg ${(totalCalls / Math.max(result.turns.length, 1)).toFixed(1)}/turn)`);
  lines.push("");

  // Sort by count descending
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  lines.push("| Tool | Count | % |");
  lines.push("|------|-------|---|");
  for (const [name, count] of sorted) {
    const pct = ((count / Math.max(totalCalls, 1)) * 100).toFixed(0);
    lines.push(`| \`${name}\` | ${count} | ${pct}% |`);
  }
  lines.push("");

  // Per-turn tool call sequence summary
  lines.push("### Tool Sequences");
  lines.push("");
  for (const turn of result.turns) {
    const seq = turn.toolCalls.map((tc) => `\`${tc.name}\``).join(" → ");
    lines.push(`**Turn ${turn.turnNumber}:** ${seq || "*none*"}`);
  }
  lines.push("");
}

function renderCostBreakdown(lines: string[], result: SimRunResult): void {
  lines.push("| Turn | Tokens In | Cached | Tokens Out | Cost | Duration | Tools |");
  lines.push("|------|-----------|--------|------------|------|----------|-------|");

  for (const turn of result.turns) {
    const cost = turn.cost > 0 ? turn.cost : estimateTurnCost(turn);
    const cacheStr = turn.cachedTokens > 0 ? turn.cachedTokens.toLocaleString() : "—";
    lines.push(`| ${turn.turnNumber} | ${turn.tokensIn.toLocaleString()} | ${cacheStr} | ${turn.tokensOut.toLocaleString()} | $${cost.toFixed(4)} | ${formatDuration(turn.durationMs)} | ${turn.toolCalls.length} |`);
  }

  const totalTools = result.turns.reduce((s, t) => s + t.toolCalls.length, 0);
  const cachedStr = result.totalCachedTokens > 0 ? result.totalCachedTokens.toLocaleString() : "—";
  lines.push(`| **Total** | **${result.totalTokensIn.toLocaleString()}** | **${cachedStr}** | **${result.totalTokensOut.toLocaleString()}** | **$${result.totalCost.toFixed(4)}** | **${formatDuration(result.totalDurationMs)}** | **${totalTools}** |`);
  lines.push("");

  // Cache efficiency summary
  if (result.totalCachedTokens > 0) {
    const cacheRate = ((result.totalCachedTokens / result.totalTokensIn) * 100).toFixed(1);
    lines.push(`*Cache hit rate: ${cacheRate}% (${result.totalCachedTokens.toLocaleString()} of ${result.totalTokensIn.toLocaleString()} input tokens served from cache)*`);
    lines.push("");
  }

  // Show pricing source
  const hasApiCost = result.turns.some((t) => t.cost > 0);
  if (hasApiCost) {
    lines.push(`*Costs from OpenRouter API (actual billing)*`);
  } else {
    const pricing = config.modelPricing[result.model];
    if (pricing) {
      lines.push(`*Estimated costs: $${pricing.input}/M input, $${pricing.output}/M output (${result.model})*`);
    }
  }
  lines.push("");
}

// ── Compliance ────────────────────────────────────────────────

function renderComplianceCheck(lines: string[], result: SimRunResult): void {
  const checks: Array<{ check: string; pass: boolean; note: string }> = [];

  for (const turn of result.turns) {
    // Skip non-narrative turns (commands, onboarding)
    if (turn.toolCalls.length === 0 && !turn.reply) continue;

    const turnLabel = `Turn ${turn.turnNumber}`;
    const toolNames = turn.toolCalls.map((tc) => tc.name);

    // Check: reply tool was called
    const hasReply = toolNames.includes("reply") || turn.reply.length > 0;
    checks.push({
      check: `${turnLabel}: narrator replied`,
      pass: hasReply,
      note: hasReply ? "reply tool or inline content" : "no reply produced",
    });

    // Check: forks presented
    const hasForks = toolNames.includes("present_forks") || turn.forks.length > 0;
    checks.push({
      check: `${turnLabel}: forks presented`,
      pass: hasForks,
      note: hasForks ? `${turn.forks.length} choices` : "no forks",
    });

    // Check: no hallucinated numbers in reply (rough heuristic)
    const numberPattern = /\b(rolls?|rolled|gets?|got)\s+(a\s+)?\d+\b/i;
    const hasHallucinatedRoll = numberPattern.test(turn.reply);
    checks.push({
      check: `${turnLabel}: no hallucinated rolls`,
      pass: !hasHallucinatedRoll,
      note: hasHallucinatedRoll ? "possible hallucinated roll in prose" : "clean",
    });

    // Check: used request_roll for checks (if any rolls happened)
    const hasRollTool = toolNames.includes("request_roll") || toolNames.includes("request_damage");
    const rollTraceLines = turn.traceLines.filter((l) => l.includes("🎲"));
    if (rollTraceLines.length > 0) {
      checks.push({
        check: `${turnLabel}: rolls via tool`,
        pass: hasRollTool,
        note: `${rollTraceLines.length} roll(s) in trace`,
      });
    }
  }

  const passCount = checks.filter((c) => c.pass).length;
  const failCount = checks.filter((c) => !c.pass).length;

  lines.push(`**${passCount} passed, ${failCount} failed** out of ${checks.length} checks`);
  lines.push("");

  if (checks.length > 0) {
    lines.push("| Check | Status | Note |");
    lines.push("|-------|--------|------|");
    for (const c of checks) {
      lines.push(`| ${c.check} | ${c.pass ? "✅" : "❌"} | ${c.note} |`);
    }
    lines.push("");
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function estimateTurnCost(turn: SimTurnResult): number {
  const pricing = config.modelPricing[turn.model];
  if (!pricing) return 0;
  return (turn.tokensIn / 1_000_000) * pricing.input
       + (turn.tokensOut / 1_000_000) * pricing.output;
}
