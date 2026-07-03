// Streaming message handlers

import { messagesEl, typingEl, state } from "./dom.js";
import { renderMd } from "./markdown.js";
import { scrollToBottom } from "./messages.js";
import { addKeyboard } from "./keyboard.js";

export function handleStreamStart(): void {
  typingEl.classList.remove("active");
  state.pendingTraceLines = [];
  state.streamingRawText = "";
  state.streamingBubble = document.createElement("div");
  state.streamingBubble.className = "msg dm";
  state.streamingBubble.textContent = "";
  messagesEl.appendChild(state.streamingBubble);
  scrollToBottom();
}

export function handleStreamDelta(text: string): void {
  if (state.streamingBubble) {
    state.streamingRawText += text;
    state.streamingBubble.textContent = state.streamingRawText;
    scrollToBottom();
  }
}

export function handleStreamEnd(text: string | undefined, forks?: Array<{ label: string; detail: string }>): void {
  typingEl.classList.remove("active");
  if (state.streamingBubble) {
    const finalText = text || state.streamingRawText;
    if (finalText.trim()) {
      state.streamingBubble.innerHTML = renderMd(finalText);
    } else {
      state.streamingBubble.remove();
    }
    state.streamingBubble = null;
    state.streamingRawText = "";
  }
  if (forks && forks.length > 0) addKeyboard(forks);
}
