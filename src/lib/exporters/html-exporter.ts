import * as fs from 'fs';
import * as path from 'path';
import { ScrapeResult, ScrapeMeta, ExportTheme } from '../../types';

const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';

export class HtmlExporter {
  /** 生成单题 HTML 文件，保存到同目录。 */
  export(batchDir: string, result: ScrapeResult, defaultTheme: ExportTheme = 'light', prevIndex?: string, nextIndex?: string): string {
    const dir = path.join(batchDir, result.index);
    const htmlPath = path.join(dir, 'index.html');
    const html = this.buildHtml(result, defaultTheme, prevIndex, nextIndex);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    return htmlPath;
  }

  /** 生成总览导航页 index.html */
  exportOverview(batchDir: string, results: ScrapeResult[], meta: ScrapeMeta, defaultTheme: ExportTheme = 'light'): string {
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
    const css = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 15px; line-height: 1.7; background: #f7f7f8; color: #1a1a1a; min-height: 100vh; }
.container { max-width: 900px; margin: 0 auto; padding: 32px 16px 80px; }
.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.header h1 { font-size: 22px; font-weight: 700; color: #7c3aed; }
.header a { font-size: 13px; color: #888; text-decoration: none; }
.header a:hover { color: #7c3aed; }
.card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; }
.card-header { padding: 16px 20px; border-bottom: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: space-between; }
.card-header h2 { font-size: 15px; font-weight: 600; color: #1a1a1a; }
.card-header .time { font-size: 12px; color: #888; }
.entry-list { list-style: none; }
.entry-item { border-bottom: 1px solid #f0f0f0; }
.entry-item:last-child { border-bottom: none; }
.entry-item a { display: flex; align-items: center; gap: 14px; padding: 16px 20px; text-decoration: none; color: #1a1a1a; transition: background .15s; }
.entry-item a:hover { background: #f9f7ff; }
.entry-item a:hover .arrow { color: #7c3aed; }
.info { flex: 1; }
.grade { font-size: 12px; color: #888; margin-bottom: 2px; }
.title { font-size: 15px; font-weight: 600; color: #1a1a1a; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.tag { background: #f3f0ff; border: 1px solid #ddd6fe; color: #5b21b6; font-size: 12px; padding: 2px 10px; border-radius: 20px; }
.arrow { color: #ccc; font-size: 18px; transition: color .15s; }
.empty { text-align: center; padding: 60px 20px; color: #888; }
.empty p { margin-bottom: 12px; font-size: 15px; }
.empty code { background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 24px; }
.pagination a, .pagination span { display: inline-block; padding: 6px 14px; border-radius: 8px; font-size: 14px; text-decoration: none; }
.pagination a { background: #f3f0ff; border: 1px solid #ddd6fe; color: #5b21b6; }
.pagination a:hover { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.pagination .current { background: #7c3aed; color: #fff; border: 1px solid #7c3aed; }
.pagination .disabled { opacity: 0.4; pointer-events: none; }
.pagination .info-text { color: #888; font-size: 13px; }
`;

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

    const items = entries.map(e => {
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
    }).join('');

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
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private buildPagination(page: number, totalPages: number, totalEntries: number): string {
    const start = (page - 1) * 20 + 1;
    const end = Math.min(page * 20, totalEntries);
    const prev = page > 1 ? `<a href="/?page=${page - 1}">← 上一页</a>` : `<span class="disabled">← 上一页</span>`;
    const next = page < totalPages ? `<a href="/?page=${page + 1}">下一页 →</a>` : `<span class="disabled">下一页 →</span>`;
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

    const questionItems = results.map(r => {
      const difficulty = r.difficulty ? `难度: ${this.escHtml(r.difficulty)}` : '';
      const scoreRate = r.scoreRate !== undefined ? `得分率: ${r.scoreRate.toFixed(2)}` : '';
      const keywords = r.knowledgeKeywords.length > 0
        ? r.knowledgeKeywords.map((kw: string) => `<span class="tag">${this.escHtml(kw)}</span>`).join('')
        : '';
      return `<a href="${r.index}/index.html" class="question-item">
        <span class="q-index">${r.index}</span>
        <span class="q-meta">${difficulty}${scoreRate ? ' | ' + scoreRate : ''}</span>
        <span class="q-tags">${keywords}</span>
        <span class="q-arrow">→</span>
      </a>`;
    }).join('');

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

    const kwBlock = r.knowledgeKeywords.length > 0
      ? `<div class="knowledge-row">
           <span class="kw-label">知识点:</span>
           <span class="kw-tags">${r.knowledgeKeywords.map((kw: string) => `<span class="tag">${this.escHtml(kw)}</span>`).join('')}</span>
         </div>`
      : '';

    const imagesBlock = r.images.length > 0
      ? `<div class="images-section">
           ${r.images.map((img: string) => {
             return `<img src="${this.escHtml(path.basename(img))}" class="example-img" onclick="window.open(this.src,'_blank')" alt="示例图" loading="lazy"/>`;
           }).join('')}
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
    return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 15px; line-height: 1.7;
  padding: 24px 16px 80px;
  transition: background .2s, color .2s;
}
.container { max-width: 860px; margin: 0 auto; }

/* ─── 主题变量 ─── */
[data-theme="light"] {
  --bg: #ffffff;
  --card-bg: #f7f7f8;
  --card-border: #e5e5e5;
  --text: #1a1a1a;
  --text-muted: #666666;
  --accent: #7c3aed;
  --accent-light: #a78bfa;
  --tag-bg: #f3f0ff;
  --tag-border: #ddd6fe;
  --tag-text: #5b21b6;
  --btn-bg: #f3f0ff;
  --btn-border: #a78bfa;
  --img-section-bg: #fafafa;
  --img-border: #e5e5e5;
  --switcher-bg: #f7f7f8;
  --switcher-border: #e5e5e5;
}
[data-theme="dark"] {
  --bg: #0f0f0f;
  --card-bg: #1a1a1a;
  --card-border: #2d2d2d;
  --text: #e5e5e5;
  --text-muted: #a3a3a3;
  --accent: #a78bfa;
  --accent-light: #c4b5fd;
  --tag-bg: #252525;
  --tag-border: #3d3d3d;
  --tag-text: #d4d4d4;
  --btn-bg: #1e1e1e;
  --btn-border: #3d3d3d;
  --img-section-bg: #141414;
  --img-border: #2d2d2d;
  --switcher-bg: #141414;
  --switcher-border: #2d2d2d;
}
[data-theme="sepia"] {
  --bg: #f5f0e8;
  --card-bg: #faf5eb;
  --card-border: #d4c8a8;
  --text: #3d3528;
  --text-muted: #7a6b50;
  --accent: #8b6914;
  --accent-light: #b8860b;
  --tag-bg: #ede5d0;
  --tag-border: #c9b88a;
  --tag-text: #5c4a1e;
  --btn-bg: #ede5d0;
  --btn-border: #c9b88a;
  --img-section-bg: #f0ead9;
  --img-border: #d4c8a8;
  --switcher-bg: #ede5d0;
  --switcher-border: #c9b88a;
}

/* ─── 主题切换器 ─── */
.theme-switcher {
  position: fixed; top: 12px; right: 16px;
  display: flex; align-items: center; gap: 6px;
  background: var(--switcher-bg);
  border: 1px solid var(--switcher-border);
  border-radius: 8px; padding: 6px 10px;
  z-index: 100; transition: background .2s, border-color .2s;
}
.theme-label { font-size: 12px; color: var(--text-muted); }
.theme-btn {
  background: transparent; border: 1px solid transparent;
  color: var(--text-muted); font-size: 12px;
  padding: 3px 10px; border-radius: 6px; cursor: pointer;
  transition: background .15s, color .15s;
}
.theme-btn:hover { background: var(--card-border); color: var(--text); }
.theme-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* ─── 卡片 ─── */
.card {
  background: var(--card-bg); border: 1px solid var(--card-border);
  border-radius: 10px; overflow: hidden; margin-bottom: 20px;
  transition: background .2s, border-color .2s;
}
.card-header {
  background: var(--card-bg); border-bottom: 1px solid var(--card-border);
  padding: 14px 20px;
}
.question-title { font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: .5px; }
.card-body { padding: 20px; }
.source { color: var(--text-muted); font-size: 13px; margin-bottom: 14px; }
.question-text { font-size: 16px; line-height: 2; color: var(--text); margin-bottom: 16px; }
.question-text p { margin-bottom: 8px; }
.question-text strong { color: var(--accent); }

/* ─── 标签 ─── */
.meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.knowledge-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.kw-label { color: var(--text-muted); font-size: 13px; }
.kw-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  background: var(--tag-bg); border: 1px solid var(--tag-border);
  color: var(--tag-text); font-size: 12px;
  padding: 2px 10px; border-radius: 20px;
  transition: background .2s, border-color .2s, color .2s;
}

/* ─── 示例图 ─── */
.images-section {
  display: flex; flex-wrap: wrap; gap: 10px;
  margin: 14px 0; padding: 12px;
  background: var(--img-section-bg); border-radius: 6px;
  transition: background .2s;
}
.example-img {
  max-width: 100%; max-height: 280px;
  border-radius: 6px; cursor: zoom-in;
  border: 1px solid var(--img-border);
  transition: border-color .2s;
}

/* ─── 折叠块 ─── */
.foldable-block { margin-top: 16px; }
.fold-btn {
  width: 100%; background: var(--btn-bg); border: 1px solid var(--btn-border);
  color: var(--accent); font-size: 14px; font-weight: 600;
  padding: 10px 16px; border-radius: 8px;
  cursor: pointer; text-align: left; transition: background .2s, border-color .2s, color .2s;
}
.fold-btn:hover { opacity: 0.85; }
.fold-content { padding: 14px 4px 4px; }
.answer-text { color: var(--text); font-size: 15px; line-height: 1.9; }
.answer-text p { margin-bottom: 8px; }
.answer-text strong { color: var(--accent); }
.screenshots-section { margin-top: 8px; }
.screenshot-label { color: var(--text-muted); font-size: 12px; margin-bottom: 4px; }
.screenshot-img {
  display: block; max-width: 100%; border-radius: 6px;
  cursor: zoom-in; border: 1px solid var(--img-border); margin-bottom: 10px;
  transition: border-color .2s;
}
.hidden { display: none; }
.muted { color: var(--text-muted); font-size: 13px; padding: 8px 4px; }
mjx-container { overflow-x: auto; overflow-y: hidden; }

/* ─── 上下题导航 ─── */
.question-nav {
  display: flex; justify-content: center; align-items: center; gap: 16px;
  margin-top: 24px; padding: 16px;
  background: var(--card-bg); border: 1px solid var(--card-border);
  border-radius: 10px;
  transition: background .2s, border-color .2s;
}
.nav-btn {
  padding: 8px 20px; border-radius: 8px; font-size: 14px;
  background: var(--btn-bg); border: 1px solid var(--btn-border);
  color: var(--accent); text-decoration: none; font-weight: 500;
  transition: background .15s, border-color .15s, color .15s;
}
.nav-btn:hover { opacity: 0.8; background: var(--accent); border-color: var(--accent); color: #fff; }
.nav-btn.disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
.nav-btn.home { background: var(--accent); border-color: var(--accent); color: #fff; }
.nav-btn.home:hover { opacity: 0.85; }

/* ─── 总览页 ─── */
.back-link { margin-bottom: 16px; }
.back-link a { font-size: 14px; color: var(--accent); text-decoration: none; }
.back-link a:hover { text-decoration: underline; }
.overview-title { font-size: 18px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
.meta-info { color: var(--text-muted); font-size: 13px; }
.question-list { display: flex; flex-direction: column; gap: 8px; }
.question-item {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: var(--card-bg);
  border: 1px solid var(--card-border); border-radius: 8px;
  text-decoration: none; color: var(--text);
  transition: background .15s, border-color .15s;
}
.question-item:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
.question-item:hover .q-arrow { color: #fff; }
.question-item:hover .tag { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); color: #fff; }
.q-index { font-weight: 700; color: var(--accent); font-size: 15px; min-width: 40px; }
.question-item:hover .q-index { color: #fff; }
.q-meta { color: var(--text-muted); font-size: 13px; flex: 1; }
.question-item:hover .q-meta { color: rgba(255,255,255,0.85); }
.q-tags { display: flex; flex-wrap: wrap; gap: 6px; flex: 2; }
.q-arrow { color: var(--text-muted); font-size: 16px; }
`;
  }

  private buildScreenshotsHtml(r: ScrapeResult): string {
    const parts: string[] = [];
    if (r.questionPath) {
      parts.push(`<p class="screenshot-label">题目截图</p><img src="${this.escHtml(path.basename(r.questionPath))}" class="screenshot-img" onclick="window.open(this.src,'_blank')" alt="题目截图" loading="lazy"/>`);
    }
    if (r.answerPath) {
      parts.push(`<p class="screenshot-label">答案截图</p><img src="${this.escHtml(path.basename(r.answerPath))}" class="screenshot-img" onclick="window.open(this.src,'_blank')" alt="答案截图" loading="lazy"/>`);
    }
    return parts.length > 0 ? parts.join('') : '<p class="muted">（无截图）</p>';
  }

  private markdownToHtml(md: string): string {
    return md
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => `<p class="math-display">$$${tex}$$</p>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .split(/\n\n+/)
      .map(block => {
        block = block.trim();
        if (!block) return '';
        if (block.startsWith('<p') || block.startsWith('<h')) return block;
        return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  }

  private escHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export const htmlExporter = new HtmlExporter();
