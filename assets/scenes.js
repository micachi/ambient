/* ============================================================
   Ambient v3 シーン集 — コンセプト「光が物質を通る」
   月の窓 / 雨の窓 / 深海 / インク / 砂 / 紙
   依存ゼロ・Canvas 2D。長時間表示の前提（明滅しない・遅い・暗い）を守る。
   ============================================================ */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(c) { return pad2(c.h24) + ":" + pad2(c.min); }

  /* ---- 値ノイズ ---- */
  function makeNoise(seed) {
    var s = (seed >>> 0) || 1;
    function rnd() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    var perm = new Uint8Array(256);
    for (var i = 0; i < 256; i++) perm[i] = i;
    for (var j = 255; j > 0; j--) { var k = (rnd() * (j + 1)) | 0, t = perm[j]; perm[j] = perm[k]; perm[k] = t; }
    var P = new Uint8Array(512);
    for (var m = 0; m < 512; m++) P[m] = perm[m & 255];
    function h1(n) { return (((n * 1103515245 + 12345) >>> 8) & 0xffff) / 32768 - 1; }
    function fade(t) { return t * t * (3 - 2 * t); }
    return {
      rnd: rnd,
      n2: function (x, y) {
        var xi = Math.floor(x), yi = Math.floor(y);
        var X = xi & 255, Y = yi & 255;
        var u = fade(x - xi), v = fade(y - yi);
        var aa = P[P[X] + Y], ab = P[P[X] + Y + 1], ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
        return lerp(lerp(h1(aa), h1(ba), u), lerp(h1(ab), h1(bb), u), v);
      }
    };
  }

  /* ---- 柔らかい円を sprite に焼く（毎フレーム gradient を作らない） ---- */
  function softSprite(size, rgb, inner) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var x = c.getContext("2d");
    var r = size / 2;
    var g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(" + rgb + "," + inner + ")");
    g.addColorStop(0.45, "rgba(" + rgb + "," + (inner * 0.42) + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  /* ---- 画面全体を覆う塗り（ドリフトで端が空かないよう余白付き） ---- */
  function fillAll(env, style) {
    var p = env.driftAmp + 2;
    env.ctx.fillStyle = style;
    env.ctx.fillRect(-p, -p, env.w + p * 2, env.h + p * 2);
  }

  /* ============================================================
     1. 月の窓 — 月相と雲、星。月の位置が時刻を語る
     ============================================================ */
  function moonPhase(when) {
    var synodic = 29.530588853;
    var ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    var nowd = when.getTime() / 86400000;
    var phase = ((((nowd - ref) % synodic) + synodic) % synodic) / synodic;
    return { phase: phase, illum: (1 - Math.cos(phase * TAU)) / 2 };
  }

  function sceneMoon() {
    var noise = makeNoise(7);
    return {
      id: "moon",
      name: { ja: "月の窓", en: "Moon Window" },
      desc: { ja: "月相と薄い雲。月の高さが時刻を語ります。", en: "A moon with its phase and thin cloud; its height tells the hour." },
      _test: { phase: moonPhase },

      init: function (env) {
        fillAll(env, "#04060e");
        this.stars = [];
        var r = makeNoise(21);
        for (var i = 0; i < 150; i++) {
          this.stars.push({
            x: r.rnd(), y: r.rnd() * 0.78,
            s: 0.4 + r.rnd() * 1.1,
            a: 0.10 + r.rnd() * 0.45,
            ph: r.rnd() * TAU, sp: 0.05 + r.rnd() * 0.18
          });
        }
        this.clouds = [];
        for (var k = 0; k < 3; k++) {
          this.clouds.push({ y: 0.20 + k * 0.14, sp: 0.018 + k * 0.008, ph: k * 1.7, a: 0.160 - k * 0.030 });
        }
        this.glow = softSprite(512, "214,222,238", 0.5);
      },
      resize: function (env) { fillAll(env, "#04060e"); },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, t = env.t;
        var ck = env.clock;

        // 空
        var g = c.createLinearGradient(0, -20, 0, h + 20);
        g.addColorStop(0, "#04060e");
        g.addColorStop(0.55, "#070c17");
        g.addColorStop(1, "#0d1420");
        c.fillStyle = g;
        c.fillRect(-20, -20, w + 40, h + 40);

        // 星（ゆっくり瞬く）
        for (var i = 0; i < this.stars.length; i++) {
          var st = this.stars[i];
          var a = st.a * (0.62 + 0.38 * Math.sin(t * st.sp + st.ph));
          c.fillStyle = "rgba(226,234,248," + a.toFixed(3) + ")";
          c.fillRect(st.x * w, st.y * h, st.s, st.s);
        }

        // 月の位置: 18時=東の低い位置, 0時=南中, 6時=西の低い位置
        var hours = ck.h24 + ck.min / 60;
        var night = (hours >= 18 ? hours - 18 : hours + 6) / 12; // 0..1
        var mx = w * (0.14 + 0.72 * night);
        var my = h * (0.62 - Math.sin(Math.PI * clamp(night, 0, 1)) * 0.40);
        var R = Math.min(w, h) * 0.155;

        // 月暈
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.50 + 0.10 * Math.sin(t * 0.06);
        c.drawImage(this.glow, mx - R * 3.1, my - R * 3.1, R * 6.2, R * 6.2);
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";

        // 月本体
        c.save();
        c.beginPath();
        c.arc(mx, my, R, 0, TAU);
        c.clip();

        var mg = c.createRadialGradient(mx - R * 0.25, my - R * 0.3, R * 0.1, mx, my, R);
        mg.addColorStop(0, "#f2efe6");
        mg.addColorStop(0.72, "#dcd8cc");
        mg.addColorStop(1, "#b8b4a8");
        c.fillStyle = mg;
        c.fillRect(mx - R, my - R, R * 2, R * 2);

        // 海（模様）— 静かに形を変える
        for (var m = 0; m < 9; m++) {
          var ang = m * 2.399 + Math.sin(t * 0.01 + m) * 0.05;
          var rad = R * (0.18 + ((m * 37) % 100) / 240);
          var px = mx + Math.cos(ang) * rad;
          var py = my + Math.sin(ang) * rad * 0.82;
          var pr = R * (0.16 + ((m * 53) % 100) / 520);
          var pg = c.createRadialGradient(px, py, 0, px, py, pr);
          pg.addColorStop(0, "rgba(150,148,140,0.30)");
          pg.addColorStop(1, "rgba(150,148,140,0)");
          c.fillStyle = pg;
          c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
        }

        // 周辺減光
        var ld = c.createRadialGradient(mx, my, R * 0.55, mx, my, R);
        ld.addColorStop(0, "rgba(0,0,0,0)");
        ld.addColorStop(1, "rgba(20,22,30,0.42)");
        c.fillStyle = ld;
        c.fillRect(mx - R, my - R, R * 2, R * 2);

        // 月相 — 朔望月から照度を出し、影の円で欠けさせる
        var mp = moonPhase(env.now);
        var phase = mp.phase; // 0=新月 0.5=満月
        var illum = mp.illum;
        var shadowOffset = (1 - illum) * 2 * R;
        var dir = phase < 0.5 ? 1 : -1;
        c.fillStyle = "rgba(8,11,20,0.93)";
        c.beginPath();
        c.arc(mx + dir * shadowOffset, my, R * 1.02, 0, TAU);
        c.fill();
        c.restore();

        // 雲（月を横切る薄い帯）
        c.globalCompositeOperation = "source-over";
        for (var ci = 0; ci < this.clouds.length; ci++) {
          var cl = this.clouds[ci];
          var baseY = h * cl.y;
          for (var sIdx = 0; sIdx < 5; sIdx++) {
            var span = w * 0.55;
            var cx = ((t * cl.sp * w + sIdx * span * 0.5 + cl.ph * 300) % (w + span * 2)) - span;
            var cy = baseY + noise.n2(sIdx * 3.1 + ci, t * 0.01) * h * 0.03;
            var cw = span * (0.7 + 0.3 * Math.sin(sIdx + ci));
            var chh = h * (0.035 + 0.012 * ci);
            var cg = c.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.5);
            cg.addColorStop(0, "rgba(190,205,230," + cl.a.toFixed(3) + ")");
            cg.addColorStop(1, "rgba(190,205,230,0)");
            c.save();
            c.translate(cx, cy);
            c.scale(1, chh / (cw * 0.5));
            c.fillStyle = cg;
            c.beginPath(); c.arc(0, 0, cw * 0.5, 0, TAU); c.fill();
            c.restore();
          }
        }

        // 月を横切る薄い帯（動きがはっきり見えるように）
        for (var v = 0; v < 2; v++) {
          var vx = ((t * (0.020 + v * 0.013) * w + v * w * 0.55) % (w + R * 9)) - R * 4.5;
          var vy = my + Math.sin(t * 0.07 + v * 2.1) * R * 0.16;
          var vg = c.createRadialGradient(vx, vy, 0, vx, vy, R * 3.4);
          vg.addColorStop(0, "rgba(206,218,238,0.14)");
          vg.addColorStop(1, "rgba(206,218,238,0)");
          c.save();
          c.translate(vx, vy);
          c.scale(1, 0.20);
          c.fillStyle = vg;
          c.beginPath(); c.arc(0, 0, R * 3.4, 0, TAU); c.fill();
          c.restore();
        }

        // 時刻の弧（月の下に細く）
        var frac = (ck.h24 + ck.min / 60) / 24;
        c.strokeStyle = "rgba(226,234,248,0.18)";
        c.lineWidth = 1;
        c.beginPath();
        c.arc(mx, my, R * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        c.stroke();
      }
    };
  }

  /* ============================================================
     2. 雨の窓 — ガラスの向こうの街。明るさと色は時刻に連動する
     夜 → 明け（いまの昼の明るさ） → 昼（さらに明るい） → 暮れ（赤） → 夜
     ============================================================ */
  function hexRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lerpRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function css(rgb, alpha) {
    var r = Math.round(clamp(rgb[0], 0, 255)), g = Math.round(clamp(rgb[1], 0, 255)), b = Math.round(clamp(rgb[2], 0, 255));
    return alpha === undefined ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  /* 時刻 → { light: 0..1.15, warm: 0..1 } */
  var SKY_KEYS = [
    [4.5, 0.00, 0.00],
    [6.0, 0.55, 0.40],
    [7.5, 0.95, 0.12],
    [12.0, 1.15, 0.00],
    [16.0, 1.00, 0.05],
    [18.0, 0.72, 0.60],
    [19.5, 0.32, 0.50],
    [21.0, 0.00, 0.00]
  ];
  function skyState(c) {
    var h = c.h24 + c.min / 60;
    if (h <= SKY_KEYS[0][0] || h >= SKY_KEYS[SKY_KEYS.length - 1][0]) return { light: 0, warm: 0 };
    for (var i = 0; i < SKY_KEYS.length - 1; i++) {
      var a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
      if (h >= a[0] && h <= b[0]) {
        var t = (h - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);
        return { light: a[1] + (b[1] - a[1]) * t, warm: a[2] + (b[2] - a[2]) * t };
      }
    }
    return { light: 0, warm: 0 };
  }
  /* 夜 → 昼 → 真昼 の 3 段で色を作り、暮れは赤へ寄せる */
  function skyShade(nightHex, dayHex, brightHex, light, warm) {
    var night = hexRgb(nightHex), day = hexRgb(dayHex), bright = hexRgb(brightHex);
    var t1 = clamp(light, 0, 1);
    var rgb = lerpRgb(night, day, t1);
    if (light > 1) rgb = lerpRgb(rgb, bright, clamp((light - 1) / 0.15, 0, 1));
    if (warm > 0) rgb = lerpRgb(rgb, hexRgb("#e0915a"), warm * 0.40);
    return rgb;
  }

  function sceneRain() {
    return {
      id: "rain",
      name: { ja: "雨の窓", en: "Rain Window" },
      desc: { ja: "ガラスの向こうの街。明けは淡く、昼は明るく、暮れは赤く。", en: "A city beyond the glass: pale at dawn, bright at noon, red at dusk." },
      _test: { skyState: skyState },

      buildBackground: function (env, light, warm) {
        var w = env.w, h = env.h;
        var cv = document.createElement("canvas");
        cv.width = Math.max(2, Math.round(w));
        cv.height = Math.max(2, Math.round(h));
        var c = cv.getContext("2d");
        var r = makeNoise(77);
        var horizon = h * 0.63;

        // 空
        var sky = c.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, css(skyShade("#070c18", "#4d6479", "#7f9aad", light, warm)));
        sky.addColorStop(0.65, css(skyShade("#0c1626", "#7b8f9f", "#a7bccb", light, warm)));
        sky.addColorStop(1, css(skyShade("#1a2233", "#a9b8c2", "#d6e2e8", light, warm)));
        c.fillStyle = sky;
        c.fillRect(0, 0, w, horizon + 2);

        // 霞（夜は暖かく、昼は白く、暮れは赤く）
        var hazeCol = lerpRgb(lerpRgb(hexRgb("#ffc482"), hexRgb("#dfe8ee"), clamp(light, 0, 1)),
                              hexRgb("#e0915a"), warm * 0.45);
        var haze = c.createRadialGradient(w * 0.5, horizon, 0, w * 0.5, horizon, w * 0.75);
        haze.addColorStop(0, css(hazeCol, (0.22 * (1 - clamp(light, 0, 1) * 0.45)).toFixed(3)));
        haze.addColorStop(0.5, css(hazeCol, (0.08 * (1 - clamp(light, 0, 1) * 0.35)).toFixed(3)));
        haze.addColorStop(1, css(hazeCol, 0));
        c.fillStyle = haze;
        c.fillRect(0, 0, w, h);

        // 建物
        var x = -w * 0.05;
        var bldCol = skyShade("#060a12", "#5d707e", "#7d909c", light, warm);
        var lit = clamp(1 - clamp(light, 0, 1) * 0.9, 0, 1);
        while (x < w * 1.05) {
          var bw = w * (0.02 + r.rnd() * 0.05);
          var bh = h * (0.05 + r.rnd() * 0.20);
          var by = horizon - bh;
          c.fillStyle = css(bldCol, 0.96);
          c.fillRect(x, by, bw, bh + h * 0.1);
          var cols = Math.max(1, Math.floor(bw / (w * 0.011)));
          var rows = Math.max(1, Math.floor(bh / (h * 0.028)));
          for (var cy = 0; cy < rows; cy++) {
            for (var cx = 0; cx < cols; cx++) {
              if (r.rnd() < 0.30) continue;
              var wx = x + (cx + 0.5) * (bw / cols);
              var wy = by + (cy + 0.6) * (bh / rows);
              var warmWin = r.rnd() < 0.72;
              var wa = (0.30 + r.rnd() * 0.55) * lit;
              if (wa <= 0.01) continue;
              c.fillStyle = warmWin ? "rgba(255,214,165," + wa.toFixed(3) + ")"
                                    : "rgba(170,205,255," + (wa * 0.7).toFixed(3) + ")";
              c.fillRect(wx, wy, Math.max(1, w * 0.0035), Math.max(1, h * 0.005));
            }
          }
          x += bw + w * (0.002 + r.rnd() * 0.01);
        }

        // 路面
        var gnd = c.createLinearGradient(0, horizon, 0, h);
        gnd.addColorStop(0, css(skyShade("#0a0f18", "#54646f", "#6f8089", light, warm)));
        gnd.addColorStop(1, css(skyShade("#04070c", "#2c3a44", "#43525c", light, warm)));
        c.fillStyle = gnd;
        c.fillRect(0, horizon, w, h - horizon);

        // 街灯（昼は消える）
        var lampA = 0.85 * clamp(1 - clamp(light, 0, 1) * 0.95, 0, 1);
        if (lampA > 0.01) {
          for (var i = 0; i < 7; i++) {
            var lx = w * (0.06 + i * 0.14) + r.rnd() * w * 0.03;
            var ly = horizon + h * (0.02 + r.rnd() * 0.05);
            var rad = Math.min(w, h) * (0.05 + r.rnd() * 0.06);
            var warm2 = r.rnd() < 0.6;
            var lg = c.createRadialGradient(lx, ly, 0, lx, ly, rad);
            lg.addColorStop(0, warm2 ? "rgba(255,222,175," + lampA.toFixed(3) + ")"
                                     : "rgba(195,228,255," + (lampA * 0.9).toFixed(3) + ")");
            lg.addColorStop(0.35, warm2 ? "rgba(255,190,120," + (lampA * 0.35).toFixed(3) + ")"
                                        : "rgba(150,200,250," + (lampA * 0.28).toFixed(3) + ")");
            lg.addColorStop(1, "rgba(0,0,0,0)");
            c.fillStyle = lg;
            c.beginPath(); c.arc(lx, ly, rad, 0, TAU); c.fill();
            c.save();
            c.globalAlpha = 0.20 * lampA;
            c.fillStyle = lg;
            c.translate(lx, ly);
            c.scale(1, 2.6);
            c.beginPath(); c.arc(0, 0, rad * 0.55, 0, TAU); c.fill();
            c.restore();
          }
        }
        this.bg = cv;
        this.bgLight = light;
        this.bgWarm = warm;
      },

      init: function (env) {
        fillAll(env, "#05070c");
        var r = makeNoise(33);
        var st = skyState(env.clock);
        this.buildBackground(env, st.light, st.warm);

        this.farRain = [];
        for (var i = 0; i < 150; i++) {
          this.farRain.push({
            x: r.rnd(), y: r.rnd(),
            len: 0.02 + r.rnd() * 0.05,
            sp: 0.35 + r.rnd() * 0.9,
            a: 0.05 + r.rnd() * 0.13
          });
        }
        this.drops = [];
        for (var d = 0; d < 44; d++) {
          this.drops.push({ x: r.rnd(), y: r.rnd(), rr: 1.6 + r.rnd() * 4.0, next: 4 + r.rnd() * 40, run: 0, runY: 0 });
        }
        this.streaks = [];
        for (var s2 = 0; s2 < 3; s2++) this.streaks.push({ x: 0.18 + s2 * 0.31, ph: r.rnd() * TAU });
        this.ref = null; this.refText = "";
      },
      resize: function (env) { fillAll(env, "#05070c"); this.init(env); },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, t = env.t;
        var st = skyState(env.clock);
        if (!this.bg || Math.abs(st.light - this.bgLight) > 0.03 || Math.abs(st.warm - this.bgWarm) > 0.03) {
          this.buildBackground(env, st.light, st.warm);
        }

        c.drawImage(this.bg, 0, 0, w, h);

        // 遠景の雨（明るいほど見えにくい）
        var rainA = 1 - clamp(st.light, 0, 1) * 0.55;
        for (var i = 0; i < this.farRain.length; i++) {
          var f = this.farRain[i];
          f.y += f.sp * dt * 0.55;
          if (f.y > 1.04) { f.y = -0.04; f.x = Math.random(); }
          var fx = f.x * w, fy = f.y * h;
          var fl = f.len * h;
          c.strokeStyle = "rgba(200,218,238," + (f.a * rainA).toFixed(3) + ")";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(fx, fy);
          c.lineTo(fx - fl * 0.22, fy + fl);
          c.stroke();
        }

        // 映り込み（明るいほど薄い）
        var txt = hhmm(env.clock);
        if (!this.ref || this.refText !== txt) {
          var fs = Math.round(Math.min(w, h) * 0.16);
          var tmp = document.createElement("canvas");
          var tw2 = Math.round(txt.length * fs * 0.62) + fs;
          var th2 = Math.round(fs * 1.6);
          tmp.width = tw2; tmp.height = th2;
          var tx = tmp.getContext("2d");
          tx.font = "300 " + fs + "px ui-monospace,Consolas,Menlo,monospace";
          tx.textAlign = "center"; tx.textBaseline = "middle";
          tx.fillStyle = "rgba(226,238,252,0.9)";
          tx.fillText(txt, tw2 / 2, th2 / 2);
          this.ref = tmp; this.refText = txt;
        }
        var rw = this.ref.width, rh = this.ref.height;
        c.save();
        c.translate(w * 0.5, h * 0.58);
        c.scale(-1, 1);
        c.globalAlpha = 0.16 * (1 - clamp(st.light, 0, 1) * 0.5);
        c.shadowColor = "rgba(200,225,255,0.50)";
        c.shadowBlur = 30;
        var strip = 3;
        for (var sy = 0; sy < rh; sy += strip) {
          var wob = Math.sin(sy * 0.05 + t * 0.55) * 1.2 + Math.sin(sy * 0.017 - t * 0.31) * 0.8;
          c.drawImage(this.ref, 0, sy, rw, strip, -rw / 2 + wob, -rh / 2 + sy, rw, strip);
        }
        c.restore();

        // ガラスの膜
        var film = c.createLinearGradient(0, 0, w * 0.6, h);
        film.addColorStop(0, "rgba(120,160,210,0.05)");
        film.addColorStop(0.5, "rgba(30,45,70,0.10)");
        film.addColorStop(1, "rgba(10,16,28,0.16)");
        c.fillStyle = film;
        c.fillRect(-20, -20, w + 40, h + 40);

        // 暮れの赤み（全体に薄く）
        if (st.warm > 0.05) {
          c.save();
          c.globalCompositeOperation = "soft-light";
          c.fillStyle = "rgba(236,146,78," + (st.warm * 0.26).toFixed(3) + ")";
          c.fillRect(-20, -20, w + 40, h + 40);
          c.restore();
        }

        // 伝う筋
        c.strokeStyle = "rgba(205,225,250,0.06)";
        c.lineWidth = 1;
        for (var s3 = 0; s3 < this.streaks.length; s3++) {
          var sk = this.streaks[s3];
          c.beginPath();
          var sx = sk.x * w;
          c.moveTo(sx, -10);
          for (var yy = 0; yy <= h; yy += 24) c.lineTo(sx + Math.sin(yy * 0.01 + t * 0.08 + sk.ph) * 6, yy);
          c.stroke();
        }

        // 手前の滴
        for (var d2 = 0; d2 < this.drops.length; d2++) {
          var dr = this.drops[d2];
          dr.next -= dt;
          if (dr.next <= 0) { dr.run = 1; dr.runY = 0; dr.next = 20 + Math.random() * 50; }
          if (dr.run) {
            dr.runY += dt * (0.012 + dr.rr * 0.002);
            if (dr.runY > 0.35) { dr.run = 0; dr.y = Math.min(0.96, dr.y + dr.runY * 0.4); }
          }
          var dx = dr.x * w + Math.sin(t * 0.3 + d2) * 1.2;
          var dy = (dr.y + dr.runY) * h;
          var r2 = dr.rr * (Math.min(w, h) / 900 + 0.6);

          c.strokeStyle = "rgba(10,16,26,0.55)";
          c.lineWidth = Math.max(1, r2 * 0.5);
          c.beginPath(); c.arc(dx, dy, r2, 0, TAU); c.stroke();
          c.strokeStyle = "rgba(215,232,252,0.40)";
          c.lineWidth = 1;
          c.beginPath(); c.arc(dx, dy, r2, 0, TAU); c.stroke();
          c.fillStyle = "rgba(240,248,255,0.70)";
          c.beginPath(); c.arc(dx - r2 * 0.25, dy - r2 * 0.30, r2 * 0.30, 0, TAU); c.fill();
          c.fillStyle = "rgba(255,255,255,0.14)";
          c.beginPath(); c.arc(dx + r2 * 0.22, dy + r2 * 0.34, r2 * 0.24, 0, TAU); c.fill();

          if (dr.runY > 0.002) {
            c.strokeStyle = "rgba(200,220,245,0.09)";
            c.beginPath(); c.moveTo(dx, dr.y * h); c.lineTo(dx, dy); c.stroke();
          }
        }

        // 周辺減光
        var vig = c.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0," + (0.42 * (1 - clamp(st.light, 0, 1) * 0.45)).toFixed(3) + ")");
        c.fillStyle = vig;
        c.fillRect(-20, -20, w + 40, h + 40);
      }
    };
  }

  /* ============================================================
     3. 深海 — 光の柱と、舞い落ちる雪
     ============================================================ */
  function sceneDeep() {
    return {
      id: "deep",
      name: { ja: "深海", en: "Deep Water" },
      desc: { ja: "水面から差す光の柱と、ゆっくり沈む粒。", en: "Shafts of light from the surface and slow sinking motes." },

      init: function (env) {
        fillAll(env, "#01060c");
        var r = makeNoise(5);
        this.motes = [];
        for (var i = 0; i < 190; i++) {
          this.motes.push({
            x: r.rnd(), y: r.rnd(),
            sp: 0.004 + r.rnd() * 0.012,
            sw: 0.2 + r.rnd() * 0.7,
            ph: r.rnd() * TAU,
            sz: 0.6 + r.rnd() * 1.6,
            a: 0.08 + r.rnd() * 0.34
          });
        }
        this.shafts = [];
        for (var k = 0; k < 6; k++) {
          this.shafts.push({ x: 0.12 + k * 0.15, w: 0.03 + r.rnd() * 0.05, lean: -0.06 + r.rnd() * 0.12, ph: r.rnd() * TAU, a: 0.075 + r.rnd() * 0.085 });
        }
        this.mote = softSprite(64, "210,235,255", 0.9);
      },
      resize: function (env) { fillAll(env, "#01060c"); },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, t = env.t;

        var g = c.createLinearGradient(0, -20, 0, h + 20);
        g.addColorStop(0, "#0a2b3d");
        g.addColorStop(0.35, "#02101a");
        g.addColorStop(1, "#000409");
        c.fillStyle = g;
        c.fillRect(-20, -20, w + 40, h + 40);

        // 水面の明るみ
        c.globalCompositeOperation = "lighter";
        var sg = c.createRadialGradient(w * 0.34, -h * 0.1, 0, w * 0.34, -h * 0.1, Math.min(w, h) * 0.85);
        sg.addColorStop(0, "rgba(150,215,245,0.12)");
        sg.addColorStop(1, "rgba(150,215,245,0)");
        c.fillStyle = sg;
        c.fillRect(-20, -20, w + 40, h + 40);

        // 光の柱（ゆっくり揺れる）
        for (var i = 0; i < this.shafts.length; i++) {
          var s = this.shafts[i];
          var sway = Math.sin(t * 0.05 + s.ph) * 0.02;
          var x0 = (s.x + sway) * w;
          var wd = s.w * w;
          var lg = c.createLinearGradient(0, 0, 0, h);
          var a = s.a * (0.75 + 0.25 * Math.sin(t * 0.09 + s.ph));
          lg.addColorStop(0, "rgba(185,235,255," + (a * 1.35).toFixed(3) + ")");
          lg.addColorStop(0.55, "rgba(130,200,235," + (a * 0.32).toFixed(3) + ")");
          lg.addColorStop(1, "rgba(120,190,230,0)");
          c.fillStyle = lg;
          c.beginPath();
          c.moveTo(x0, -10);
          c.lineTo(x0 + wd, -10);
          c.lineTo(x0 + wd + s.lean * w, h + 10);
          c.lineTo(x0 + s.lean * w - wd * 0.3, h + 10);
          c.closePath();
          c.fill();
          // 柱の芯（細い高輝度）
          var coreA = a * 1.6;
          c.strokeStyle = "rgba(215,245,255," + Math.min(0.5, coreA).toFixed(3) + ")";
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(x0 + wd * 0.5, -10);
          c.lineTo(x0 + wd * 0.5 + s.lean * w * 0.45, h * 0.45);
          c.stroke();
        }
        c.globalCompositeOperation = "source-over";

        // マリンスノー
        for (var m = 0; m < this.motes.length; m++) {
          var p = this.motes[m];
          p.y += p.sp * dt * 60;
          if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
          var px = (p.x + Math.sin(t * 0.15 + p.ph) * 0.004 * p.sw) * w;
          var py = p.y * h;
          var sz = p.sz * (Math.min(w, h) / 800 + 0.5) * 3;
          c.globalAlpha = p.a;
          c.drawImage(this.mote, px - sz, py - sz, sz * 2, sz * 2);
        }
        c.globalAlpha = 1;

        // 時刻（水中ににじむ）
        var ck = env.clock;
        c.save();
        c.globalAlpha = 0.20;
        c.fillStyle = "#cfe9f7";
        c.shadowColor = "rgba(160,220,245,0.6)";
        c.shadowBlur = 22;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "200 " + Math.round(Math.min(w, h) * 0.17) + "px ui-monospace,Consolas,Menlo,monospace";
        c.fillText(hhmm(ck), w * 0.5, h * 0.8);
        c.restore();
      }
    };
  }

  /* ============================================================
     4. インク — 水に落ちた墨がゆっくり咲く
     ============================================================ */
  function sceneInk() {
    return {
      id: "ink",
      name: { ja: "インク", en: "Ink" },
      desc: { ja: "水に落ちた墨が、ゆっくりと花のように開きます。", en: "Ink dropped in water, opening like a flower." },

      init: function (env) {
        fillAll(env, "#040404");
        this.buf = document.createElement("canvas");
        this.buf.width = Math.max(2, Math.round(env.w * 0.5));
        this.buf.height = Math.max(2, Math.round(env.h * 0.5));
        this.bc = this.buf.getContext("2d");
        this.bc.fillStyle = "#040404";
        this.bc.fillRect(0, 0, this.buf.width, this.buf.height);
        this.noise = makeNoise(17);
        this.parts = [];
        this.emitters = [{ x: 0.42, y: 0.38, born: 0, life: 40, hue: "224,164,92" }, { x: 0.62, y: 0.55, born: 0, life: 34, hue: "111,199,194" }];
        this.nextEmitter = 8;
        this.dot = {};
      },
      resize: function (env) {
        fillAll(env, "#040404");
        this.init(env);
      },

      spawn: function (em) {
        var n = 10 + ((Math.random() * 8) | 0);
        for (var i = 0; i < n; i++) {
          var a = Math.random() * TAU;
          var sp = 0.0012 + Math.random() * 0.0035;
          this.parts.push({
            x: em.x + (Math.random() - 0.5) * 0.01,
            y: em.y + (Math.random() - 0.5) * 0.01,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            age: 0, life: 10 + Math.random() * 16, hue: em.hue
          });
        }
      },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, t = env.t;
        var bw = this.buf.width, bh = this.buf.height;

        // 発光体の管理
        this.nextEmitter -= dt;
        if (this.nextEmitter <= 0) {
          this.nextEmitter = 14 + Math.random() * 16;
          var hues = ["224,164,92", "111,199,194", "200,214,235"];
          this.emitters.push({
            x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6,
            born: t, life: 22 + Math.random() * 12,
            hue: hues[(Math.random() * hues.length) | 0]
          });
        }
        for (var e = this.emitters.length - 1; e >= 0; e--) {
          var em = this.emitters[e];
          if (t - em.born < em.life) {
            if (Math.random() < 0.06 && this.parts.length < 900) this.spawn(em);
          } else this.emitters.splice(e, 1);
        }

        // 墨の移動（curl 風の流れ）
        var bc = this.bc;
        bc.globalCompositeOperation = "source-over";
        bc.fillStyle = "rgba(4,4,4,0.045)";
        bc.fillRect(0, 0, bw, bh);
        bc.globalCompositeOperation = "lighter";

        for (var i = this.parts.length - 1; i >= 0; i--) {
          var p = this.parts[i];
          p.age += dt;
          if (p.age > p.life) { this.parts.splice(i, 1); continue; }
          var n1 = this.noise.n2(p.x * 6 + t * 0.03, p.y * 6);
          var n2 = this.noise.n2(p.y * 6 + 40, p.x * 6 - t * 0.02);
          p.vx += (n2 * 0.00016 - p.vx * 0.02) * dt * 60 * 0.02;
          p.vy += (n1 * 0.00016 - p.vy * 0.02) * dt * 60 * 0.02;
          p.x += p.vx * dt * 60;
          p.y += p.vy * dt * 60;

          var fade = Math.sin(Math.PI * clamp(p.age / p.life, 0, 1));
          var sz = (0.024 + p.age * 0.0028) * Math.min(bw, bh);
          var key = p.hue;
          if (!this.dot[key]) this.dot[key] = softSprite(64, key, 0.9);
          bc.globalAlpha = 0.10 * fade;
          bc.drawImage(this.dot[key], p.x * bw - sz, p.y * bh - sz, sz * 2, sz * 2);
        }
        bc.globalAlpha = 1;

        // 背景 + 墨を拡大描画
        c.fillStyle = "#040404";
        c.fillRect(-20, -20, w + 40, h + 40);
        c.drawImage(this.buf, -10, -10, w + 20, h + 20);

        // 時刻（墨の向こうに薄く）
        var ck = env.clock;
        c.save();
        c.globalAlpha = 0.10;
        c.fillStyle = "#e8dcc6";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "300 " + Math.round(Math.min(w, h) * 0.2) + "px ui-monospace,Consolas,Menlo,monospace";
        c.fillText(hhmm(ck), w * 0.5, h * 0.5);
        c.restore();
      }
    };
  }

  /* ============================================================
     5. 砂 — 砂時計そのものが時計。砂の量が「今」
     ============================================================ */
  function sceneSand() {
    return {
      id: "sand",
      name: { ja: "砂", en: "Sand" },
      desc: { ja: "砂時計。落ちた砂の量が、そのまま今の時刻です。", en: "An hourglass; the sand that has fallen is the time." },

      init: function (env) { fillAll(env, "#0a0806"); this.grains = []; },
      resize: function (env) { fillAll(env, "#0a0806"); },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, ck = env.clock;
        var g = c.createLinearGradient(0, -20, 0, h + 20);
        g.addColorStop(0, "#0b0908");
        g.addColorStop(1, "#060504");
        c.fillStyle = g;
        c.fillRect(-20, -20, w + 40, h + 40);

        var cx = w * 0.5, cy = h * 0.5;
        var hh = Math.min(h * 0.56, w * 0.42);      // 全体の高さ
        var top = cy - hh * 0.5, bot = cy + hh * 0.5;
        var halfW = hh * 0.30;                       // 一番広いところ
        var neck = hh * 0.022;

        var frac = (ck.min + ck.sec / 60) / 60;      // 0..1 今の分
        var topFill = 1 - frac, botFill = frac;

        // ガラス
        c.strokeStyle = "rgba(226,214,190,0.20)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx - halfW, top);
        c.lineTo(cx - neck, cy);
        c.lineTo(cx - halfW, bot);
        c.lineTo(cx + halfW, bot);
        c.lineTo(cx + neck, cy);
        c.lineTo(cx + halfW, top);
        c.closePath();
        c.stroke();

        // ガラスのハイライト
        var hl = c.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
        hl.addColorStop(0, "rgba(255,255,255,0.05)");
        hl.addColorStop(0.18, "rgba(255,255,255,0.015)");
        hl.addColorStop(0.8, "rgba(255,255,255,0)");
        hl.addColorStop(1, "rgba(255,255,255,0.03)");
        c.fillStyle = hl;
        c.fillRect(cx - halfW, top, halfW * 2, hh);

        // 砂（上）
        var sandTop = "rgba(222,184,126,0.95)";
        c.fillStyle = sandTop;
        c.beginPath();
        var yTop = cy - (cy - top) * topFill;
        c.moveTo(cx - (halfW - neck) * (yTop - top) / (cy - top) - neck, yTop);
        c.lineTo(cx + (halfW - neck) * (yTop - top) / (cy - top) + neck, yTop);
        c.lineTo(cx + neck, cy);
        c.lineTo(cx - neck, cy);
        c.closePath();
        c.fill();

        // 砂（下）
        c.beginPath();
        var yBot = cy + (bot - cy) * botFill;
        c.moveTo(cx - (halfW - neck) * (bot - yBot) / (bot - cy) - neck, yBot);
        c.lineTo(cx + (halfW - neck) * (bot - yBot) / (bot - cy) + neck, yBot);
        c.lineTo(cx + halfW, bot);
        c.lineTo(cx - halfW, bot);
        c.closePath();
        c.fill();

        // 砂粒の質感
        var rnd = makeNoise(41);
        c.fillStyle = "rgba(120,92,54,0.35)";
        for (var i = 0; i < 160; i++) {
          var gx = cx + (rnd.rnd() - 0.5) * halfW * 1.6;
          var gy = cy + (rnd.rnd() - 0.5) * hh * 0.9;
          c.fillRect(gx, gy, 1, 1);
        }

        // 落ちる筋
        c.strokeStyle = "rgba(224,190,136,0.5)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, cy - neck);
        c.lineTo(cx, cy + neck * 2);
        c.stroke();

        // 時刻（台に刻む）
        c.fillStyle = "rgba(226,214,190,0.35)";
        c.textAlign = "center";
        c.textBaseline = "top";
        c.font = "400 " + Math.round(Math.min(w, h) * 0.028) + "px ui-monospace,Consolas,Menlo,monospace";
        c.fillText(hhmm(ck), cx, bot + hh * 0.08);
      }
    };
  }

  /* ============================================================
     6. 紙 — 活版の時刻。紙の繊維と、にじむインク
     ============================================================ */
  function scenePaper() {
    var DAYS = ["日", "月", "火", "水", "木", "金", "土"];
    var KAN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    var HOURS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
    var MINS = ["", "五", "十", "十五", "二十", "二十五", "三十", "三十五", "四十", "四十五", "五十", "五十五"];
    function kanjiDay(d) {
      var t = Math.floor(d / 10), o = d % 10;
      var tens = t === 0 ? "" : (t === 1 ? "十" : KAN[t] + "十");
      return tens + (o ? KAN[o] : (t ? "" : KAN[d])) + "日";
    }
    function kanjiTime(c) {
      var h = HOURS[c.h24 % 24] || "零";
      var m = MINS[Math.floor(c.min / 5)];
      return h + "時" + (m ? m + "分" : "");
    }
    var MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    return {
      id: "paper",
      name: { ja: "紙", en: "Paper" },
      desc: { ja: "紙に組んだ時刻。インクがゆっくり紙に沈みます。", en: "A time set in paper; the ink slowly sinks in." },
      _test: { kanjiTime: kanjiTime, kanjiDay: kanjiDay, MONTHS: MONTHS },

      init: function (env) {
        fillAll(env, "#12100d");
        this.tex = document.createElement("canvas");
        var tw = Math.max(2, Math.round(env.w * 0.5)), th = Math.max(2, Math.round(env.h * 0.5));
        this.tex.width = tw; this.tex.height = th;
        var x = this.tex.getContext("2d");
        x.fillStyle = "#12100d";
        x.fillRect(0, 0, tw, th);
        var r = makeNoise(63);
        for (var i = 0; i < 2600; i++) {
          var px = r.rnd() * tw, py = r.rnd() * th;
          var len = 4 + r.rnd() * 18;
          var a = r.rnd() * TAU;
          x.strokeStyle = "rgba(226,214,190," + (0.012 + r.rnd() * 0.02).toFixed(3) + ")";
          x.lineWidth = 0.6;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
        }
      },
      resize: function (env) { this.init(env); },

      frame: function (env, dt) {
        var c = env.ctx, w = env.w, h = env.h, ck = env.clock, now = env.now;
        c.drawImage(this.tex, -10, -10, w + 20, h + 20);

        var cx = w * 0.5, cy = h * 0.5;
        var big = Math.round(Math.min(w, h) * 0.22);
        var txt = kanjiTime(ck);

        c.textAlign = "center";
        c.textBaseline = "middle";

        // 罫線
        c.strokeStyle = "rgba(226,214,190,0.13)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx - big * 2.1, cy - big * 0.78);
        c.lineTo(cx + big * 2.1, cy - big * 0.78);
        c.moveTo(cx - big * 2.1, cy + big * 0.78);
        c.lineTo(cx + big * 2.1, cy + big * 0.78);
        c.stroke();

        // 活版の時刻（沈み込み + にじみ）
        var font = "500 " + big + "px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
        c.font = font;
        var tw = c.measureText(txt).width;
        if (tw > w * 0.78) {
          big = Math.floor(big * (w * 0.78) / tw);
          font = "500 " + big + "px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
          c.font = font;
        }
        c.fillStyle = "rgba(0,0,0,0.55)";
        c.fillText(txt, cx + 1.5, cy + 2.5);
        c.fillStyle = "rgba(236,228,210,0.95)";
        c.fillText(txt, cx, cy);

        // インクのにじみ（薄い二重写し）
        c.save();
        c.globalAlpha = 0.14 + 0.03 * Math.sin(env.t * 0.2);
        c.filter = "blur(6px)";
        c.fillStyle = "#e8e0ce";
        c.fillText(txt, cx + Math.sin(env.t * 0.05) * 0.8, cy + Math.cos(env.t * 0.04) * 0.8);
        c.restore();

        // 日付
        var d = now.getDate(), mo = now.getMonth(), dy = now.getDay();
        c.font = "400 " + Math.round(big * 0.17) + "px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
        c.fillStyle = "rgba(226,214,190,0.55)";
        c.fillText(MONTHS[mo] + kanjiDay(d) + " " + DAYS[dy] + "曜日", cx, cy + big * 0.95);

        // 分の進み（下辺の細い線）
        var frac = (ck.min * 60 + ck.sec) / 3600;
        c.strokeStyle = "rgba(226,214,190,0.22)";
        c.beginPath();
        c.moveTo(cx - big * 2.1, h * 0.86);
        c.lineTo(cx - big * 2.1 + big * 4.2 * frac, h * 0.86);
        c.stroke();
      }
    };
  }

  global.SCENES = [sceneMoon(), sceneRain(), sceneDeep(), sceneInk(), sceneSand(), scenePaper()];
})(typeof window !== "undefined" ? window : this);
