/**
 * Shared types for tool definitions. Every tool file exports
 * a `definition` (JSON Schema for the model) and optionally
 * a handler type hint.
 */

import type { ToolDef } from "../client";

export interface ToolModule {
  definition: ToolDef;
}
