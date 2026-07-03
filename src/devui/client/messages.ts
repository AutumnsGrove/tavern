// Chat message rendering and history

import { messagesEl, typingEl } from "./dom.js";
import { renderMd } from "./markdown.js";

export function loadChatHistory(messages: Array<{ role: string; content: string }>): void {
  // Clear existing messages except the system welcome
  const children = Array.from(messagesEl.children);
  children.forEach((child) => {
    if (!(child as HTMLElement).classList.contains("system")) child.remove();
  });
  // Also remove any leftover keyboards
  messagesEl.querySelectorAll(".keyboard").forEach((kb) => kb.remove());

  if (messages.length === 0) return;

  // Remove the system welcome message since we have history
  const welcome = messagesEl.querySelector(".msg.system");
  if (welcome) welcome.remove();

  for (const msg of messages) {
    const el = document.createElement("div");
    el.className = msg.role === "user" ? "msg player" : "msg dm";
    if (msg.role === "user") {
      el.textContent = msg.content;
    } else {
      el.innerHTML = renderMd(msg.content);
    }
    messagesEl.appendChild(el);
  }
  scrollToBottom();
}

export function addDmMessage(text: string): void {
  typingEl.classList.remove("active");
  const el = document.createElement("div");
  el.className = "msg dm";
  el.innerHTML = renderMd(text);
  messagesEl.appendChild(el);
  scrollToBottom();
}

export function addPlayerMessage(text: string): void {
  const el = document.createElement("div");
  el.className = "msg player";
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

export function addErrorMessage(text: string): void {
  typingEl.classList.remove("active");
  const el = document.createElement("div");
  el.className = "msg error";
  el.innerHTML = renderMd(text);
  messagesEl.appendChild(el);
  scrollToBottom();
}

export function scrollToBottom(): void {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
