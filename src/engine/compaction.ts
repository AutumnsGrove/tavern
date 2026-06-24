/**
 * Context compaction. Two strategies:
 *
 * 1. Scene-based: when end_scene is called, old messages before the
 *    scene boundary are trimmed. The scene summary replaces them.
 *
 * 2. Token-based: if hot context exceeds the token budget, auto-trim
 *    oldest messages and inject a compaction notice. Keeps the most
 *    recent N messages so the narrator has immediate context.
 *
 * The two documents (character sheet + world state) are always fresh —
 * they're rendered from DB on every turn, not stored in message history.
 * Scene summaries are also always available via the world state document.
 */

import type { GameStore } from "../state/store";
import type { ChatMessage } from "../narrator/client";
import { estimateTokens } from "./context";
import { config } from "../config";

export interface CompactionResult {
  trimmedCount: number;
  reason: "scene" | "token_budget" | "none";
}

/**
 * Scene compaction: delete messages older than the latest scene boundary.
 * Called after end_scene tool is handled.
 */
export async function compactOnSceneEnd(
  store: GameStore,
  saveId: string,
  keepRecent: number = config.compactionKeepMessages,
): Promise<CompactionResult> {
  const messages = await store.getRecentMessages(saveId, 1000);
  if (messages.length <= keepRecent) {
    return { trimmedCount: 0, reason: "none" };
  }

  // Keep the most recent messages
  const cutoffIdx = messages.length - keepRecent;
  const cutoffSeq = (messages[cutoffIdx] as { seq: number }).seq;

  // Delete everything before the cutoff
  await store.deleteMessagesBeforeSeq(saveId, cutoffSeq);

  return {
    trimmedCount: cutoffIdx,
    reason: "scene",
  };
}

/**
 * Token-based compaction: check if hot context exceeds budget.
 * If so, trim oldest messages. Called before building context.
 */
export async function compactIfNeeded(
  store: GameStore,
  saveId: string,
  recentMessages: ChatMessage[],
): Promise<CompactionResult> {
  const tokenCount = estimateTokens(recentMessages);

  if (tokenCount <= config.contextTokenBudget) {
    return { trimmedCount: 0, reason: "none" };
  }

  // Find how many messages to drop from the front
  let tokensToTrim = tokenCount - config.contextTokenBudget;
  let trimCount = 0;

  for (const msg of recentMessages) {
    if (tokensToTrim <= 0) break;
    tokensToTrim -= estimateTokens([msg]);
    trimCount++;
  }

  // Keep at least compactionKeepMessages
  const maxTrim = recentMessages.length - config.compactionKeepMessages;
  trimCount = Math.min(trimCount, Math.max(0, maxTrim));

  if (trimCount <= 0) {
    return { trimmedCount: 0, reason: "none" };
  }

  // Delete the oldest messages from DB
  const cutoffMsg = recentMessages[trimCount] as { seq?: number } | undefined;
  if (cutoffMsg?.seq) {
    await store.deleteMessagesBeforeSeq(saveId, cutoffMsg.seq);
  }

  return { trimmedCount: trimCount, reason: "token_budget" };
}
