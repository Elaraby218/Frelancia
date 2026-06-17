// ==========================================
// shared/markdown.js — Lightweight Markdown renderer
// Shared between popup and any future chat surfaces
// ==========================================

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdown(text) {
  const safe = escapeHtml(text || '');
  const lines = safe.split('\n');
  const parts = [];
  let inList = false;
  let inOrderedList = false;
  let inCodeBlock = false;
  let codeLines = [];
  let tableRows = [];

  const closeList = () => {
    if (inList) { parts.push('</ul>'); inList = false; }
    if (inOrderedList) { parts.push('</ol>'); inOrderedList = false; }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      parts.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      inCodeBlock = false;
      codeLines = [];
    }
  };

  const isTableSeparator = (line) =>
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);

  const flushTable = () => {
    if (tableRows.length < 2 || !isTableSeparator(tableRows[1])) {
      for (const row of tableRows) {
        parts.push(`<p>${renderInlineMarkdown(row)}</p>`);
      }
      tableRows = [];
      return;
    }

    const splitRow = (row) =>
      row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => renderInlineMarkdown(cell.trim()));

    const headers = splitRow(tableRows[0]);
    const bodyRows = tableRows.slice(2).map(splitRow);

    parts.push('<div class="table-wrap"><table><thead><tr>' + headers.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>');
    for (const row of bodyRows) {
      parts.push('<tr>' + row.map((c) => `<td>${c}</td>`).join('') + '</tr>');
    }
    parts.push('</tbody></table></div>');
    tableRows = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      closeList();
      flushTable();
      if (inCodeBlock) { flushCodeBlock(); } else { inCodeBlock = true; codeLines = []; }
      continue;
    }

    if (inCodeBlock) { codeLines.push(line); continue; }
    if (!trimmed) { closeList(); flushTable(); continue; }

    if (/^\|.+\|$/.test(trimmed)) { closeList(); tableRows.push(trimmed); continue; }
    flushTable();

    if (/^###\s+/.test(trimmed)) { closeList(); parts.push(`<h3>${renderInlineMarkdown(trimmed.replace(/^###\s+/, ''))}</h3>`); continue; }
    if (/^##\s+/.test(trimmed))  { closeList(); parts.push(`<h2>${renderInlineMarkdown(trimmed.replace(/^##\s+/, ''))}</h2>`); continue; }
    if (/^#\s+/.test(trimmed))   { closeList(); parts.push(`<h1>${renderInlineMarkdown(trimmed.replace(/^#\s+/, ''))}</h1>`); continue; }

    if (/^-\s+/.test(trimmed)) {
      if (!inList) { if (inOrderedList) { parts.push('</ol>'); inOrderedList = false; } parts.push('<ul>'); inList = true; }
      parts.push(`<li>${renderInlineMarkdown(trimmed.replace(/^-\s+/, ''))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inOrderedList) { if (inList) { parts.push('</ul>'); inList = false; } parts.push('<ol>'); inOrderedList = true; }
      parts.push(`<li>${renderInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) { closeList(); parts.push(`<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s+/, ''))}</blockquote>`); continue; }
    if (/^---+$/.test(trimmed)) { closeList(); parts.push('<hr>'); continue; }

    closeList();
    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  flushTable();
  flushCodeBlock();
  return parts.join('');
}
