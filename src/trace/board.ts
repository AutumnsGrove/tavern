/**
 * Trace board — structured, named slots with render ordering.
 *
 * Ported from her-go's trace system. Each slot is a named category
 * (rolls, state, flags, npcs, combat, meta). Slots render in a
 * fixed order so the trace output is consistent across turns.
 *
 * Usage:
 *   const board = new TraceBoard();
 *   board.add("rolls", "🎲 Stealth: nat 14 + 9 = 23 vs DC 15 ✅");
 *   board.add("state", "📊 HP: 45 → 38/45");
 *   board.render();  // returns formatted string with slots in order
 */

export type TraceSlot = "rolls" | "state" | "flags" | "npcs" | "combat" | "meta";

const SLOT_ORDER: TraceSlot[] = ["combat", "rolls", "state", "flags", "npcs", "meta"];

const SLOT_HEADERS: Record<TraceSlot, string> = {
  combat: "⚔️ Combat",
  rolls: "🎲 Rolls",
  state: "📊 State",
  flags: "🏴 Flags",
  npcs: "👥 NPCs",
  meta: "⏱ Meta",
};

export class TraceBoard {
  private slots = new Map<TraceSlot, string[]>();

  add(slot: TraceSlot, line: string): void {
    if (!this.slots.has(slot)) {
      this.slots.set(slot, []);
    }
    this.slots.get(slot)!.push(line);
  }

  get(slot: TraceSlot): string[] {
    return this.slots.get(slot) ?? [];
  }

  isEmpty(): boolean {
    for (const lines of this.slots.values()) {
      if (lines.length > 0) return false;
    }
    return true;
  }

  /** Render all non-empty slots in fixed order. */
  render(): string {
    const sections: string[] = [];

    for (const slot of SLOT_ORDER) {
      const lines = this.slots.get(slot);
      if (!lines || lines.length === 0) continue;

      if (sections.length > 0) sections.push("");
      sections.push(SLOT_HEADERS[slot]);
      sections.push(...lines);
    }

    return sections.join("\n");
  }

  /** Flat array of all lines (for backwards compat with CLI). */
  toLines(): string[] {
    const result: string[] = [];
    for (const slot of SLOT_ORDER) {
      const lines = this.slots.get(slot);
      if (lines) result.push(...lines);
    }
    return result;
  }

  clear(): void {
    this.slots.clear();
  }
}
