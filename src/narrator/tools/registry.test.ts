import { describe, it, expect } from "vitest";
import { ALL_TOOLS, getToolDef, getToolNames } from "./registry";

describe("tool registry", () => {
  it("has all 15 expected tools", () => {
    expect(ALL_TOOLS).toHaveLength(15);
  });

  it("has no duplicate names", () => {
    const names = getToolNames();
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool has a valid definition shape", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.type).toBe("object");
    }
  });

  const expectedTools = [
    "think", "reply", "present_forks", "done",
    "request_roll", "request_damage", "lookup_rule",
    "get_character", "get_world", "update_character", "update_world",
    "start_combat", "end_combat", "enemy_action", "end_scene",
  ];

  it.each(expectedTools)("includes tool: %s", (name) => {
    const def = getToolDef(name);
    expect(def).toBeDefined();
    expect(def!.function.name).toBe(name);
  });

  it("getToolDef returns undefined for unknown tools", () => {
    expect(getToolDef("nonexistent")).toBeUndefined();
  });

  it("request_roll requires type and reason", () => {
    const def = getToolDef("request_roll")!;
    const required = def.function.parameters.required as string[];
    expect(required).toContain("type");
    expect(required).toContain("reason");
  });

  it("request_roll does NOT have a modifier parameter", () => {
    const def = getToolDef("request_roll")!;
    const props = def.function.parameters.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty("modifier");
  });

  it("present_forks requires forks array with 3-5 items", () => {
    const def = getToolDef("present_forks")!;
    const props = def.function.parameters.properties as Record<string, { minItems?: number; maxItems?: number }>;
    expect(props.forks?.minItems).toBe(3);
    expect(props.forks?.maxItems).toBe(5);
  });
});
