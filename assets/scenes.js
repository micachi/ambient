/* ============================================================
   アンビエント・シーン集（Canvas 2D のみ／依存ゼロ）
   長時間の表示を前提に、次のことを守っている
     ・強い明滅をしない（輝度は徐々に変える）
     ・動きは遅い（目の追従に優しさ）
     ・焼き付き防止のドリフトはエンジン側で全体に加算される
   ============================================================ */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---- 高速 sin 参照表（波干渉で 1フレーム数十万回呼ぶため） ---- */
  var SINN = 4096;
  var SINTAB = new Float32Array(SINN);
  for (var i = 0; i < SINN; i++) SINTAB[i] = Math.sin((i / SINN) * TAU);
  function fsin(x) {
    var idx = (x * (SINN / TAU)) | 0;
    return SINTAB[idx & (SINN - 1)];
  }

  /* ---- 値ノイズ（滑らかに補間される乱場） ---- */
  function makeNoise(seed) {
    var s = (seed >>> 0) || 1;
    var rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    var perm = new Uint8Array(256);
    for (var i = 0; i < 256; i++) perm[i] = i;
    for (var j = 255; j > 0; j--) {
      var k = (rnd() * (j + 1)) | 0;
      var t = perm[j]; perm[j] = perm[k]; perm[k] = t;
    }
    var P = new Uint8Array(512);
    for (var m = 0; m < 512; m++) P[m] = perm[m & 255];
    // ハッシュ値を -1..1 に落とす
    var h1 = function (n) { return (((n * 1103515245 + 12345) >>> 8) & 0xffff) / 32768 - 1; };
    var fade = function (t) { return t * t * (3 - 2 * t); };
    return {
      rnd: rnd,
      n2: function (x, y) {
        var xi = Math.floor(x), yi = Math.floor(y);
        var X = xi & 255, Y = yi & 255;
        var u = fade(x - xi), v = fade(y - yi);
        var aa = P[P[X] + Y], ab = P[P[X] + Y + 1];
        var ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
        return lerp(lerp(h1(aa), h1(ba), u), lerp(h1(ab), h1(bb), u), v);
      },
    };
  }

  /* ---- 全面塗り。ドリフトで端が空き所以外を覆う ---- */
  function fillAll(env, style) {
    var p = env.driftAmp + 2;
    env.ctx.fillStyle = style;
    env.ctx.fillRect(-p, -p, env.w + p * 2, env.h + p * 2);
  }

  /* ============================================================
     1. 残像秒針 — 長秒針を長い露光のように眺める
     ============================================================ */
  function sceneTrail() {
    return {
      id: "trail",
      name: { ja: "残像秒針", en: "Trail Clock" },
      desc: { ja: "秒針の軌跡を、長い露光のように残像で眺めます。", en: "The second hand, left to fade like a long exposure." },

      init: function (env) {
        fillAll(env, "#070910");
        this.ticks = [];
        for (var i = 0; i < 60; i++) this.ticks.push(i);
      },
      resize: function (env) { fillAll(env, "#070910"); },

      frame: function (env, dt) {
        var c = env.ctx;
        // 残像の消え残り方そのものがこのシーンの主役なので、薄く重ねるだけ
        c.globalCompositeOperation = "source-over";
        fillAll(env, "rgba(7,9,16,0.055)");

        var R = Math.min(env.w, env.h) * 0.33;
        var cx = env.w / 2, cy = env.h / 2;
        var sec = env.clock.sec + env.clock.ms / 1000;
        var min = env.clock.min + sec / 60;
        var hr = (env.clock.h24 % 12) + min / 60;

        // 文字盤の目盛り（1時間は太く、5分ごとに長く）。常に同じ位置だと焼き付くので
        // 全体ドリフトに任せるが、輝度は抑えてある。
        c.save();
        c.translate(cx, cy);
        for (var i = 0; i < 60; i++) {
          var a = (i / 60) * TAU - Math.PI / 2;
          var big = i % 5 === 0;
          var r0 = R * (big ? 0.9 : 0.955);
          var r1 = R * 0.99;
          c.strokeStyle = big ? "rgba(150,175,215,0.20)" : "rgba(150,175,215,0.07)";
          c.lineWidth = big ? 2 : 1;
          c.beginPath();
          c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          c.stroke();
        }
        c.restore();

        var hand = function (ang, len, w, col, tail) {
          c.save();
          c.translate(cx, cy);
          c.rotate(ang);
          c.strokeStyle = col;
          c.lineWidth = w;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(-R * (tail || 0.12), 0);
          c.lineTo(len, 0);
          c.stroke();
          c.restore();
        };

        // 時・分は「在る」程度に。秒針だけが光る。
        hand((hr / 12) * TAU - Math.PI / 2, R * 0.5, 4.5, "rgba(140,165,205,0.16)", 0.16);
        hand((min / 60) * TAU - Math.PI / 2, R * 0.82, 3, "rgba(150,180,220,0.20)", 0.14);
        hand((sec / 60) * TAU - Math.PI / 2, R * 0.94, 2, "rgba(120,190,255,0.85)", 0.18);

        // 中心の光
        var g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.09);
        g.addColorStop(0, "rgba(190,220,255,0.55)");
        g.addColorStop(1, "rgba(190,220,255,0)");
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, R * 0.09, 0, TAU);
        c.fill();
      },
    };
  }

  /* ============================================================
     2. 言葉の時計 — 文章として光る
     ============================================================ */
  function sceneWord() {
    // 分は 5 分刻みのトークン、正確な分は下部のプログレスで示す（ワードクロックの定石）
    var JA = {
      rows: [
        [["今は", "now"], ["午前", "am"], ["午後", "pm"]],
        [["一時", "h1"], ["二時", "h2"], ["三時", "h3"], ["四時", "h4"]],
        [["五時", "h5"], ["六時", "h6"], ["七時", "h7"], ["八時", "h8"]],
        [["九時", "h9"], ["十時", "h10"], ["十一時", "h11"], ["十二時", "h12"]],
        [["ちょうど", "m0"], ["五分", "m5"], ["十分", "m10"], ["十五分", "m15"]],
        [["二十分", "m20"], ["二十五分", "m25"], ["三十分", "m30"], ["三十五分", "m35"]],
        [["四十分", "m40"], ["四十五分", "m45"], ["五十分", "m50"], ["五十五分", "m55"]],
      ],
      font: '"Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif',
    };
    var EN = {
      rows: [
        [["IT IS", "now"], ["O'CLOCK", "m0"]],
        [["FIVE", "m5"], ["TEN", "m10"], ["QUARTER", "m15"], ["TWENTY", "m20"]],
        [["HALF", "m30"], ["TWENTYFIVE", "m25"], ["PAST", "past"], ["TO", "to"]],
        [["ONE", "h1"], ["TWO", "h2"], ["THREE", "h3"], ["FOUR", "h4"]],
        [["FIVE", "h5"], ["SIX", "h6"], ["SEVEN", "h7"], ["EIGHT", "h8"]],
        [["NINE", "h9"], ["TEN", "h10"], ["ELEVEN", "h11"], ["TWELVE", "h12"]],
        [["MORNING", "morning"], ["AFTERNOON", "afternoon"], ["EVENING", "evening"], ["NIGHT", "night"]],
      ],
      font: '"Helvetica Neue",Arial,system-ui,sans-serif',
    };

    // 分は 5 分刻みのトークンに丸め、正確な分は下部のプログレスで示す（ワードクロックの定石）。
    // ただし丸めて 60 分になったときは「次の時」に繰り上げる
    // （2:58 を 「2時ちょうど」と出さないため）。
    var MIN_TOKENS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    /* 5 分丸めで分が 60 になった日は「時」側へ繰り上げる。
       繰り上げは am/pm も含めて先に行う（23:59 を「午後」と出さないため）。 */
    function roundUp(h24, m) {
      var b = Math.round(m / 5);
      if (b === 12) { b = 0; h24 = (h24 + 1) % 24; }
      return { h24: h24, b: b };
    }
    function to12(h24) { var h = h24 % 12; return h === 0 ? 12 : h; }

    function activeKeysJa(d) {
      var r = roundUp(d.getHours(), d.getMinutes());
      return ["now", r.h24 < 12 ? "am" : "pm", "h" + to12(r.h24), "m" + MIN_TOKENS[r.b]];
    }

    function activeKeysEn(d) {
      var r = roundUp(d.getHours(), d.getMinutes());
      var h12 = to12(r.h24);
      var keys = ["now"];
      if (r.b === 0) {
        keys.push("m0", "past");
      } else if (r.b <= 6) {
        keys.push("m" + MIN_TOKENS[r.b], "past");
      } else {
        keys.push("m" + MIN_TOKENS[12 - r.b], "to");
        h12 = h12 === 12 ? 1 : h12 + 1;
      }
      keys.push("h" + h12);
      keys.push(r.h24 < 5 ? "night" : r.h24 < 12 ? "morning" : r.h24 < 18 ? "afternoon" : "evening");
      return keys;
    }

    return {
      id: "word",
      // テスト用に内部マッピングを公開（描画ロジックと切り離して検証するため）
      _test: {
        activeKeysJa: activeKeysJa, activeKeysEn: activeKeysEn, MIN_TOKENS: MIN_TOKENS,
        rowsJa: JA.rows, rowsEn: EN.rows,
      },
      name: { ja: "言葉の時計", en: "Word Clock" },
      desc: { ja: "時刻を文章で表示します。光る語が変わっていくのを眺めます。", en: "The time spelled out; watch which words light up." },

      init: function () { this.fade = {}; },
      resize: function () {},

      frame: function (env, dt) {
        var c = env.ctx;
        fillAll(env, "#080a11");
        var L = env.lang === "en" ? EN : JA;
        var rows = L.rows;
        var active = env.lang === "en" ? activeKeysEn(env.now) : activeKeysJa(env.now);

        // 各行のトークン幅を測って、全体が画面に収まる字号を決める
        var maxCols = 0, maxChars = 0;
        rows.forEach(function (r) {
          maxCols = Math.max(maxCols, r.length);
          r.forEach(function (t) { maxChars = Math.max(maxChars, t[0].length); });
        });
        var fs = Math.min(
          (env.w * 0.86) / (maxCols * 1.55),
          (env.h * 0.72) / (rows.length * 1.5)
        );
        fs = Math.max(14, fs);
        c.font = "600 " + fs.toFixed(1) + "px " + L.font;
        c.textAlign = "center";
        c.textBaseline = "middle";

        var rowH = fs * 1.5;
        var top = env.h / 2 - ((rows.length - 1) * rowH) / 2;

        for (var r = 0; r < rows.length; r++) {
          var toks = rows[r];
          var widths = toks.map(function (t) { return c.measureText(t[0]).width; });
          var gap = fs * 0.55;
          var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (toks.length - 1);
          var x = env.w / 2 - total / 2;
          for (var k = 0; k < toks.length; k++) {
            var key = toks[k][1];
            var on = active.indexOf(key) >= 0;
            // 点灯はフェードさせる（瞬間 ON だと明滅になってしまう）
            var cur = this.fade[key] == null ? (on ? 1 : 0) : this.fade[key];
            var tgt = on ? 1 : 0;
            cur += (tgt - cur) * clamp(dt * 2.2, 0, 1);
            this.fade[key] = cur;

            var w = widths[k];
            var cx = x + w / 2;
            var cy = top + r * rowH;
            // 消字（とても暗く常時表示）＋ 点字
            c.fillStyle = "rgba(150,170,200," + (0.055 + 0.02 * cur).toFixed(3) + ")";
            c.fillText(toks[k][0], cx, cy);
            if (cur > 0.01) {
              c.fillStyle = "rgba(190,225,255," + (0.9 * cur).toFixed(3) + ")";
              c.shadowColor = "rgba(110,180,255," + (0.5 * cur).toFixed(3) + ")";
              c.shadowBlur = fs * 0.5 * cur;
              c.fillText(toks[k][0], cx, cy);
              c.shadowBlur = 0;
            }
            x += w + gap;
          }
        }

        // 正確な分（5分刻みでは無い部分）を細いプログレスで正直に示す
        var m = env.now.getMinutes(), s = env.now.getSeconds();
        var frac = (m * 60 + s) / 3600;
        var bw = env.w * 0.5, bx = env.w / 2 - bw / 2, by = top + rows.length * rowH - rowH * 0.25;
        c.fillStyle = "rgba(150,170,200,0.10)";
        c.fillRect(bx, by, bw, 2);
        c.fillStyle = "rgba(120,190,255,0.55)";
        c.fillRect(bx, by, bw * frac, 2);
      },
    };
  }

  /* ============================================================
     3. 粒子時計 — 分が変わるたび、粒子が流れて数字になる
     ============================================================ */
  function sceneParticles() {
    var off = document.createElement("canvas");
    var octx = off.getContext("2d", { willReadFrequently: true });

    function sample(text, w, h, step) {
      off.width = Math.max(2, Math.floor(w / 2));
      off.height = Math.max(2, Math.floor(h / 2));
      octx.clearRect(0, 0, off.width, off.height);
      octx.fillStyle = "#fff";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      var fs = Math.min(off.width / (text.length * 0.72), off.height * 0.52);
      octx.font = "700 " + fs.toFixed(1) + 'px ui-monospace,"Consolas","Menlo",monospace';
      octx.fillText(text, off.width / 2, off.height / 2);
      var img = octx.getImageData(0, 0, off.width, off.height).data;
      var pts = [];
      for (var y = 0; y < off.height; y += step) {
        for (var x = 0; x < off.width; x += step) {
          if (img[(y * off.width + x) * 4 + 3] > 140) {
            pts.push([x * 2, y * 2]);
          }
        }
      }
      return pts;
    }

    return {
      id: "particles",
      name: { ja: "粒子時計", en: "Particle Clock" },
      desc: { ja: "分が変わるたび、粒子が流れて時刻の数字を組み直します。", en: "Every minute the particles reflow into the new time." },

      init: function (env) {
        this.n = env.w < 700 ? 900 : 1600;
        this.parts = [];
        this.targets = [];
        this.key = "";
        this.t = 0;
      },
      resize: function (env) { this.key = ""; },

      frame: function (env, dt) {
        var c = env.ctx;
        c.globalCompositeOperation = "source-over";
        fillAll(env, "rgba(8,10,17,0.20)");

        var hh = String(env.clock.h24).padStart(2, "0");
        var mm = String(env.clock.min).padStart(2, "0");
        var key = hh + ":" + mm;

        if (key !== this.key) {
          this.key = key;
          var pts = sample(key, env.w, env.h, env.w < 700 ? 9 : 7);
          if (!pts.length) return;
          // 粒子数に合わせてターゲットを複製／間引き
          var t = [];
          for (var i = 0; i < this.n; i++) t.push(pts[(Math.random() * pts.length) | 0]);
          this.targets = t;
          // 最初の一度だけ、画面外から流し込む
          if (!this.parts.length) {
            for (var j = 0; j < this.n; j++) {
              this.parts.push({
                x: Math.random() * env.w, y: Math.random() * env.h,
                vx: 0, vy: 0,
              });
            }
          }
        }
        if (!this.targets.length) return;

        c.globalCompositeOperation = "lighter";
        for (var p = 0; p < this.parts.length; p++) {
          var pt = this.parts[p];
          var tg = this.targets[p];
          // ターゲットへの緩やかな収束＋ゆらぎ（収束しきらないことで生き続ける）
          var dx = tg[0] - pt.x, dy = tg[1] - pt.y;
          pt.vx += dx * 0.0060 * (dt * 60) + (Math.random() - 0.5) * 0.16;
          pt.vy += dy * 0.0060 * (dt * 60) + (Math.random() - 0.5) * 0.16;
          pt.vx *= 0.90; pt.vy *= 0.90;
          pt.x += pt.vx; pt.y += pt.vy;

          var sp = Math.min(1, Math.sqrt(pt.vx * pt.vx + pt.vy * pt.vy) / 6);
          // 速い間は青白く、収束すると落ち着いた青へ
          var rr = Math.round(lerp(90, 150, sp));
          var gg = Math.round(lerp(150, 210, sp));
          var bb = 255;
          c.fillStyle = "rgba(" + rr + "," + gg + "," + bb + "," + (0.16 + 0.30 * sp).toFixed(3) + ")";
          c.fillRect(pt.x, pt.y, 2, 2);
        }
        c.globalCompositeOperation = "source-over";
      },
    };
  }

  /* ============================================================
     4. 流れ場 — ノイズの場を粒子が流れ続ける
     ============================================================ */
  function sceneFlow() {
    return {
      id: "flow",
      name: { ja: "流れ場", en: "Flow Field" },
      desc: { ja: "ゆっくり形を変えるノイズの場を、粒子が流れ続けます。", en: "Particles drifting through a slowly morphing noise field." },

      init: function (env) {
        this.nz = makeNoise(20260921);
        this.n = env.w < 700 ? 700 : 1300;
        this.p = [];
        for (var i = 0; i < this.n; i++) {
          this.p.push({
            x: Math.random() * env.w, y: Math.random() * env.h,
            a: Math.random(), life: Math.random() * 6,
          });
        }
        fillAll(env, "#070a11");
      },
      resize: function (env) { fillAll(env, "#070a11"); },

      frame: function (env, dt) {
        var c = env.ctx;
        fillAll(env, "rgba(7,10,17,0.035)");
        c.globalCompositeOperation = "lighter";
        c.lineCap = "round";

        var t = env.t;
        var scale = 0.0016;
        for (var i = 0; i < this.p.length; i++) {
          var q = this.p[i];
          var ang = this.nz.n2(q.x * scale, q.y * scale + t * 0.035) * TAU * 1.6
                  + this.nz.n2(q.y * scale * 0.5 - t * 0.02, q.x * scale * 0.5) * 1.2;
          var sp = 26 + q.a * 34;
          var px = q.x, py = q.y;
          q.x += Math.cos(ang) * sp * dt;
          q.y += Math.sin(ang) * sp * dt;
          q.life -= dt;

          // 寿命が来たら、場の中で別の場所に生まれ直す（端から消えない）
          if (q.life <= 0 || q.x < -20 || q.x > env.w + 20 || q.y < -20 || q.y > env.h + 20) {
            q.x = Math.random() * env.w;
            q.y = Math.random() * env.h;
            q.life = 3 + Math.random() * 6;
            continue;
          }
          var hue = 200 + q.a * 45;
          c.strokeStyle = "hsla(" + hue.toFixed(0) + ",80%,66%,0.16)";
          c.lineWidth = 0.6 + q.a * 1.1;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(q.x, q.y);
          c.stroke();
        }
        c.globalCompositeOperation = "source-over";
      },
    };
  }

  /* ============================================================
     5. 波干渉 — 複数の波源のうねりが交わる
     ============================================================ */
  function sceneWaves() {
    var SCALE = 6; // 低解像度で計算して拡大（1px あたり複数回の sin を避ける）
    return {
      id: "waves",
      name: { ja: "波干渉", en: "Interference" },
      desc: { ja: "いくつもの波源から届くうねりが、ゆっくり干渉し合います。", en: "Slow swells from several sources interfering." },

      init: function (env) {
        this.buf = document.createElement("canvas");
        this.reset(env);
      },
      resize: function (env) { this.reset(env); },
      reset: function (env) {
        this.bw = Math.max(24, Math.ceil(env.w / SCALE));
        this.bh = Math.max(16, Math.ceil(env.h / SCALE));
        this.buf.width = this.bw;
        this.buf.height = this.bh;
        this.bctx = this.buf.getContext("2d");
        this.img = this.bctx.createImageData(this.bw, this.bh);
      },

      frame: function (env, dt) {
        var t = env.t;
        var src = [
          { x: 0.28 + 0.10 * fsin(t * 0.071), y: 0.34 + 0.12 * fsin(t * 0.053 + 1.3), k: 26, w: 0.62 },
          { x: 0.72 + 0.11 * fsin(t * 0.047 + 2.1), y: 0.62 + 0.10 * fsin(t * 0.061 + 0.4), k: 22, w: 0.58 },
          { x: 0.50 + 0.16 * fsin(t * 0.037 + 4.0), y: 0.20 + 0.14 * fsin(t * 0.043 + 2.6), k: 30, w: 0.44 },
          { x: 0.44 + 0.13 * fsin(t * 0.029 + 5.2), y: 0.80 + 0.11 * fsin(t * 0.033 + 3.1), k: 18, w: 0.40 },
        ];
        var d = this.img.data;
        var bw = this.bw, bh = this.bh;
        var inv = 1 / Math.max(1e-6, Math.sqrt(bw * bw + bh * bh));
        var p = 0;
        for (var y = 0; y < bh; y++) {
          for (var x = 0; x < bw; x++) {
            var v = 0;
            for (var s = 0; s < 4; s++) {
              var o = src[s];
              var dx = x / bw - o.x, dy = y / bh - o.y;
              var r = Math.sqrt(dx * dx + dy * dy);
              v += fsin(r * o.k - t * o.w) * o.w;
            }
            // -1..1 → 暗い藍の階調（まぶしさを抑えるため最大輝度を絞る）
            var n = clamp(v * 0.62, -1, 1);
            var g = n * 0.5 + 0.5;
            d[p] = 8 + g * 34;
            d[p + 1] = 12 + g * 74;
            d[p + 2] = 22 + g * 128;
            d[p + 3] = 255;
            p += 4;
          }
        }
        this.bctx.putImageData(this.img, 0, 0);
        var c = env.ctx;
        c.imageSmoothingEnabled = true;
        c.globalCompositeOperation = "source-over";
        c.drawImage(this.buf, 0, 0, env.w, env.h);
      },
    };
  }

  /* ============================================================
     6. 星屑 — ゆっくり流れる星と、ときどきの流星
     ============================================================ */
  function sceneStars() {
    return {
      id: "stars",
      name: { ja: "星屑", en: "Stardust" },
      desc: { ja: "ゆっくり流れる星屑。ときどき、流星が筋を引きます。", en: "Slow-drifting stardust, with the occasional meteor." },

      init: function (env) {
        this.nz = makeNoise(777);
        this.n = env.w < 700 ? 260 : 460;
        this.st = [];
        for (var i = 0; i < this.n; i++) this.st.push(this.mk(env, true));
        this.shoot = null;
        this.next = 6 + Math.random() * 18;
      },
      mk: function (env, spread) {
        var z = Math.random();
        return {
          x: Math.random() * env.w,
          y: spread ? Math.random() * env.h : -8,
          z: z,
          ph: Math.random() * TAU,
          tw: 0.5 + Math.random() * 1.6,
        };
      },
      resize: function () {},

      frame: function (env, dt) {
        var c = env.ctx;
        fillAll(env, "#05070d");

        // うっすらと天の川のような帯
        var g = c.createLinearGradient(0, env.h * 0.15, env.w, env.h * 0.85);
        g.addColorStop(0, "rgba(70,95,150,0)");
        g.addColorStop(0.45, "rgba(80,105,160,0.055)");
        g.addColorStop(0.6, "rgba(95,120,175,0.075)");
        g.addColorStop(1, "rgba(70,95,150,0)");
        c.fillStyle = g;
        fillAll(env, g);

        c.globalCompositeOperation = "lighter";
        for (var i = 0; i < this.st.length; i++) {
          var s = this.st[i];
          // 奥行きが速さに効く（遠い星はゆっくり）
          s.x -= (4 + s.z * 16) * dt;
          s.y += (1.5 + s.z * 5) * dt;
          if (s.x < -10) { s.x = env.w + 8; s.y = Math.random() * env.h; }
          if (s.y > env.h + 10) { s.y = -8; s.x = Math.random() * env.w; }

          var tw = 0.55 + 0.45 * fsin(env.t * s.tw + s.ph);
          var a = (0.10 + s.z * 0.55) * tw;
          var r = 0.5 + s.z * 1.5;
          c.fillStyle = "rgba(210,228,255," + a.toFixed(3) + ")";
          c.beginPath();
          c.arc(s.x, s.y, r, 0, TAU);
          c.fill();
          if (s.z > 0.82) {
            var gg = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 5);
            gg.addColorStop(0, "rgba(180,210,255," + (a * 0.5).toFixed(3) + ")");
            gg.addColorStop(1, "rgba(180,210,255,0)");
            c.fillStyle = gg;
            c.beginPath();
            c.arc(s.x, s.y, r * 5, 0, TAU);
            c.fill();
          }
        }

        // 流星
        this.next -= dt;
        if (!this.shoot && this.next <= 0) {
          this.shoot = {
            x: env.w * (0.15 + Math.random() * 0.7),
            y: env.h * (0.05 + Math.random() * 0.35),
            vx: -(260 + Math.random() * 220),
            vy: 150 + Math.random() * 130,
            life: 0,
            max: 0.9 + Math.random() * 0.5,
          };
          this.next = 14 + Math.random() * 34;
        }
        if (this.shoot) {
          var m = this.shoot;
          m.life += dt;
          m.x += m.vx * dt; m.y += m.vy * dt;
          var f = 1 - m.life / m.max;
          if (f <= 0) { this.shoot = null; }
          else {
            var len = 130 * f;
            var nx = m.vx, ny = m.vy;
            var mag = Math.sqrt(nx * nx + ny * ny) || 1;
            var lg = c.createLinearGradient(m.x, m.y, m.x - (nx / mag) * len, m.y - (ny / mag) * len);
            lg.addColorStop(0, "rgba(225,240,255," + (0.75 * f).toFixed(3) + ")");
            lg.addColorStop(1, "rgba(225,240,255,0)");
            c.strokeStyle = lg;
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(m.x, m.y);
            c.lineTo(m.x - (nx / mag) * len, m.y - (ny / mag) * len);
            c.stroke();
          }
        }
        c.globalCompositeOperation = "source-over";
      },
    };
  }

  global.SCENES = [
    sceneTrail(), sceneWord(), sceneParticles(),
    sceneFlow(), sceneWaves(), sceneStars(),
  ];
})(typeof window !== "undefined" ? window : this);
