// DOM element refs and shared mutable state

export const messagesEl = document.getElementById("messages") as HTMLDivElement;
export const inputEl = document.getElementById("input") as HTMLTextAreaElement;
export const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
export const voiceBtn = document.getElementById("voice-btn") as HTMLButtonElement;
export const typingEl = document.getElementById("typing") as HTMLDivElement;
export const statusDot = document.getElementById("status-dot") as HTMLDivElement;
export const statusText = document.getElementById("status-text") as HTMLSpanElement;
export const autocompleteEl = document.getElementById("autocomplete") as HTMLDivElement;
export const sessionStatsEl = document.getElementById("session-stats") as HTMLSpanElement;
export const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;
export const sidePanel = document.getElementById("side-panel") as HTMLElement;
export const panelContent = document.getElementById("panel-content") as HTMLDivElement;
export const panelTabs = document.querySelectorAll<HTMLButtonElement>(".panel-tab");

// Shared mutable state
export const state = {
  ws: null as WebSocket | null,
  mediaRecorder: null as MediaRecorder | null,
  audioChunks: [] as Blob[],
  acIndex: -1,
  streamingBubble: null as HTMLDivElement | null,
  streamingRawText: "",
  pendingTraceLines: [] as string[],
  panelData: {} as Record<string, string>,
  activePanel: "sheet",
  isRecording: false,
};
