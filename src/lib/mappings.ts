import { Grade, Order } from '../types';

/** 题型码映射：仅 t1-t4 支持 URL 筛选（站点无 t5/t6 对应题型码，暂不支持）。 */
export const QUESTION_TYPE_CODES: Record<Grade, Partial<Record<string, string>>> = {
  high: { t1: '2701', t2: '2704', t3: '2702', t4: '2703' },
  middle: { t1: '1101', t2: '1104', t3: '1102', t4: '1103' },
};

/** 题型完整名称（用于结果元信息 meta.type） */
export const QUESTION_TYPE_NAMES: Record<string, string> = {
  t1: '单选题',
  t2: '多选题',
  t3: '填空题',
  t4: '解答题',
  t5: '判断题',
  t6: '概念填空',
};

/** 题型简称（用于 CLI 帮助文本） */
export const QUESTION_TYPE_SHORT_NAMES: Record<string, string> = {
  t1: '单选',
  t2: '多选',
  t3: '填空',
  t4: '解答',
  t5: '判断',
  t6: '概念填空',
};

/** 难度名称 */
export const DIFFICULTY_NAMES: Record<string, string> = {
  d1: '容易',
  d2: '较易',
  d3: '适中',
  d4: '较难',
  d5: '困难',
};

/** 排序码 */
export const ORDER_CODES: Record<Order, string> = {
  latest: 'o2',
  hot: 'o1',
  comprehensive: 'o0',
};

/** 排序名称（用于结果元信息与日志） */
export const ORDER_NAMES: Record<Order, string> = {
  latest: '最新',
  hot: '最热',
  comprehensive: '综合',
};

/** 生成 CLI 题型帮助文本：t1=单选 t2=多选 ... */
export function buildTypeHelp(): string {
  return Object.entries(QUESTION_TYPE_SHORT_NAMES)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

/** 生成 CLI 难度帮助文本：d1=容易 d2=较易 ... */
export function buildDifficultyHelp(): string {
  return Object.entries(DIFFICULTY_NAMES)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}
