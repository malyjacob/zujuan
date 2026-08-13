import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { escHtml, markdownToHtml, convertPipeTables, buildTableHtml } from '../src/lib/exporters/markdown-to-html';

test('escHtml 转义 & < > "', () => {
  assert.equal(escHtml('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

test('buildTableHtml：表头保留、分隔行跳过、数据行转换', () => {
  const html = buildTableHtml(['| h1 | h2 |', '|---|---|', '| a | b |']);
  assert.equal(
    html,
    '<table>\n  <thead>\n    <tr><th>h1</th><th>h2</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>a</td><td>b</td></tr>\n  </tbody>\n</table>'
  );
});

test('convertPipeTables：表格整体替换，前后文保留', () => {
  const md = '前文\n\n| 名称 | 值 |\n|---|---|\n| a | 1 |\n\n后文';
  const out = convertPipeTables(md);
  assert.ok(out.includes('<table>'));
  assert.ok(out.includes('<th>名称</th>'));
  assert.ok(out.includes('<td>a</td>'));
  assert.ok(out.includes('前文'));
  assert.ok(out.includes('后文'));
});

test('convertPipeTables：非表格管道行保持不变', () => {
  const md = '| 不是表格 | 就一行 |\n普通行';
  assert.equal(convertPipeTables(md), md);
});

test('markdownToHtml：标题', () => {
  assert.equal(markdownToHtml('# 大标题'), '<h2>大标题</h2>');
  assert.equal(markdownToHtml('## 中标题'), '<h3>中标题</h3>');
  assert.equal(markdownToHtml('### 小标题'), '<h4>小标题</h4>');
});

test('markdownToHtml：加粗', () => {
  assert.equal(markdownToHtml('**加粗**'), '<p><strong>加粗</strong></p>');
});

test('markdownToHtml：空行分段，单换行转 <br/>', () => {
  assert.equal(markdownToHtml('第一段\n\n第二段'), '<p>第一段</p>\n<p>第二段</p>');
  assert.equal(markdownToHtml('a\nb'), '<p>a<br/>b</p>');
});

test('markdownToHtml：已包裹的块不再重复包裹', () => {
  assert.equal(markdownToHtml('<p>已包裹</p>'), '<p>已包裹</p>');
});

test('markdownToHtml：表格与段落混排', () => {
  const out = markdownToHtml('表前\n\n| 名称 | 值 |\n|---|---|\n| a | 1 |\n\n表后');
  assert.ok(out.includes('<p>表前</p>'));
  assert.ok(out.includes('<table>'));
  assert.ok(out.includes('<p>表后</p>'));
});
