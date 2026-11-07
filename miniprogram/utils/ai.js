// AI 行程规划：调用 WorkBuddy 云服务 LLM（免密钥）。
// 只输出结构化 JSON，解析失败时由调用方回退到本地智能排程。
const { cloud } = require('./cloud');
const data = require('./data');

function buildPrompt(demand) {
  const spots = data.spotsOf(demand.to);
  const pool = spots.map(s => s.name + "(门票" + s.ticket + "元," + s.dur + "小时)").join("、");
  return [
    "请规划一次旅行：",
    "出发城市：" + demand.from + "；目的地：" + demand.to + "；",
    "共 " + demand.days + " 天，" + demand.travelers + " 人，总预算 " + demand.budget + " 元。",
    "偏好：" + ((demand.prefs && demand.prefs.length) ? demand.prefs.join("、") : "不限") + "。",
    "候选景点（尽量从中选择，也可补充其他知名地点）：" + pool + "。",
    "",
    "要求：",
    "1. 第一天含抵达，最后一天含返程；每天 5-8 条安排（含三餐与游玩）。",
    "2. cost 为人均花费（数字，单位元），交通写 0 由系统估算。",
    "3. 同一天的景点尽量地理相近；合理安排时间，从早到晚。",
    "",
    '只输出 JSON，不要输出任何其他文字：{"days":[{"title":"天标题","items":[{"time":"09:30","text":"安排内容","cost":0}]}],"tips":["实用建议1","实用建议2"]}'
  ].join("\n");
}

function normalizePlan(json, demand) {
  if (!json || !Array.isArray(json.days) || !json.days.length) return null;
  const days = json.days.slice(0, Math.max(1, parseInt(demand.days, 10) || 1)).map((d, di) => ({
    title: (d && d.title) ? String(d.title).slice(0, 20) : "第 " + (di + 1) + " 天",
    items: (d && Array.isArray(d.items) ? d.items : []).map(it => ({
      id: data.uid(),
      kind: "spot",
      time: (it && it.time) ? String(it.time).slice(0, 5) : "",
      text: (it && it.text) ? String(it.text).slice(0, 30) : "自由活动",
      cost: Math.max(0, Number(it && it.cost) || 0)
    })).filter(it => it.text)
  })).filter(d => d.items.length);
  if (!days.length) return null;
  const tips = (Array.isArray(json.tips) ? json.tips : [])
    .map(t => String(t).slice(0, 60)).filter(Boolean).slice(0, 4);
  return { days, tips, source: "ai" };
}

function extractJSON(text) {
  if (!text) return null;
  let t = String(text).replace(/```json|```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch (err) { return null; }
}

async function listModels() {
  if (!cloud) {
    const err = new Error('未配置云服务，已切换到智能生成');
    err.code = 'NO_MODEL';
    throw err;
  }
  const models = await cloud.llm.models.list();
  return Array.isArray(models) ? models.filter(m => m.disabled !== true) : [];
}

// onDelta(textFragment) 用于流式渲染；返回 { plan, tips, raw, model }
async function planWithAI(demand, onDelta) {
  const models = await listModels();
  if (!models.length) {
    const err = new Error("暂无可用模型，请稍后再试或使用智能生成");
    err.code = "NO_MODEL";
    throw err;
  }
  const model = models[0];
  let full = "";
  for await (const chunk of cloud.llm.chat.completions.create({
    model: model.id,
    messages: [
      { role: "system", content: "你是资深旅行规划师，输出严格遵循用户要求的 JSON 格式，不输出任何解释。" },
      { role: "user", content: buildPrompt(demand) }
    ],
    stream: true,
    temperature: 0.7
  })) {
    const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (delta && delta.content) {
      full += delta.content;
      if (onDelta) onDelta(delta.content);
    }
  }
  const parsed = normalizePlan(extractJSON(full), demand);
  if (!parsed) {
    const err = new Error("AI 返回的内容没能解析成行程，请重试或使用智能生成");
    err.code = "PARSE_FAIL";
    err.raw = full;
    throw err;
  }
  return { plan: parsed, model: model.name || model.id, raw: full };
}

module.exports = { planWithAI, listModels };
