#!/usr/bin/env node
/**
 * 生成文档用截图（开发期工具，需要本机 Edge/Chrome 与 puppeteer-core）。
 * 用法：node scripts/shots.js
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('未找到 Edge/Chrome，跳过截图');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });
  const url = 'file:///' + path.join(root, 'demo', 'index.html').replace(/\\/g, '/');

  // 桌面端：首屏
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 940, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'load' });
  await wait(1200);
  await page.screenshot({ path: path.join(outDir, 'web-overview.png') });

  // 桌面端：整页长图
  await page.screenshot({ path: path.join(outDir, 'web-full.png'), fullPage: true });

  // 移动端：首屏
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await m.goto(url, { waitUntil: 'load' });
  await wait(1200);
  await m.screenshot({ path: path.join(outDir, 'web-mobile.png') });

  await browser.close();
  console.log('截图完成 →', outDir);
})().catch((e) => {
  console.error('截图失败：', e.message);
  process.exit(1);
});
