const { cloud } = require('./utils/cloud');
const { CITIES } = require('./utils/data');

App({
  globalData: {
    appName: '行迹',
    cities: Object.keys(CITIES),
    // 当前行程（plan 页生成，trip 页展示编辑；同时落 wx.storage）
    plan: null,
    demand: null,
  },

  ensureSession() {
    // 未配置云服务（本机演示模式）时直接返回 null，不阻塞页面
    if (!cloud) return Promise.resolve(null);
    if (!this.sessionPromise) {
      this.sessionPromise = cloud.auth.getSession().catch((e) => {
        this.sessionPromise = null;
        throw e;
      });
    }
    return this.sessionPromise;
  },

  resetSession() {
    this.sessionPromise = null;
  },

  loadSavedTrip() {
    try {
      const raw = wx.getStorageSync('xingji-trip-v1');
      if (raw && raw.plan && Array.isArray(raw.plan.days)) {
        this.globalData.plan = raw.plan;
        this.globalData.demand = raw.demand || null;
        return raw;
      }
    } catch (e) { /* 本地存储不可用时忽略 */ }
    return null;
  },

  saveTrip(plan, demand) {
    this.globalData.plan = plan;
    this.globalData.demand = demand || null;
    try {
      wx.setStorageSync('xingji-trip-v1', { plan, demand: demand || null });
    } catch (e) { /* 忽略 */ }
  },
});
