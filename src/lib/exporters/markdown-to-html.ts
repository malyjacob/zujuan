/**
 * Markdown → HTML 片段转换（纯函数，无副作用）。
 * 从 html-exporter.ts 抽出：供 HTML 导出复用与单元测试直接调用。
 */
export function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function markdownToHtml(md: string): string {
  // 第一步：提取并转换 Markdown 表格（pipe table），防止被后续段落拆分破坏
  let result = convertPipeTables(md);

  // 第二步：标准 Markdown 内联语法
  result = result
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // 第三步：段落拆分（表格已被替换为 <table>，不会被拆分）
  result = result
    .split(/\n\n+/)
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<p') || block.startsWith('<h') || block.startsWith('<table')) return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return result;
}

export function convertPipeTables(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // 检测表格开始：当前行以 | 开头，且下一行是分隔行（|---|）
    if (line.trimStart().startsWith('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const sepMatch = nextLine.match(/^\|?[\s]*(:?-{3,}:?[\s]*\|?)+[\s]*$/);
      if (sepMatch) {
        // 收集整个表格所有行
        const tableRows: string[] = [line];
        i++;
        while (i < lines.length && lines[i].trimStart().startsWith('|')) {
          tableRows.push(lines[i]);
          i++;
        }
        result.push(buildTableHtml(tableRows));
        continue;
      }
    }
    result.push(line);
    i++;
  }

  return result.join('\n');
}

export function buildTableHtml(rows: string[]): string {
  // 第一行 = 表头，第二行 = 分隔符，后续行 = 数据
  const headerRow = rows[0];
  const dataRows = rows.slice(2); // 跳过表头和分隔行

  const cells = (row: string): string[] => {
    return row
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1); // 去掉首尾空
  };

  const headers = cells(headerRow);

  let html = '<table>\n';
  // 表头
  html += '  <thead>\n    <tr>';
  for (const h of headers) {
    html += `<th>${h}</th>`;
  }
  html += '</tr>\n  </thead>\n';
  // 表体
  if (dataRows.length > 0) {
    html += '  <tbody>\n';
    for (const row of dataRows) {
      const rowCells = cells(row);
      html += '    <tr>';
      for (const c of rowCells) {
        html += `<td>${c}</td>`;
      }
      html += '</tr>\n';
    }
    html += '  </tbody>\n';
  }
  html += '</table>';

  return html;
}
