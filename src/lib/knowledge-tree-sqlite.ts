import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { configManager, getConfigDir } from './config';

/** 获取数据库文件路径（从配置读取） */
function getDbPath(): string {
  const configured = configManager.get('treeDb');
  if (configured) return configured;
  // 默认：~/.zujuan-scraper/knowledge-tree.db
  return path.join(getConfigDir(), 'knowledge-tree.db');
}

/** 获取知识树文件所在目录（固定在配置目录 ~/.zujuan-scraper/） */
function getTreeDir(): string {
  return getConfigDir();
}

let db: Database.Database | null = null;
let lastDbPath: string | null = null;

export interface KnowledgeNodeRow {
  id: string;
  name: string;
  parent_id: string | null;
  grade: 'high' | 'middle';
  level: number;
  /** 在原文件中的行号位置，用于同层节点排序 */
  pos: number;
}

export interface NodeWithLevel {
  node: KnowledgeNodeRow;
  level: number;
}

function getDb(): Database.Database {
  const dbPath = getDbPath();

  // 如果路径变了，关闭旧连接
  if (db && lastDbPath !== dbPath) {
    db.close();
    db = null;
    lastDbPath = null;
  }

  if (!db) {
    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    lastDbPath = dbPath;
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        parent_id TEXT,
        grade     TEXT NOT NULL,
        level     INTEGER NOT NULL DEFAULT 0,
        pos       INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_parent ON knowledge_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_grade  ON knowledge_nodes(grade);
      CREATE INDEX IF NOT EXISTS idx_name   ON knowledge_nodes(name);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  return db;
}

/** 检查数据库的元数据，决定是否需要重建 */
function needsRebuild(): boolean {
  const database = getDb();
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get('tree_dir') as
    | { value: string }
    | undefined;
  const storedDir = row?.value || '';
  const currentDir = getTreeDir();
  return storedDir !== currentDir;
}

function parseNodeLine(line: string): { name: string; id: string } | null {
  const match = line.match(/^\s*•\s(.+?)\s+\((zsd\d+)\)$/);
  if (!match) return null;
  return { name: match[1], id: match[2] };
}

function getFilePath(grade: 'high' | 'middle'): string {
  const gradeMap = { high: 'KNOWLEDGE_TREE_HIGH.txt', middle: 'KNOWLEDGE_TREE_MIDDLE.txt' };
  return path.join(getTreeDir(), gradeMap[grade]);
}

/** 从文本文件导入知识点到数据库（幂等：先删除同名表数据再插入） */
export function importTreeFromFile(grade: 'high' | 'middle'): number {
  const filePath = getFilePath(grade);
  if (!fs.existsSync(filePath)) {
    throw new Error(`知识树文件不存在: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const database = getDb();

  // 清除旧数据
  database.prepare('DELETE FROM knowledge_nodes WHERE grade = ?').run(grade);

  const insert = database.prepare(
    'INSERT INTO knowledge_nodes (id, name, parent_id, grade, level, pos) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAll = database.transaction((nodes: KnowledgeNodeRow[]) => {
    for (const n of nodes) insert.run(n.id, n.name, n.parent_id, n.grade, n.level, n.pos);
  });

  // 解析并构建带层级的节点列表
  const parsed: { name: string; id: string; level: number }[] = [];
  let lineIndex = 0;
  for (const line of lines) {
    const node = parseNodeLine(line);
    if (!node) continue;
    const level = Math.floor((line.search(/\S/) || 0) / 2);
    parsed.push({ ...node, level });
    lineIndex++;
  }

  // 建立父子关系，同时记录行号位置（用于同层排序）
  const rows: KnowledgeNodeRow[] = [];
  const stack: { id: string; level: number }[] = [];

  for (let idx = 0; idx < parsed.length; idx++) {
    const p = parsed[idx];
    while (stack.length > 0 && stack[stack.length - 1].level >= p.level) {
      stack.pop();
    }
    const parent_id = stack.length > 0 ? stack[stack.length - 1].id : null;
    rows.push({ id: p.id, name: p.name, parent_id, grade, level: p.level, pos: idx });
    stack.push({ id: p.id, level: p.level });
  }

  insertAll(rows);

  // 写入元数据：记录本次导入使用的树文件目录
  database
    .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('tree_dir', getTreeDir());

  return rows.length;
}

/** 初始化数据库：文件不存在则自动创建，已存在则检查目录是否变更 */
export function ensureDatabase(): void {
  if (db && !needsRebuild()) return; // DB 已存在且目录未变，直接复用
  getDb();
  if (needsRebuild()) {
    importTreeFromFile('high');
    importTreeFromFile('middle');
  }
}

/** 关闭数据库连接（下次 ensureDatabase 会按新配置重新打开） */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    lastDbPath = null;
  }
}

/** 查询单个节点 */
export function getNodeById(id: string, grade: 'high' | 'middle'): KnowledgeNodeRow | null {
  const row = getDb()
    .prepare('SELECT * FROM knowledge_nodes WHERE id = ? AND grade = ?')
    .get(id, grade) as KnowledgeNodeRow | undefined;
  return row || null;
}

/** 查询节点的子孙节点（带层级信息） */
export function getDescendants(
  nodeId: string,
  maxDepth: number,
  searchTerm?: string,
  grade: 'high' | 'middle' = 'high'
): NodeWithLevel[] {
  const database = getDb();
  const results: NodeWithLevel[] = [];

  // 首先查询根节点自身（level=0）
  const rootNode = database
    .prepare('SELECT * FROM knowledge_nodes WHERE id = ? AND grade = ?')
    .get(nodeId, grade) as KnowledgeNodeRow | undefined;

  if (rootNode) {
    results.push({ node: rootNode, level: 0 });
  }

  if (maxDepth === 0) return results;

  // 用 parent_id 链式查询：每一层收集子节点的 id，作为下一层的 parent 条件
  let parentIds: string[] = [nodeId];

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (parentIds.length === 0) break;

    const placeholders = parentIds.map(() => '?').join(',');
    const rows = database
      .prepare(`SELECT * FROM knowledge_nodes WHERE parent_id IN (${placeholders}) AND grade = ? ORDER BY pos`)
      .all(...parentIds, grade) as KnowledgeNodeRow[];

    if (rows.length === 0) break;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      for (const row of rows) {
        if (row.name.toLowerCase().includes(lower)) {
          results.push({ node: row, level: depth });
        }
      }
    } else {
      for (const row of rows) {
        results.push({ node: row, level: depth });
      }
    }

    // 下一层的 parent 为当前层所有子节点
    parentIds = rows.map((r) => r.id);
  }

  return results;
}

/**
 * 虚拟根查询：收集所有匹配 searchTerm 的节点及其祖先路径，
 * 只保留从根到该节点的深度 ≤ maxDepth 的节点。
 * 祖先节点（如根节点不匹配搜索词但其子孙匹配）也会被加入以显示路径。
 */
export function getDescendantsFromRoots(
  maxDepth: number,
  searchTerm?: string,
  grade: 'high' | 'middle' = 'high'
): NodeWithLevel[] {
  const database = getDb();

  // 无搜索词：直接返回指定深度内的节点（level 0=根 → display=1）
  if (!searchTerm) {
    if (maxDepth === -1) {
      const all = database
        .prepare('SELECT * FROM knowledge_nodes WHERE grade = ? ORDER BY level, pos')
        .all(grade) as KnowledgeNodeRow[];
      return all.map((node) => ({ node, level: node.level + 1 }));
    }

    if (maxDepth === 0) return [];

    const roots = database
      .prepare('SELECT * FROM knowledge_nodes WHERE parent_id IS NULL AND grade = ? ORDER BY pos')
      .all(grade) as KnowledgeNodeRow[];

    const results: NodeWithLevel[] = [];
    for (const root of roots) {
      results.push({ node: root, level: 1 });
    }
    if (maxDepth === 1) return results;

    let parentIds = roots.map((r) => r.id);
    for (let depth = 2; depth <= maxDepth; depth++) {
      if (parentIds.length === 0) break;
      const placeholders = parentIds.map(() => '?').join(',');
      const rows = database
        .prepare(`SELECT * FROM knowledge_nodes WHERE parent_id IN (${placeholders}) AND grade = ? ORDER BY pos`)
        .all(...parentIds, grade) as KnowledgeNodeRow[];
      if (rows.length === 0) break;
      for (const row of rows) results.push({ node: row, level: depth });
      parentIds = rows.map((r) => r.id);
    }
    return results;
  }

  // 有搜索词：递归 CTE 收集每个匹配节点到根的完整链，
  // display_level = 路径中从根往下数的层级（根=1）
  const lower = searchTerm.toLowerCase();
  const maxDepthCond = maxDepth === -1 ? '' : `AND display_level <= ${maxDepth}`;
  const rows = database
    .prepare(`
      WITH RECURSIVE chain(id, name, parent_id, grade, level, display_level) AS (
        SELECT id, name, parent_id, grade, level, 1 AS display_level
        FROM knowledge_nodes
        WHERE grade = ? AND parent_id IS NULL
        UNION ALL
        SELECT k.id, k.name, k.parent_id, k.grade, k.level, c.display_level + 1
        FROM knowledge_nodes k
        JOIN chain c ON k.parent_id = c.id
        WHERE k.grade = ?
      )
      SELECT id, name, parent_id, grade, level, display_level
      FROM chain
      WHERE name LIKE ? ${maxDepthCond}
      ORDER BY display_level, pos
    `)
    .all(grade, grade, `%${lower}%`) as (KnowledgeNodeRow & { display_level: number })[];

  if (rows.length === 0) return [];

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .map((row) => ({ node: row as KnowledgeNodeRow, level: row.display_level }));
}

/** 获取节点的父节点链（用于显示路径） */
export function getNodePath(
  nodeId: string,
  grade: 'high' | 'middle' = 'high'
): KnowledgeNodeRow[] {
  const path: KnowledgeNodeRow[] = [];
  let current = getNodeById(nodeId, grade);
  while (current) {
    path.unshift(current);
    if (!current.parent_id) break;
    current = getNodeById(current.parent_id, grade);
  }
  return path;
}

/** 全局搜索：模糊匹配名称 */
export function searchNodes(
  searchTerm: string,
  grade: 'high' | 'middle' = 'high'
): KnowledgeNodeRow[] {
  const lower = searchTerm.toLowerCase();
  return getDb()
    .prepare('SELECT * FROM knowledge_nodes WHERE name LIKE ? AND grade = ?')
    .all(`%${lower}%`, grade) as KnowledgeNodeRow[];
}

/** 打印带层级的节点列表（平铺，按层级分组） */
export function printNodesWithLevels(nodesWithLevels: NodeWithLevel[]): void {
  for (const { node, level } of nodesWithLevels) {
    console.log(`${'  '.repeat(level - 1)}• ${node.name} (${node.id})`);
  }
}

/**
 * 按树结构递归打印（仅限无搜索词场景）。
 * 将平铺的 BFS 结果重建为树，保持父→子→孙 的层级缩进和原始同层顺序。
 * @param nodesWithLevels 由 getDescendantsFromRoots / getDescendants 返回的扁平结果
 * @param maxDisplayLevel 最大打印深度（-1=不限）
 * @param rootId 可选：从指定节点开始打印（用于 --id 场景，忽略其他根节点）
 */
export function printTree(
  nodesWithLevels: NodeWithLevel[],
  maxDisplayLevel: number = -1,
  rootId?: string
): void {
  // 第一遍：建立 parent_id → children[] 的映射（children 按 pos 排序）
  const childrenMap = new Map<string | null, KnowledgeNodeRow[]>();

  for (const { node } of nodesWithLevels) {
    const siblings = childrenMap.get(node.parent_id) ?? [];
    siblings.push(node);
    childrenMap.set(node.parent_id, siblings);
  }

  // 按 pos 排序（同层原始顺序）
  for (const [, siblings] of childrenMap) {
    siblings.sort((a, b) => a.pos - b.pos);
  }

  function printChildren(parentId: string | null, depth: number): void {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      if (maxDisplayLevel !== -1 && depth > maxDisplayLevel) break;
      console.log(`${'  '.repeat(depth - 1)}• ${child.name} (${child.id})`);
      printChildren(child.id, depth + 1);
    }
  }

  if (rootId) {
    // --id 场景：只打印以 rootId 为根的子树（depth=1 缩进）
    printChildren(rootId, 1);
  } else {
    // --tree / --depth 场景：打印所有根节点及其子树
    const roots = childrenMap.get(null) ?? [];
    for (const root of roots) {
      console.log(`• ${root.name} (${root.id})`);
      printChildren(root.id, 2);
    }
  }
}
