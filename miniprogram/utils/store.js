// 统一数据访问层：云端优先，失败自动降级到本机存储。
// 页面对这里发请求，不直接碰 cloud / localdb，于是「没配云服务」也能完整演示。
const { cloud } = require('./cloud');
const localdb = require('./localdb');

// cloud = 已配置且未出错；local = 本机演示模式
let mode = cloud ? 'cloud' : 'local';

function getMode() { return mode; }

function degrade(err) {
  if (mode !== 'local') {
    mode = 'local';
    console.warn('[store] 云端不可用，已切换到本机演示模式：', err && (err.message || err));
  }
}

function ok(data) { return { data: data, error: null, mode: mode }; }
function fail(error) { return { data: null, error: error, mode: mode }; }

// ---------- 「想去」计数 ----------
async function wantCounts() {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('spot_favs').select('spot_key').limit(5000);
      if (res.error) throw res.error;
      const counts = {};
      (res.data || []).forEach(function (r) {
        counts[r.spot_key] = (counts[r.spot_key] || 0) + 1;
      });
      return ok(counts);
    } catch (e) {
      degrade(e);
    }
  }
  const counts = {};
  localdb.listFavs().forEach(function (r) {
    counts[r.spot_key] = (counts[r.spot_key] || 0) + 1;
  });
  return ok(counts);
}

async function addWant(spotKey, spotName, city, deviceId) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('spot_favs')
        .insert({ spot_key: spotKey, spot_name: spotName, city: city, device_id: deviceId });
      if (res.error) throw res.error;
      return ok(true);
    } catch (e) {
      degrade(e);
    }
  }
  localdb.addFav({ spot_key: spotKey, spot_name: spotName, city: city, device_id: deviceId });
  return ok(true);
}

async function removeWant(spotKey, deviceId) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('spot_favs')
        .delete().eq('device_id', deviceId).eq('spot_key', spotKey);
      if (res.error) throw res.error;
      return ok(true);
    } catch (e) {
      degrade(e);
    }
  }
  localdb.removeFav(spotKey, deviceId);
  return ok(true);
}

// ---------- 评论 ----------
async function listComments(spotKey) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('comments')
        .select('id,nickname,content,likes,created_at')
        .eq('spot_key', spotKey)
        .order('created_at', { ascending: false })
        .limit(50);
      if (res.error) throw res.error;
      return ok(res.data || []);
    } catch (e) {
      degrade(e);
    }
  }
  return ok(localdb.listComments(spotKey));
}

async function addComment(row) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('comments').insert(row).select();
      if (res.error) throw res.error;
      return ok(res.data || true);
    } catch (e) {
      degrade(e);
    }
  }
  return ok(localdb.addComment(row));
}

async function likeComment(id, likes) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('comments').update({ likes: likes }).eq('id', id);
      if (res.error) throw res.error;
      return ok(true);
    } catch (e) {
      degrade(e);
    }
  }
  localdb.likeComment(id, likes);
  return ok(true);
}

// ---------- 搭子共享行程 ----------
async function saveShared(code, payload) {
  if (mode === 'cloud') {
    try {
      const upd = await cloud.database.from('shared_trips').update(payload).eq('code', code).select();
      if (upd.error) throw upd.error;
      if (!upd.data || !upd.data.length) {
        const ins = await cloud.database.from('shared_trips').insert(Object.assign({ code: code }, payload));
        if (ins.error) throw ins.error;
      }
      return ok(true);
    } catch (e) {
      degrade(e);
    }
  }
  localdb.saveShared(code, payload);
  return ok(true);
}

async function getShared(code) {
  if (mode === 'cloud') {
    try {
      const res = await cloud.database.from('shared_trips')
        .select('code,title,plan,demand,updated_by,updated_at').eq('code', code).limit(1);
      if (res.error) throw res.error;
      return ok(res.data && res.data[0] ? res.data[0] : null);
    } catch (e) {
      degrade(e);
    }
  }
  return ok(localdb.getShared(code));
}

module.exports = {
  getMode, degrade,
  wantCounts, addWant, removeWant,
  listComments, addComment, likeComment,
  saveShared, getShared
};
