import { describe, it, expect } from "vitest";
import { TraceBoard } from "./board";

describe("TraceBoard", () => {
  it("starts empty", () => {
    const board = new TraceBoard();
    expect(board.isEmpty()).toBe(true);
    expect(board.render()).toBe("");
    expect(board.toLines()).toEqual([]);
  });

  it("adds lines to slots", () => {
    const board = new TraceBoard();
    board.add("rolls", "🎲 Stealth: nat 14 + 9 = 23 vs DC 15 ✅");
    board.add("rolls", "🎲 Perception: nat 7 + 3 = 10 vs DC 12 ❌");

    expect(board.isEmpty()).toBe(false);
    expect(board.get("rolls")).toHaveLength(2);
    expect(board.get("state")).toEqual([]);
  });

  it("renders slots in fixed order", () => {
    const board = new TraceBoard();
    board.add("meta", "⏱ 3 tool calls · 1200 tokens");
    board.add("rolls", "🎲 Attack: nat 18 + 7 = 25");
    board.add("state", "📊 HP: 45 → 38/45");
    board.add("combat", "⚔️ Round 2");

    const rendered = board.render();
    const lines = rendered.split("\n");

    // Combat should come first
    expect(lines[0]).toBe("⚔️ Combat");
    expect(lines[1]).toContain("Round 2");

    // Rolls before state
    const rollsIdx = lines.findIndex((l) => l === "🎲 Rolls");
    const stateIdx = lines.findIndex((l) => l === "📊 State");
    const metaIdx = lines.findIndex((l) => l === "⏱ Meta");
    expect(rollsIdx).toBeLessThan(stateIdx);
    expect(stateIdx).toBeLessThan(metaIdx);
  });

  it("skips empty slots in render", () => {
    const board = new TraceBoard();
    board.add("rolls", "🎲 Check: nat 12 + 5 = 17");
    board.add("meta", "⏱ 1 call");

    const rendered = board.render();
    expect(rendered).not.toContain("State");
    expect(rendered).not.toContain("Flags");
    expect(rendered).not.toContain("NPCs");
    expect(rendered).not.toContain("Combat");
  });

  it("toLines returns flat array in slot order", () => {
    const board = new TraceBoard();
    board.add("meta", "meta-line");
    board.add("rolls", "roll-line");

    const lines = board.toLines();
    expect(lines).toEqual(["roll-line", "meta-line"]);
  });

  it("clears all slots", () => {
    const board = new TraceBoard();
    board.add("rolls", "something");
    board.add("state", "something");
    board.clear();
    expect(board.isEmpty()).toBe(true);
  });
});
