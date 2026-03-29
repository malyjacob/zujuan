import * as blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { DisplayNode } from './tree';

export interface TreeWidgets {
  screen: Widgets.Screen;
  treeList: Widgets.BoxElement;
  detailBox: Widgets.BoxElement;
  searchBar: Widgets.TextboxElement;
  statusBar: Widgets.BoxElement;
}

/** 创建 TUI 所有组件 */
export function createWidgets(): TreeWidgets {
  const screen = blessed.screen({
    smartCSR: true,
    title: '组卷网知识点浏览器',
    fullUnicode: true,
  });

  // ── 顶部标题栏 ──────────────────────────────────────
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    content: ' 组卷网知识点浏览器 ',
    style: { fg: 'white', bg: 'blue', bold: true },
  });

  // ── 搜索栏（隐藏，直到按 /） ────────────────────────
  const searchBar = blessed.textbox({
    parent: screen,
    top: 1,
    left: 2,
    width: '50%',
    height: 1,
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'yellow' },
    },
    hidden: true,
    label: ' 搜索 ',
  });

  // ── 左侧：知识点树列表 ───────────────────────────────
  const treeList = blessed.box({
    parent: screen,
    top: 2,
    left: 0,
    width: '60%',
    bottom: 3,
    border: { type: 'line', fg: 'gray' } as any,
    label: ' 知识点树 ',
    style: { border: { fg: 'gray' } },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      track: { bg: 'black' },
      style: { inverse: true },
    },
    keys: true,
    vi: true,
    mouse: true,
  });

  // ── 右侧：详情面板 ─────────────────────────────────
  const detailBox = blessed.box({
    parent: screen,
    top: 2,
    left: '60%' as any,
    right: 0,
    bottom: 3,
    border: { type: 'line', fg: 'gray' } as any,
    label: ' 详情 ',
    style: { border: { fg: 'gray' } },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '│',
      track: { bg: 'black' },
      style: { inverse: true },
    },
  });

  // ── 底部状态栏 ─────────────────────────────────────
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    border: { type: 'line', fg: 'gray' } as any,
    style: { border: { fg: 'gray' } },
  });

  return { screen, treeList, detailBox, searchBar, statusBar };
}

/** 将 DisplayNode 渲染为带缩进和样式的行文本 */
function renderNodeLine(node: DisplayNode, searchTerm?: string): string {
  const indent = '  '.repeat(node.depth);
  const prefix = !node.hasChildren ? '└─ ' : node.expanded ? '▼ ' : '▶ ';
  const name = searchTerm ? highlightMatch(node.name, searchTerm) : node.name;
  return `${indent}${prefix}${name}`;
}

/** 高亮搜索匹配文字（返回带 blessed 标签的字符串） */
function highlightMatch(text: string, term: string): string {
  const lower = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lower.indexOf(lowerTerm);
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `{bold}{yellow-fg}${text.slice(idx, idx + term.length)}{/yellow-fg}{/bold}` +
    text.slice(idx + term.length)
  );
}

/** 将 DisplayNode[] 渲染到 treeList box 的内容中 */
export function renderTreeList(
  treeList: Widgets.BoxElement,
  nodes: DisplayNode[],
  currentIndex: number,
  searchTerm?: string
): void {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isSelected = i === currentIndex;
    const raw = renderNodeLine(node, searchTerm);

    if (isSelected) {
      lines.push(`{bold}{blue-fg}{bg:cyan}${raw}{/bg:cyan}{/blue-fg}{/bold}`);
    } else {
      const isMatch = searchTerm
        ? node.name.toLowerCase().includes(searchTerm.toLowerCase())
        : false;
      const fg = isMatch ? 'yellow' : node.hasChildren ? (node.depth === 0 ? 'cyan' : 'white') : 'dim';
      lines.push(`{${fg}-fg}${raw}{/}`);
    }
  }

  treeList.setContent(lines.length > 0 ? lines.join('\n') : '  (空)');
}

/** 渲染详情面板 */
export function renderDetail(
  detailBox: Widgets.BoxElement,
  node: DisplayNode | null,
  path: string[],
  gradeLabel: string
): void {
  if (!node) {
    detailBox.setContent(
      '\n\n  {dim-fg}←/→ 展开或折叠节点{/dim-fg}\n' +
      '  {dim-fg}按 {white-fg}/{/white-fg} 搜索{/dim-fg}\n' +
      '  {dim-fg}按 {white-fg}q{/white-fg} 退出{/dim-fg}'
    );
    return;
  }

  const status = !node.hasChildren ? '叶子节点' : node.expanded ? '已展开' : '已折叠';

  const parts: string[] = [];
  parts.push(`  {bold}名称{/bold}：${node.name}`);
  parts.push(`  {bold}ID{/bold}：{green-fg}${node.id}{/green-fg}`);
  parts.push(`  {bold}层级{/bold}：${node.depth}`);
  parts.push(`  {bold}状态{/bold}：${status}`);
  parts.push(`  {bold}年级{/bold}：${gradeLabel}`);
  if (path.length > 0) {
    parts.push(`  {bold}路径{/bold}：${path.join(' {dim-fg}›{/dim-fg} ')}`);
  }

  const content = [
    '',
    ...parts,
    '',
    '  {dim-fg}─────────────────────────────────{/dim-fg}',
    '  {dim-fg}按 {white-fg}Enter{/white-fg} 展开/折叠节点{/dim-fg}',
    '  {dim-fg}按 {white-fg}/{/white-fg} 搜索　{/dim-fg}',
    '  {dim-fg}按 {white-fg}q{/white-fg} 退出{/dim-fg}',
  ].join('\n');

  detailBox.setContent(content);
}

/** 渲染状态栏 */
export function renderStatus(
  statusBar: Widgets.BoxElement,
  current: DisplayNode | null,
  total: number,
  visible: number,
  gradeLabel: string,
  searchActive: boolean
): void {
  const lines: string[] = [];

  // 第一行：标题
  lines.push(
    `{blue-fg}{bold} 知识点浏览器{/bold}{/blue-fg}  ` +
    `{dim-fg}│  年级: ${gradeLabel}  │  总计: {green-fg}${total}{/green-fg} 个节点  │  显示: {yellow-fg}${visible}{/yellow-fg}{/dim-fg}`
  );

  // 第二行
  if (current) {
    lines.push(
      `  {bold}当前{/bold}：{cyan-fg}${current.name}{/cyan-fg}  ` +
      `{dim-fg}({white-fg}${current.id}{/white-fg}){/dim-fg} 　` +
      `  {dim-fg}│  {white-fg}↑↓{/white-fg} 移动  {white-fg}→{/white-fg} 展开  {white-fg}←{/white-fg} 折叠{/dim-fg}`
    );
  } else {
    lines.push(
      `  {dim-fg}│  {white-fg}↑↓{/white-fg} 移动  {white-fg}→{/white-fg} 展开  {white-fg}←{/white-fg} 折叠  {white-fg}*/-{/white-fg} 展开/折叠全部{/dim-fg}`
    );
  }

  // 第三行
  const searchHint = searchActive ? `{yellow-fg}搜索中{/yellow-fg}` : `{dim-fg}/{dim-fg} 搜索`;
  lines.push(
    `  {dim-fg}│  ${searchHint}  ` +
    `{white-fg}Esc{/white-fg} 取消搜索  ` +
    `{white-fg}Enter{/white-fg} 切换展开  ` +
    `{white-fg}n{/white-fg} 下一匹配{/dim-fg}`
  );

  statusBar.setContent(lines.join('\n'));
}
