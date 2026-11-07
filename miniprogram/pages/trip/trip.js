const data = require('../../utils/data');
const store = require('../../utils/store');
const social = require('../../utils/social');

const KIND_ICON = { spot: '景', meal: '食', free: '闲', go: '行', back: '行', hotel: '宿', checkout: '宿' };
const DAY_COLORS = ['#12584a', '#c9762b', '#3b6ea5', '#8a5aa8', '#c0392b', '#2b8a78'];

// ---------- 海报绘制辅助 ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsis(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function drawThumb(ctx, canvas, x, y, w, h, spot) {
  return new Promise(resolve => {
    const done = img => {
      ctx.save();
      roundRect(ctx, x, y, w, h, 14);
      ctx.clip();
      if (img) {
        // cover 模式绘制
        const ir = img.width / img.height, br = w / h;
        let dw = w, dh = h, dx = x, dy = y;
        if (ir > br) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; }
        else { dw = w; dh = w / ir; dy = y - (dh - h) / 2; }
        ctx.drawImage(img, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = '#eaf4f0';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#12584a';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((spot.name || '景').slice(0, 1), x + w / 2, y + h / 2 - 24);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.strokeStyle = '#eae3d8';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 14);
      ctx.stroke();
      resolve();
    };
    if (!spot.src) { done(null); return; }
    const img = canvas.createImage();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = spot.src;
  });
}

Page({
  data: {
    hasPlan: false,
    days: [],
    totals: null,
    summaryLines: [],
    markers: [],
    polyline: [],
    mapCenter: { lat: 39.9, lng: 116.4 },
    hasSpots: false,
    tips: [],
    sourceLabel: '',
    // 搭子协作
    buddyCode: '',
    buddyBy: '',
    buddyAt: '',
    buddyLocal: false,
    joinCode: '',
    buddyBusy: false,
    posterBusy: false
  },

  onLoad(query) {
    // 分享卡片可带 ?code=XXXX，记住等 onShow 渲染完再拉取
    if (query && query.code) this.pendingJoinCode = String(query.code).toUpperCase();
  },

  fmtBuddyTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  onShow() {
    const g = getApp();
    const saved = g.loadSavedTrip();
    if (!saved) {
      this.setData({ hasPlan: false });
    } else {
      this.render(saved.plan, saved.demand);
    }
    // 从分享卡片进来：自动加入搭子行程
    if (this.pendingJoinCode && !this.data.buddyCode) {
      const code = this.pendingJoinCode;
      this.pendingJoinCode = null;
      this.setData({ joinCode: code });
      this.onJoin();
    }
  },

  render(plan, demand) {
    const totals = data.computeTotals(demand, plan);
    const itemsOf = [];
    plan.days.forEach((day, di) => {
      const dateLabel = data.fmtMD(data.addDays(demand.startDate, di)) + ' ' + data.weekdayCN(data.addDays(demand.startDate, di));
      let sub = 0;
      const items = day.items.map((it, ii) => {
        const isSys = data.SYSTEM_KINDS.indexOf(it.kind) > -1;
        const amount = isSys ? data.systemAmount(it.kind, demand) : Math.max(0, Number(it.cost) || 0);
        sub += amount;
        return {
          id: it.id, kind: it.kind, di, ii,
          isSys,
          icon: KIND_ICON[it.kind] || '行',
          time: it.time || '',
          text: it.text || '',
          cost: isSys ? '' : String(Math.max(0, Number(it.cost) || 0)),
          amountText: isSys ? (amount > 0 ? data.money(amount) : '—') : data.money(amount * totals.ppl),
          isSpot: it.kind === 'spot',
          spotKey: it.spotKey || '',
          desc: it.desc || ''
        };
      });
      itemsOf.push({ di, title: day.title, dateLabel, subText: data.money(sub), items });
    });

    // 地图点位与连线（每天一种颜色，直观看出每天的动线）
    const markers = [];
    const polylines = [];
    plan.days.forEach((day, di) => {
      const color = DAY_COLORS[di % DAY_COLORS.length];
      const dayPoints = [];
      day.items.forEach(it => {
        if (it.kind === 'spot' && isFinite(Number(it.lat)) && isFinite(Number(it.lng))) {
          markers.push({
            id: markers.length,
            latitude: Number(it.lat),
            longitude: Number(it.lng),
            iconPath: '/assets/marker-' + (di % DAY_COLORS.length) + '.png',
            width: 30, height: 30,
            callout: {
              content: 'Day' + (di + 1) + ' ' + (it.text || ''),
              display: 'BYCLICK', fontSize: 12, borderRadius: 6, padding: 6,
              bgColor: '#ffffff', color: '#211d19'
            },
            spotCity: demand.to,
            spotName: it.text
          });
          dayPoints.push({ latitude: Number(it.lat), longitude: Number(it.lng) });
        }
      });
      if (dayPoints.length > 1) {
        polylines.push({ points: dayPoints, color: color + 'aa', width: 3, dottedLine: true, arrowLine: false });
      }
    });
    const cityCoord = data.CITIES[demand.to];
    this.setData({
      hasPlan: true,
      days: itemsOf,
      totals: {
        totalText: data.money(totals.total),
        transportText: data.money(totals.transport),
        hotelText: data.money(totals.hotel),
        actText: data.money(totals.act),
        remainText: (totals.remain < 0 ? '-' : '') + data.money(Math.abs(totals.remain)),
        over: totals.remain < 0,
        ppl: totals.ppl,
        nights: totals.nights,
        rooms: totals.rooms
      },
      summaryLines: [
        '交通 ' + data.money(totals.transport) + ' · 住宿 ' + data.money(totals.hotel) +
          '（' + totals.nights + '晚×' + totals.rooms + '间）· 游玩餐饮 ' + data.money(totals.act) + '（人均×' + totals.ppl + '）'
      ],
      markers,
      hasSpots: markers.length > 0,
      polyline: polylines,
      mapCenter: cityCoord ? { lat: cityCoord[0], lng: cityCoord[1] }
        : (points[0] ? { lat: points[0].latitude, lng: points[0].longitude } : { lat: 39.9, lng: 116.4 }),
      tips: plan.tips || [],
      sourceLabel: plan.source === 'ai' ? 'AI 规划' : '智能生成'
    });
    this.demand = demand;
    this.plan = plan;
  },

  onItemInput(e) {
    const { day, item, field } = e.currentTarget.dataset;
    const d = this.plan && this.plan.days[Number(day)];
    if (!d || !d.items[Number(item)]) return;
    if (field === 'cost') d.items[Number(item)].cost = Math.max(0, Number(e.detail.value) || 0);
    else if (field === 'text') d.items[Number(item)].text = e.detail.value;
    else if (field === 'time') d.items[Number(item)].time = e.detail.value;
    getApp().saveTrip(this.plan, this.demand);
    // 只刷新金额区，避免输入过程重排整个列表
    const totals = data.computeTotals(this.demand, this.plan);
    this.setData({
      'totals.totalText': data.money(totals.total),
      'totals.actText': data.money(totals.act),
      'totals.remainText': (totals.remain < 0 ? '-' : '') + data.money(Math.abs(totals.remain)),
      'totals.over': totals.remain < 0
    });
  },

  onItemDone(e) {
    // 输入结束（失焦）后整表刷新小计
    this.render(this.plan, this.demand);
    this.autoSync();
  },

  onMove(e) {
    const { day, item, dir } = e.currentTarget.dataset;
    const items = this.plan.days[Number(day)].items;
    const i = Number(item), j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return;
    const t = items[i]; items[i] = items[j]; items[j] = t;
    getApp().saveTrip(this.plan, this.demand);
    this.render(this.plan, this.demand);
    this.autoSync();
  },

  onDelete(e) {
    const { day, item } = e.currentTarget.dataset;
    const di = Number(day), ii = Number(item);
    const removed = this.plan.days[di].items.splice(ii, 1)[0];
    const restore = () => {
      const d2 = this.plan.days[di];
      if (!d2) return;
      d2.items.splice(Math.min(ii, d2.items.length), 0, removed);
      getApp().saveTrip(this.plan, this.demand);
      this.render(this.plan, this.demand);
    };
    getApp().saveTrip(this.plan, this.demand);
    this.render(this.plan, this.demand);
    this.autoSync();
    if (removed) {
      wx.showModal({
        title: '已删除',
        content: '「' + (removed.text || '未命名条目') + '」，撤销吗？',
        cancelText: '不撤销',
        confirmText: '撤销',
        success: (res) => { if (res.confirm) restore(); }
      });
    }
  },

  onAdd(e) {
    const di = Number(e.currentTarget.dataset.day);
    const day = this.plan.days[di];
    const last = day.items[day.items.length - 1];
    day.items.push({ id: data.uid(), kind: 'free', time: last ? last.time : '10:00', text: '新的安排', cost: 0 });
    getApp().saveTrip(this.plan, this.demand);
    this.render(this.plan, this.demand);
    this.autoSync();
  },

  onMarkerTap(e) {
    const m = this.data.markers.find(x => x.id === e.detail.markerId);
    if (!m) return;
    wx.navigateTo({
      url: '/pages/detail/detail?city=' + encodeURIComponent(m.spotCity) + '&name=' + encodeURIComponent(m.spotName)
    });
  },

  onItemTap(e) {
    const { spot } = e.currentTarget.dataset;
    if (!spot) return;
    wx.navigateTo({
      url: '/pages/detail/detail?city=' + encodeURIComponent(this.demand.to) + '&name=' + encodeURIComponent(spot)
    });
  },

  goPlan() { wx.switchTab({ url: '/pages/plan/plan' }); },

  // ---------- 旅游搭子协作 ----------
  genCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  },

  buddyNick() {
    return social.savedNick() || '旅行者';
  },

  // 把本地行程推到共享（upsert：先 update，无行再 insert）
  async pushBuddy(silent) {
    const code = this.data.buddyCode;
    if (!code || !this.plan || !this.demand) return;
    if (!silent) this.setData({ buddyBusy: true });
    const payload = {
      title: (this.demand.to || '行程') + '·' + (this.demand.days || this.plan.days.length) + '日',
      plan: this.plan,
      demand: this.demand,
      updated_by: this.buddyNick(),
      updated_at: new Date().toISOString()
    };
    try {
      const res = await store.saveShared(code, payload);
      if (res.error) throw res.error;
      const isLocal = res.mode === 'local';
      this.setData({
        buddyBy: payload.updated_by,
        buddyAt: this.fmtBuddyTime(payload.updated_at),
        buddyLocal: isLocal
      });
      if (!silent) {
        wx.showToast({ title: isLocal ? '已存到本机（演示）' : '已同步给搭子', icon: 'success' });
      }
    } catch (e) {
      if (!silent) wx.showToast({ title: '同步失败，稍后再试', icon: 'none' });
    }
    if (!silent) this.setData({ buddyBusy: false });
  },

  async fetchBuddy(code) {
    const res = await store.getShared(code);
    if (res.error) throw res.error;
    if (res.mode === 'local') this.setData({ buddyLocal: true });
    return res.data;
  },

  onInviteBuddy() {
    if (!this.plan) { wx.showToast({ title: '先生成一份行程', icon: 'none' }); return; }
    const code = this.data.buddyCode || this.genCode();
    this.setData({ buddyCode: code });
    this.pushBuddy(false);
  },

  onJoinInput(e) {
    this.setData({ joinCode: String(e.detail.value || '').toUpperCase() });
  },

  async onJoin() {
    if (this.data.buddyBusy) return;
    const code = (this.data.joinCode || '').trim().toUpperCase();
    if (code.length !== 6) { wx.showToast({ title: '搭子码是 6 位', icon: 'none' }); return; }
    this.setData({ buddyBusy: true });
    try {
      const row = await this.fetchBuddy(code);
      if (!row || !row.plan) {
        wx.showToast({ title: '没找到这个搭子码', icon: 'none' });
      } else {
        getApp().saveTrip(row.plan, row.demand || null);
        this.render(row.plan, row.demand || null);
        this.setData({
          buddyCode: code,
          buddyBy: row.updated_by || '旅行者',
          buddyAt: this.fmtBuddyTime(row.updated_at)
        });
        wx.showToast({ title: '已加入搭子行程', icon: 'success' });
      }
    } catch (e) {
      wx.showToast({ title: '加入失败，稍后再试', icon: 'none' });
    }
    this.setData({ buddyBusy: false });
  },

  async onPullBuddy() {
    if (this.data.buddyBusy) return;
    const code = this.data.buddyCode;
    if (!code) return;
    this.setData({ buddyBusy: true });
    try {
      const row = await this.fetchBuddy(code);
      if (row && row.plan) {
        getApp().saveTrip(row.plan, row.demand || null);
        this.render(row.plan, row.demand || null);
        this.setData({
          buddyBy: row.updated_by || '旅行者',
          buddyAt: this.fmtBuddyTime(row.updated_at)
        });
        wx.showToast({ title: '已拉取最新行程', icon: 'success' });
      }
    } catch (e) {
      wx.showToast({ title: '拉取失败，稍后再试', icon: 'none' });
    }
    this.setData({ buddyBusy: false });
  },

  onSyncBuddy() { this.pushBuddy(false); },

  // 有搭子时，每次编辑落定后静默自动同步
  autoSync() {
    if (this.data.buddyCode) this.pushBuddy(true);
  },

  onCopyCode() {
    wx.setClipboardData({ data: this.data.buddyCode });
  },

  // ---------- 行程规划图（canvas 海报，借景点图库 + 天色动线） ----------
  onMakePoster() {
    if (this.data.posterBusy || !this.plan || !this.demand) {
      if (!this.plan) wx.showToast({ title: '先生成一份行程', icon: 'none' });
      return;
    }
    this.setData({ posterBusy: true });
    wx.showLoading({ title: '正在生成…', mask: true });
    this.drawPoster()
      .then(path => {
        wx.hideLoading();
        this.setData({ posterBusy: false });
        wx.previewImage({ urls: [path] }); // 预览后长按即可保存 / 转发
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ posterBusy: false });
        wx.showToast({ title: '生成失败，再试一次', icon: 'none' });
      });
  },

  drawPoster() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#posterCanvas').fields({ node: true }).exec(async res => {
        try {
          if (!res || !res[0] || !res[0].node) return reject(new Error('no canvas'));
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const plan = this.plan, demand = this.demand;
          const W = 750, DAY_H = 260;
          const days = plan.days.slice(0, 8);
          const moreDays = plan.days.length - days.length;
          // 景点名 → 包内图片路径（借景点图库）
          const imgMap = {};
          (data.SPOT_DB[demand.to] || []).forEach(r => {
            if (r[7]) imgMap[r[0]] = '/assets/spots/' + r[7] + '.jpg';
          });
          const dayRows = days.map((day, di) => {
            const spots = day.items
              .filter(it => it.kind === 'spot')
              .map(it => ({ name: it.text || '', src: imgMap[it.text] || '' }))
              .slice(0, 4);
            return { di: di, color: DAY_COLORS[di % DAY_COLORS.length], spots: spots };
          });
          const H = 320 + dayRows.length * DAY_H + (moreDays > 0 ? 70 : 0) + 190;
          const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          ctx.scale(dpr, dpr);
          ctx.textBaseline = 'top';

          // 背景 + 头部
          ctx.fillStyle = '#f7f4ef';
          ctx.fillRect(0, 0, W, H);
          const grad = ctx.createLinearGradient(0, 0, 0, 320);
          grad.addColorStop(0, '#12584a');
          grad.addColorStop(1, '#1c7a67');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, 320);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 52px sans-serif';
          ctx.fillText('行迹 · 行程规划图', 40, 40);
          ctx.fillStyle = '#d8ebe3';
          ctx.font = '28px sans-serif';
          ctx.fillText((demand.to || '') + ' · ' + (demand.days || plan.days.length) + '天 · '
            + (demand.travelers || 1) + '人 · 预算 ¥' + (demand.budget || 0), 40, 116);
          ctx.fillStyle = '#ffd98a';
          ctx.font = 'bold 36px sans-serif';
          ctx.fillText('背上行馕就出发！', 40, 172);
          ctx.fillStyle = '#bcd8cf';
          ctx.font = '22px sans-serif';
          ctx.fillText('新疆馕队 · ' + (plan.source === 'ai' ? 'AI 规划' : '智能生成'), 40, 236);

          // 每天一行：天色徽标 + 景点图 + 名称 + 动线虚线
          let y = 350;
          for (const row of dayRows) {
            roundRect(ctx, 40, y, 140, 50, 25);
            ctx.fillStyle = row.color;
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 27px sans-serif';
            ctx.fillText('DAY ' + (row.di + 1), 66, y + 12);

            if (!row.spots.length) {
              ctx.fillStyle = '#9c9287';
              ctx.font = '24px sans-serif';
              ctx.fillText('当天以交通 / 自由活动为主', 40, y + 80);
              y += DAY_H;
              continue;
            }
            // 动线虚线画在图片层后面，缝隙里露出来
            ctx.strokeStyle = row.color;
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 8]);
            ctx.beginPath();
            ctx.moveTo(40 + 75, y + 100);
            ctx.lineTo(40 + 75 + (row.spots.length - 1) * 168, y + 100);
            ctx.stroke();
            ctx.setLineDash([]);
            let x = 40;
            for (const sp of row.spots) {
              await drawThumb(ctx, canvas, x, y + 70, 150, 110, sp);
              ctx.fillStyle = '#5f574d';
              ctx.font = '22px sans-serif';
              ctx.fillText(ellipsis(sp.name, 9), x, y + 188);
              x += 168;
            }
            y += DAY_H;
          }
          if (moreDays > 0) {
            ctx.fillStyle = '#9c9287';
            ctx.font = '24px sans-serif';
            ctx.fillText('… 还有 ' + moreDays + ' 天，见行程列表', 40, y + 6);
            y += 70;
          }

          // 底部
          ctx.fillStyle = '#c9762b';
          ctx.font = 'bold 32px sans-serif';
          ctx.fillText('背上行馕就出发！', 40, H - 130);
          ctx.fillStyle = '#9c9287';
          ctx.font = '22px sans-serif';
          ctx.fillText('行迹 · 新疆馕队 · 保存图片发到群里，和搭子一起讨论', 40, H - 74);

          wx.canvasToTempFilePath(
            { canvas: canvas, success: r => resolve(r.tempFilePath), fail: reject },
            this
          );
        } catch (e) { reject(e); }
      });
    });
  },

  onShareAppMessage() {
    const d = this.demand;
    if (this.data.buddyCode) {
      return {
        title: '来当我的旅游搭子，一起改' + (d && d.to ? d.to : '') + '的行程 · 行迹',
        path: '/pages/trip/trip?code=' + this.data.buddyCode
      };
    }
    const title = d && d.to
      ? '我的' + d.to + d.days + '日行程，来一起看看 · 行迹'
      : '行迹 · 一键规划你的旅行路线';
    return { title, path: '/pages/plan/plan' };
  }
});
