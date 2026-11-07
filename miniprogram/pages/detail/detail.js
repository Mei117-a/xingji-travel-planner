const data = require('../../utils/data');
const store = require('../../utils/store');
const social = require('../../utils/social');

const QUICK_TAGS = ['避雷', '必吃', '拍照机位', '路线建议'];

const NICK_KEY = 'xingji-nick';

Page({
  data: {
    loaded: false,
    name: '',
    city: '',
    img: '',
    initial: '',
    tag: '',
    ticket: '',
    hours: '',
    dur: '',
    desc: '',
    comments: [],
    commentCount: 0,
    nick: '',
    content: '',
    posting: false,
    loadingComments: true,
    commentError: '',
    fav: false,
    wantText: '',
    localMode: false,
    quickTags: QUICK_TAGS,
    sortMode: 'new'   // new = 最新，hot = 最热
  },

  onLoad(query) {
    const city = decodeURIComponent(query.city || '');
    const name = decodeURIComponent(query.name || '');
    const spot = data.spotsOf(city).find(s => s.name === name);
    let nick = '';
    try { nick = wx.getStorageSync(NICK_KEY) || ''; } catch (e) { /* 忽略 */ }
    this.setData({
      city, name,
      img: spot && spot.img ? '/assets/spots/' + spot.img + '.jpg' : '',
      initial: name.slice(0, 1),
      tag: spot ? spot.tag : '',
      ticket: spot ? (spot.ticket > 0 ? '门票 ¥' + spot.ticket + '（参考价）' : '免费开放') : '',
      hours: spot ? spot.hours : '',
      dur: spot ? spot.dur + ' 小时' : '',
      desc: spot ? spot.desc : '',
      nick,
      fav: data.isFav(data.spotKey(city, name)),
      loaded: true
    });
    this.spotKey = data.spotKey(city, name);
    this.loadComments();
    this.refreshWant();
  },

  async refreshWant() {
    const counts = await social.fetchWantCounts();
    const n = counts[this.spotKey] || 0;
    this.setData({ wantText: n > 0 ? n + ' 人想去' : '' });
  },

  onToggleFav() {
    const added = data.toggleFav(data.spotKey(this.data.city, this.data.name));
    this.setData({ fav: added });
    // 云端同步（失败不影响本地收藏）
    (added
      ? social.cloudAddWant(this.spotKey, this.data.name, this.data.city)
      : social.cloudRemoveWant(this.spotKey)
    ).then(() => this.refreshWant()).catch(() => {});
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none', duration: 800 });
  },

  onShareAppMessage() {
    return {
      title: this.data.name + ' · ' + this.data.city + '旅行攻略',
      path: '/pages/detail/detail?city=' + encodeURIComponent(this.data.city) + '&name=' + encodeURIComponent(this.data.name)
    };
  },

  async loadComments() {
    this.setData({ loadingComments: true, commentError: '' });
    const res = await store.listComments(this.spotKey);
    const rows = res.data;
    this.setData({ localMode: res.mode === 'local' });
    if (res.error) {
      this.setData({
        loadingComments: false,
        commentError: '评论加载失败：' + (res.error.message || '请稍后再试')
      });
      return;
    }
    this.allComments = (rows || []).map(r => ({
      id: r.id,
      nickname: r.nickname || '旅行者',
      content: r.content,
      likes: Number(r.likes) || 0,
      liked: social.isLiked(r.id),
      time: this.fmtTime(r.created_at)
    }));
    this.applySort();
  },

  applySort() {
    const list = (this.allComments || []).slice();
    if (this.data.sortMode === 'hot') {
      list.sort((a, b) => b.likes - a.likes || (a.id < b.id ? 1 : -1));
    }
    this.setData({ loadingComments: false, comments: list, commentCount: list.length });
  },

  onSortChange(e) {
    this.setData({ sortMode: e.currentTarget.dataset.mode });
    this.applySort();
  },

  async onLike(e) {
    const id = Number(e.currentTarget.dataset.id);
    const c = (this.allComments || []).find(x => x.id === id);
    if (!c || c.liked) return;
    c.liked = true; c.likes += 1;
    social.markLiked(id);
    this.applySort();
    try { await social.likeComment(id, c.likes - 1); } catch (err) { /* 静默：下次进入重试 */ }
  },

  onQuickTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const cur = this.data.content;
    const piece = '【' + tag + '】';
    if (cur.indexOf(piece) === 0) return;
    this.setData({ content: (piece + cur).slice(0, 200) });
  },

  fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  onNick(e) {
    const nick = String(e.detail.value || '').slice(0, 12);
    this.setData({ nick });
    try { wx.setStorageSync(NICK_KEY, nick); } catch (e) { /* 忽略 */ }
  },

  onContent(e) {
    this.setData({ content: String(e.detail.value || '').slice(0, 200) });
  },

  async post() {
    if (this.data.posting) return;
    const content = this.data.content.trim();
    if (!content) { wx.showToast({ title: '说点什么再发布吧', icon: 'none' }); return; }
    this.setData({ posting: true });
    // 昵称为空时送一个馕队主题随机昵称，并记住方便下次沿用
    let nick = (this.data.nick || '').trim();
    if (!nick) {
      nick = social.randomNick();
      social.rememberNick(nick);
      this.setData({ nick });
    }
    const res = await store.addComment({
      spot_key: this.spotKey,
      spot_name: this.data.name,
      city: this.data.city,
      nickname: nick,
      content: content
    });
    this.setData({ posting: false });
    if (res.error) {
      wx.showToast({ title: '发布失败：' + (res.error.message || '稍后再试'), icon: 'none' });
      return;
    }
    this.setData({ content: '' });
    wx.showToast({ title: '已发布', icon: 'success' });
    this.loadComments();
  }
});
