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
        totalCost: 0,
        model,
        iterations: iteration + 1,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    totalTokensIn += completion.usage.prompt_tokens;
    totalTokensOut += completion.usage.completion_tokens;
    model = completion.model;

    const assistantMsg = completion.message;
    messages.push(assistantMsg);

    // Capture content from any assistant message — some models put
    // the narrative in content alongside tool calls instead of using reply()
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

      if (name === "reply") {
        reply = String(args.text ?? "");
        replyCalled = true;
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
      totalCost: 0,
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
      totalCost: 0,
      model,
      iterations: toolCalls.length,
      error: "done called without reply",
    };
  }

  // Nudge: if we have a reply but no forks, ask the model to provide choices.
  // This catches models that put prose in content without calling present_forks.
  if (reply && forks.length === 0) {
    messages.push({
      role: "user",
      content: "Good narrative. Now call present_forks with 3-5 player choices, then call done.",
    });

    try {
      const nudge = stream
        ? await client.chatStream(messages, tools)
        : await client.chat(messages, tools);

      totalTokensIn += nudge.usage.prompt_tokens;
      totalTokensOut += nudge.usage.completion_tokens;

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
    totalCost: 0,
    model,
    iterations: toolCalls.length,
  };
}
