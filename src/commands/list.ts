import { Command } from 'commander';
import {
  ensureDatabase,
  importTreeFromFile,
  getNodeById,
  getDescendants,
  getDescendantsFromRoots,
  getNodePath,
  printNodesWithLevels,
} from '../lib/knowledge-tree-sqlite';
import { configManager } from '../lib/config';

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('列出/搜索知识点')
    .option('-s, --search <name>', '搜索知识点名称（模糊匹配）')
    .option('-i, --id <id>', '从指定知识点节点查询其子孙节点')
    .option('-t, --tree', '显示完整知识点树')
    .option('-m, --middle', '使用初中知识点树（默认高中）')
    .option('--depth <n>', '最大查询深度（-1=无限制，不指定则使用配置默认值）', (val) => parseInt(val))
    .option('--refresh', '强制从知识点树文件重建数据库')
    .action((options) => {
      const isMiddle = !!(options.middle || false);
      const grade = isMiddle ? 'middle' : 'high';
      const treeName = isMiddle ? '初中' : '高中';

      // --refresh：强制重建数据库
      if (options.refresh) {
        try {
          const highCount = importTreeFromFile('high');
          const middleCount = importTreeFromFile('middle');
          console.log(`数据库已重建：高中 ${highCount} 条，初中 ${middleCount} 条`);
        } catch (e: any) {
          console.log(`重建失败: ${e.message}`);
        }
        return;
      }

      // 确保数据库已初始化（文件存在则直接复用，不存在则自动创建）
      try {
        ensureDatabase();
      } catch (e: any) {
        console.log(`未找到知识点树文件: ${e.message}`);
        return;
      }

      if (options.tree) {
        // --tree: 从根节点开始，无限深度
        const depth = configManager.get('treeDepth');
        const nodes = getDescendantsFromRoots(-1, undefined, grade);
        if (nodes.length === 0) {
          console.log('（无数据）');
          return;
        }
        console.log(`${treeName}数学知识点树:\n`);
        printNodesWithLevels(nodes);
        return;
      }

      const targetId = options.id;
      const depth = options.depth !== undefined ? options.depth : configManager.get('treeDepth');

      if (targetId) {
        // --id: 查询指定节点的子孙
        const node = getNodeById(targetId, grade);
        if (!node) {
          console.log(`未找到ID为 "${targetId}" 的知识点`);
          return;
        }

        const nodePath = getNodePath(targetId, grade);
        console.log(`知识点: ${node.name}`);
        console.log(`ID: ${node.id}`);
        console.log(`路径: ${nodePath.map((n) => n.name).join(' > ')}`);

        const descendants = getDescendants(targetId, depth, options.search || undefined, grade);

        if (descendants.length === 0) {
          if (options.search) {
            console.log(`在深度 ${depth === -1 ? '不限' : depth} 内未找到包含"${options.search}"的子孙节点`);
          } else {
            console.log('（无子节点）');
          }
          return;
        }

        console.log(`\n子孙节点 (${descendants.length}个, 深度${depth === -1 ? '不限' : `≤${depth}`}):`);
        printNodesWithLevels(descendants);
        return;
      }

      // 不指定 --id：从虚拟根节点查询
      if (options.search) {
        const nodes = getDescendantsFromRoots(depth, options.search, grade);
        if (nodes.length === 0) {
          console.log(`在深度 ${depth === -1 ? '不限' : depth} 内未找到包含"${options.search}"的知识点`);
          return;
        }
        console.log(`找到 ${nodes.length} 个匹配结果 (深度${depth === -1 ? '不限' : `≤${depth}`}):\n`);
        printNodesWithLevels(nodes);
        return;
      }

      // 无搜索词：直接按层级展示
      const nodes = getDescendantsFromRoots(depth, undefined, grade);
      if (nodes.length === 0) {
        console.log('（无数据）');
        return;
      }
      console.log(`${treeName}数学知识点 (深度${depth === -1 ? '不限' : depth}):\n`);
      printNodesWithLevels(nodes);
      return;
    });

  return command;
}
