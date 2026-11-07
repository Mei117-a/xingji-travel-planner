#!/usr/bin/env node
/**
 * 通过 GitHub REST API 把当前仓库内容推成一个 commit。
 *
 * 为什么需要它：某些网络环境下 github.com（git push / OAuth 网页授权）不可达，
 * 但 api.github.com 可达。此脚本只依赖 api.github.com，用 Git Data API
 * 直接写 blob/tree/commit/ref，效果等同于一次 git push。
 *
 * 用法（令牌只从环境变量读，不落盘）：
 *   GH_TOKEN=ghp_xxx node scripts/push-github.js [repo名]
 *
 * 可选环境变量：
 *   GH_API   默认 https://api.github.com
 *   GH_PRIVATE  设为 1 则建私有仓库
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API = process.env.GH_API || 'https://api.github.com';
const TOKEN = process.env.GH_TOKEN;
const REPO = process.argv[2] || 'xingji-travel-planner';
const DESC = '行迹 · 旅行规划微信小程序｜AI/智能双模式行程规划、60 城 219 景点、按天分色路线图、云端评论与搭子协作（新疆馕队）';
const ROOT = path.join(__dirname, '..');

if (!TOKEN) {
  console.error('缺少 GH_TOKEN 环境变量');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body, attempt = 0) {
  let res;
  try {
    res = await fetch(url.startsWith('http') ? url : API + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'xingji-push-script',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    // 网络抖动（fetch failed / socket hang up）——退避重试
    if (attempt < 5) {
      const wait = 800 * Math.pow(2, attempt);
      console.log('  · 网络异常，' + wait + 'ms 后重试（' + (attempt + 1) + '/5）');
      await sleep(wait);
      return api(method, url, body, attempt + 1);
    }
    throw netErr;
  }

  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }

  if (!res.ok) {
    // 5xx / 429 视为可重试
    if ((res.status >= 500 || res.status === 429) && attempt < 5) {
      const wait = 800 * Math.pow(2, attempt);
      console.log('  · HTTP ' + res.status + '，' + wait + 'ms 后重试（' + (attempt + 1) + '/5）');
      await sleep(wait);
      return api(method, url, body, attempt + 1);
    }
    const err = new Error(method + ' ' + url + ' -> ' + res.status + ' ' + (json && json.message ? json.message : text.slice(0, 200)));
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// 并发受限的 map
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

(async () => {
  const me = await api('GET', '/user');
  const owner = me.login;
  console.log('已认证：' + owner);

  // 1) 创建仓库（已存在则沿用）
  let repo;
  try {
    repo = await api('POST', '/user/repos', {
      name: REPO,
      description: DESC,
      private: process.env.GH_PRIVATE === '1',
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    });
    console.log('已创建仓库：' + repo.full_name);
  } catch (e) {
    if (e.status === 422) {
      repo = await api('GET', '/repos/' + owner + '/' + REPO);
      console.log('仓库已存在，沿用：' + repo.full_name);
    } else {
      throw e;
    }
  }

  // 2) 收集要提交的文件（遵守 .gitignore，跳过 .git）
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (!files.length) throw new Error('git ls-files 为空，先在本地 git add 文件');
  console.log('待上传文件：' + files.length + ' 个');

  // 2.5) 空仓库不能直接写 blob（API 返回 409 Git Repository is empty），
  //      先用 contents API 放一个占位文件把分支建出来，拿到 parent commit。
  let parentSha = null;
  try {
    const ref = await api('GET', '/repos/' + owner + '/' + REPO + '/git/ref/heads/main');
    parentSha = ref.object.sha;
  } catch (e) {
    // 空仓库会返回 409（Git Repository is empty），一并按「需要初始化」处理
    if (e.status !== 404 && e.status !== 409) throw e;
    const init = await api('PUT', '/repos/' + owner + '/' + REPO + '/contents/.gitkeep', {
      message: 'chore: init repository',
      content: Buffer.from(' ').toString('base64'),
    });
    parentSha = init.commit.sha;
    console.log('已初始化空仓库分支（占位提交）');
  }

  // 3) 逐个创建 blob
  let done = 0;
  const blobs = await mapLimit(files, 3, async (file) => {
    const abs = path.join(ROOT, file);
    const buf = fs.readFileSync(abs);
    const isBinary = /\.(png|jpe?g|gif|webp|ico|zip|pdf)$/i.test(file);
    const res = await api('POST', '/repos/' + owner + '/' + REPO + '/git/blobs', isBinary
      ? { content: buf.toString('base64'), encoding: 'base64' }
      : { content: buf.toString('utf8'), encoding: 'utf-8' });
    done++;
    if (done % 10 === 0 || done === files.length) console.log('  blob ' + done + '/' + files.length);
    return { path: file, mode: '100644', type: 'blob', sha: res.sha };
  });

  // 4) tree / commit / ref
  const head = execSync('git log -1 --pretty=%s', { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = await api('POST', '/repos/' + owner + '/' + REPO + '/git/trees', { tree: blobs });
  const commit = await api('POST', '/repos/' + owner + '/' + REPO + '/git/commits', {
    message: head || '行迹 初始提交',
    tree: tree.sha,
    parents: parentSha ? [parentSha] : [],
  });

  await api('PATCH', '/repos/' + owner + '/' + REPO + '/git/refs/heads/main', { sha: commit.sha, force: true });
  console.log('已推送 main -> ' + commit.sha.slice(0, 7));

  // 5) 默认分支设为 main
  await api('PATCH', '/repos/' + owner + '/' + REPO, { default_branch: 'main' });

  // 6) 开启 GitHub Pages（workflow 方式，由仓库内 pages.yml 构建）
  try {
    await api('POST', '/repos/' + owner + '/' + REPO + '/pages', { build_type: 'workflow' });
    console.log('已开启 Pages（workflow 构建）');
  } catch (e) {
    if (e.status === 409) {
      console.log('Pages 之前已开启，跳过');
    } else {
      console.log('Pages 开启失败（可在仓库 Settings → Pages 手动选 GitHub Actions）：' + e.message);
    }
  }

  console.log('\n仓库地址：' + repo.html_url);
  console.log('Pages 演示：https://' + owner.toLowerCase() + '.github.io/' + REPO + '/');
})().catch((e) => {
  console.error('失败：' + e.message);
  if (e.body) console.error(JSON.stringify(e.body).slice(0, 400));
  process.exit(1);
});
