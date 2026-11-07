#!/usr/bin/env node
/**
 * 小程序工程体检：不需要微信开发者工具，直接检查编译前最容易踩的坑。
 *
 * 用发：node scripts/verify-miniprogram.js
 * 检查项：
 *   - 所有 JSON 严格可解析（微信对 JSON 很挑剔）
 *   - app.json 的 pages 页面四件套齐全
 *   - tabBar 指向的页面都在 pages 里
 *   - 所有 JS 语法正确
 *   - require 的相对路径真实存在
 *   - wxml 标签闭合、且 wx:else/wx:elif 不与 wx:for 同节点
 *   - data.js 里引用的景点配图文件存在
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'miniprogram');
let pass = 0;
const fails = [];

function ok(name, detail) {
  pass++;
  console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
}
function bad(name, detail) {
  fails.push(name + (detail ? ' — ' + detail : ''));
  console.log('  ✗ ' + name + (detail ? '  ' + detail : ''));
}
function walk(dir, ext, out = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === 'miniprogram_npm' || d.name === 'node_modules') return;
      walk(p, ext, out);
    } else if (d.name.endsWith(ext)) {
      out.push(p);
    }
  });
  return out;
}

// ---------- 1. JSON ----------
console.log('\n[1/6] JSON 配置');
const jsonFiles = walk(ROOT, '.json').concat([path.join(ROOT, '..', 'project.config.json')]);
let jsonBad = 0;
jsonFiles.forEach((f) => {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    jsonBad++;
    bad('JSON 解析失败 ' + path.relative(ROOT, f), e.message);
  }
});
if (!jsonBad) ok('全部 JSON 可解析', jsonFiles.length + ' 个');

const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

// ---------- 2. 页面四件套 ----------
console.log('\n[2/6] 页面结构');
let missing = 0;
app.pages.forEach((p) => {
  ['.js', '.json', '.wxml', '.wxss'].forEach((ext) => {
    const f = path.join(ROOT, p + ext);
    if (!fs.existsSync(f)) { missing++; bad('缺少文件', p + ext); }
  });
});
if (!missing) ok('页面四件套齐全', app.pages.length + ' 个页面');

// ---------- 3. tabBar ----------
console.log('\n[3/6] tabBar');
const tabPaths = ((app.tabBar && app.tabBar.list) || []).map((x) => x.pagePath);
const tabBad = tabPaths.filter((p) => app.pages.indexOf(p) === -1);
if (tabBad.length) bad('tabBar 指向不存在的页面', tabBad.join(','));
else ok('tabBar 4 项均指向已注册页面', tabPaths.length + ' 项');

// ---------- 4. JS 语法 ----------
console.log('\n[4/6] JS 语法');
const jsFiles = walk(ROOT, '.js');
let jsBad = 0;
jsFiles.forEach((f) => {
  try {
    execSync('node --check "' + f + '"', { stdio: 'pipe' });
  } catch (e) {
    jsBad++;
    bad('语法错误 ' + path.relative(ROOT, f), String(e.stderr || '').split('\n')[0]);
  }
});
if (!jsBad) ok('全部 JS 语法正确', jsFiles.length + ' 个文件');

// ---------- 5. require 路径 ----------
console.log('\n[5/6] 模块引用');
let reqBad = 0;
jsFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = path.resolve(path.dirname(f), m[1]);
    const candidates = [target, target + '.js', path.join(target, 'index.js')];
    if (!candidates.some((c) => fs.existsSync(c))) {
      reqBad++;
      bad('引用不存在 ' + path.relative(ROOT, f), m[1]);
    }
  }
});
if (!reqBad) ok('相对 require 全部可解析');

// ---------- 6. WXML ----------
console.log('\n[6/6] WXML 结构');
const wxmlFiles = walk(ROOT, '.wxml');
let wxmlBad = 0;

// 微信不允许 wx:else / wx:elif 与 wx:for 出现在同一节点上
wxmlFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const tagRe = /<([a-zA-Z-]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const attrs = m[2];
    const hasElse = /\bwx:(else|elif)\b/.test(attrs);
    const hasFor = /\bwx:for\b/.test(attrs);
    if (hasElse && hasFor) {
      wxmlBad++;
      bad('wx:else/elif 与 wx:for 同节点 ' + path.relative(ROOT, f), m[0].slice(0, 60));
    }
  }
});

// 标签闭合（忽略自闭合与注释）
wxmlFiles.forEach((f) => {
  let src = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<\/?([a-zA-Z-]+)([^>]*?)(\/?)>/g;
  let m;
  let broken = false;
  while ((m = re.exec(src))) {
    const raw = m[0];
    const tag = m[1];
    if (raw.startsWith('</')) {
      const top = stack.pop();
      if (top !== tag) { broken = true; bad('标签未正确闭合 ' + path.relative(ROOT, f), '</' + tag + '> 期望 </' + top + '>'); break; }
    } else if (!m[3] && !/^(input|image|icon|progress|switch|slider|import|include)$/.test(tag)) {
      stack.push(tag);
    }
  }
  if (!broken && stack.length) {
    wxmlBad++;
    bad('存在未闭合标签 ' + path.relative(ROOT, f), stack.slice(-3).join(' > '));
  }
});
if (!wxmlBad) ok('WXML 标签闭合、无非法属性组合', wxmlFiles.length + ' 个文件');

// ---------- 附加：配图 ----------
console.log('\n[附加] 景点配图');
const memory = new Map();
global.wx = {
  getStorageSync: (k) => (memory.has(k) ? memory.get(k) : ''),
  setStorageSync: (k, v) => { memory.set(k, v); },
};
const data = require(path.join(ROOT, 'utils', 'data.js'));
const imgKeys = new Set();
Object.keys(data.CITIES).forEach((c) => {
  (data.spotsOf(c) || []).forEach((s) => { if (s.img) imgKeys.add(s.img); });
});
let imgBad = 0;
imgKeys.forEach((k) => {
  const f = path.join(ROOT, 'assets', 'spots', k + '.jpg');
  if (!fs.existsSync(f)) { imgBad++; bad('配图缺失', k + '.jpg'); }
});
if (!imgBad) ok('景点配图齐全', imgKeys.size + ' 张');

// ---------- 汇总 ----------
console.log('\n' + '-'.repeat(48));
if (fails.length) {
  console.log('结果：' + pass + ' 项通过，' + fails.length + ' 项失败');
  process.exit(1);
}
console.log('结果：' + pass + ' 项全部通过 ✅  工程可编译');
