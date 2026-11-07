const data = require('../../utils/data');
const social = require('../../utils/social');

const FILTERS = ['全部', '人文', '美食', '自然', '休闲'];

Page({
  data: {
    cities: [],
    cityIndex: 0,
    city: '北京',
    spots: [],          // 全量
    shown: [],          // 筛选后展示
    filters: FILTERS,
    filterIndex: 0,
    favCount: 0
  },

  onLoad() {
    const g = getApp().globalData;
    this.setData({ cities: g.cities });
  },

  onShow() {
    // 目的地变化时跟随切换景点库；收藏状态每次进入都刷新
    const g = getApp().globalData;
    const target = (g.demand && g.demand.to) || this.data.city;
    const idx = this.data.cities.indexOf(target);
    this.setCity(idx > -1 ? idx : this.data.cityIndex);
    this.refreshWantCounts();
  },

  // 云端「想去」人数（异步，不阻塞列表渲染）
  async refreshWantCounts() {
    const counts = await social.fetchWantCounts();
    const spots = this.data.spots.map(s => Object.assign({}, s, {
      want: counts[data.spotKey(this.data.city, s.name)] || 0
    }));
    this.setData({ spots });
    this.applyFilter();
  },

  onCityChange(e) {
    this.setCity(Number(e.detail.value));
  },

  setCity(idx) {
    const city = this.data.cities[idx] || '北京';
    const spots = data.spotsOf(city).map((s, i) => ({
      idx: i,
      name: s.name,
      tag: s.tag,
      ticket: s.ticket > 0 ? '门票 ¥' + s.ticket : '免费',
      hours: s.hours,
      dur: s.dur,
      desc: s.desc,
      img: s.img ? '/assets/spots/' + s.img + '.jpg' : '',
      initial: s.name.slice(0, 1),
      fav: data.isFav(data.spotKey(city, s.name))
    }));
    this.setData({
      cityIndex: idx, city, spots,
      favCount: spots.filter(s => s.fav).length
    });
    this.applyFilter();
  },

  applyFilter() {
    const tag = this.data.filters[this.data.filterIndex];
    const shown = this.data.spots.filter(s =>
      (tag === '全部' || s.tag === tag) && (!this.data.onlyFav || s.fav)
    );
    this.setData({ shown });
  },

  onFilterChange(e) {
    this.setData({ filterIndex: Number(e.currentTarget.dataset.i) });
    this.applyFilter();
  },

  onToggleFavOnly() {
    this.setData({ onlyFav: !this.data.onlyFav });
    this.applyFilter();
  },

  onToggleFav(e) {
    const { name } = e.currentTarget.dataset;
    const key = data.spotKey(this.data.city, name);
    const added = data.toggleFav(key);
    const spots = this.data.spots.map(s =>
      s.name === name ? Object.assign({}, s, { fav: added, want: Math.max(0, (s.want || 0) + (added ? 1 : -1)) }) : s
    );
    this.setData({ spots, favCount: spots.filter(s => s.fav).length });
    this.applyFilter();
    // 云端同步（失败不影响本地收藏）
    (added ? social.cloudAddWant(key, name, this.data.city) : social.cloudRemoveWant(key))
      .catch(() => {});
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none', duration: 800 });
  },

  openDetail(e) {
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url: '/pages/detail/detail?city=' + encodeURIComponent(this.data.city) + '&name=' + encodeURIComponent(name)
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.city + '的景点都在这里 · 行迹',
      path: '/pages/spots/spots'
    };
  }
});
