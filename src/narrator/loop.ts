/**
 * Narrator agent loop. Runs the tool-calling cycle until the model
 * calls `done`. Dispatches tool calls to handlers, enforces the
 * DM contract (must reply before done, max iterations, etc.).
 */

import type { ChatMessage, ToolCall, CompletionResult } from "./client";
import type { NarratorClient } from "./client";
import type { ToolDef } from "./client";

export interface Fork {
  label: string;
  detail: string;
}

export interface TurnResult {
  reply: string;
  forks: Fork[];
  toolCalls: ToolCallRecord[];
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  cachedTokens: number;
  model: string;
  iterations: number;
  error?: string;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface LoopOptions {
  client: NarratorClient;
  tools: ToolDef[];
  handlers: Record<string, ToolHandler>;
  messages: ChatMessage[];
  maxIterations?: number;
  stream?: boolean;
  onToolCall?: (name: string, args: Record<string, unknown>, result: unknown) => void;
  onContentDelta?: (delta: string) => void;
}

const DEFAULT_MAX_ITERATIONS = 20;

/**
 * Run the narrator agent loop. Sends messages to the LLM, dispatches
 * tool calls, and loops until `done` is called or max iterations hit.
 */
export async function runNarratorLoop(opts: LoopOptions): Promise<TurnResult> {
  const {
    client,
    tools,
    handlers,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    stream = false,
    onToolCall,
    onContentDelta,
  } = opts;

  const messages = [...opts.messages];
  let reply = "";
  let forks: Fork[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;
  let cachedTokens = 0;
  let model = "";
  let done = false;
  let replyCalled = false;

  for (let iteration = 0; iteration < maxIterations && !done; iteration++) {
    let completion: CompletionResult;
    try {
      completion = stream
        ? await client.chatStream(messages, tools, onContentDelta)
        : await client.chat(messages, tools);
    } catch (err) {
      return {
        reply: reply || "The narrator stumbles over their words... (API error)",
        forks,
        toolCalls,
        totalTokensIn,
        totalTokensOut,
        totalCost,
        cachedTokens,
        model,
        iterations: iteration + 1,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    totalTokensIn += completion.usage.prompt_tokens;
    totalTokensOut += completion.usage.completion_tokens;
    totalCost += completion.usage.cost ?? 0;
    cachedTokens += completion.usage.prompt_tokens_details?.cached_tokens ?? 0;
    model = completion.model;

    const assistantMsg = completion.message;
    messages.push(assistantMsg);

    // Narrative comes as regular content, not a tool call
    if (assistantMsg.content && assistantMsg.content.trim()) {
      reply = assistantMsg.content;
      replyCalled = true;
    }

    // If no tool calls, the model is done (some models don't call `done` explicitly)
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      done = true;
      break;
    }

    // Dispatch each tool call
    for (const tc of assistantMsg.tool_calls) {
      const name = tc.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      // Handle built-in control tools
      if (name === "done") {
        done = true;
        messages.push({
          role: "tool",
          content: JSON.stringify({ ok: true }),
          tool_call_id: tc.id,
        });
        break;
      }

      if (name === "present_forks") {
        forks = (args.forks as Fork[]) ?? [];
        const result = { ok: true };
        toolCalls.push({ name, args, result });
        onToolCall?.(name, args, result);
        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
        continue;
      }

      if (name === "reply") {
        const text = args.text as string;
        if (text) {
          reply = reply ? `${reply}\n\n${text}` : text;
          replyCalled = true;
        }
        const result = { ok: true };
        toolCalls.push({ name, args, result });
        onToolCall?.(name, args, result);
        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
        continue;
      }

      if (name === "think") {
        const result = { ok: true };
        toolCalls.push({ name, args, result });
        onToolCall?.(name, args, result);
        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
        continue;
      }

      // Dispatch to registered handlers
      const handler = handlers[name];
      if (!handler) {
        const errorResult = { error: `unknown tool: ${name}` };
        messages.push({
          role: "tool",
          content: JSON.stringify(errorResult),
          tool_call_id: tc.id,
        });
        toolCalls.push({ name, args, result: errorResult });
        continue;
      }

      try {
        const result = await handler(args);
        toolCalls.push({ name, args, result });
        onToolCall?.(name, args, result);
        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
      } catch (err) {
        const errorResult = {
          error: err instanceof Error ? err.message : String(err),
        };
        toolCalls.push({ name, args, result: errorResult });
        messages.push({
          role: "tool",
          content: JSON.stringify(errorResult),
          tool_call_id: tc.id,
        });
      }
    }
  }

  // If the model hit max iterations without calling done
  if (!done) {
    return {
      reply: reply || "The narrator loses their train of thought... (max iterations reached)",
      forks,
      toolCalls,
      totalTokensIn,
      totalTokensOut,
      totalCost,
      cachedTokens,
      model,
      iterations: maxIterations,
      error: "max iterations reached without done",
    };
  }

  // If done was called without reply
  if (!replyCalled && !reply) {
    return {
      reply: "The narrator remains silent... (no reply before done)",
      forks,
      toolCalls,
      totalTokensIn,
      totalTokensOut,
      totalCost,
      cachedTokens,
      model,
      iterations: toolCalls.length,
      error: "done called without reply",
    };
  }

  // Nudge: if mechanical tools fired but no state updates, ask the model to persist changes.
  const mechanicalTools = ["request_roll", "request_damage", "start_combat", "end_combat", "enemy_action"];
  const stateTools = ["update_character", "update_world"];
  const calledMechanical = toolCalls.some((tc) => mechanicalTools.includes(tc.name));
  const calledState = toolCalls.some((tc) => stateTools.includes(tc.name));

  if (calledMechanical && !calledState) {
    const rollSummary = toolCalls
      .filter((tc) => mechanicalTools.includes(tc.name))
      .map((tc) => `${tc.name}: ${JSON.stringify(tc.result)}`)
      .join("\n");

    messages.push({
      role: "user",
      content:
        "Rolls and combat actions happened this turn but you did not call " +
        "update_character or update_world. You MUST persist state changes now.\n\n" +
        "Call update_character if HP, ki, inventory, or resources changed.\n" +
        "Call update_world to set the current_scene description and any flags or NPCs.\n\n" +
        "Here are the mechanical results from this turn:\n" + rollSummary,
    });

    try {
      const stateNudge = stream
        ? await client.chatStream(messages, tools)
        : await client.chat(messages, tools);

      totalTokensIn += stateNudge.usage.prompt_tokens;
      totalTokensOut += stateNudge.usage.completion_tokens;
      totalCost += stateNudge.usage.cost ?? 0;
      cachedTokens += stateNudge.usage.prompt_tokens_details?.cached_tokens ?? 0;

      if (stateNudge.message.tool_calls) {
        for (const tc of stateNudge.message.tool_calls) {
          const name = tc.function.name;
          if (!stateTools.includes(name)) continue;
          const handler = handlers[name];
          if (!handler) continue;
          try {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            const result = await handler(args);
            toolCalls.push({ name, args, result });
            onToolCall?.(name, args, result);
          } catch { /* state nudge handler error, continue */ }
        }
      }
    } catch { /* state nudge failed, continue */ }
  }

  // Nudge: if we have a reply but no forks, force the model to call present_forks.
  if (reply && forks.length === 0) {
    messages.push({
      role: "user",
      content:
        "You must call the present_forks tool now with 3-5 choices. " +
        "Do NOT write text — only call the present_forks tool, then call done.",
    });

    try {
      const nudge = stream
        ? await client.chatStream(messages, tools)
        : await client.chat(messages, tools);

      totalTokensIn += nudge.usage.prompt_tokens;
      totalTokensOut += nudge.usage.completion_tokens;
      totalCost += nudge.usage.cost ?? 0;
      cachedTokens += nudge.usage.prompt_tokens_details?.cached_tokens ?? 0;

      if (nudge.message.tool_calls) {
        for (const tc of nudge.message.tool_calls) {
          if (tc.function.name === "present_forks") {
            try {
              const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
              forks = (args.forks as Fork[]) ?? [];
            } catch { /* ignore parse error */ }
          }
        }
      }
    } catch { /* nudge failed, continue without forks */ }
  }

  return {
    reply,
    forks,
    toolCalls,
    totalTokensIn,
    totalTokensOut,
    totalCost,
    cachedTokens,
    model,
    iterations: toolCalls.length,
  };
}
