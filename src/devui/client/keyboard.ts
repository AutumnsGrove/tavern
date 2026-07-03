// Fork button keyboard rendering

import { messagesEl, inputEl, state } from "./dom.js";
import { addPlayerMessage, scrollToBottom } from "./messages.js";

export function addKeyboard(forks: Array<{ label: string; detail: string }>): void {
  const prev = messagesEl.querySelector(".keyboard:last-child");
  if (prev) prev.remove();

  const kb = document.createElement("div");
  kb.className = "keyboard";

  for (const fork of forks) {
    const btn = document.createElement("button");
    btn.textContent = fork.label;
    btn.title = fork.detail;
    btn.onclick = () => {
      addPlayerMessage(fork.label);
      kb.remove();
      if (state.ws) {
        state.ws.send(JSON.stringify({ type: "message", text: fork.label }));
      }
    };
    kb.appendChild(btn);
  }

  const other = document.createElement("button");
  other.textContent = "Other...";
  other.className = "other";
  other.onclick = () => {
    kb.remove();
    inputEl.focus();
    inputEl.placeholder = "Type your action...";
  };
  kb.appendChild(other);

  messagesEl.appendChild(kb);
  scrollToBottom();
}
