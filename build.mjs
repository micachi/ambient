#!/usr/bin/env node
/**
 * アンビエント・サイトのビルド。
 * ja / en の 2 ページだけを生成する（Tools とは独立した小さな静的サイト）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

// DNS を当てる想定のエントリポイント。未設定の間は github.io 側を canonical にする。
const CANON = process.env.CANON_BASE || "https://ambient.wicachi.com";

const css = readFileSync(join(ROOT, "assets", "style.css"), "utf8");
const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");
const scenesJs = readFileSync(join(ROOT, "assets", "scenes.js"), "utf8");
const appJs = readFileSync(join(ROOT, "assets", "app.js"), "utf8");

const T = {
  ja: {
    lang: "ja",
    title: "Ambient — ずっと眺めていられる、ブラウザのスクリーンセーバー",
    desc: "時計として、そのまま眺めるものとして。6つのシーンがゆっくり移り変わる、インストール不要のブラウザ製スクリーンセーバー。自動で次のシーンへ移り、焼き付き防止のドリフトと省電力キャップを備えます。",
    brand: "Ambient",
    tagline: "ずっと眺めていられる、ブラウザのスクリーンセーバー",
    hintKeys: "← → シーン切替 ／ F 全画面 ／ S 設定 ／ H UI 非表示 ／ + − 明るさ",
    settings: "設定",
    sceneList: "シーン",
    cycle: "自動で次のシーンへ",
    cycleEvery: "間隔",
    brightness: "明るさ",
    fps: "フレームレート",
    drift: "焼き付き防止の揺れ",
    fullscreen: "全画面",
    reducedNote: "モーション低減が設定されているため、動きとフレームレートを抑えています。",
    about: "すべてブラウザ内で動いています。入力も個人データも一切送信されません。放置しておけば自動でシーンが切り替わります。",
    toolsLink: "便利ツール集 Tools へ",
    toolsNote: "同じ作者の、実用のブラウザツール集。",
    close: "閉じる",
    startHint: "動かなくても大丈夫。そのまま置いておくと、しばらくして自動で全画面にできます。",
  },
  en: {
    lang: "en",
    title: "Ambient — a browser screensaver you can watch forever",
    desc: "As a clock, or simply as something to look at. Six slow scenes in your browser, no install, with auto-advance, burn-in drift and a power-friendly frame cap.",
    brand: "Ambient",
    tagline: "A browser screensaver you can watch forever",
    hintKeys: "← → switch scene / F fullscreen / S settings / H hide UI / + - brightness",
    settings: "Settings",
    sceneList: "Scenes",
    cycle: "Advance automatically",
    cycleEvery: "Interval",
    brightness: "Brightness",
    fps: "Frame rate",
    drift: "Burn-in drift",
    fullscreen: "Fullscreen",
    reducedNote: "Reduced motion is enabled, so movement and frame rate are dialled down.",
    about: "Everything runs in your browser. No input is ever sent anywhere. Leave it be and the scenes keep changing.",
    toolsLink: "Go to Tools",
    toolsNote: "The same author's collection of practical browser tools.",
    close: "Close",
    startHint: "You don't have to touch anything. It will keep cycling on its own.",
  },
};

function page(t) {
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${t.title}</title>
<meta name="description" content="${t.desc}">
<link rel="canonical" href="${CANON}${t.lang === "en" ? "/en/" : "/"}">
<link rel="alternate" hreflang="${t.lang === "en" ? "ja" : "en"}" href="${CANON}${t.lang === "en" ? "/" : "/en/"}">
<meta name="theme-color" content="#05070d">
<meta name="color-scheme" content="dark">
<style>${css}</style>
</head>
<body>
<canvas id="cv" aria-hidden="true"></canvas>

<div id="ui">
  <header class="bar top">
    <a class="brand" href="${t.lang === "en" ? "./" : "./"}">${t.brand}</a>
    <span class="tag">${t.tagline}</span>
    <span class="spacer"></span>
    <a class="xlink" href="https://tools.wicachi.com/" hreflang="${t.lang}">${t.toolsLink}</a>
  </header>

  <div class="sceneinfo">
    <div id="sceneName" class="scenename"></div>
    <div id="sceneDesc" class="scenedesc"></div>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <footer class="bar bottom">
    <span class="keys">${t.hintKeys}</span>
    <button type="button" class="ghost" id="fsBtn">${t.fullscreen}</button>
    <button type="button" class="ghost" id="panelBtn" aria-controls="panel">${t.settings}</button>
  </footer>

  <section id="panel" class="panel" aria-label="${t.settings}">
    <div class="prow">
      <div class="plabel">${t.sceneList}</div>
      <div id="sceneBtns" class="scenebtns"></div>
    </div>
    <div class="prow">
      <label class="chk"><input type="checkbox" id="cyc"> ${t.cycle}</label>
      <span class="inline">${t.cycleEvery}</span>
      <input type="range" id="cycmin" min="2" max="60" step="1">
      <span class="val" id="cycmv"></span>
    </div>
    <div class="prow">
      <span class="plabel">${t.brightness}</span>
      <input type="range" id="br" min="0.25" max="1" step="0.05">
      <span class="val" id="brv"></span>
    </div>
    <div class="prow">
      <span class="plabel">${t.fps}</span>
      <select id="fps">
        <option value="24">24</option>
        <option value="30">30</option>
        <option value="60">60</option>
      </select>
      <label class="chk"><input type="checkbox" id="drift"> ${t.drift}</label>
    </div>
    <p id="reduced" class="note" hidden>${t.reducedNote}</p>
    <p class="note">${t.about}</p>
    <p class="note sub">${t.toolsNote} <a href="https://tools.wicachi.com/">tools.wicachi.com</a></p>
  </section>
</div>

<script>${safe(scenesJs)}</script>
<script>${safe(appJs)}</script>
<script>
(function () {
  var app = new AMBIENT();
  window.app = app;   // テストからフレームを駆動できるようにする
  app.boot();
  var pb = document.getElementById("panelBtn");
  if (pb) pb.addEventListener("click", function () { app.togglePanel(); });
})();
</script>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "en"), { recursive: true });
writeFileSync(join(OUT, "index.html"), page(T.ja));
writeFileSync(join(OUT, "en", "index.html"), page(T.en));
cpSync(join(ROOT, "assets"), join(OUT, "assets"), { recursive: true });
console.log("built: index.html, en/index.html, assets/");
