import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UrlBuilder } from '../src/lib/url-builder';
import type { QuestionType } from '../src/types';

// ═══ 已知缺陷记录（IMPROVEMENTS.todo.md #17 遗留项）═══
// 1. t5/t6：站点无对应题型码，setType 会 no-op（命令层已加显式警告）
// 2. setGrade：写入的 gradePart 不参与 build()，对 URL 无效果（历史遗留）

test('年级前缀：high → gzsx，middle → czsx', () => {
  assert.equal(new UrlBuilder('28279', 'high').build(), 'https://zujuan.xkw.com/gzsx/zsd28279/o2/');
  assert.equal(new UrlBuilder('28279', 'middle').build(), 'https://zujuan.xkw.com/czsx/zsd28279/o2/');
});

test('knowledgeId 自动剥离 zsd 前缀', () => {
  assert.equal(new UrlBuilder('zsd28279', 'high').build(), 'https://zujuan.xkw.com/gzsx/zsd28279/o2/');
});

test('高中题型码 t1-t4', () => {
  const cases: Record<string, string> = { t1: 'qt2701', t2: 'qt2704', t3: 'qt2702', t4: 'qt2703' };
  for (const [t, code] of Object.entries(cases)) {
    const url = new UrlBuilder('28279', 'high').setType(t as QuestionType).build();
    assert.equal(url, `https://zujuan.xkw.com/gzsx/zsd28279/${code}o2/`);
  }
});

test('初中题型码 t1-t4', () => {
  const cases: Record<string, string> = { t1: 'qt1101', t2: 'qt1104', t3: 'qt1102', t4: 'qt1103' };
  for (const [t, code] of Object.entries(cases)) {
    const url = new UrlBuilder('28279', 'middle').setType(t as QuestionType).build();
    assert.equal(url, `https://zujuan.xkw.com/czsx/zsd28279/${code}o2/`);
  }
});

test('多选题答案数量后缀（2→02、3→03、4+→03）', () => {
  assert.equal(new UrlBuilder('x', 'high').setType('t2', 2).build(), 'https://zujuan.xkw.com/gzsx/zsdx/qt270402o2/');
  assert.equal(new UrlBuilder('x', 'high').setType('t2', 3).build(), 'https://zujuan.xkw.com/gzsx/zsdx/qt270403o2/');
  assert.equal(new UrlBuilder('x', 'high').setType('t2', 4).build(), 'https://zujuan.xkw.com/gzsx/zsdx/qt270403o2/');
});

test('填空题空数后缀（1→01、2→02、3+→03）', () => {
  assert.equal(
    new UrlBuilder('x', 'high').setType('t3', undefined, 1).build(),
    'https://zujuan.xkw.com/gzsx/zsdx/qt270201o2/'
  );
  assert.equal(
    new UrlBuilder('x', 'high').setType('t3', undefined, 2).build(),
    'https://zujuan.xkw.com/gzsx/zsdx/qt270202o2/'
  );
  assert.equal(
    new UrlBuilder('x', 'high').setType('t3', undefined, 5).build(),
    'https://zujuan.xkw.com/gzsx/zsdx/qt270203o2/'
  );
});

test('难度与年份段', () => {
  assert.equal(new UrlBuilder('x', 'high').setDifficulty('d3').build(), 'https://zujuan.xkw.com/gzsx/zsdx/d3o2/');
  assert.equal(new UrlBuilder('x', 'high').setYear(2024).build(), 'https://zujuan.xkw.com/gzsx/zsdx/y2024o2/');
});

test('年份 -1（更早年份）→ y-1', () => {
  assert.equal(new UrlBuilder('x', 'high').setYear(-1).build(), 'https://zujuan.xkw.com/gzsx/zsdx/y-1o2/');
});

test('年份越界（1999/2101/小数）静默忽略', () => {
  assert.equal(new UrlBuilder('x', 'high').setYear(1999).build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
  assert.equal(new UrlBuilder('x', 'high').setYear(2101).build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
  assert.equal(new UrlBuilder('x', 'high').setYear(2024.5).build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
});

test('排序映射：latest→o2、hot→o1、comprehensive→o0', () => {
  assert.equal(new UrlBuilder('x', 'high').setOrder('latest').build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
  assert.equal(new UrlBuilder('x', 'high').setOrder('hot').build(), 'https://zujuan.xkw.com/gzsx/zsdx/o1/');
  assert.equal(new UrlBuilder('x', 'high').setOrder('comprehensive').build(), 'https://zujuan.xkw.com/gzsx/zsdx/o0/');
});

test('分页：page=1 无 p 段，page=2 → o2p2', () => {
  assert.equal(new UrlBuilder('x', 'high').setPage(1).build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
  assert.equal(new UrlBuilder('x', 'high').setPage(2).build(), 'https://zujuan.xkw.com/gzsx/zsdx/o2p2/');
});

test('拼接顺序：题型+难度+年份+排序，无分隔符', () => {
  const url = new UrlBuilder('x', 'high').setType('t1').setDifficulty('d3').setYear(2024).setOrder('hot').build();
  assert.equal(url, 'https://zujuan.xkw.com/gzsx/zsdx/qt2701d3y2024o1/');
});

test('分页与全段组合', () => {
  const url = new UrlBuilder('x', 'high')
    .setType('t1')
    .setDifficulty('d3')
    .setYear(2024)
    .setOrder('hot')
    .setPage(2)
    .build();
  assert.equal(url, 'https://zujuan.xkw.com/gzsx/zsdx/qt2701d3y2024o1p2/');
});

test('buildUrl 静态方法：年级前缀与参数透传', () => {
  assert.equal(
    UrlBuilder.buildUrl('28279', { type: 't1', difficulty: 'd3', year: 2024, order: 'hot' }, 'middle'),
    'https://zujuan.xkw.com/czsx/zsd28279/qt1101d3y2024o1/'
  );
});

test('buildUrl：options.order 优先于 defaultOrder', () => {
  assert.equal(
    UrlBuilder.buildUrl('x', { order: 'comprehensive' }, 'high', 'hot'),
    'https://zujuan.xkw.com/gzsx/zsdx/o0/'
  );
  assert.equal(UrlBuilder.buildUrl('x', {}, 'high', 'hot'), 'https://zujuan.xkw.com/gzsx/zsdx/o1/');
  assert.equal(UrlBuilder.buildUrl('x', {}, 'high'), 'https://zujuan.xkw.com/gzsx/zsdx/o2/');
});

test('buildUrl：page 分页', () => {
  assert.equal(UrlBuilder.buildUrl('x', { page: 2 }, 'high'), 'https://zujuan.xkw.com/gzsx/zsdx/o2p2/');
});
