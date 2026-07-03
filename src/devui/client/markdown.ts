// Markdown renderer

export function renderMd(text: string): string {
  if (!text) return "";
  // Escape HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Split into lines for block-level processing
  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Blockquotes
    if (line.match(/^&gt;\s?/)) {
      const content = line.replace(/^&gt;\s?/, "");
      if (!inBlockquote) { out.push("<blockquote>"); inBlockquote = true; }
      out.push(inlineMarkdown(content));
      if (i + 1 >= lines.length || !lines[i + 1]?.match(/^&gt;\s?/)) {
        out.push("</blockquote>");
        inBlockquote = false;
      }
      continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { closeList(); out.push("<h3>" + inlineMarkdown(h3[1]!) + "</h3>"); continue; }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { closeList(); out.push("<h2>" + inlineMarkdown(h2[1]!) + "</h2>"); continue; }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { closeList(); out.push("<h1>" + inlineMarkdown(h1[1]!) + "</h1>"); continue; }

    // Horizontal rule
    if (line.match(/^---+$/)) { closeList(); out.push("<hr>"); continue; }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push("<li>" + inlineMarkdown(line.replace(/^[-*]\s+/, "")) + "</li>");
      continue;
    }

    // Ordered list
    const ol = line.match(/^(\d+)\.\s+(.+)/);
    if (ol) {
      if (!inList) { out.push("<ol>"); inList = true; }
      out.push("<li>" + inlineMarkdown(ol[2]!) + "</li>");
      continue;
    }

    // Close list if we hit a non-list line
    closeList();

    // Empty line = paragraph break
    if (line.trim() === "") {
      continue;
    }

    // Regular paragraph
    out.push("<p>" + inlineMarkdown(line) + "</p>");
  }
  closeList();

  function closeList() {
    if (inList) {
      // Detect if it was ordered or unordered by checking last open tag
      const lastOpen = out.findLast((l) => l === "<ul>" || l === "<ol>");
      out.push(lastOpen === "<ol>" ? "</ol>" : "</ul>");
      inList = false;
    }
  }

  return out.join("\n");
}

export function inlineMarkdown(text: string): string {
  return text
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
