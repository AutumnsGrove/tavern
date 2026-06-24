import { describe, it, expect, vi } from "vitest";
import { runNarratorLoop } from "./loop";
import type { ChatMessage, CompletionResult, ToolDef } from "./client";
import type { NarratorClient } from "./client";

function makeClient(responses: CompletionResult[]): NarratorClient {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => {
      const response = responses[callIndex];
      if (!response) throw new Error("unexpected call to client.chat");
      callIndex++;
      return response;
    }),
    setModel: vi.fn(),
    getModel: vi.fn(() => "test-model"),
  } as unknown as NarratorClient;
}

function makeResult(message: ChatMessage, finishReason = "stop"): CompletionResult {
  return {
    message,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: "test-model",
    finishReason,
  };
}

const emptyTools: ToolDef[] = [];

describe("runNarratorLoop", () => {
  it("handles a simple reply + done turn", async () => {
    const client = makeClient([
      // Model calls reply, present_forks, done
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "reply", arguments: '{"text":"You enter the tavern."}' } },
          { id: "tc2", type: "function", function: { name: "present_forks", arguments: '{"forks":[{"label":"Talk to barkeep","detail":"Approach the bar"},{"label":"Sit in corner","detail":"Find a dark corner"},{"label":"Check exits","detail":"Look for exits"}]}' } },
          { id: "tc3", type: "function", function: { name: "done", arguments: "{}" } },
        ],
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "I enter the tavern." }],
    });

    expect(result.reply).toBe("You enter the tavern.");
    expect(result.forks).toHaveLength(3);
    expect(result.forks[0]!.label).toBe("Talk to barkeep");
    expect(result.error).toBeUndefined();
  });

  it("dispatches tool calls to handlers", async () => {
    const rollHandler = vi.fn(async () => ({
      nat: 15, modifier: 5, total: 20, dc: 15,
      success: true, crit: false, fumble: false,
    }));

    const client = makeClient([
      // Iteration 1: model calls request_roll
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "request_roll", arguments: '{"type":"check","skill":"stealth","dc":15,"reason":"sneak past guard"}' } },
        ],
      }),
      // Iteration 2: model calls reply + done
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc2", type: "function", function: { name: "reply", arguments: '{"text":"You slip past the guard unseen."}' } },
          { id: "tc3", type: "function", function: { name: "present_forks", arguments: '{"forks":[{"label":"A","detail":"a"},{"label":"B","detail":"b"},{"label":"C","detail":"c"}]}' } },
          { id: "tc4", type: "function", function: { name: "done", arguments: "{}" } },
        ],
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: { request_roll: rollHandler },
      messages: [{ role: "user", content: "I sneak past the guard." }],
    });

    expect(rollHandler).toHaveBeenCalledTimes(1);
    expect(rollHandler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "check", skill: "stealth", dc: 15 }),
    );
    expect(result.reply).toBe("You slip past the guard unseen.");
    expect(result.toolCalls).toHaveLength(3); // request_roll, reply, forks (done breaks loop before recording)
  });

  it("handles model responding with text content instead of tool calls", async () => {
    const client = makeClient([
      makeResult({
        role: "assistant",
        content: "You enter a dimly lit tavern.",
        tool_calls: undefined,
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "I enter the tavern." }],
    });

    expect(result.reply).toBe("You enter a dimly lit tavern.");
  });

  it("records think tool calls but doesn't expose them", async () => {
    const onToolCall = vi.fn();

    const client = makeClient([
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "think", arguments: '{"text":"The player is entering a dangerous area..."}' } },
          { id: "tc2", type: "function", function: { name: "reply", arguments: '{"text":"You step into darkness."}' } },
          { id: "tc3", type: "function", function: { name: "present_forks", arguments: '{"forks":[{"label":"A","detail":"a"},{"label":"B","detail":"b"},{"label":"C","detail":"c"}]}' } },
          { id: "tc4", type: "function", function: { name: "done", arguments: "{}" } },
        ],
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "Go forward." }],
      onToolCall,
    });

    const thinkCall = result.toolCalls.find((tc) => tc.name === "think");
    expect(thinkCall).toBeDefined();
    expect(thinkCall!.args.text).toBe("The player is entering a dangerous area...");
    expect(result.reply).toBe("You step into darkness.");
  });

  it("reports error when max iterations reached", async () => {
    // Model just keeps calling think forever
    const thinkResponse = makeResult({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "tc1", type: "function", function: { name: "think", arguments: '{"text":"hmm..."}' } },
      ],
    });

    const client = makeClient(Array(5).fill(thinkResponse));

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "test" }],
      maxIterations: 5,
    });

    expect(result.error).toContain("max iterations");
    expect(result.iterations).toBe(5);
  });

  it("handles API errors gracefully", async () => {
    const client = makeClient([]);
    (client.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("rate limited"),
    );

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.error).toContain("rate limited");
    expect(result.reply).toContain("API error");
  });

  it("handles tool handler errors gracefully", async () => {
    const brokenHandler = vi.fn(async () => {
      throw new Error("database connection failed");
    });

    const client = makeClient([
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "request_roll", arguments: '{"type":"check","reason":"test"}' } },
        ],
      }),
      // After error, model replies anyway
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc2", type: "function", function: { name: "reply", arguments: '{"text":"Something went wrong in the world..."}' } },
          { id: "tc3", type: "function", function: { name: "done", arguments: "{}" } },
        ],
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: { request_roll: brokenHandler },
      messages: [{ role: "user", content: "test" }],
    });

    // The loop should continue even if a handler fails
    const rollCall = result.toolCalls.find((tc) => tc.name === "request_roll");
    expect(rollCall!.result).toEqual({ error: "database connection failed" });
    expect(result.reply).toBe("Something went wrong in the world...");
  });

  it("tracks token usage across iterations", async () => {
    const client = makeClient([
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "think", arguments: '{"text":"planning"}' } },
        ],
      }),
      makeResult({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc2", type: "function", function: { name: "reply", arguments: '{"text":"Done."}' } },
          { id: "tc3", type: "function", function: { name: "done", arguments: "{}" } },
        ],
      }),
    ]);

    const result = await runNarratorLoop({
      client,
      tools: emptyTools,
      handlers: {},
      messages: [{ role: "user", content: "test" }],
    });

    // Each call has 100 in + 50 out
    expect(result.totalTokensIn).toBe(200);
    expect(result.totalTokensOut).toBe(100);
  });
});
