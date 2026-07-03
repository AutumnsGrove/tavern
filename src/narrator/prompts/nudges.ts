/**
 * Nudge messages — post-loop prompts that correct the model's behavior.
 * These fire after the main narrator loop ends, before the final return.
 *
 * Each nudge is a function that returns the message string, so nudges
 * can incorporate dynamic context (e.g. which tools were called).
 */

/** Nudge: force update_world to persist the current scene. */
export function worldNudge(): string {
  return (
    "Call update_world now. Set current_scene to a 1-2 sentence description " +
    "of where the player is RIGHT NOW and what's happening. Also set any " +
    "flags or NPCs that changed."
  );
}

/** Nudge: force update_character when mechanical state changed. */
export function characterNudge(): string {
  return "Call update_character if HP, ki, inventory, or resources changed this turn.";
}

/** Nudge: wrapper for state nudges. */
export function stateNudge(parts: string[]): string {
  return (
    "You MUST persist state before finishing. " +
    parts.join("\n\n") +
    "\n\nCall ONLY state update tools. Do NOT write text."
  );
}

/** Nudge: force present_forks when the model forgot to offer choices. */
export function forksNudge(): string {
  return (
    "You must call the present_forks tool now with 3-5 choices. " +
    "Do NOT write text — only call the present_forks tool, then call done."
  );
}

/** Nudge: suggest end_scene at natural narrative breaks. */
export function sceneNudge(turnsSinceLastScene: number): string {
  return (
    `It has been ${turnsSinceLastScene} turns since the last scene summary. ` +
    "If a natural story break has occurred (changed location, finished a conversation, " +
    "completed an objective), call end_scene with a 1-2 sentence summary of what " +
    "happened in this scene. If the scene is still ongoing, skip this.\n\n" +
    "Call end_scene or do nothing. Do NOT write text."
  );
}
