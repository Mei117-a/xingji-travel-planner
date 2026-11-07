// 云服务客户端：全局唯一实例。
// endpoint / publishableKey 来自 WorkBuddy 云服务开通时返回的 publicConfig，
// 二者都是端侧公开配置（服务端按应用校验），不含任何私密凭证。
//
// 两种状态：
//   1) 已装依赖 + 填了配置 -> 真实云端（AI 规划、跨设备评论、搭子协作）
//   2) 缺任一项         -> cloud 为 null，store.js 自动走本机演示模式
// 这样别人 clone 下来，即使不装依赖、不配云服务，也能直接编译预览。
let createMiniProgramWorkBuddyCloud = null;
try {
  createMiniProgramWorkBuddyCloud = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
    .createMiniProgramWorkBuddyCloud;
} catch (e) {
  console.warn('[cloud] 未找到 @tencent-ai/workbuddy-cloud-sdk，将以本机演示模式运行');
}

// 改成自己的云服务配置即可（开通方式见 README「接入自己的云服务」）。
// 下面这组是端侧公开配置（会打包进代码，非私密凭证），保留它可以让 clone 者
// 直接体验 AI 规划与云端评论；担心共用配额时换成自己的即可。
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_tFtcIPB71gB62VHuekorJI_sbr1oB0P12MQkqNPEg8vUAF0EYE97G9R',
};

let cloud = null;
if (createMiniProgramWorkBuddyCloud && publicConfig.endpoint && publicConfig.publishableKey) {
  try {
    const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');
    cloud = createMiniProgramWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      publishableKey: publicConfig.publishableKey,
      wx: createDiagnosticWx(wx),
    });
  } catch (e) {
    console.warn('[cloud] 云客户端初始化失败，回退本机演示模式：', e && e.message);
    cloud = null;
  }
}

module.exports = { cloud, publicConfig, available: !!cloud };
