---
name: Tavern
description: D&D choose-your-own-adventure game engine
colors:
  hearth-amber: "#c9944a"
  deep-oak: "#1a1410"
  aged-leather: "#241e17"
  worn-surface: "#2c2419"
  smoke-border: "#3d3428"
  parchment-text: "#e8dcc8"
  faded-ink: "#9b8e7a"
  ember-red: "#c45a4a"
  sage-green: "#5a7a5e"
  dm-shadow: "#1e1912"
  player-shadow: "#1a2218"
  trace-violet: "#2a2435"
  trace-text: "#a89cbd"
typography:
  display:
    fontFamily: "Crimson Pro, Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "32px"
components:
  button-fork:
    backgroundColor: "{colors.worn-surface}"
    textColor: "{colors.hearth-amber}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-fork-hover:
    backgroundColor: "{colors.smoke-border}"
    textColor: "{colors.hearth-amber}"
  button-send:
    backgroundColor: "{colors.hearth-amber}"
    textColor: "{colors.deep-oak}"
    rounded: "{rounded.full}"
    padding: "10px"
  message-dm:
    backgroundColor: "{colors.dm-shadow}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  message-player:
    backgroundColor: "{colors.player-shadow}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  input-field:
    backgroundColor: "{colors.aged-leather}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: Tavern

## 1. Overview

**Creative North Star: "The Lamplit Table"**

A well-worn wooden table in a dim room. Maps spread out, dice scattered, candles burning low. The focus is the game, not the room. Every surface carries the warmth of aged wood and firelight; nothing is cold, nothing is sterile, nothing glows with neon urgency. The atmosphere is earned through material, not decoration.

The system rejects two extremes: the personality-void of generic AI chat interfaces (plain grey bubbles, indistinguishable from a support chatbot) and the ornamental excess of MMO fantasy UI (gold filigree, dragon borders, themed frames competing with content). The sweet spot is textural warmth with typographic discipline. The narrative is the star; the interface is the table it rests on.

**Key Characteristics:**
- Warm-tinted darks (brown-blacks, not blue-blacks)
- Amber as the sole accent, used sparingly for emphasis and interaction
- Serif display type for narrative headings; clean sans for UI chrome
- Flat surfaces with tonal layering (no shadows, no glass)
- Generous line height in narrative text (this is reading-first)

## 2. Colors: The Hearthside Palette

A warm monochrome with a single amber accent. The neutrals are tinted toward raw umber, not toward blue or grey. The result reads as candlelit, not as GitHub.

### Primary
- **Hearth Amber** (#c9944a): Interactive elements, active states, emphasis. Appears on fork buttons, the send button, headings within narrative. Used at under 15% of any screen.

### Neutral
- **Deep Oak** (#1a1410): Page background. The darkest surface, warm-black.
- **Aged Leather** (#241e17): Input fields, secondary surfaces. One step up from the background.
- **Worn Surface** (#2c2419): Fork buttons at rest, elevated containers. Two steps up.
- **Smoke Border** (#3d3428): Dividers, subtle borders. Visible but never dominant.
- **Parchment Text** (#e8dcc8): Primary text. Warm off-white, never pure white.
- **Faded Ink** (#9b8e7a): Secondary text, timestamps, metadata. Recedes without disappearing.

### Semantic
- **Ember Red** (#c45a4a): Errors, failed rolls, danger states. Warm red, not alarm-siren.
- **Sage Green** (#5a7a5e): Successful rolls, positive state changes. Muted, not celebratory.
- **Trace Violet** (#2a2435): Trace/debug panel background. Cool enough to read as a different register from game content.

### Named Rules
**The One Flame Rule.** Hearth Amber is the only saturated color in the chrome. Every other interactive element uses warm neutrals. The amber's rarity is what makes it feel like firelight.

## 3. Typography

**Display Font:** Crimson Pro (with Georgia fallback)
**Body Font:** Inter (with system-ui fallback)
**Mono Font:** JetBrains Mono (with SF Mono fallback)

**Character:** Crimson Pro brings the weight of a printed chronicle without the fussiness of a blackletter or script face. Its optical sizing and variable weight make it readable at body sizes while carrying authority at display. Inter is the invisible workhorse for UI elements. The pairing says: the story is literature, the interface is a tool.

### Hierarchy
- **Display** (600, 18px, 1.3): Narrator headings within prose. Bold names, locations, items.
- **Body** (400, 14px, 1.6): All narrative prose and player messages. Max line length capped at 65ch.
- **Label** (500, 11px, 1.4, 0.02em tracking): Fork button text, session stats, metadata.
- **Mono** (400, 11px, 1.5): Trace panel, roll results, token counts.

### Named Rules
**The Reading-First Rule.** Narrative body text has 1.6 line height and 65ch max width. This is a reading interface first. If the prose feels cramped, everything else breaks down.

## 4. Elevation

Flat by default. Depth is conveyed through tonal layering (Deep Oak → Aged Leather → Worn Surface), not through shadows. The only exception: a subtle ambient shadow on the input bar to separate it from the message scroll area.

### Named Rules
**The Flat Table Rule.** Surfaces sit on the table, they don't float above it. No drop shadows, no lifted cards, no glassmorphism. Tonal steps are the only depth cue.

## 5. Components

### Fork Buttons
- **Shape:** Gently rounded (10px radius)
- **Rest:** Worn Surface background, Hearth Amber text, no border
- **Hover:** Smoke Border background, slight brightness lift
- **Character:** Quiet presence. They invite without demanding.

### Message Bubbles
- **DM messages:** DM Shadow background, left-aligned, rounded with flat bottom-left corner
- **Player messages:** Player Shadow background, right-aligned, rounded with flat bottom-right corner
- **Internal padding:** 12px 16px. Generous but not wasteful.

### Input Bar
- **Field:** Aged Leather background, Smoke Border border, full-round corners (16px)
- **Focus:** Border shifts to Hearth Amber at reduced opacity
- **Send button:** Hearth Amber circle, Deep Oak icon

### Trace Panel
- **Background:** Trace Violet (cool-shifted to visually separate from game content)
- **Text:** Trace text in mono, muted violet-grey
- **Position:** Inline bubble above narrative, not a sidebar

### Navigation/Header
- **Background:** Aged Leather, visually separated by Smoke Border bottom edge
- **Title:** Hearth Amber, display weight
- **Stats:** Mono, Faded Ink

## 6. Do's and Don'ts

### Do:
- **Do** tint every neutral toward raw umber. Even the darkest background should feel warm, not cold.
- **Do** use Hearth Amber only for interactive elements and emphasis. Its scarcity is the design.
- **Do** give narrative text room to breathe: 1.6 line height, 65ch max width, 12px+ padding.
- **Do** use tonal layering for depth. Three stops (Deep Oak, Aged Leather, Worn Surface) is enough.
- **Do** keep the trace panel visually distinct from game content via the cool violet shift.

### Don't:
- **Don't** use blue-tinted darks or cool greys. This is not GitHub, not VS Code, not a dev tool palette.
- **Don't** add gold filigree, ornate borders, dragon motifs, or fantasy-themed decoration. Atmosphere comes from material, not ornament.
- **Don't** use drop shadows. Surfaces are flat on the table.
- **Don't** make fork buttons look like CTA banners. They're quiet options, not sales pitches.
- **Don't** use pure white (#fff) or pure black (#000) anywhere. Everything is tinted warm.
- **Don't** put the trace panel in a sidebar or overlay. It's inline, part of the conversation flow.
