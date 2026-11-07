// 社交互动辅助：「想去」计数、评论点赞、馕队主题昵称。
// 口径：spot_key 与评论表一致（城市|名称）；收藏行用 device_id 标识设备。
// 读写统一走 store.js：有云服务用云端，没有就落本机，演示流程不中断。
const store = require('./store');

const DEVICE_KEY = 'xingji-device-id';
const LIKED_KEY = 'xingji-liked-v1';
const NICK_KEY = 'xingji-nick';

function deviceId() {
  try {
    let id = wx.getStorageSync(DEVICE_KEY);
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      wx.setStorageSync(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return 'anon-device'; }
}

// 一次性拉全部「想去」行，客户端按 spot_key 计数（表小，够用且省请求）
async function fetchWantCounts() {
  const res = await store.wantCounts();
  return res.data || {};
}

async function cloudAddWant(key, name, city) {
  return store.addWant(key, name, city, deviceId());
}

async function cloudRemoveWant(key) {
  return store.removeWant(key, deviceId());
}

// ---------- 评论点赞（本地记录防重复） ----------
function likedIds() {
  try {
    const v = wx.getStorageSync(LIKED_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function isLiked(id) { return likedIds().indexOf(id) > -1; }

function markLiked(id) {
  const list = likedIds();
  if (list.indexOf(id) === -1) {
    list.push(id);
    try { wx.setStorageSync(LIKED_KEY, list.slice(-500)); } catch (e) { /* 忽略 */ }
  }
}

async function likeComment(id, current) {
  markLiked(id);
  return store.likeComment(id, (Number(current) || 0) + 1);
}

// ---------- 新疆馕队主题昵称 ----------
const NICK_A = ['爱吃馕的', '追风的', '骑骆驼的', '看雪山的', '逛吃的', '拍落日的', '赶巴扎的'];
const NICK_B = ['小旅人', '驼铃客', '小馕宝', '风行者', '小星星', '行脚商'];

function randomNick() {
  const a = NICK_A[Math.floor(Math.random() * NICK_A.length)];
  const b = NICK_B[Math.floor(Math.random() * NICK_B.length)];
  return a + b;
}

function savedNick() {
  try { return wx.getStorageSync(NICK_KEY) || ''; } catch (e) { return ''; }
}

function rememberNick(nick) {
  try { wx.setStorageSync(NICK_KEY, nick); } catch (e) { /* 忽略 */ }
}

module.exports = { deviceId, fetchWantCounts, cloudAddWant, cloudRemoveWant, likedIds, isLiked, markLiked, likeComment, randomNick, savedNick, rememberNick, NICK_KEY };
