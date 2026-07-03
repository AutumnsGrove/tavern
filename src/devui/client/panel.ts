// Side panel toggle, tab switching, and data rendering

import { panelToggle, sidePanel, panelContent, panelTabs, state } from "./dom.js";
import { renderMd } from "./markdown.js";

export function initPanelHandlers(): void {
  panelToggle.addEventListener("click", () => {
    sidePanel.classList.toggle("collapsed");
    panelToggle.classList.toggle("active");
    if (!sidePanel.classList.contains("collapsed") && state.ws && state.ws.readyState === 1) {
      state.ws.send(JSON.stringify({ type: "panel_request" }));
    }
  });

  panelTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      panelTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.activePanel = tab.dataset.panel ?? "sheet";
      renderPanel();
    });
  });
}

export function updatePanelData(panels: Record<string, string>): void {
  state.panelData = panels || {};
  renderPanel();
}

export function renderPanel(): void {
  const content = state.panelData[state.activePanel];
  if (!content) {
    panelContent.innerHTML = '<div class="panel-empty">No data yet. Start a campaign with /new.</div>';
    return;
  }
  panelContent.innerHTML = renderMd(content);
}
