/**
 * Central prompt exports. All narrator-facing text lives here
 * or in sibling files in this directory.
 *
 * To tweak prompts: edit the files in src/narrator/prompts/
 * To tweak tool descriptions: edit files in src/narrator/tools/
 */

import { DM_CONTRACT } from "./contract";
import { VERBOSE_DIRECTIVE, CONCISE_DIRECTIVE } from "./directives";

export { DM_CONTRACT } from "./contract";
export { VERBOSE_DIRECTIVE, CONCISE_DIRECTIVE } from "./directives";
export {
  worldNudge,
  characterNudge,
  stateNudge,
  forksNudge,
  sceneNudge,
} from "./nudges";

export function buildSystemPrompt(mode: "verbose" | "concise"): string {
  const directive = mode === "verbose" ? VERBOSE_DIRECTIVE : CONCISE_DIRECTIVE;
  return `${DM_CONTRACT}\n\n## Narration Mode\n${directive}`;
}
