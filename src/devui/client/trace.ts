// Trace bubble rendering

import { messagesEl, state } from "./dom.js";
import { scrollToBottom } from "./messages.js";

export function addTraceBubble(text: string): void {
  const el = document.createElement("div");
  el.className = "msg trace";
  el.textContent = text;
  // Insert before the streaming bubble or last DM message
  const target = state.streamingBubble || messagesEl.lastElementChild;
  if (target && target !== messagesEl.firstElementChild) {
    messagesEl.insertBefore(el, target);
  } else {
    messagesEl.appendChild(el);
  }
  scrollToBottom();
}

export function updateLiveTrace(): void {
  let live = messagesEl.querySelector<HTMLDivElement>(".msg.trace.live");
  if (!live) {
    live = document.createElement("div");
    live.className = "msg trace live";
    const target = state.streamingBubble || null;
    if (target) {
      messagesEl.insertBefore(live, target);
    } else {
      messagesEl.appendChild(live);
    }
  }
  live.textContent = state.pendingTraceLines.join("\n");
  scrollToBottom();
}
