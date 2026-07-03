// Command autocomplete

import { inputEl, autocompleteEl, sendBtn, state } from "./dom.js";

export const COMMANDS = [
  { cmd: "/new", desc: "Start a new campaign" },
  { cmd: "/help", desc: "Show available commands" },
  { cmd: "/sheet", desc: "View character sheet" },
  { cmd: "/inventory", desc: "View inventory" },
  { cmd: "/abilities", desc: "View abilities" },
  { cmd: "/world", desc: "View world state" },
  { cmd: "/roll", desc: "Roll dice (e.g. /roll 2d6+3)" },
  { cmd: "/model", desc: "Change narrator model" },
  { cmd: "/rest", desc: "Short or long rest" },
  { cmd: "/undo", desc: "Undo last turn" },
  { cmd: "/reset", desc: "Clear message history" },
  { cmd: "/saves", desc: "List/switch campaigns" },
  { cmd: "/concise", desc: "Concise narration mode" },
  { cmd: "/verbose", desc: "Verbose narration mode" },
  { cmd: "/traces", desc: "Toggle trace display" },
];

export function handleAutocomplete(): void {
  const val = inputEl.value;
  if (!val.startsWith("/") || val.includes(" ")) { closeAutocomplete(); return; }

  const query = val.toLowerCase();
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(query));
  if (matches.length === 0 || (matches.length === 1 && matches[0]?.cmd === val)) {
    closeAutocomplete(); return;
  }

  state.acIndex = 0;
  autocompleteEl.innerHTML = matches
    .map(
      (m, i) =>
        `<div class="item${i === 0 ? " selected" : ""}" data-cmd="${m.cmd}">
      <span class="cmd">${m.cmd}</span>
      <span class="desc">${m.desc}</span>
    </div>`
    )
    .join("");

  autocompleteEl.querySelectorAll<HTMLDivElement>(".item").forEach((item) => {
    item.addEventListener("click", () => {
      inputEl.value = item.dataset.cmd + " ";
      closeAutocomplete();
      inputEl.focus();
      sendBtn.disabled = false;
    });
  });
  autocompleteEl.classList.add("open");
}

export function closeAutocomplete(): void {
  autocompleteEl.classList.remove("open");
  state.acIndex = -1;
}

export function updateAcSelection(items: NodeListOf<HTMLDivElement>): void {
  items.forEach((el, i) => el.classList.toggle("selected", i === state.acIndex));
}
