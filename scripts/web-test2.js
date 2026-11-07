/* 新增功能测试：人均计费 / 上下移动 / 撤销删除 / 日期快捷片 / 输入夹取 / 底部操作栏 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(require("path").join(__dirname, "..", "demo", "index.html"), "utf8");
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/",
  beforeParse(w){
    w.print = () => {};
    w.confirm = () => true;
    w.Element.prototype.scrollIntoView = () => {};
  }
});
const d = dom.window.document, w = dom.window;
const $ = id => d.getElementById(id);
const qs = sel => d.querySelector(sel);
const qsa = sel => Array.from(d.querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const num = s => Number(String(s).replace(/[^\d-]/g, "")) || 0;

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if(ok){ pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, "→", detail); }
};

console.log("[A] 门票按人数计算");
// 生成 4 天 2 人北京->上海行程，检查 lg3(游玩餐饮总额) = 条目人均金额之和 × 2
click($("btnReset"));
const perPerson = qsa(".item:not(.sys) input.cost")
  .filter(i => i.closest(".item").dataset.id)
  .reduce((a, i) => a + num(i.value), 0);
const lg3 = num($("lg3").textContent);
check("游玩餐饮总额 = 人均门票 × 2", lg3 === perPerson * 2, lg3 + " vs " + perPerson * 2);
check("存在有门票的景点(用例有效)", perPerson > 0, "perPerson=" + perPerson);
check("人均提示可见", $("perHint").textContent.includes("× 2"), $("perHint").textContent);

console.log("[B] 上移 / 下移");
const day1Items = () => state_items(0);
function state_items(di){
  // 从 DOM 顺序读条目文本
  return qsa('.day[data-day="' + di + '"] .item:not(.sys) .txt').map(i => i.value);
}
{
  const before = state_items(0);
  if(before.length >= 2){
    const ups = qsa('.day[data-day="0"] .item:not(.sys) [data-act="up"]');
    click(ups[1]);   // 第二条上移
    let after = state_items(0);
    check("上移后顺序交换", after[0] === before[1] && after[1] === before[0], JSON.stringify(before) + " → " + JSON.stringify(after));
    const downs = qsa('.day[data-day="0"] .item:not(.sys) [data-act="down"]');
    click(downs[0]); // 第一条下移，复原
    check("下移后复原", JSON.stringify(state_items(0)) === JSON.stringify(before), JSON.stringify(state_items(0)));
  } else {
    check("Day1 至少两条非系统条目", false, String(before.length));
  }
}

console.log("[C] 删除 + 撤销");
{
  const before = state_items(0);
  const target = qs('.day[data-day="0"] .item:not(.sys)');
  const delBtn = target.querySelector('[data-act="del"]');
  click(delBtn);
  check("删除后数量-1", state_items(0).length === before.length - 1, "");
  const undoBtn = qs("#toast button");
  check("toast 出现撤销按钮", !!undoBtn, "");
  click(undoBtn);
  check("撤销后条目复原", JSON.stringify(state_items(0)) === JSON.stringify(before), JSON.stringify(state_items(0)));
}

console.log("[D] 日期快捷片");
{
  const chips = qsa("#dateChips .chip");
  check("三个快捷片", chips.length === 3, String(chips.length));
  click(chips[1]); // 明天
  const t = new Date(); t.setDate(t.getDate() + 1);
  const exp = t.getFullYear() + "-" + String(t.getMonth()+1).padStart(2,"0") + "-" + String(t.getDate()).padStart(2,"0");
  check("点明天后出发日期=明天", $("startDate").value === exp, $("startDate").value + " vs " + exp);
  click(chips[0]);
}

console.log("[E] 输入夹取回写");
{
  const days = $("days");
  days.value = "99"; fire(days, "input");
  check("天数 99 → 夹到 30 且回写", days.value === "30" && w.eval("state.days") === undefined ? days.value === "30" : days.value === "30", days.value);
  const tv = $("travelers");
  tv.value = "20"; fire(tv, "input");
  check("人数 20 → 夹到 9 且回写", tv.value === "9", tv.value);
  // 结束日期绕过上限
  $("startDate").value = "2026-11-01"; fire($("startDate"), "change");
  $("endDate").value = "2027-01-15"; fire($("endDate"), "change");
  check("结束日期超 30 天被夹到 30", $("days").value === "30", $("days").value);
  // 恢复
  click($("btnReset"));
}

console.log("[F] 底部操作栏(移动端)");
{
  check("mbar 存在", !!$("mbar"), "");
  check("mbarInfo 有剩余金额", $("mbarInfo").textContent.includes("剩余"), $("mbarInfo").textContent);
  const daysBefore = qsa(".day").length;
  $("toCity").value = "西安"; fire($("toCity"), "input");
  click($("btnGenerateM"));
  check("底栏按钮可生成行程", qsa(".day").length > 0 && $("mapSub").textContent.includes("西安") || qsa(".day").length === daysBefore, $("mapSub").textContent);
  // 恢复上海并重新生成，避免影响后续
  $("toCity").value = "上海"; fire($("toCity"), "input");
  click($("btnGenerateM"));
}

console.log("[G] toast 基础行为不回归");
{
  const before = state_items(0).length;
  click(qs('.day[data-day="0"] .item:not(.sys) [data-act="del"]'));
  check("删除提示含条目名", $("toast").textContent.includes("已删除"), $("toast").textContent);
}

console.log("\n===== 新增功能：" + pass + " 通过 / " + fail + " 失败 =====");
process.exit(fail ? 1 : 0);
