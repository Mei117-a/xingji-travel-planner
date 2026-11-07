#!/usr/bin/env node
/**
 * 行迹 · 离线自检脚本
 *
 * 用途：验证「clone 下来就能跑」——不依赖微信开发者工具、不依赖云服务，
 * 直接在 Node 里跑规划引擎与本机数据层，确认核心链路没有坏。
 *
 * 用法：node scripts/verify.js
 * 退出码：0 全部通过；1 有失败项
 */
const path = require('path');

// ---------- 最小 wx 运行时（内存版 storage） ----------
const memory = new Map();
global.wx = {
  getStorageSync: (k) => (memory.has(k) ? memory.get(k) : ''),
  setStorageSync: (k, v) => { memory.set(k, v); },
  removeStorageSync: (k) => { memory.delete(k); },
  showToast: () => {},
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
};

const root = path.join(__dirname, '..', 'miniprogram');
const data = require(path.join(root, 'utils', 'data.js'));
const localdb = require(path.join(root, 'utils', 'localdb.js'));

let pass = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
  } else {
    fails.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ✗ ' + name + (detail ? '  ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

// ---------- 1. 数据资产 ----------
section('[1/4] 数据资产');
const cities = Object.keys(data.CITIES);
check('城市坐标库 ≥ 60 座', cities.length >= 60, cities.length + ' 座');

let spotTotal = 0;
let withImg = 0;
let withCoord = 0;
cities.forEach((city) => {
  (data.spotsOf(city) || []).forEach((s) => {
    spotTotal++;
    if (s.img) withImg++;
    if (Number(s.lat) && Number(s.lng)) withCoord++;
  });
});
check('景点条目 ≥ 200 条', spotTotal >= 200, spotTotal + ' 条');
check('全部景点有经纬度', withCoord === spotTotal, withCoord + '/' + spotTotal);
check('配图景点 ≥ 20 个', withImg >= 20, withImg + ' 个');

// ---------- 2. 规划引擎 ----------
section('[2/4] 规划引擎');
const demand = {
  from: '北京', to: '杭州', days: 3, travelers: 2, budget: 5000,
  goMode: 'train', backMode: 'train', hotelLevel: 'comfort',
  prefs: ['人文', '美食'], startDate: '2026-11-20',
};
const plan3 = data.buildPlan(demand);
check('3 天行程生成 3 天', plan3.days.length === 3, plan3.days.length + ' 天');
check('每天至少 3 条安排', plan3.days.every((d) => d.items.length >= 3));
check('首日含出发交通', plan3.days[0].items.some((i) => i.kind === 'go'));
check('末日含返程交通', plan3.days[2].items.some((i) => i.kind === 'back'));

const oneDay = data.buildPlan(Object.assign({}, demand, { days: 1 }));
check('单日往返仍保留返程', oneDay.days[0].items.some((i) => i.kind === 'back'));

const week = data.buildPlan(Object.assign({}, demand, { days: 7 }));
check('7 天行程生成 7 天', week.days.length === 7, week.days.length + ' 天');

// 空景点城市不应崩（用无景点库的边界构造）
const emptyCity = data.buildPlan(Object.assign({}, demand, { to: '东莞' }));
check('无景点城市降级不报错', Array.isArray(emptyCity.days) && emptyCity.days.length === 3);

// ---------- 3. 费用口径 ----------
section('[3/4] 费用口径');
const t1 = data.computeTotals(Object.assign({}, demand, { travelers: 1 }), plan3);
const t2 = data.computeTotals(demand, plan3);
check('门票游玩费随人数翻倍', t2.act === t1.act * 2, t1.act + ' → ' + t2.act);
check('住宿按房间数计算', t2.rooms === 1 && t2.nights === 2, '2 人 3 天 = 1 间 2 晚');
check('总额 = 交通 + 住宿 + 游玩',
  t2.total === t2.transport + t2.hotel + t2.act,
  t2.total + ' = ' + t2.transport + ' + ' + t2.hotel + ' + ' + t2.act);

// ---------- 4. 本机数据层（无云服务时的降级实现） ----------
section('[4/4] 本机数据层');
const key = data.spotKey('杭州', '西湖');
const c1 = localdb.addComment({ spot_key: key, spot_name: '西湖', city: '杭州', nickname: '测试', content: '第一条' });
check('评论写入并分配 id', !!c1.id, 'id=' + c1.id);
check('评论按景点可读', localdb.listComments(key).length === 1);
localdb.likeComment(c1.id, 5);
check('点赞数可更新', localdb.listComments(key)[0].likes === 5);

localdb.addFav({ spot_key: key, spot_name: '西湖', city: '杭州', device_id: 'dev-1' });
localdb.addFav({ spot_key: key, spot_name: '西湖', city: '杭州', device_id: 'dev-1' });
check('同设备重复收藏不叠加', localdb.listFavs().length === 1);
localdb.removeFav(key, 'dev-1');
check('取消收藏后清空', localdb.listFavs().length === 0);

const shared = localdb.saveShared('ABC123', { title: '杭州·3日', plan: plan3, demand: demand, updated_by: '测试' });
check('搭子码可存取', !!localdb.getShared('ABC123') && shared.code === 'ABC123');
check('不存在的搭子码返回 null', localdb.getShared('ZZZZZZ') === null);

// ---------- 汇总 ----------
console.log('\n' + '-'.repeat(48));
if (fails.length) {
  console.log('结果：' + pass + ' 项通过，' + fails.length + ' 项失败');
  fails.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
console.log('结果：' + pass + ' 项全部通过 ✅');
