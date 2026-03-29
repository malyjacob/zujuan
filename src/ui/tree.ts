import { KnowledgeNodeRow } from '../lib/knowledge-tree-sqlite';

/** 树中单个节点的展示状态 */
export interface DisplayNode {
  id: string;
  name: string;
  parentId: string | null;
  /** 在展示列表中的下标（从展开的根节点算起） */
  index: number;
  /** 在树中的深度（0=根） */
  depth: number;
  /** 是否已展开 */
  expanded: boolean;
  /** 是否有子节点 */
  hasChildren: boolean;
}

/**
 * 树状态管理器：
 * - 从 DB 加载所有节点，建立 parent→children 映射
 * - 维护展开/折叠状态
 * - 按需扁平化为展示列表
 */
export class TreeState {
  private allNodes: Map<string, KnowledgeNodeRow> = new Map();
  private childrenMap: Map<string | null, string[]> = new Map(); // parentId → [childId]
  private expandedIds: Set<string> = new Set();
  private grade: 'high' | 'middle';

  /** 已加载且已扁平化的展示节点列表 */
  displayList: DisplayNode[] = [];

  constructor(rows: KnowledgeNodeRow[], grade: 'high' | 'middle') {
    this.grade = grade;
    for (const row of rows) {
      this.allNodes.set(row.id, row);
      const siblings = this.childrenMap.get(row.parent_id) ?? [];
      siblings.push(row.id);
      this.childrenMap.set(row.parent_id, siblings);
    }

    // 初始：展开所有根节点
    const roots = this.childrenMap.get(null) ?? [];
    for (const id of roots) {
      this.expandedIds.add(id);
    }

    this.rebuild();
  }

  /** 获取节点信息 */
  getNode(id: string): KnowledgeNodeRow | undefined {
    return this.allNodes.get(id);
  }

  /** 获取所有根节点 ID */
  getRoots(): string[] {
    return this.childrenMap.get(null) ?? [];
  }

  /** 获取某节点的子节点 ID（按 pos 顺序） */
  getChildren(parentId: string): string[] {
    return this.childrenMap.get(parentId) ?? [];
  }

  /** 节点是否有子节点 */
  hasChildren(id: string): boolean {
    return this.childrenMap.has(id) && (this.childrenMap.get(id)?.length ?? 0) > 0;
  }

  /** 切换节点的展开/折叠状态 */
  toggle(id: string): void {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
      this.collapseDescendants(id);
    } else {
      this.expandedIds.add(id);
    }
    this.rebuild();
  }

  /** 展开节点 */
  expand(id: string): void {
    if (!this.expandedIds.has(id)) {
      this.expandedIds.add(id);
      this.rebuild();
    }
  }

  /** 折叠节点及其所有子孙 */
  collapseDescendants(id: string): void {
    const toCollapse = [id];
    while (toCollapse.length > 0) {
      const current = toCollapse.pop()!;
      for (const childId of this.getChildren(current)) {
        if (this.expandedIds.has(childId)) {
          this.expandedIds.delete(childId);
          toCollapse.push(childId);
        }
      }
    }
  }

  /** 展开所有节点 */
  expandAll(): void {
    for (const [id] of this.allNodes) {
      this.expandedIds.add(id);
    }
    this.rebuild();
  }

  /** 折叠所有节点（只剩根展开） */
  collapseAll(): void {
    for (const id of this.expandedIds) {
      if (this.allNodes.get(id)?.parent_id !== null) {
        this.expandedIds.delete(id);
      }
    }
    this.rebuild();
  }

  /** 搜索节点，返回匹配节点 ID 列表（仅限名称匹配） */
  search(term: string): string[] {
    const lower = term.toLowerCase();
    const results: string[] = [];
    for (const [id, node] of this.allNodes) {
      if (node.name.toLowerCase().includes(lower)) {
        results.push(id);
      }
    }
    return results;
  }

  /** 高亮搜索匹配节点：展开其所有祖先路径 */
  revealPath(nodeId: string): void {
    const ancestors: string[] = [];
    let current = nodeId;
    while (current) {
      ancestors.push(current);
      const node = this.allNodes.get(current);
      if (!node || !node.parent_id) break;
      current = node.parent_id;
    }
    // 从根往子展开
    for (let i = ancestors.length - 1; i >= 0; i--) {
      this.expand(ancestors[i]);
    }
    this.rebuild();
  }

  /** 获取当前展示列表中的索引位置 */
  getPosition(id: string): number {
    return this.displayList.findIndex(n => n.id === id);
  }

  /** 重建扁平化展示列表 */
  private rebuild(): void {
    this.displayList = [];
    const roots = this.childrenMap.get(null) ?? [];

    // 按 pos（行号）顺序遍历根节点
    for (const rootId of roots) {
      this.appendNode(rootId, 0);
    }
  }

  private appendNode(id: string, depth: number): void {
    const row = this.allNodes.get(id);
    if (!row) return;

    const node: DisplayNode = {
      id,
      name: row.name,
      parentId: row.parent_id,
      index: this.displayList.length,
      depth,
      expanded: this.expandedIds.has(id),
      hasChildren: this.hasChildren(id),
    };
    this.displayList.push(node);

    if (this.expandedIds.has(id)) {
      const children = this.childrenMap.get(id) ?? [];
      for (const childId of children) {
        this.appendNode(childId, depth + 1);
      }
    }
  }

  /** 获取当前选中节点 */
  getCurrent(index: number): DisplayNode | undefined {
    return this.displayList[index];
  }

  /** 当前可见节点总数 */
  get length(): number {
    return this.displayList.length;
  }

  /** 节点总数 */
  get totalCount(): number {
    return this.allNodes.size;
  }
}
