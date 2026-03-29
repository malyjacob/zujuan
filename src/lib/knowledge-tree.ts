import * as fs from 'fs';
import * as path from 'path';
import { configManager, getConfigDir } from './config';

export interface KnowledgeNode {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  children: KnowledgeNode[];
}

// 解析知识点树文本文件
export function parseKnowledgeTree(filePath: string): KnowledgeNode[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const roots: KnowledgeNode[] = [];
  const stack: { node: KnowledgeNode; level: number }[] = [];

  for (const line of lines) {
    // 计算缩进层级
    const match = line.match(/^(\s*)•\s(.+?)\s+\((zsd\d+)\)$/);
    if (!match) continue;

    const indent = match[1];
    const level = Math.floor(indent.length / 2); // 每2个空格算一个层级
    const name = match[2];
    const id = match[3];

    const node: KnowledgeNode = {
      id,
      name,
      parentId: null,
      level,
      children: [],
    };

    // 找到父节点
    if (stack.length === 0) {
      roots.push(node);
      stack.push({ node, level });
    } else {
      // 弹出比当前层级深的节点
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        node.parentId = parent.id;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
      stack.push({ node, level });
    }
  }

  return roots;
}

// 查找知识点节点（通过ID）
export function findNodeById(
  roots: KnowledgeNode[],
  id: string
): KnowledgeNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeInChildren(root, id);
    if (found) return found;
  }
  return null;
}

function findNodeInChildren(node: KnowledgeNode, id: string): KnowledgeNode | null {
  for (const child of node.children) {
    if (child.id === id) return child;
    const found = findNodeInChildren(child, id);
    if (found) return found;
  }
  return null;
}

// 查找知识点节点（通过名称模糊匹配）
export function findNodesByName(
  roots: KnowledgeNode[],
  name: string
): KnowledgeNode[] {
  const results: KnowledgeNode[] = [];
  const lowerName = name.toLowerCase();

  function search(node: KnowledgeNode) {
    if (node.name.toLowerCase().includes(lowerName)) {
      results.push(node);
    }
    node.children.forEach(search);
  }

  roots.forEach(search);
  return results;
}

// 获取知识点路径（从根到该节点）
export function getNodePath(roots: KnowledgeNode[], id: string): string[] {
  const path: string[] = [];

  function find(currentNode: KnowledgeNode): boolean {
    path.push(currentNode.name);
    if (currentNode.id === id) return true;
    for (const child of currentNode.children) {
      if (find(child)) return true;
    }
    path.pop();
    return false;
  }

  for (const root of roots) {
    if (find(root)) break;
  }

  return path;
}

// 打印知识点树
export function printTree(roots: KnowledgeNode[], prefix = '', isLast = true): void {
  const connector = isLast ? '└── ' : '├── ';

  for (let i = 0; i < roots.length; i++) {
    const node = roots[i];
    const isLastNode = i === roots.length - 1;
    const newPrefix = prefix + (isLast ? '    ' : '│   ');

    console.log(`${prefix}${connector}${node.name} (${node.id})`);

    if (node.children.length > 0) {
      printTree(node.children, newPrefix, isLastNode);
    }
  }
}

// 获取知识点树文件所在目录（固定在配置目录 ~/.zujuan-scraper/）
function getTreeDir(): string {
  return getConfigDir();
}

// 加载高中知识点树
let highSchoolTree: KnowledgeNode[] | null = null;
let highSchoolTreeLoadedDir: string | null = null;

export function loadHighSchoolTree(): KnowledgeNode[] {
  const dir = getTreeDir();
  if (!highSchoolTree || highSchoolTreeLoadedDir !== dir) {
    const filePath = path.join(dir, 'KNOWLEDGE_TREE_HIGH.txt');
    highSchoolTreeLoadedDir = dir;
    if (fs.existsSync(filePath)) {
      highSchoolTree = parseKnowledgeTree(filePath);
    } else {
      highSchoolTree = [];
    }
  }
  return highSchoolTree;
}

// 加载初中知识点树
let middleSchoolTree: KnowledgeNode[] | null = null;
let middleSchoolTreeLoadedDir: string | null = null;

export function loadMiddleSchoolTree(): KnowledgeNode[] {
  const dir = getTreeDir();
  if (!middleSchoolTree || middleSchoolTreeLoadedDir !== dir) {
    const filePath = path.join(dir, 'KNOWLEDGE_TREE_MIDDLE.txt');
    middleSchoolTreeLoadedDir = dir;
    if (fs.existsSync(filePath)) {
      middleSchoolTree = parseKnowledgeTree(filePath);
    } else {
      middleSchoolTree = [];
    }
  }
  return middleSchoolTree;
}

// 根据年级类型加载对应的知识点树
export function loadKnowledgeTree(gradeType: '高中' | '初中'): KnowledgeNode[] {
  return gradeType === '高中' ? loadHighSchoolTree() : loadMiddleSchoolTree();
}

// 清除知识点树缓存（用于配置变更后强制重新加载）
export function clearTreeCache(): void {
  highSchoolTree = null;
  highSchoolTreeLoadedDir = null;
  middleSchoolTree = null;
  middleSchoolTreeLoadedDir = null;
}

/**
 * 获取节点的子孙节点
 * @param node 根节点
 * @param depth 最大查询深度（-1 表示无限制），默认 1（直接子节点）
 * @param searchTerm 可选搜索词，只返回名称包含该词的节点
 * @param currentDepth 当前递归深度（内部使用）
 */
export function getDescendants(
  node: KnowledgeNode,
  depth: number = 1,
  searchTerm?: string,
  currentDepth: number = 0
): KnowledgeNode[] {
  const results: KnowledgeNode[] = [];

  // 超过最大深度则停止
  if (depth !== -1 && currentDepth >= depth) {
    return results;
  }

  for (const child of node.children) {
    const matchesSearch = !searchTerm || child.name.toLowerCase().includes(searchTerm.toLowerCase());
    const childResults: KnowledgeNode[] = [];

    // 收集符合条件的子节点（如果当前深度在限制内）
    if (matchesSearch && (depth === -1 || currentDepth < depth)) {
      childResults.push(child);
    }

    // 递归向下查询
    const grandDescendants = getDescendants(child, depth, searchTerm, currentDepth + 1);
    childResults.push(...grandDescendants);

    results.push(...childResults);
  }

  return results;
}

/**
 * 从多个根节点集合中收集子孙节点（用于无指定节点ID时查询）
 * @param roots 所有根节点数组
 * @param depth 最大深度（-1=无限制），depth=1 时只返回 roots 本身
 * @param searchTerm 可选搜索词
 */
export function getDescendantsFromRoots(
  roots: KnowledgeNode[],
  depth: number,
  searchTerm?: string
): KnowledgeNode[] {
  if (depth === 0) return [];

  const results: KnowledgeNode[] = [];

  for (const root of roots) {
    const matchesSearch = !searchTerm || root.name.toLowerCase().includes(searchTerm.toLowerCase());
    // depth=1 时只返回根节点本身
    if (depth === 1) {
      if (matchesSearch) results.push(root);
      continue;
    }
    // depth>1 时，先收集符合条件的根节点，再递归其子孙
    if (matchesSearch) results.push(root);
    const childDescendants = getDescendants(root, depth - 1, searchTerm, 1);
    results.push(...childDescendants);
  }

  return results;
}

/** 带层级信息的节点（用于分层展示） */
export interface NodeWithLevel {
  node: KnowledgeNode;
  level: number;
}

/**
 * 从多个根节点收集带层级的子孙节点（用于分层打印）
 * @param roots 所有根节点
 * @param maxDepth 最大深度（-1=无限制）
 * @param searchTerm 可选搜索词，只收集名称匹配的节点及搜索路径上的祖先节点
 */
export function collectNodesWithLevels(
  roots: KnowledgeNode[],
  maxDepth: number,
  searchTerm?: string
): NodeWithLevel[] {
  const results: NodeWithLevel[] = [];

  for (const root of roots) {
    if (maxDepth === -1 || maxDepth >= 1) {
      const matches = !searchTerm || root.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (matches) {
        results.push({ node: root, level: 1 });
      }
    }
    if (maxDepth !== 0) {
      collectChildrenWithLevels(root, results, 2, maxDepth, searchTerm);
    }
  }

  return results;
}

/**
 * 递归收集子节点：如果节点自身匹配则加入结果；无论匹配与否都继续向下，
 * 以便其子孙匹配时仍能出现在正确的层级下（祖先节点会作为占位被加入结果）。
 */
function collectChildrenWithLevels(
  node: KnowledgeNode,
  results: NodeWithLevel[],
  currentLevel: number,
  maxDepth: number,
  searchTerm?: string
): void {
  for (const child of node.children) {
    if (maxDepth !== -1 && currentLevel > maxDepth) {
      continue; // 超出深度，跳过该分支，但继续处理同级的其他兄弟节点
    }

    const matches = !searchTerm || child.name.toLowerCase().includes(searchTerm.toLowerCase());

    // 如果匹配，加入结果；即使不匹配也要向下递归（供子孙作为祖先占位）
    if (matches) {
      results.push({ node: child, level: currentLevel });
    }

    // 无论是否匹配，都继续向下探索子孙
    collectChildrenWithLevels(child, results, currentLevel + 1, maxDepth, searchTerm);
  }
}

/**
 * 打印带层级的节点列表（按层级缩进）
 */
export function printNodesWithLevels(nodesWithLevels: NodeWithLevel[]): void {
  for (const { node, level } of nodesWithLevels) {
    console.log(`${'  '.repeat(level - 1)}• ${node.name} (${node.id})`);
  }
}
