import * as fs from 'fs';
import * as path from 'path';
import { ScrapeResult, ScrapeMeta, ExportTheme } from '../../types';
import { escHtml, markdownToHtml, convertPipeTables, buildTableHtml } from './markdown-to-html';
import { MATHJAX_CDN, buildQuestionCss, buildServeListCss } from './html-css';

export class HtmlExporter {
  /** 生成单题 HTML 文件，保存到同目录。 */
  export(
    batchDir: string,
    result: ScrapeResult,
    defaultTheme: ExportTheme = 'light',
    prevIndex?: string,
    nextIndex?: string
  ): string {
    const dir = path.join(batchDir, result.index);
    const htmlPath = path.join(dir, 'index.html');
    const html = this.buildHtml(result, defaultTheme, prevIndex, nextIndex);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    return htmlPath;
  }

  /** 生成总览导航页 index.html */
  exportOverview(
    batchDir: string,
    results: ScrapeResult[],
    meta: ScrapeMeta,
    defaultTheme: ExportTheme = 'light'
  ): string {
    const htmlPath = path.join(batchDir, 'index.html');
    const html = this.buildOverviewHtml(results, meta, defaultTheme);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    return htmlPath;
  }

  /**
   * 生成服务列表页 HTML 字符串（不分页的内存渲染版，供 serve 命令调用）。
   * @param entries 经过分页筛选的条目
   * @param page 当前页码
   * @param totalPages 总页数
   * @param totalEntries 总条目数
   */
  buildServeListHtml(entries: ScrapeMeta[], page: number, totalPages: number, totalEntries: number): string {
    const css = buildServeListCss();
    if (entries.length === 0) {
      return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>组卷网题目总览</title><style>${css}</style>
</head>
<body><div class="container">
<div class="header"><h1>📚 组卷网题目总览</h1><a href="/">刷新</a></div>
<div class="empty"><p>暂无抓取记录</p><p>运行 <code>zujuan scrape -k &lt;知识点ID&gt;</code> 开始抓取</p></div>
</div></html>`;
    }

    const items = entries
      .map((e) => {
        const grade = e.grade === 'high' ? '高中' : '初中';
        const timeStr = e.timestamp ? this.formatTimestamp(e.timestamp) : '';

        return `<li class="entry-item">
  <a href="/${e.timestamp}/index.html">
    <div class="info">
      <div class="grade">${grade} · ${timeStr}</div>
      <div class="title">${this.escHtml(e.knowledgePoint)}</div>
      <div class="meta">
        ${e.type ? `<span class="tag">${this.escHtml(e.type)}</span>` : ''}
        ${e.difficulty ? `<span class="tag">${this.escHtml(e.difficulty)}</span>` : ''}
      </div>
    </div>
    <span class="arrow">→</span>
  </a>
</li>`;
      })
      .join('');

    const pageNav = totalPages > 1 ? this.buildPagination(page, totalPages, totalEntries) : '';

    return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>组卷网题目总览</title><style>${css}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📚 组卷网题目总览</h1>
    <a href="/">刷新</a>
  </div>
  <div class="card">
    <ul class="entry-list">
      ${items}
    </ul>
  </div>
  ${pageNav}
</div>
</body>
</html>`;
  }

  private formatTimestamp(ts: string): string {
    const d = new Date(parseInt(ts));
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  private buildPagination(page: number, totalPages: number, totalEntries: number): string {
    const start = (page - 1) * 20 + 1;
    const end = Math.min(page * 20, totalEntries);
    const prev = page > 1 ? `<a href="/?page=${page - 1}">← 上一页</a>` : `<span class="disabled">← 上一页</span>`;
    const next =
      page < totalPages ? `<a href="/?page=${page + 1}">下一页 →</a>` : `<span class="disabled">下一页 →</span>`;
    return `<div class="pagination">
  ${prev}
  <span class="info-text">第 ${start}-${end} 条，共 ${totalEntries} 条</span>
  ${next}
</div>`;
  }

  private buildOverviewHtml(results: ScrapeResult[], meta: ScrapeMeta, defaultTheme: ExportTheme): string {
    const css = this.buildCss();
    const metaParts: string[] = [];
    metaParts.push(`知识点: ${this.escHtml(meta.knowledgePoint)}`);
    metaParts.push(`年级: ${meta.grade === 'high' ? '高中' : '初中'}`);
    if (meta.type) metaParts.push(`题型: ${this.escHtml(meta.type)}`);
    if (meta.difficulty) metaParts.push(`难度: ${this.escHtml(meta.difficulty)}`);
    metaParts.push(`数量: ${results.length}`);

    const questionItems = results
      .map((r) => {
        const difficulty = r.difficulty ? `难度: ${this.escHtml(r.difficulty)}` : '';
        const scoreRate = r.scoreRate !== undefined ? `得分率: ${r.scoreRate.toFixed(2)}` : '';
        const keywords =
          r.knowledgeKeywords.length > 0
            ? r.knowledgeKeywords.map((kw: string) => `<span class="tag">${this.escHtml(kw)}</span>`).join('')
            : '';
        return `<a href="${r.index}/index.html" class="question-item">
        <span class="q-index">${r.index}</span>
        <span class="q-meta">${difficulty}${scoreRate ? ' | ' + scoreRate : ''}</span>
        <span class="q-tags">${keywords}</span>
        <span class="q-arrow">→</span>
      </a>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="zh" data-theme="${defaultTheme}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>题目总览</title>
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$']] },
      options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
    };
  </script>
  <script src="${MATHJAX_CDN}" async></script>
  <style>${css}</style>
</head>
<body>
<div class="theme-switcher">
  <span class="theme-label">主题:</span>
  <button class="theme-btn" data-target="light">白底</button>
  <button class="theme-btn" data-target="sepia">米黄</button>
  <button class="theme-btn" data-target="dark">深色</button>
</div>

<div class="container">
  <div class="back-link"><a href="/">← 返回目录</a></div>
  <div class="card">
    <div class="card-header">
      <h1 class="overview-title">题目总览</h1>
      <p class="meta-info">${metaParts.join(' | ')}</p>
    </div>
  </div>
  <div class="question-list">
    ${questionItems}
  </div>
</div>
<script>
(function() {
  var html = document.documentElement;
  var btns = document.querySelectorAll('.theme-btn');
  var saved = localStorage.getItem('zujuan-theme');
  if (saved) setTheme(saved, false);
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      setTheme(btn.getAttribute('data-target'), true);
    });
  });
  function setTheme(name, persist) {
    html.setAttribute('data-theme', name);
    btns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-target') === name); });
    if (persist) localStorage.setItem('zujuan-theme', name);
  }
})();
</script>
</body>
</html>`;
  }

  private buildHtml(r: ScrapeResult, defaultTheme: ExportTheme, prevIndex?: string, nextIndex?: string): string {
    const qText = r.questionText || '';
    const aText = r.answerText || '';

    const metaRows: string[] = [];
    if (r.questionType) metaRows.push(`<span class="tag">题型: ${this.escHtml(r.questionType)}</span>`);
    if (r.difficulty) metaRows.push(`<span class="tag">难度: ${this.escHtml(r.difficulty)}</span>`);
    if (r.scoreRate !== undefined) metaRows.push(`<span class="tag">得分率: ${r.scoreRate.toFixed(2)}</span>`);

    const kwBlock =
      r.knowledgeKeywords.length > 0
        ? `<div class="knowledge-row">
           <span class="kw-label">知识点:</span>
           <span class="kw-tags">${r.knowledgeKeywords.map((kw: string) => `<span class="tag">${this.escHtml(kw)}</span>`).join('')}</span>
         </div>`
        : '';

    const imagesBlock =
      r.images.length > 0
        ? `<div class="images-section">
           ${r.images
             .map((img: string) => {
               return `<img src="${this.escHtml(path.basename(img))}" class="example-img" onclick="window.open(this.src,'_blank')" alt="示例图" loading="lazy"/>`;
             })
             .join('')}
         </div>`
        : '';

    const answerBlock = aText
      ? `<div class="foldable-block">
           <button class="fold-btn" data-label="答案解析">答案解析 ▾</button>
           <div class="fold-content hidden">
             <div class="answer-text">${this.markdownToHtml(aText)}</div>
           </div>
         </div>`
      : `<div class="foldable-block">
           <button class="fold-btn" data-label="答案解析">答案解析 ▾</button>
           <div class="fold-content hidden"><p class="muted">（无答案解析）</p></div>
         </div>`;

    const screenshotsBlock = this.buildScreenshotsHtml(r);

    const hasPrev = !!prevIndex;
    const hasNext = !!nextIndex;
    const navHtml = `<nav class="question-nav">
  ${hasPrev ? `<a href="../${prevIndex}/index.html" class="nav-btn prev">← 上一题</a>` : '<span class="nav-btn disabled">← 上一题</span>'}
  <a href="../index.html" class="nav-btn home">目录</a>
  ${hasNext ? `<a href="../${nextIndex}/index.html" class="nav-btn next">下一题 →</a>` : '<span class="nav-btn disabled">下一题 →</span>'}
</nav>`;

    const css = this.buildCss();

    return `<!DOCTYPE html>
<html lang="zh" data-theme="${defaultTheme}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>第 ${r.index} 题</title>
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$']] },
      options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
    };
  </script>
  <script src="${MATHJAX_CDN}" async></script>
  <style>${css}</style>
</head>
<body>
<div class="theme-switcher">
  <span class="theme-label">主题:</span>
  <button class="theme-btn" data-target="light">白底</button>
  <button class="theme-btn" data-target="sepia">米黄</button>
  <button class="theme-btn" data-target="dark">深色</button>
</div>

<div class="container">
<div class="card">
  <div class="card-header">
    <div class="question-title">第 ${r.index} 题</div>
  </div>
  <div class="card-body">
    ${r.source ? `<div class="source">（${this.escHtml(r.source)}）</div>` : ''}
    <div class="question-text">
      ${qText ? this.markdownToHtml(qText) : '<p class="muted">（无题目文字，请查看下方截图）</p>'}
    </div>
    ${imagesBlock}
    ${kwBlock}
    ${metaRows.length > 0 ? `<div class="meta-row">${metaRows.join('')}</div>` : ''}
    ${answerBlock}
    <div class="foldable-block screenshots-section">
      <button class="fold-btn" data-label="截图参考">截图参考 ▾</button>
      <div class="fold-content hidden">
        ${screenshotsBlock}
      </div>
    </div>
  </div>
</div>
${navHtml}
</div>
<script>
(function() {
  var html = document.documentElement;
  var btns = document.querySelectorAll('.theme-btn');

  // 恢复保存的主题
  var saved = localStorage.getItem('zujuan-theme');
  if (saved) setTheme(saved, false);

  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      setTheme(btn.getAttribute('data-target'), true);
    });
  });

  function setTheme(name, persist) {
    html.setAttribute('data-theme', name);
    btns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-target') === name); });
    if (persist) localStorage.setItem('zujuan-theme', name);
  }
})();

document.querySelectorAll('.fold-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var content = btn.nextElementSibling;
    var isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden', !isHidden);
    var label = btn.getAttribute('data-label') || '';
    btn.textContent = (isHidden ? '▲ ' : '▼ ') + label;
  });
});
</script>
</body>
</html>`;
  }

  private buildCss(): string {
    return buildQuestionCss();
  }

  private buildScreenshotsHtml(r: ScrapeResult): string {
    const parts: string[] = [];
    if (r.questionPath) {
      parts.push(
        `<p class="screenshot-label">题目截图</p><img src="${this.escHtml(path.basename(r.questionPath))}" class="screenshot-img" onclick="window.open(this.src,'_blank')" alt="题目截图" loading="lazy"/>`
      );
    }
    if (r.answerPath) {
      parts.push(
        `<p class="screenshot-label">答案截图</p><img src="${this.escHtml(path.basename(r.answerPath))}" class="screenshot-img" onclick="window.open(this.src,'_blank')" alt="答案截图" loading="lazy"/>`
      );
    }
    return parts.length > 0 ? parts.join('') : '<p class="muted">（无截图）</p>';
  }

  private markdownToHtml(md: string): string {
    return markdownToHtml(md);
  }

  /** 将 Markdown pipe table（管道表格）转换为 HTML <table> */
  private _convertPipeTables(md: string): string {
    return convertPipeTables(md);
  }

  /** 将 pipe table 行数组转为 <table> HTML */
  private _buildTableHtml(rows: string[]): string {
    return buildTableHtml(rows);
  }

  private escHtml(str: string): string {
    return escHtml(str);
  }
}

export const htmlExporter = new HtmlExporter();
