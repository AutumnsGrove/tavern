// WebSocket connection and message dispatch

import { statusDot, statusText, typingEl, sessionStatsEl, state } from "./dom.js";
import { loadChatHistory, addDmMessage, addErrorMessage, scrollToBottom } from "./messages.js";
import { addKeyboard } from "./keyboard.js";
import { addTraceBubble, updateLiveTrace } from "./trace.js";
import { handleStreamStart, handleStreamDelta, handleStreamEnd } from "./stream.js";
import { updatePanelData } from "./panel.js";

export function connect(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.onopen = () => {
    statusDot.classList.add("connected");
    statusText.textContent = "Connected";
  };

  state.ws.onclose = () => {
    statusDot.classList.remove("connected");
    statusText.textContent = "Disconnected — reconnecting...";
    setTimeout(connect, 2000);
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string);
    switch (msg.type) {
      case "narrative":
        addDmMessage(msg.text);
        if (msg.forks && msg.forks.length > 0) addKeyboard(msg.forks);
        break;
      case "error":
        addErrorMessage(msg.text);
        break;
      case "forks":
        addKeyboard(msg.forks);
        break;
      case "trace":
        addTraceBubble(msg.text);
        break;
      case "trace_line":
        state.pendingTraceLines.push(msg.text);
        updateLiveTrace();
        break;
      case "stream_start":
        handleStreamStart();
        break;
      case "stream_delta":
        handleStreamDelta(msg.text);
        break;
      case "stream_end":
        handleStreamEnd(msg.text, msg.forks);
        break;
      case "session_stats":
        sessionStatsEl.textContent = `${msg.turns} turn${msg.turns !== 1 ? "s" : ""} · $${msg.cost.toFixed(4)}`;
        break;
      case "typing":
        if (msg.active) {
          typingEl.classList.add("active");
          scrollToBottom();
        } else {
          typingEl.classList.remove("active");
        }
        break;
      case "panel_data":
        updatePanelData(msg.panels);
        break;
      case "chat_history":
        loadChatHistory(msg.messages);
        break;
    }
  };
}
