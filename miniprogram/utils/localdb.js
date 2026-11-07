// 本地数据层：没有云服务（或云端不可用）时的降级实现。
// 数据落在 wx.storage，接口形状与云端表一致，方便 store.js 无感切换。
// 表结构对齐：comments / spot_favs / shared_trips。

const K_COMMENTS = 'xingji-local-comments-v1';
const K_FAVS = 'xingji-local-favs-v1';
const K_SHARED = 'xingji-local-shared-v1';

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v || fallback;
  } catch (e) { return fallback; }
}

function write(key, value) {
  try { wx.setStorageSync(key, value); } catch (e) { /* 存储满时静默 */ }
}

function nextId(list) {
  let max = 0;
  (list || []).forEach(function (x) { if (Number(x.id) > max) max = Number(x.id); });
  return max + 1;
}

// ---------- comments ----------
function listComments(spotKey) {
  const all = read(K_COMMENTS, []);
  return all
    .filter(function (c) { return c.spot_key === spotKey; })
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, 50);
}

function addComment(row) {
  const all = read(K_COMMENTS, []);
  const item = Object.assign({}, row, {
    id: nextId(all),
    likes: 0,
    created_at: new Date().toISOString()
  });
  all.push(item);
  write(K_COMMENTS, all);
  return item;
}

function likeComment(id, likes) {
  const all = read(K_COMMENTS, []);
  for (let i = 0; i < all.length; i++) {
    if (Number(all[i].id) === Number(id)) {
      all[i].likes = Number(likes) || 0;
      write(K_COMMENTS, all);
      return true;
    }
  }
  return false;
}

// ---------- spot_favs ----------
function listFavs() { return read(K_FAVS, []); }

function addFav(row) {
  const all = read(K_FAVS, []);
  const dup = all.some(function (f) {
    return f.spot_key === row.spot_key && f.device_id === row.device_id;
  });
  if (!dup) {
    all.push(Object.assign({}, row, { created_at: new Date().toISOString() }));
    write(K_FAVS, all);
  }
  return true;
}

function removeFav(spotKey, deviceId) {
  const all = read(K_FAVS, []).filter(function (f) {
    return !(f.spot_key === spotKey && f.device_id === deviceId);
  });
  write(K_FAVS, all);
  return true;
}

// ---------- shared_trips ----------
function saveShared(code, payload) {
  const all = read(K_SHARED, {});
  all[code] = Object.assign({ code: code }, payload);
  write(K_SHARED, all);
  return all[code];
}

function getShared(code) {
  const all = read(K_SHARED, {});
  return all[code] || null;
}

module.exports = {
  listComments, addComment, likeComment,
  listFavs, addFav, removeFav,
  saveShared, getShared
};
