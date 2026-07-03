/**
 * Re-exports from src/narrator/prompts/ for backward compatibility.
 * The canonical prompt files now live in the prompts/ directory.
 */

export {
  DM_CONTRACT,
  VERBOSE_DIRECTIVE,
  CONCISE_DIRECTIVE,
  buildSystemPrompt,
} from "./prompts/index";
