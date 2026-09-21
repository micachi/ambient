/* ============================================================
   アンビエント・エンジン
   シーン管理・描画ループ・UI・設定永続化・省電力
   ============================================================ */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var LS_KEY = "ambient.settings.v1";

  var DEFAULTS = {
    scene: "trail",
    cycle: true,
    cycleMin: 8,
    fps: 30,
    brightness: 1.0,
    drift: true,
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var o = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, o);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---- 焼き付き防止ドリフト ----
     数分周期のリサージュで画面全体を少しずつ揺らす。
     静止画のようなシーンでも「同じ画素に同じ光が当たり続ける」ことを避ける。 */
  function driftAt(t, amp) {
    return {
      x: Math.sin(t / 421 * TAU) * amp + Math.sin(t / 173 * TAU) * amp * 0.35,
      y: Math.cos(t / 613 * TAU) * amp + Math.sin(t / 239 * TAU) * amp * 0.35,
    };
  }

  function App(opts) {
    this.canvas = document.getElementById("cv");
    this.ctx = this.canvas.getContext("2d");
    this.s = loadSettings();
    this.scenes = global.SCENES || [];
    this.lang = (document.documentElement.getAttribute("lang") === "en") ? "en" : "ja";
    this.t0 = performance.now() / 1000;
    this.last = this.t0;
    this.cycleT = 0;
    this.trans = null;      // シーン切替中のフェード
    this.uiTimer = null;
    this.reduced = false;
    try {
      this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.env = null;
  }

  App.prototype.indexOf = function (id) {
    for (var i = 0; i < this.scenes.length; i++) if (this.scenes[i].id === id) return i;
    return 0;
  };

  App.prototype.current = function () {
    return this.scenes[this.indexOf(this.s.scene)];
  };

  App.prototype.resize = function () {
    // Retina を拾いすぎると発熱するので DPR は 1.5 に上限
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    var sc = this.current();
    if (sc && sc.resize) sc.resize(this.makeEnv(sc));
  };

  App.prototype.makeEnv = function (sc) {
    var self = this;
    var now = new Date();
    var t = performance.now() / 1000 - this.t0;
    var amp = this.s.drift ? (this.reduced ? 6 : 18) : 0;
    var d = driftAt(t, amp);
    return {
      ctx: this.ctx,
      w: this.w, h: this.h, dpr: this.dpr,
      t: t,
      now: now,
      lang: this.lang,
      driftAmp: amp,
      clock: {
        h24: now.getHours(),
        min: now.getMinutes(),
        sec: now.getSeconds(),
        ms: now.getMilliseconds(),
      },
      scene: sc,
    };
  };

  App.prototype.switchTo = function (id, immediate) {
    var self = this;
    if (id === this.s.scene && !immediate) return;
    if (immediate) {
      this.s.scene = id; saveSettings(this.s);
      this.applyHash(id);
      var sc = this.current();
      if (sc.init) sc.init(this.makeEnv(sc));
      this.showSceneLabel(sc);
      return;
    }
    this.trans = { phase: "out", k: 0, next: id };
  };

  App.prototype.applyHash = function (id) {
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  };

  App.prototype.step = function () {
    var now = performance.now() / 1000;
    var dt = clamp(now - this.last, 0, 0.1);
    this.last = now;

    // 自動サイクル
    if (this.s.cycle && !this.trans) {
      this.cycleT += dt;
      if (this.cycleT >= this.s.cycleMin * 60) {
        this.cycleT = 0;
        var i = this.indexOf(this.s.scene);
        this.switchTo(this.scenes[(i + 1) % this.scenes.length].id);
      }
    }

    var c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 切替フェード: 暗転してから差し替える（明滅ではなく暗転にする）
    if (this.trans) {
      this.trans.k += dt / 0.55;
      if (this.trans.phase === "out" && this.trans.k >= 1) {
        this.s.scene = this.trans.next; saveSettings(this.s); this.applyHash(this.trans.next);
        var sc = this.current();
        if (sc.init) sc.init(this.makeEnv(sc));
        this.showSceneLabel(sc);
        this.trans = { phase: "in", k: 0, next: this.trans.next };
      } else if (this.trans.phase === "in" && this.trans.k >= 1) {
        this.trans = null;
      }
    }

    var sc2 = this.current();
    if (!sc2) return;
    var env = this.makeEnv(sc2);

    c.save();
    c.translate(env.driftAmp ? driftAt(env.t, env.driftAmp).x : 0,
                env.driftAmp ? driftAt(env.t, env.driftAmp).y : 0);
    try {
      sc2.frame(env, dt);
    } catch (err) {
      // 一つの実行エラーでループを止めない
      console.error(err);
    }
    c.restore();

    if (this.trans) {
      var a = this.trans.phase === "out" ? this.trans.k : 1 - this.trans.k;
      c.fillStyle = "rgba(5,7,12," + clamp(a, 0, 1).toFixed(3) + ")";
      c.fillRect(0, 0, this.w, this.h);
    }
  };

  /* ---- ループ（FPS キャップ） ---- */
  App.prototype.run = function () {
    var self = this;
    var cap = this.effFps();
    var interval = 1 / cap;
    var acc = 0;
    var prev = performance.now() / 1000;
    function tick() {
      if (document.hidden) { prev = performance.now() / 1000; requestAnimationFrame(tick); return; }
      var now = performance.now() / 1000;
      var d = now - prev;
      prev = now;
      acc += d;
      if (acc < interval) { requestAnimationFrame(tick); return; }
      // 落ち込み時に何コマも追いかけない（発熱防止）
      if (acc > interval * 3) acc = interval;
      self.step();
      acc = 0;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  App.prototype.effFps = function () {
    var f = this.s.fps;
    if (this.reduced && f > 24) f = 24;
    return f;
  };

  /* ---- UI ---- */
  App.prototype.boot = function () {
    var self = this;
    var L = this.lang === "en" ? STR.en : STR.ja;
    this.L = L;

    // ハッシュでシーン指定
    var h = (location.hash || "").replace(/^#/, "").trim();
    if (h && this.scenes.some(function (s) { return s.id === h; })) this.s.scene = h;

    this.buildUI();
    this.resize();

    var sc = this.current();
    if (sc.init) sc.init(this.makeEnv(sc));
    this.showSceneLabel(sc);
    this.run();

    window.addEventListener("resize", function () { self.resize(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) self.last = performance.now() / 1000;
    });
    window.addEventListener("hashchange", function () {
      var hh = (location.hash || "").replace(/^#/, "");
      if (hh && self.scenes.some(function (s) { return s.id === hh; })) self.switchTo(hh);
    });

    // キー操作
    document.addEventListener("keydown", function (e) {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      var i = self.indexOf(self.s.scene);
      switch (e.key) {
        case "ArrowRight": case "d": self.switchTo(self.scenes[(i + 1) % self.scenes.length].id); break;
        case "ArrowLeft": case "a": self.switchTo(self.scenes[(i - 1 + self.scenes.length) % self.scenes.length].id); break;
        case "f": case "F": self.fullscreen(); break;
        case "h": case "H": self.toggleUI(); break;
        case "s": case "S": self.togglePanel(); break;
        case "c": case "C": self.setCycle(!self.s.cycle); break;
        case "+": case "=": self.setBrightness(self.s.brightness + 0.1); break;
        case "-": case "_": self.setBrightness(self.s.brightness - 0.1); break;
        case "?": self.showHelp(); break;
      }
      self.nudgeUI();
    });

    // 操作があったこと自体で UI を出す
    ["mousemove", "touchstart", "click"].forEach(function (ev) {
      document.addEventListener(ev, function () { self.nudgeUI(); }, { passive: true });
    });
    this.nudgeUI();
  };

  App.prototype.fullscreen = function () {
    var d = document;
    if (!d.fullscreenElement) {
      (d.documentElement.requestFullscreen || function () {}).call(d.documentElement);
    } else if (d.exitFullscreen) { d.exitFullscreen(); }
  };

  App.prototype.toggleUI = function () {
    var u = document.getElementById("ui");
    if (!u) return;
    u.classList.toggle("hidden");
  };

  App.prototype.togglePanel = function () {
    var p = document.getElementById("panel");
    if (!p) return;
    p.classList.toggle("open");
    this.nudgeUI();
  };

  App.prototype.setBrightness = function (v) {
    this.s.brightness = clamp(Math.round(v * 10) / 10, 0.25, 1);
    saveSettings(this.s);
    this.applyBrightness();
    var el = document.getElementById("br");
    if (el) { el.value = String(this.s.brightness); this.syncRange(el); }
  };

  App.prototype.applyBrightness = function () {
    var v = this.s.brightness;
    this.canvas.style.filter = v >= 1 ? "none" : "brightness(" + v + ")";
    var lab = document.getElementById("brv");
    if (lab) lab.textContent = Math.round(v * 100) + "%";
  };

  App.prototype.setCycle = function (on) {
    this.s.cycle = !!on;
    if (on) this.cycleT = 0;
    saveSettings(this.s);
    var el = document.getElementById("cyc");
    if (el) el.checked = this.s.cycle;
    this.toast(this.s.cycle
      ? this.L.cycleOn.replace("{n}", this.s.cycleMin)
      : this.L.cycleOff);
  };

  App.prototype.syncRange = function (el) {
    // range の塗り（ブラウザ既定だと暗いテーマで読みにくい）
    var pct = ((parseFloat(el.value) - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min))) * 100;
    el.style.setProperty("--pct", pct + "%");
  };

  App.prototype.toast = function (msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { t.classList.remove("show"); }, 1800);
  };

  App.prototype.showSceneLabel = function (sc) {
    var n = this.indexOf(sc.id) + 1;
    var lab = document.getElementById("sceneName");
    if (lab) lab.textContent = String(n).padStart(2, "0") + " / " + String(this.scenes.length).padStart(2, "0") + "  \u00b7  " + sc.name[this.lang];
    var d = document.getElementById("sceneDesc");
    if (d) d.textContent = sc.desc[this.lang] || "";
    this.markSceneButtons();
  };

  App.prototype.markSceneButtons = function () {
    var cur = this.s.scene;
    var bs = document.querySelectorAll("[data-scene]");
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle("on", bs[i].getAttribute("data-scene") === cur);
    }
  };

  App.prototype.nudgeUI = function () {
    var u = document.getElementById("ui");
    if (!u) return;
    u.classList.remove("idle");
    clearTimeout(this.uiTimer);
    var panel = document.getElementById("panel");
    if (panel && panel.classList.contains("open")) return; // パネル開いている間は隠さない
    this.uiTimer = setTimeout(function () { u.classList.add("idle"); }, 4200);
  };

  App.prototype.buildUI = function () {
    var self = this;
    var L = this.L;

    // シーンボタン
    var wrap = document.getElementById("sceneBtns");
    if (wrap) {
      wrap.innerHTML = this.scenes.map(function (s, i) {
        return '<button type="button" class="scbtn" data-scene="' + s.id + '">' +
          '<span class="scn">' + String(i + 1).padStart(2, "0") + "</span>" +
          esc(s.name[self.lang]) + "</button>";
      }).join("");
      wrap.addEventListener("click", function (e) {
        var b = e.target.closest("[data-scene]");
        if (b) self.switchTo(b.getAttribute("data-scene"));
      });
    }

    var cyc = document.getElementById("cyc");
    if (cyc) { cyc.checked = this.s.cycle; cyc.addEventListener("change", function () { self.setCycle(cyc.checked); }); }

    var cycm = document.getElementById("cycmin");
    if (cycm) {
      cycm.value = String(this.s.cycleMin);
      cycm.addEventListener("input", function () {
        self.s.cycleMin = clamp(parseInt(cycm.value, 10) || 8, 2, 60);
        saveSettings(self.s);
        var lab = document.getElementById("cycmv");
        if (lab) lab.textContent = self.s.cycleMin + (self.lang === "ja" ? " 分" : " min");
      });
      var lab0 = document.getElementById("cycmv");
      if (lab0) lab0.textContent = this.s.cycleMin + (this.lang === "ja" ? " 分" : " min");
    }

    var br = document.getElementById("br");
    if (br) {
      br.value = String(this.s.brightness);
      this.syncRange(br);
      br.addEventListener("input", function () { self.setBrightness(parseFloat(br.value)); });
    }

    var fpsSel = document.getElementById("fps");
    if (fpsSel) {
      fpsSel.value = String(this.s.fps);
      fpsSel.addEventListener("change", function () { self.s.fps = parseInt(fpsSel.value, 10) || 30; saveSettings(self.s); });
    }

    var dr = document.getElementById("drift");
    if (dr) { dr.checked = this.s.drift; dr.addEventListener("change", function () { self.s.drift = dr.checked; saveSettings(self.s); }); }

    var fsb = document.getElementById("fsBtn");
    if (fsb) fsb.addEventListener("click", function () { self.fullscreen(); });

    this.applyBrightness();

    if (this.reduced) {
      var r = document.getElementById("reduced");
      if (r) r.hidden = false;
    }
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var STR = {
    ja: {
      cycleOn: "{n} 分ごとに次のシーンへ",
      cycleOff: "自動切替オフ",
    },
    en: {
      cycleOn: "Next scene every {n} min",
      cycleOff: "Auto-cycle off",
    },
  };

  global.AMBIENT = App;
  // テストから内部関数を検証できるようにしておく
  App.driftAt = driftAt;
  App.DEFAULTS = DEFAULTS;
})(typeof window !== "undefined" ? window : this);
