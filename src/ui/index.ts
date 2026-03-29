import { ensureDatabase, getDb, getDescendants, getNodeById, getNodePath } from '../lib/knowledge-tree-sqlite';
import { configManager } from '../lib/config';
import { TreeState } from './tree';
import {
  createWidgets,
  renderTreeList,
  renderDetail,
  renderStatus,
} from './widgets';
import type { TreeWidgets } from './widgets';
import type { KnowledgeNodeRow } from '../lib/knowledge-tree-sqlite';

let widgets: TreeWidgets;
let treeState: TreeState;
let currentIndex = 0;
let searchTerm = '';
let searchActive = false;
let searchMatches: string[] = [];
let matchIndex = -1;
let grade: 'high' | 'middle' = 'high';

const GRADE_LABELS: Record<string, string> = { high: '高中', middle: '初中' };

/** 主入口：启动交互式知识点浏览器 */
export async function startInteractive(
  targetGrade: 'high' | 'middle' = 'high',
  initialId?: string
): Promise<void> {
  grade = targetGrade;

  // 初始化数据库
  ensureDatabase();

  // 加载所有知识点到内存
  const allRows = loadAllNodes(grade);
  if (allRows.length === 0) {
    console.error('未找到知识点数据，请先运行: zujuan list --refresh');
    return;
  }

  treeState = new TreeState(allRows, grade);
  currentIndex = 0;

  // 如果指定了初始节点，展开其路径并定位
  if (initialId) {
    const match = allRows.find(r => r.id === initialId);
    if (match) {
      treeState.revealPath(initialId);
      currentIndex = treeState.getPosition(initialId);
      if (currentIndex < 0) currentIndex = 0;
    }
  }

  // 创建 UI
  widgets = createWidgets();
  const { screen, treeList, detailBox, searchBar, statusBar } = widgets;

  // 首次渲染
  fullRender();

  // ── 注册键盘事件 ──────────────────────────────────────
  screen.key(['q', 'Q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key('enter', () => {
    const node = treeState.getCurrent(currentIndex);
    if (node && node.hasChildren) {
      treeState.toggle(node.id);
      currentIndex = treeState.getPosition(node.id);
      if (currentIndex < 0) currentIndex = 0;
      fullRender();
    }
  });

  // 方向键：上下移动
  screen.key(['up', 'k'], () => {
    if (currentIndex > 0) {
      currentIndex--;
      fullRender();
    }
  });

  screen.key(['down', 'j'], () => {
    if (currentIndex < treeState.length - 1) {
      currentIndex++;
      fullRender();
    }
  });

  // Home：跳到第一个节点
  screen.key('home', () => {
    currentIndex = 0;
    fullRender();
  });

  // End：跳到最后
  screen.key('end', () => {
    currentIndex = treeState.length - 1;
    fullRender();
  });

  // PageUp / PageDown：大步滚动
  screen.key('pageup', () => {
    currentIndex = Math.max(0, currentIndex - 20);
    fullRender();
  });

  screen.key('pagedown', () => {
    currentIndex = Math.min(treeState.length - 1, currentIndex + 20);
    fullRender();
  });

  // 右方向键：展开当前节点
  screen.key('right', () => {
    const node = treeState.getCurrent(currentIndex);
    if (node && node.hasChildren && !node.expanded) {
      treeState.toggle(node.id);
      currentIndex = treeState.getPosition(node.id);
      if (currentIndex < 0) currentIndex = 0;
      fullRender();
    }
  });

  // 左方向键：折叠当前节点（如果已展开则折叠，否则跳到父节点）
  screen.key('left', () => {
    const node = treeState.getCurrent(currentIndex);
    if (!node) return;
    if (node.expanded) {
      treeState.toggle(node.id);
      fullRender();
    } else if (node.parentId) {
      // 跳到父节点
      const parentIdx = treeState.getPosition(node.parentId);
      if (parentIdx >= 0) currentIndex = parentIdx;
      fullRender();
    }
  });

  // * 展开全部节点
  screen.key('*', () => {
    treeState.expandAll();
    currentIndex = 0;
    fullRender();
  });

  // - 折叠全部（只留根）
  screen.key('-', () => {
    treeState.collapseAll();
    currentIndex = 0;
    fullRender();
  });

  // / 进入搜索模式
  screen.key('/', () => {
    searchActive = true;
    searchTerm = '';
    searchMatches = [];
    matchIndex = -1;
    searchBar.show();
    searchBar.focus();
    searchBar.clearValue();
    screen.render();
  });

  // 搜索框回车：执行搜索
  searchBar.key('enter', () => {
    searchTerm = searchBar.getValue();
    if (searchTerm.trim()) {
      searchMatches = treeState.search(searchTerm);
      if (searchMatches.length > 0) {
        matchIndex = 0;
        treeState.revealPath(searchMatches[0]);
        currentIndex = treeState.getPosition(searchMatches[0]);
        if (currentIndex < 0) currentIndex = 0;
      }
    }
    exitSearch();
    fullRender();
  });

  // 搜索框 Escape：取消搜索
  searchBar.key('escape', () => {
    exitSearch();
    fullRender();
  });

  // n：在搜索结果间跳转下一个
  screen.key('n', () => {
    if (searchMatches.length === 0) return;
    matchIndex = (matchIndex + 1) % searchMatches.length;
    const id = searchMatches[matchIndex];
    treeState.revealPath(id);
    currentIndex = treeState.getPosition(id);
    if (currentIndex < 0) currentIndex = 0;
    fullRender();
  });

  // Shift+n：搜索结果跳上一个
  screen.key('S', () => {
    if (searchMatches.length === 0) return;
    matchIndex = (matchIndex - 1 + searchMatches.length) % searchMatches.length;
    const id = searchMatches[matchIndex];
    treeState.revealPath(id);
    currentIndex = treeState.getPosition(id);
    if (currentIndex < 0) currentIndex = 0;
    fullRender();
  });

  screen.key('C-c', () => {
    if (searchActive) {
      exitSearch();
      fullRender();
    }
  });

  screen.render();
}

/** 退出搜索模式 */
function exitSearch(): void {
  searchActive = false;
  widgets.searchBar.hide();
  widgets.searchBar.clearValue();
  widgets.screen.focusPop();
  widgets.screen.render();
}

/** 全量重渲染（每次状态变化调用） */
function fullRender(): void {
  const { treeList, detailBox, statusBar } = widgets;
  const current = treeState.getCurrent(currentIndex);

  // 获取当前节点的完整路径
  const path = getNodePathDisplay(current?.id, grade);

  // 渲染三个面板
  renderTreeList(treeList, treeState.displayList, currentIndex, searchActive ? searchTerm : undefined);
  renderDetail(detailBox, current ?? null, path, GRADE_LABELS[grade] as '高中' | '初中');
  renderStatus(
    statusBar,
    current ?? null,
    treeState.totalCount,
    treeState.length,
    GRADE_LABELS[grade] as '高中' | '初中',
    searchActive
  );

  // 滚动到当前选中项
  const rowHeight = 1;
  const visibleHeight = Math.floor(Number(treeList.height) || 20);
  const scrollTop = treeList.getScroll();
  if (currentIndex < scrollTop) {
    treeList.scroll(-(scrollTop - currentIndex));
  } else if (currentIndex >= scrollTop + visibleHeight - 1) {
    treeList.scroll(currentIndex - scrollTop - visibleHeight + 1);
  }

  widgets.screen.render();
}

/** 获取节点的父节点路径（用于详情面板） */
function getNodePathDisplay(
  nodeId: string | undefined,
  grade: 'high' | 'middle'
): string[] {
  if (!nodeId) return [];
  const node = getNodeById(nodeId, grade);
  if (!node) return [];
  return getNodePath(nodeId, grade).map(n => n.name);
}

/** 从数据库加载所有节点 */
function loadAllNodes(grade: 'high' | 'middle'): KnowledgeNodeRow[] {
  return getDb()
    .prepare('SELECT * FROM knowledge_nodes WHERE grade = ? ORDER BY level, pos')
    .all(grade) as KnowledgeNodeRow[];
}
