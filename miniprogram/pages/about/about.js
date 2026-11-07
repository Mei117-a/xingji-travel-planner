Page({
  data: {
    teamName: '新疆馕队',
    leader: '马玉梅',
    members: ['马玉梅', '王倩', '张一鸣', '尹寅忠', '王谷雨'],
    advisor: '韩子伟',
    version: 'v1.2'
  },

  onShareAppMessage() {
    return {
      title: '背上行馕就出发！行迹 · 一键规划你的旅行路线',
      path: '/pages/plan/plan'
    };
  }
});
