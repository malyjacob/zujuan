/**
 * HTML 导出器的 CSS 模板与静态资源（从 html-exporter.ts 抽出，集中管理）。
 * 题目页/总览页主题通过 [data-theme] 的 CSS 变量切换，新增主题只需加一组变量。
 */

export const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';

/** 题目页 / 总览页 CSS（三主题由 CSS 变量切换） */
export function buildQuestionCss(): string {
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

/* ─── 表格 ─── */
table {
  width: 100%; border-collapse: collapse;
  margin: 12px 0; font-size: 14px;
  transition: border-color .2s;
}
th, td {
  border: 1px solid var(--card-border);
  padding: 8px 12px; text-align: center;
  transition: border-color .2s, background .2s, color .2s;
}
th {
  background: var(--tag-bg);
  color: var(--text); font-weight: 600;
}
td {
  background: var(--card-bg);
  color: var(--text);
}

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

/** serve 列表页 CSS（固定浅色主题） */
export function buildServeListCss(): string {
  return `
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
}
