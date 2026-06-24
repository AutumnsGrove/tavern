import { describe, it, expect } from "vitest";
import { CommandRegistry } from "./commands";
import type { CommandDef } from "./commands";

describe("CommandRegistry", () => {
  function makeRegistry(): CommandRegistry {
    const reg = new CommandRegistry();
    reg.register({
      name: "sheet",
      description: "Display character sheet",
      requiresSave: true,
      handler: async () => ({ text: "sheet content" }),
    });
    reg.register({
      name: "help",
      description: "Show help",
      requiresSave: false,
      handler: async () => ({ text: "help text" }),
    });
    reg.register({
      name: "roll",
      description: "Roll a die",
      requiresSave: false,
      handler: async () => ({ text: "rolled" }),
    });
    return reg;
  }

  it("registers and retrieves commands", () => {
    const reg = makeRegistry();
    expect(reg.has("sheet")).toBe(true);
    expect(reg.has("help")).toBe(true);
    expect(reg.has("nonexistent")).toBe(false);
    expect(reg.get("sheet")?.description).toBe("Display character sheet");
  });

  it("lists all registered commands", () => {
    const reg = makeRegistry();
    const all = reg.all();
    expect(all).toHaveLength(3);
    const names = all.map((c) => c.name);
    expect(names).toContain("sheet");
    expect(names).toContain("help");
    expect(names).toContain("roll");
  });

  describe("parse", () => {
    const reg = new CommandRegistry();

    const cases: Array<[string, { name: string; args: string } | null]> = [
      ["/sheet", { name: "sheet", args: "" }],
      ["/roll 20", { name: "roll", args: "20" }],
      ["/model gpt-4o", { name: "model", args: "gpt-4o" }],
      ["/HELP", { name: "help", args: "" }],
      ["  /sheet  ", { name: "sheet", args: "" }],
      ["/roll  20  ", { name: "roll", args: "20" }],
      ["hello", null],
      ["", null],
      ["not a / command", null],
    ];

    it.each(cases)("parse(%j) → %j", (input, expected) => {
      expect(reg.parse(input)).toEqual(expected);
    });
  });
});
