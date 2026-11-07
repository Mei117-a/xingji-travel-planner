const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "demo", "index.html"), "utf8");
const errors = [];

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/index.html",
  beforeParse(w) {
    w.print = () => {};
    w.confirm = () => true;
    w.Element.prototype.scrollIntoView = () => {};
    w.addEventListener("error", e => errors.push("window.error: " + e.message));
    const origError = w.console.error;
    w.console.error = (...a) => { errors.push("console.error: " + a.join(" ")); origError(...a); };
  }
});

const w = dom.window;
const d = w.document;
const $ = id => d.getElementById(id);
const $$ = sel => Array.from(d.querySelectorAll(sel));
const qs = sel => d.querySelector(sel);
const text = el => (el ? el.textContent.trim() : "<null>");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  → " + extra : "")); }
}
function fire(el, type) {
  el.dispatchEvent(new w.Event(type, { bubbles: true }));
}
function addDays(s, n) {
  const p = s.split("-").map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]) + n * 86400000).toISOString().slice(0, 10);
}
const spotTexts = di => $$('.day[data-day="' + di + '"] .item .txt').map(x => x.value);

console.log("\n[1] 初始渲染");
check("页面标题", d.title.includes("行迹"), d.title);
check("时间线生成 4 张日卡", $$(".day").length === 4, "实际 " + $$(".day").length);
check("Day1 含去程系统行", $$('.day[data-day="0"] .item.sys').length >= 2);
check("汇总-预算显示", text($("kBudget")) === "¥6,000", text($("kBudget")));
check("汇总-预计花费非零", text($("kTotal")) !== "¥0", text($("kTotal")));
check("环形图百分比已更新", text($("ringPct")) !== "0%", text($("ringPct")));
check("偏好 chips 渲染", $$("#prefChips .chip").length === 8);
check("去程/返程下拉已填充", $("goMode").options.length === 4);

console.log("\n[2] 真实景点数据");
const names = $$(".s-name").map(i => i.value);
const allText = $$(".day").map(x => x.textContent + " " + Array.from(x.querySelectorAll("input")).map(i => i.value).join(" ")).join("");
check("上海景点库为真实景点", names.includes("外滩"), names.slice(0, 3).join(" / "));
check("景点库渲染 7 条", $$(".spot").length === 7, "实际 " + $$(".spot").length);
check("元信息含建议时长或开放时间", text(qs(".spot .s-info")).length > 0, text(qs(".spot .s-info")));
check("行程里出现真实景点名", allText.includes("外滩") || allText.includes("豫园"), allText.slice(0, 40));

console.log("\n[3] 路线图");
const pts = $$(".map-point");
const spotCount = $$(".day .item:not(.sys)").length;
check("地图渲染出点位", pts.length > 0, "点位数 " + pts.length);
check("点位不超过条目数", pts.length <= spotCount, pts.length + " vs " + spotCount);
check("图例按天分组", $$(".map-legend span").length >= 2, "图例 " + $$(".map-legend span").length);
check("有按天连线", $$("#mapSvg path").length >= 1, "路径 " + $$("#mapSvg path").length);
check("点位带顺序编号", $$("#mapSvg text").some(t => t.textContent === "1"));
check("空状态已隐藏", $("mapEmpty").style.display === "none");

console.log("\n[4] 地图交互");
const first = qs(".map-point");
first.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
check("悬停显示提示框", $("mapTip").classList.contains("on"));
check("提示框内有景点信息", text($("mapTip")).length > 2, text($("mapTip")).slice(0, 26));
first.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: true }));
check("移出隐藏提示框", !$("mapTip").classList.contains("on"));
const targetId = first.getAttribute("data-pid");
first.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const targetItem = qs('.item[data-id="' + targetId + '"]');
check("点击可定位到行程条目", !!targetItem);
check("定位后高亮", targetItem && targetItem.classList.contains("flash"));

console.log("\n[5] 改天数 → 日期联动 + 脏标记");
const daysInput = $("days");
daysInput.value = "6";
fire(daysInput, "input");
check("endDate 自动推算", $("endDate").value === addDays($("startDate").value, 5), $("endDate").value);
check("日期提示含 6 天", text($("dateHint")).includes("6 天"), text($("dateHint")));
check("脏提示条出现", !$("dirtyBar").classList.contains("hidden"));

console.log("\n[6] 重新生成行程");
$("btnGenerate").dispatchEvent(new w.Event("click", { bubbles: true }));
check("生成 6 张日卡", $$(".day").length === 6, "实际 " + $$(".day").length);
check("脏提示条消失", $("dirtyBar").classList.contains("hidden"));
check("景点点位增多", $$(".map-point").length >= 8, "点位 " + $$(".map-point").length);
check("图例 = 有景点的天数(6天行程中间4天)", $$(".map-legend span").length === 4, "实际 " + $$(".map-legend span").length);

console.log("\n[7] 每天两站不重复");
const groups = [];
for (let i = 0; i < 6; i++) { const g = spotTexts(i); if (g.length) groups.push(g); }
check("同一天两站不同名", groups.every(g => g.length < 2 || g[0] !== g[1]),
  JSON.stringify(groups.map(g => g.join(" + "))));

console.log("\n[8] 改预算 → 汇总实时更新");
const before = text($("kTotal"));
$("budget").value = "12000";
fire($("budget"), "input");
check("总预算刷新", text($("kBudget")) === "¥12,000", text($("kBudget")));
check("花费不受预算影响", text($("kTotal")) === before, before + " vs " + text($("kTotal")));

console.log("\n[9] 编辑单条活动费用");
const subBefore = Number(text(qs('.day[data-day="1"] .day-sub b')).replace(/[^\d]/g, ""));
const actBefore = Number(text($("lg3")).replace(/[^\d]/g, ""));
const costInput = qs('.day[data-day="1"] input[data-act="cost"]');
costInput.value = String(Number(costInput.value) + 300);
fire(costInput, "input");
const subAfter = Number(text(qs('.day[data-day="1"] .day-sub b')).replace(/[^\d]/g, ""));
const actAfter = Number(text($("lg3")).replace(/[^\d]/g, ""));
check("日小计 +300(默认2人=+600)", subAfter - subBefore === 600, subBefore + " → " + subAfter);
check("游玩餐饮 +300(默认2人=+600)", actAfter - actBefore === 600, actBefore + " → " + actAfter);

console.log("\n[10] 新增与删除活动");
const beforeItems = $$('.day[data-day="1"] .item').length;
qs('.day[data-day="1"] .add-item').dispatchEvent(new w.Event("click", { bubbles: true }));
check("新增一行", $$('.day[data-day="1"] .item').length === beforeItems + 1,
  beforeItems + " → " + $$('.day[data-day="1"] .item').length);
qs('.day[data-day="1"] .item:not(.sys) .del').dispatchEvent(new w.Event("click", { bubbles: true }));
check("删除后回到原数量", $$('.day[data-day="1"] .item').length === beforeItems);

console.log("\n[11] 改城市 → 景点库重建");
$("toCity").value = "成都";
fire($("toCity"), "input");
check("标记为待重新生成", !$("dirtyBar").classList.contains("hidden"));
$("btnGenerate").dispatchEvent(new w.Event("click", { bubbles: true }));
const cdNames = $$(".s-name").map(i => i.value);
check("换成成都真实景点", cdNames.some(n => n.includes("熊猫")), cdNames.slice(0, 3).join(" / "));
check("行程标题含成都", $$(".day-title")[1].value.includes("成都"), $$(".day-title")[1].value);
check("地图仍有点位", $$(".map-point").length > 0);

console.log("\n[12] 费用覆盖与还原");
const goCost = $("goCost");
const autoVal = Number(goCost.dataset.auto);
goCost.value = "999";
fire(goCost, "input");
check("覆盖后标黄", goCost.classList.contains("edited"));
goCost.value = String(autoVal);
fire(goCost, "input");
check("改回估算值即取消覆盖", !goCost.classList.contains("edited"));

console.log("\n[13] 校验与预设");
$("fromCity").value = "成都";
fire($("fromCity"), "input");
$("btnGenerate").dispatchEvent(new w.Event("click", { bubbles: true }));
check("同城被拦截", $("toCity").classList.contains("invalid"));

$$("#presets button")[1].dispatchEvent(new w.Event("click", { bubbles: true }));
check("载入单日示例", $$(".day").length === 1, "实际 " + $$(".day").length);
check("单日行程含去程与返程", $$('.day[data-day="0"] .item.sys').length === 2);
check("单日住宿费用为 0", text($("lg2")) === "¥0", text($("lg2")));
check("单日地图 2 个点", $$(".map-point").length === 2, "实际 " + $$(".map-point").length);

console.log("\n[14] 持久化与重置");
const saved = w.localStorage.getItem("xingji-planner-v1");
check("已写入本地存储", !!saved);
const parsed = saved ? JSON.parse(saved) : null;
check("存储内容含坐标", parsed && JSON.stringify(parsed.plan).includes('"lat"'));
$("btnReset").dispatchEvent(new w.Event("click", { bubbles: true }));
check("恢复 4 天示例", $$(".day").length === 4, "实际 " + $$(".day").length);

console.log("\n[15] 运行期异常");
check("无未捕获脚本错误", errors.length === 0, errors.join(" | "));

console.log("\n===== 结果：" + pass + " 通过 / " + fail + " 失败 =====");
process.exit(fail ? 1 : 0);
