import { describe, it, expect } from "vitest";
import { buildContext, estimateTokens, trimToTokenBudget } from "./context";
import type { ChatMessage } from "../narrator/client";

describe("buildContext", () => {
  it("puts system prompt first with DM contract", () => {
    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: null,
      worldState: null,
      recentMessages: [],
      playerMessage: "I enter the tavern.",
    });

    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("Dungeon Master");
    expect(messages[0]!.content).toContain("NEVER produce a die result");
  });

  it("injects character sheet into system context", () => {
    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: "# Sayola — Character Sheet\nHP: 18/18",
      worldState: null,
      recentMessages: [],
      playerMessage: "What's my HP?",
    });

    expect(messages[0]!.content).toContain("Sayola — Character Sheet");
    expect(messages[0]!.content).toContain("HP: 18/18");
    expect(messages[0]!.content).toContain("CHARACTER SHEET");
  });

  it("injects world state into system context", () => {
    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: null,
      worldState: "# World State\n## Current Scene\nA dark alley",
      recentMessages: [],
      playerMessage: "Where am I?",
    });

    expect(messages[0]!.content).toContain("WORLD STATE");
    expect(messages[0]!.content).toContain("A dark alley");
  });

  it("injects combat state when active", () => {
    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: null,
      worldState: null,
      combatState: "Round 2. Sayola's turn. Goblin A: 5/7 HP.",
      recentMessages: [],
      playerMessage: "I attack!",
    });

    expect(messages[0]!.content).toContain("COMBAT (active)");
    expect(messages[0]!.content).toContain("Round 2");
  });

  it("includes recent messages and player message in correct order", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I look around." },
      { role: "assistant", content: "You see a tavern." },
    ];

    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: null,
      worldState: null,
      recentMessages: history,
      playerMessage: "I go inside.",
    });

    expect(messages).toHaveLength(4); // system + 2 history + player
    expect(messages[1]!.content).toBe("I look around.");
    expect(messages[2]!.content).toBe("You see a tavern.");
    expect(messages[3]!.content).toBe("I go inside.");
    expect(messages[3]!.role).toBe("user");
  });

  it("uses concise directive in concise mode", () => {
    const messages = buildContext({
      narrationMode: "concise",
      characterSheet: null,
      worldState: null,
      recentMessages: [],
      playerMessage: "Go.",
    });

    expect(messages[0]!.content).toContain("tight, punchy");
    expect(messages[0]!.content).not.toContain("atmospheric prose");
  });

  it("uses verbose directive in verbose mode", () => {
    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: null,
      worldState: null,
      recentMessages: [],
      playerMessage: "Go.",
    });

    expect(messages[0]!.content).toContain("atmospheric prose");
  });
});

describe("estimateTokens", () => {
  it("estimates roughly 1 token per 4 chars", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "a".repeat(400) },
    ];
    expect(estimateTokens(messages)).toBe(100);
  });

  it("handles messages with tool calls", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function", function: { name: "think", arguments: '{"text":"hello"}' } },
        ],
      },
    ];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("returns 0 for empty messages", () => {
    expect(estimateTokens([])).toBe(0);
  });
});

describe("trimToTokenBudget", () => {
  it("keeps all messages when under budget", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a DM." },
      { role: "user", content: "Hello." },
      { role: "assistant", content: "Welcome." },
      { role: "user", content: "Go." },
    ];

    const trimmed = trimToTokenBudget(messages, 10000);
    expect(trimmed).toHaveLength(4);
  });

  it("drops oldest non-system messages first", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "old message " + "x".repeat(1000) },
      { role: "assistant", content: "old reply " + "x".repeat(1000) },
      { role: "user", content: "recent message" },
      { role: "assistant", content: "recent reply" },
      { role: "user", content: "latest" },
    ];

    // Budget that fits system + latest + recent pair but not old pair
    const trimmed = trimToTokenBudget(messages, 100);
    expect(trimmed.length).toBeLessThan(messages.length);
    // System always kept
    expect(trimmed[0]!.role).toBe("system");
    // Latest user message always kept
    expect(trimmed[trimmed.length - 1]!.content).toBe("latest");
  });

  it("always keeps system messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "x".repeat(200) },
      { role: "user", content: "latest" },
    ];

    const trimmed = trimToTokenBudget(messages, 100);
    expect(trimmed[0]!.role).toBe("system");
  });
});
