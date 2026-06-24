import { describe, it, expect } from "vitest";
import { renderCharacterSheet, renderWorldState } from "./documents";
import type { Character, InventoryItem, Npc, Flag, Scene } from "./store";

const sayola: Character = {
  save_id: "test-save",
  name: "Sayola",
  race: "Tiefling",
  class: "Monk",
  subclass: "Way of the Open Hand",
  level: 10,
  xp: 0,
  str: 10,
  dex: 20,
  con: 12,
  int: 10,
  wis: 16,
  cha: 14,
  hp_current: 18,
  hp_max: 18,
  ac: 15,
  speed: 45,
  proficiency_bonus: 4,
  ki_current: 10,
  ki_max: 10,
  spell_slots_json: null,
  hit_dice_remaining: 10,
  class_resources_json: '{"ki_points":{"current":10,"max":10,"restoresOn":"short"}}',
  skill_proficiencies: '["stealth", "acrobatics", "insight", "athletics"]',
  save_proficiencies: '["str", "dex"]',
  tool_proficiencies: "[]",
  updated_at: "2026-06-23",
};

const inventory: InventoryItem[] = [
  { id: 1, save_id: "test-save", name: "Quarterstaff", qty: 1, unit: null, equipped: 1, notes: null, category: "weapon" },
  { id: 2, save_id: "test-save", name: "Hemp rope", qty: 30, unit: "ft", equipped: 0, notes: null, category: "gear" },
  { id: 3, save_id: "test-save", name: "Spyglass", qty: 1, unit: null, equipped: 0, notes: "collapsible", category: "gear" },
  { id: 4, save_id: "test-save", name: "Gold", qty: 4, unit: null, equipped: 0, notes: null, category: "coin" },
];

describe("renderCharacterSheet", () => {
  it("includes character name and class info", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    expect(sheet).toContain("# Sayola — Character Sheet");
    expect(sheet).toContain("Tiefling Monk");
    expect(sheet).toContain("Way of the Open Hand");
    expect(sheet).toContain("Level 10");
  });

  it("shows correct HP, AC, speed", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    expect(sheet).toContain("HP: 18/18");
    expect(sheet).toContain("AC: 15");
    expect(sheet).toContain("Speed: 45 ft");
  });

  it("computes ability modifiers correctly", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    expect(sheet).toContain("DEX 20 (+5)");
    expect(sheet).toContain("STR 10 (+0)");
    expect(sheet).toContain("WIS 16 (+3)");
    expect(sheet).toContain("CHA 14 (+2)");
  });

  it("marks proficient skills with ★ and computes modifiers", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    // Stealth: DEX(+5) + prof(+4) = +9
    expect(sheet).toContain("★ Stealth: +9");
    // Acrobatics: DEX(+5) + prof(+4) = +9
    expect(sheet).toContain("★ Acrobatics: +9");
    // Persuasion: CHA(+2), no prof = +2
    expect(sheet).toMatch(/\s Persuasion: \+2/);
  });

  it("shows ki resources", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    expect(sheet).toContain("Ki: 10/10");
  });

  it("lists inventory grouped by category", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    expect(sheet).toContain("Quarterstaff");
    expect(sheet).toContain("[equipped]");
    expect(sheet).toContain("Hemp rope (x30) ft");
    expect(sheet).toContain("collapsible");
    expect(sheet).toContain("Gold (x4)");
  });

  it("marks proficient saves with ★", () => {
    const sheet = renderCharacterSheet(sayola, inventory);
    // STR save: STR(+0) + prof(+4) = +4
    expect(sheet).toContain("★ STR: +4");
    // DEX save: DEX(+5) + prof(+4) = +9
    expect(sheet).toContain("★ DEX: +9");
    // WIS save: WIS(+3), no prof = +3
    expect(sheet).toMatch(/\s WIS: \+3/);
  });
});

describe("renderWorldState", () => {
  const npcs: Npc[] = [
    { id: 1, save_id: "test-save", name: "Reka", role: "first mate", loyalty: 85, alive: 1, notes: "sharp, loyal" },
    { id: 2, save_id: "test-save", name: "Bryn", role: "mercenary", loyalty: 45, alive: 1, notes: "here for silver" },
    { id: 3, save_id: "test-save", name: "Officer", role: "prisoner", loyalty: null, alive: 1, notes: "bound, gagged" },
  ];

  const flags: Flag[] = [
    { save_id: "test-save", key: "ship_taken", value: "true", set_at: "2026-06-23" },
    { save_id: "test-save", key: "quill_alerted", value: "false", set_at: "2026-06-23" },
    { save_id: "test-save", key: "heading", value: "Havana", set_at: "2026-06-23" },
  ];

  const scenes: Scene[] = [
    { id: 1, save_id: "test-save", seq: 1, scene_id: "market", summary: "Sayola cased the Crooked Market, stole a spyglass, and recruited a street kid.", created_at: "2026-06-23" },
    { id: 2, save_id: "test-save", seq: 2, scene_id: "ship_heist", summary: "Boarded the Maiden's Regret, freed 20 captives, neutralized the officer.", created_at: "2026-06-23" },
  ];

  it("includes NPCs with roles and loyalty", () => {
    const doc = renderWorldState(npcs, flags, scenes);
    expect(doc).toContain("**Reka** — first mate (loyalty: 85/100)");
    expect(doc).toContain("**Bryn** — mercenary (loyalty: 45/100)");
  });

  it("includes world flags in readable format", () => {
    const doc = renderWorldState(npcs, flags, scenes);
    expect(doc).toContain("ship taken");
    expect(doc).toContain("heading: Havana");
  });

  it("includes story-so-far scene summaries", () => {
    const doc = renderWorldState(npcs, flags, scenes);
    expect(doc).toContain("**1.** Sayola cased the Crooked Market");
    expect(doc).toContain("**2.** Boarded the Maiden's Regret");
  });

  it("includes current scene when provided", () => {
    const doc = renderWorldState(npcs, flags, scenes, "Open water, night 1. The crew eats together.");
    expect(doc).toContain("Open water, night 1");
  });

  it("handles empty data gracefully", () => {
    const doc = renderWorldState([], [], []);
    expect(doc).toContain("(none)");
    expect(doc).toContain("(no active scene)");
  });
});
