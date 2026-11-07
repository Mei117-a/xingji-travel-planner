const data = require('../../utils/data');
const ai = require('../../utils/ai');

const GO_MODES = ['plane', 'train', 'bus', 'car'];
const HOTEL_LEVELS = ['econ', 'comfort', 'lux'];

Page({
  data: {
    cities: [],
    fromCity: '北京',
    toCity: '上海',
    days: 4,
    travelers: 2,
    budget: 6000,
    goModeIndex: 0,
    backModeIndex: 1,
    hotelIndex: 1,
    modeLabels: [],
    hotelLabels: [],
    prefs: [],
    prefChips: [],
    // AI 状态：idle | streaming | done | error
    aiState: 'idle',
    aiText: '',
    aiModel: '',
    aiError: '',
    generating: false
  },

  onLoad() {
    const g = getApp().globalData;
    this.setData({
      cities: g.cities,
      modeLabels: Object.keys(data.MODES).map(k => data.MODES[k].label),
      hotelLabels: Object.values(data.HOTEL_LABEL),
      prefChips: data.PREFS.map(p => ({ name: p, on: false }))
    });
  },

  onShow() {
    // 从景点页返回时保持输入不变
  },

  onFromChange(e) { this.setData({ fromCity: this.data.cities[Number(e.detail.value)] || this.data.fromCity }); },
  onToChange(e) { this.setData({ toCity: this.data.cities[Number(e.detail.value)] || this.data.toCity }); },
  onGoModeChange(e) { this.setData({ goModeIndex: Number(e.detail.value) }); },
  onBackModeChange(e) { this.setData({ backModeIndex: Number(e.detail.value) }); },
  onHotelChange(e) { this.setData({ hotelIndex: Number(e.detail.value) }); },
  onDays(e) { this.setData({ days: Math.min(30, Math.max(1, parseInt(e.detail.value, 10) || 1)) }); },
  onTravelers(e) { this.setData({ travelers: Math.min(9, Math.max(1, parseInt(e.detail.value, 10) || 1)) }); },
  onBudget(e) { this.setData({ budget: Math.max(0, Number(e.detail.value) || 0) }); },

  togglePref(e) {
    const name = e.currentTarget.dataset.pref;
    const chips = this.data.prefChips.map(c => c.name === name ? { name: c.name, on: !c.on } : c);
    const prefs = chips.filter(c => c.on).map(c => c.name);
    this.setData({ prefChips: chips, prefs });
  },

  collectDemand() {
    const d = this.data;
    if (!d.fromCity || !d.toCity) { wx.showToast({ title: '请选择城市', icon: 'none' }); return null; }
    if (d.fromCity === d.toCity) { wx.showToast({ title: '目的地不能与出发地相同', icon: 'none' }); return null; }
    if (!(Number(d.budget) > 0)) { wx.showToast({ title: '请填写总预算', icon: 'none' }); return null; }
    return {
      from: d.fromCity, to: d.toCity,
      days: d.days, travelers: d.travelers, budget: d.budget,
      goMode: GO_MODES[d.goModeIndex] || 'train',
      backMode: GO_MODES[d.backModeIndex] || 'train',
      hotelLevel: HOTEL_LEVELS[d.hotelIndex] || 'comfort',
      prefs: d.prefs.slice(),
      startDate: data.addDays(new Date().toISOString().slice(0, 10), 7)
    };
  },

  smartGenerate() {
    const demand = this.collectDemand();
    if (!demand) return;
    const plan = data.buildPlan(demand);
    plan.tips = [];
    plan.source = 'local';
    getApp().saveTrip(plan, demand);
    wx.showToast({ title: '已生成行程', icon: 'success' });
    setTimeout(() => wx.switchTab({ url: '/pages/trip/trip' }), 400);
  },

  async aiGenerate() {
    if (this.data.aiState === 'streaming') return;
    const demand = this.collectDemand();
    if (!demand) return;
    this.setData({ aiState: 'streaming', aiText: '', aiError: '', aiModel: '', generating: true });
    let buffer = '';
    let flushTimer = null;
    const flush = () => {
      flushTimer = null;
      if (buffer) {
        this.setData({ aiText: this.data.aiText + buffer });
        buffer = '';
      }
    };
    try {
      const result = await ai.planWithAI(demand, (frag) => {
        buffer += frag;
        if (!flushTimer) flushTimer = setTimeout(flush, 120);
      });
      clearTimeout(flushTimer);
      const plan = result.plan;
      getApp().saveTrip(plan, demand);
      this.setData({
        aiState: 'done',
        aiText: this.data.aiText,
        aiModel: result.model,
        generating: false
      });
      wx.showToast({ title: 'AI 行程已生成', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/trip/trip' }), 600);
    } catch (err) {
      clearTimeout(flushTimer);
      const fallback = err && (err.code === 'PARSE_FAIL' || err.code === 'NO_MODEL');
      this.setData({
        aiState: 'error',
        generating: false,
        aiError: (err && err.message) || 'AI 规划失败，请重试'
      });
      if (fallback) {
        wx.showToast({ title: '已回退到智能生成', icon: 'none' });
        const plan = data.buildPlan(demand);
        plan.tips = [];
        plan.source = 'local';
        getApp().saveTrip(plan, demand);
      }
    }
  },

  useLocalInstead() {
    const demand = this.collectDemand();
    if (!demand) return;
    const plan = data.buildPlan(demand);
    plan.tips = [];
    plan.source = 'local';
    getApp().saveTrip(plan, demand);
    wx.switchTab({ url: '/pages/trip/trip' });
  },

  goSpots() {
    wx.switchTab({ url: '/pages/spots/spots' });
  },

  onShareAppMessage() {
    return {
      title: '背上行馕就出发！行迹 · 一键规划旅行路线',
      path: '/pages/plan/plan'
    };
  }
});
