/* ============================================================
   アンビエント・サイトのテスト
   実行: NODE_PATH=<jsdom+canvas のある node_modules> node test.js
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log("  \x1b[32mPASS\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31mFAIL\x1b[0m " + name + (info !== undefined ? "  " + info : "")); }
};

/* ---------- 1. ビルド成果物 ---------- */
console.log("\n--- 1. ビルド成果物 ---");
ok("dist/index.html がある", fs.existsSync(path.join(DIST, "index.html")));
ok("dist/en/index.html がある", fs.existsSync(path.join(DIST, "en", "index.html")));
ok("assets/scenes.js がコピーされている", fs.existsSync(path.join(DIST, "assets", "scenes.js")));
ok("JS が HTML にインライン化されている", fs.readFileSync(path.join(DIST, "index.html"), "utf8").includes("SCENES"));
ok("JS 埋め込みで script タグが暴れていない（開閉数が一致）", (() => {
  const h = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const opens = (h.match(/<script>/g) || []).length;
  const closes = (h.match(/<\/script>/g) || []).length;
  return opens === closes && opens >= 3;
})(), (() => {
  const h = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  return (h.match(/<script>/g) || []).length + " open / " + (h.match(/<\/script>/g) || []).length + " close";
})());
ok("インライン化する JS 側に生の </script> が無い（=埋め込みで閉じない）", (() => {
  const src = fs.readFileSync(path.join(ROOT, "assets", "scenes.js"), "utf8") +
              fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
  return !src.includes("</script>");
})());

/* ---------- jsdom で読み込み ---------- */
function load(rel) {
  const errs = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errs.push("jsdomError: " + (e && e.message || e)));
  vc.on("error", (...a) => errs.push("console.error: " + a.join(" ")));
  const dom = new JSDOM(fs.readFileSync(path.join(DIST, rel), "utf8"), {
    runScripts: "dangerously", virtualConsole: vc,
    url: "https://ambient.test/" + (rel === "index.html" ? "" : "en/"),
    pretendToBeVisual: true,
  });
  return { dom, d: dom.window.document, w: dom.window, errs };
}

const { d, w, errs } = load("index.html");
ok("読み込みで実行時エラーなし", errs.length === 0, errs.slice(0, 3).join(" | "));

const SCENES = w.SCENES || [];

/* ---------- 2. シーン定義 ---------- */
console.log("\n--- 2. シーン定義 ---");
ok("シーンが 6 個ある", SCENES.length === 6, String(SCENES.length));
ok("ID が重複しない", new Set(SCENES.map((s) => s.id)).size === SCENES.length,
  SCENES.map((s) => s.id).join(","));
const badMeta = SCENES.filter((s) =>
  !s.name || !s.name.ja || !s.name.en || !s.desc || !s.desc.ja || !s.desc.en ||
  typeof s.frame !== "function");
ok("全シーンに ja/en の名前・説明と frame がある", badMeta.length === 0,
  badMeta.map((s) => s.id).join(","));
ok("ID が小英字のみのスラッグ", SCENES.every((s) => /^[a-z]+$/.test(s.id)),
  SCENES.map((s) => s.id).join(","));

/* ---------- 3. 時刻の表現（紙の漢数字 / 月相 / 雨の昼夜） ---------- */
console.log("\n--- 3. 時刻と空 ---");
const paper = SCENES.find((s) => s.id === "paper");
const PT = paper && paper._test;
ok("紙: テスト用マッピングを公開している", !!PT);

const TIME_RE = /^(零|一|二|三|四|五|六|七|八|九|十|十一|十二)時((五|十|十五|二十|二十五|三十|三十五|四十|四十五|五十|五十五)分)?$/;
const badTime = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m++) {
    const t = PT.kanjiTime({ h24: h, min: m });
    if (!TIME_RE.test(t)) badTime.push(h + ":" + m + "→" + t);
  }
}
ok("紙: 全 1440 分が漢数字の時刻になる", badTime.length === 0, badTime.slice(0, 4).join(" "));
ok("紙: 0 分は「時」で終わる（分を付けない）", PT.kanjiTime({ h24: 8, min: 0 }) === "八時",
  PT.kanjiTime({ h24: 8, min: 0 }));
ok("紙: 45 分は「四十五分」", PT.kanjiTime({ h24: 8, min: 45 }) === "八時四十五分",
  PT.kanjiTime({ h24: 8, min: 45 }));
ok("紙: 日付は漢数字（1・10・20・31 日）",
  PT.kanjiDay(1) === "一日" && PT.kanjiDay(10) === "十日" &&
  PT.kanjiDay(20) === "二十日" && PT.kanjiDay(31) === "三十一日",
  [1, 10, 20, 31].map(PT.kanjiDay).join(","));
ok("紙: 月名が漢数字", PT.MONTHS[9] === "十月", PT.MONTHS[9]);

const moon = SCENES.find((s) => s.id === "moon");
ok("月: 朔（2000-01-06）で照度がほぼ 0",
  moon._test.phase(new Date(Date.UTC(2000, 0, 6, 18, 14))).illum < 0.02,
  String(moon._test.phase(new Date(Date.UTC(2000, 0, 6, 18, 14))).illum));
ok("月: 約 14.8 日後に満月（照度 > 0.98）",
  moon._test.phase(new Date(Date.UTC(2000, 0, 21, 9, 0))).illum > 0.98,
  String(moon._test.phase(new Date(Date.UTC(2000, 0, 21, 9, 0))).illum));
ok("月: 照度は 0..1 に収まる", (() => {
  for (let i = 0; i < 90; i++) {
    const v = moon._test.phase(new Date(Date.UTC(2026, 0, 1) + i * 86400000)).illum;
    if (!(v >= 0 && v <= 1)) return false;
  }
  return true;
})());

const rain = SCENES.find((s) => s.id === "rain");
const SS = rain._test.skyState;
ok("雨: 深夜は明るさ 0", SS({ h24: 23, min: 0 }).light === 0, JSON.stringify(SS({ h24: 23, min: 0 })));
ok("雨: 正午は真昼（light > 1.1）", SS({ h24: 12, min: 0 }).light > 1.1, JSON.stringify(SS({ h24: 12, min: 0 })));
ok("雨: 夕方は赤み（warm > 0.5）", SS({ h24: 18, min: 0 }).warm > 0.5, JSON.stringify(SS({ h24: 18, min: 0 })));
ok("雨: 明けの赤みは控えめ（warm < 0.5）", SS({ h24: 6, min: 0 }).warm < 0.5, JSON.stringify(SS({ h24: 6, min: 0 })));
ok("雨: 昼の赤みはほぼ 0", SS({ h24: 12, min: 0 }).warm < 0.05, JSON.stringify(SS({ h24: 12, min: 0 })));
ok("雨: 明るさは 0..1.2 に収まる", (() => {
  for (let h = 0; h < 48; h++) {
    const v = SS({ h24: Math.floor(h / 2), min: (h % 2) * 30 }).light;
    if (!(v >= 0 && v <= 1.2)) return false;
  }
  return true;
})());

/* ---------- 4. ドリフト（焼き付き防止） ---------- */
console.log("\n--- 4. 焼き付き防止ドリフト ---");
const driftAt = w.AMBIENT.driftAt;
ok("driftAt が有限値を返す", [0, 37, 421, 9999].every((t) => {
  const d0 = driftAt(t, 18);
  return Number.isFinite(d0.x) && Number.isFinite(d0.y);
}));
ok("振幅が上限（1.4 倍）を超えない", (() => {
  let mx = 0;
  for (let t = 0; t < 4000; t += 1.7) {
    const d0 = driftAt(t, 18);
    mx = Math.max(mx, Math.abs(d0.x), Math.abs(d0.y));
  }
  return mx <= 18 * 1.4 + 1e-6;
})(), "max=" + (() => { let mx = 0; for (let t = 0; t < 4000; t += 1.7) { const d0 = driftAt(t, 18); mx = Math.max(mx, Math.abs(d0.x), Math.abs(d0.y)); } return mx.toFixed(2); })());
ok("時間とともに必ず動く（固定されない）",
  driftAt(0, 18).x !== driftAt(211, 18).x || driftAt(0, 18).y !== driftAt(211, 18).y);
ok("振幅 0 なら動かず、NaN も出ない",
  driftAt(123, 0).x === 0 && driftAt(123, 0).y === 0);

/* ---------- 5. 実際の描画 ---------- */
console.log("\n--- 5. 描画（node-canvas） ---");
const cv = d.getElementById("cv");
const ctx = cv.getContext("2d");
ok("canvas が実際に描画できるコンテキストを返す", !!ctx && typeof ctx.getImageData === "function");

function stats() {
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let max = 0, sum = 0, n = 0, nan = 0;
  for (let i = 0; i < img.length; i += 4 * 37) { // 間引きサンプリング
    const r = img[i], g = img[i + 1], b = img[i + 2];
    const v = Math.max(r, g, b);
    if (!Number.isFinite(v)) nan++;
    if (v > max) max = v;
    sum += v; n++;
  }
  return { max, mean: sum / Math.max(1, n), nan };
}

const app = w.app;
ok("アプリインスタンスが取得できる", !!app);

for (const sc of SCENES) {
  app.switchTo(sc.id, true);
  let threw = null;
  try {
    for (let i = 0; i < 10; i++) app.step();
  } catch (e) { threw = e; }
  const st = stats();
  ok(`${sc.name.ja}: 10 フレーム描画で例外なし`, threw === null, threw && threw.message);
  ok(`${sc.name.ja}: 画面に何か描かれている（最大輝度 > 8）`, st.max > 8, JSON.stringify(st));
  ok(`${sc.name.ja}: 輝度が NaN ではない`, st.nan === 0, JSON.stringify(st));
}

/* ---------- 6. 設定の永続化と効き方 ---------- */
console.log("\n--- 6. 設定 ---");
app.setBrightness(0.5);
ok("明るさ 50% が canvas の filter に反映", /brightness\(0\.5\)/.test(cv.style.filter), cv.style.filter);
ok("明るさが localStorage に保存", JSON.parse(w.localStorage.getItem("ambient.settings.v1")).brightness === 0.5,
  w.localStorage.getItem("ambient.settings.v1"));
app.setBrightness(9);
ok("明るさは 1 にクランプ", app.s.brightness === 1, String(app.s.brightness));
app.setBrightness(-3);
ok("明るさの下限は 0.25", app.s.brightness === 0.25, String(app.s.brightness));
app.setBrightness(1);

app.setCycle(false);
ok("自動切替 OFF が保存", JSON.parse(w.localStorage.getItem("ambient.settings.v1")).cycle === false);
app.setCycle(true);
ok("自動切替 ON が保存", JSON.parse(w.localStorage.getItem("ambient.settings.v1")).cycle === true);

/* ---------- 7. シーン切替とハッシュ ---------- */
console.log("\n--- 7. 切替 / ハッシュ ---");
app.switchTo("deep", true);
ok("シーン切り替えが設定に反映", app.s.scene === "deep", app.s.scene);
ok("ハッシュにシーン ID が乗る", (w.location.hash || "") === "#deep", w.location.hash);
ok("シーン名が UI に出る", /0\d\s\/\s0\d/.test(d.getElementById("sceneName").textContent),
  d.getElementById("sceneName").textContent);
const btns = [...d.querySelectorAll("[data-scene]")];
ok("設定パネルにシーンボタンが 6 個", btns.length === 6, String(btns.length));
ok("現在のシーンがボタンで選択状態", btns.some((b) => b.classList.contains("on") && b.getAttribute("data-scene") === "deep"));

/* ---------- 7b. 設定パネルを閉じる経路 ---------- */
console.log("\n--- 7b. パネルを閉じる ---");
const panelEl = d.getElementById("panel");
const brEl = d.getElementById("br");
const keyOn = (el, key) => (el || d.body).dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

panelEl.classList.add("open");
if (brEl && brEl.focus) brEl.focus();
keyOn(brEl, "s");
ok("パネル: 入力にフォーカスが残っても S で閉じる", !panelEl.classList.contains("open"));

panelEl.classList.add("open");
keyOn(brEl, "Escape");
ok("パネル: Escape で閉じる", !panelEl.classList.contains("open"));

panelEl.classList.add("open");
const pcloseEl = d.getElementById("pclose");
ok("パネル: 閉じるボタンがある", !!pcloseEl);
if (pcloseEl) pcloseEl.click();
ok("パネル: 閉じるボタンで閉じる", !panelEl.classList.contains("open"));

panelEl.classList.add("open");
d.getElementById("cv").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
ok("パネル: 外側クリックで閉じる", !panelEl.classList.contains("open"));

panelEl.classList.add("open");
brEl.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
ok("パネル: 内側クリックでは閉じない", panelEl.classList.contains("open"));
app.closePanel();
ok("パネル: closePanel() で閉じる", !panelEl.classList.contains("open"));

/* ---------- 8. ロケール / 相互リンク ---------- */
console.log("\n--- 8. ロケールと相互リンク ---");
const jaHtml = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const enHtml = fs.readFileSync(path.join(DIST, "en", "index.html"), "utf8");
ok("JA に Tools への相互リンク", jaHtml.includes("https://tools.wicachi.com/"));
ok("EN に Tools への相互リンク", enHtml.includes("https://tools.wicachi.com/"));
ok("JA/EN が hreflang で相互参照", /hreflang="en"/.test(jaHtml) && /hreflang="ja"/.test(enHtml));
ok("canonical が両方にある", /rel="canonical"/.test(jaHtml) && /rel="canonical"/.test(enHtml));

const { d: de, errs: errsEn } = load("en/index.html");
ok("EN 読み込みで実行時エラーなし", errsEn.length === 0, errsEn.slice(0, 2).join(" | "));
const badJaInEn = [];
const tw = de.createTreeWalker(de.body, 4 /* SHOW_TEXT */);
let tn;
while ((tn = tw.nextNode())) {
  const p = tn.parentElement;
  if (!p || p.closest("script,style,noscript")) continue;
  if (/[\u3000\u3001\u3002\uff08\uff09\uff0f\u30fb\u4e00-\u9fff\u3040-\u30ff]/.test(tn.nodeValue)) {
    badJaInEn.push(tn.nodeValue.trim().slice(0, 40));
  }
}
ok("EN の表示テキストに日本語・全角句読点が混入しない", badJaInEn.length === 0, badJaInEn.slice(0, 3).join(" / "));
ok("EN のシーン名が英語で描画される", (() => {
  const el = de.getElementById("sceneName");
  return el && /[A-Za-z]/.test(el.textContent) && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(el.textContent);
})(), de.getElementById("sceneName").textContent);

/* ---------- 9. 省電力・アクセシビリティ ---------- */
console.log("\n--- 9. 省電力 / アクセシビリティ ---");
ok("既定 FPS は 30（長時間表示向け）", w.AMBIENT.DEFAULTS.fps === 30, String(w.AMBIENT.DEFAULTS.fps));
ok("既定で自動サイクル ON / 8 分", w.AMBIENT.DEFAULTS.cycle === true && w.AMBIENT.DEFAULTS.cycleMin === 8);
ok("DPR は 1.5 上限（発熱対策）", app.dpr <= 1.5, String(app.dpr));
ok("トーストが aria-live で読み上げられる",
  d.getElementById("toast").getAttribute("aria-live") === "polite");
ok("canvas は装飾として aria-hidden", cv.getAttribute("aria-hidden") === "true");
ok("reduced-motion で UI アニメーションを切る CSS がある",
  fs.readFileSync(path.join(ROOT, "assets", "style.css"), "utf8").includes("prefers-reduced-motion"));

console.log(`\n---- ${pass} passed, ${fail} failed ----`);
process.exit(fail ? 1 : 0);
