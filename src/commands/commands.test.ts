import { describe, it, expect, vi } from "vitest";
import { rollCommand } from "./roll";
import { helpCommand } from "./help";

describe("/roll command", () => {
  it("rolls a d20 and returns a result in range", async () => {
    const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "20" });
    expect(result.text).toContain("d20:");
    // Extract the number between ** markers
    const match = result.text.match(/\*\*(\d+)\*\*/);
    expect(match).toBeTruthy();
    const value = parseInt(match![1]!, 10);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(20);
  });

  it("rolls a d6", async () => {
    const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "6" });
    expect(result.text).toContain("d6:");
    const match = result.text.match(/\*\*(\d+)\*\*/);
    const value = parseInt(match![1]!, 10);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);
  });

  it("shows NAT 20 label on d20 nat 20", async () => {
    // Roll many times and check that nat 20 gets labeled when it occurs
    let sawNat20 = false;
    for (let i = 0; i < 500; i++) {
      const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "20" });
      if (result.text.includes("NAT 20")) {
        sawNat20 = true;
        break;
      }
    }
    // With 500 d20 rolls, probability of never seeing a 20 is (19/20)^500 ≈ 0
    expect(sawNat20).toBe(true);
  });

  it("rejects invalid input", async () => {
    const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "abc" });
    expect(result.text).toContain("Usage");
  });

  it("rejects d0", async () => {
    const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "0" });
    expect(result.text).toContain("Usage");
  });

  it("rejects d200", async () => {
    const result = await rollCommand.handler({ chatId: "test", saveId: null, args: "200" });
    expect(result.text).toContain("Usage");
  });

  it("does not require a save", () => {
    expect(rollCommand.requiresSave).toBe(false);
  });
});

describe("/help command", () => {
  it("lists all commands", async () => {
    const result = await helpCommand.handler({ chatId: "test", saveId: null, args: "" });
    expect(result.text).toContain("/sheet");
    expect(result.text).toContain("/roll");
    expect(result.text).toContain("/help");
    expect(result.text).toContain("/abilities");
    expect(result.text).toContain("/new");
    expect(result.text).toContain("/concise");
    expect(result.text).toContain("/verbose");
    expect(result.text).toContain("/model");
    expect(result.text).toContain("/traces");
  });

  it("does not require a save", () => {
    expect(helpCommand.requiresSave).toBe(false);
  });
});
