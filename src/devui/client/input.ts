// Input handling and send logic

import { inputEl, sendBtn, autocompleteEl, messagesEl, state } from "./dom.js";
import { addPlayerMessage } from "./messages.js";
import { handleAutocomplete, closeAutocomplete, updateAcSelection } from "./autocomplete.js";

export function send(): void {
  const text = inputEl.value.trim();
  if (!text || !state.ws || state.ws.readyState !== 1) return;

  const kb = messagesEl.querySelector(".keyboard:last-child");
  if (kb) kb.remove();

  addPlayerMessage(text);
  state.ws.send(JSON.stringify({ type: "message", text }));
  inputEl.value = "";
  inputEl.style.height = "auto";
  sendBtn.disabled = true;
  closeAutocomplete();
}

export function initInputHandlers(): void {
  inputEl.addEventListener("input", () => {
    sendBtn.disabled = !inputEl.value.trim();
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    handleAutocomplete();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (autocompleteEl.classList.contains("open")) {
      const items = autocompleteEl.querySelectorAll<HTMLDivElement>(".item");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.acIndex = Math.min(state.acIndex + 1, items.length - 1);
        updateAcSelection(items);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        state.acIndex = Math.max(state.acIndex - 1, 0);
        updateAcSelection(items);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && state.acIndex >= 0)) {
        e.preventDefault();
        if (state.acIndex >= 0 && items[state.acIndex]) {
          inputEl.value = (items[state.acIndex] as HTMLElement).dataset.cmd + " ";
          closeAutocomplete();
          sendBtn.disabled = false;
        }
        return;
      }
      if (e.key === "Escape") { closeAutocomplete(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  sendBtn.addEventListener("click", send);
}
