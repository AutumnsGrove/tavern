/**
 * Context builder. Assembles the full narrator prompt from:
 * 1. System prompt (DM contract + narration mode)
 * 2. Character sheet document
 * 3. World state document
 * 4. Combat state (if active)
 * 5. Recent message history (hot context)
 * 6. The player's latest message
 */

import type { ChatMessage } from "../narrator/client";
import { buildSystemPrompt } from "../narrator/prompt";

export interface ContextParts {
  narrationMode: "verbose" | "concise";
  characterSheet: string | null;
  worldState: string | null;
  combatState?: string;
  recentMessages: ChatMessage[];
  playerMessage: string;
}

/**
 * Build the full message array to send to the narrator.
 * System prompt is always first. Documents are injected as system
 * messages so the narrator reads them as authoritative context.
 */
export function buildContext(parts: ContextParts): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 1. System prompt (DM contract + narration mode)
  let systemContent = buildSystemPrompt(parts.narrationMode);

  // 2. Character sheet as part of system context
  if (parts.characterSheet) {
    systemContent += `\n\n---\n\n## CHARACTER SHEET (current state — read-only, use update_character to change)\n\n${parts.characterSheet}`;
  }

  // 3. World state as part of system context
  if (parts.worldState) {
    systemContent += `\n\n---\n\n## WORLD STATE (current state — read-only, use update_world to change)\n\n${parts.worldState}`;
  }

  // 4. Combat state
  if (parts.combatState) {
    systemContent += `\n\n---\n\n## COMBAT (active)\n\n${parts.combatState}`;
  }

  messages.push({ role: "system", content: systemContent });

  // 5. Recent message history (hot context)
  for (const msg of parts.recentMessages) {
    messages.push(msg);
  }

  // 6. Player's latest message
  messages.push({ role: "user", content: parts.playerMessage });

  return messages;
}

/**
 * Estimate token count for a message array. Rough approximation
 * (~4 chars per token for English text). Used for budget decisions.
 */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (msg.content) chars += msg.content.length;
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        chars += tc.function.name.length + tc.function.arguments.length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Trim message history to fit within a token budget.
 * Drops the oldest messages first (keeps the most recent ones).
 * Never drops system messages.
 */
export function trimToTokenBudget(
  messages: ChatMessage[],
  budgetTokens: number,
): ChatMessage[] {
  // Always keep system messages and the latest user message
  const system = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (nonSystem.length === 0) return messages;

  const latestUser = nonSystem[nonSystem.length - 1]!;
  const history = nonSystem.slice(0, -1);

  // Start with system + latest, add history from most recent
  const result = [...system];
  const historyToAdd: ChatMessage[] = [];

  let currentTokens = estimateTokens([...system, latestUser]);

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    const msgTokens = estimateTokens([msg]);
    if (currentTokens + msgTokens > budgetTokens) break;
    historyToAdd.unshift(msg);
    currentTokens += msgTokens;
  }

  result.push(...historyToAdd, latestUser);
  return result;
}
