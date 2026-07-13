/* ==========================================================================
   MiFRM — Logo / Başlık Enerji-Işık + Minik Karınca Efekti (v2.0)
   --------------------------------------------------------------------------
   * Bu dosya TAMAMEN EK (additive) bir modüldür.
   * Temanın mevcut HTML (Mifrm-tema.xml), CSS (theme-vb.css) ve
     JS (theme-vb.js) dosyalarına HİÇBİR ŞEKİLDE dokunmaz.
   * Sadece ".hamdi-logo-area" içindeki başlık linkini bulur, üzerine
     TEK bir <canvas> ekler ve efekti onun üzerinde çizer.
   * İki bağımsız katman:
       1) Harflerin etrafında yumuşak, nefes alan neon/glow parıltısı
          (yıldırım/ok/bolt biçimi YOK — sadece yuvarlak, sakin ışıma)
       2) Harflerin arasında/altında dolaşan, gerçekçi görünümlü,
          bacakları ve anteni animasyonlu minik bir karınca
   * Kütüphane / CDN yok. Sadece Vanilla JS (ES2025) + Canvas2D.
   ========================================================================== */
(function () {
  "use strict";

  if (window.__mifrmLogoFxLoaded) return;
  window.__mifrmLogoFxLoaded = true;

  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduceMotion = !!(reduceMotionMQ && reduceMotionMQ.matches);
  var pageHidden = false;

  /* ------------------------------------------------------------------ *
   * Yardımcı: hex renk -> HSL (tema vurgu rengini baz almak için)
   * ------------------------------------------------------------------ */
  function hexToHsl(hex) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return { h: 210, s: 70, l: 55 };
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2, d = max - min;
    if (d === 0) { h = 0; s = 0; }
    else {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60; if (h < 0) h += 360;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return;
    var link = area.querySelector("a");
    if (!link) return;

    var accentHex = getComputedStyle(document.documentElement)
      .getPropertyValue("--blue").trim() || "#c15f3c";
    var baseHsl = hexToHsl(accentHex);

    var areaComputed = getComputedStyle(area);
    if (areaComputed.position === "static") area.style.position = "relative";
    if (!link.style.position) link.style.position = "relative";
    link.style.zIndex = "2";

    var canvas = document.createElement("canvas");
    canvas.className = "mifrm-logofx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.willChange = "transform";
    area.insertBefore(canvas, area.firstChild);

    var ctx = canvas.getContext("2d");
    var PAD = 16;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var boxW = 0, boxH = 0;
    var letters = [];   // her harfin canvas'a göre merkezi {x,y,h}
    var gaps = [];       // ardışık harfler arası orta noktalar (karınca "dalış" hedefleri)
    var baselineY = 0;   // karıncanın normalde yürüdüğü çizgi

    function measure() {
      var rect = area.getBoundingClientRect();
      boxW = rect.width + PAD * 2;
      boxH = rect.height + PAD * 2;
      canvas.width = Math.round(boxW * dpr);
      canvas.height = Math.round(boxH * dpr);
      canvas.style.width = boxW + "px";
      canvas.style.height = boxH + "px";
      canvas.style.left = -PAD + "px";
      canvas.style.top = -PAD + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      letters = [];
      var walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        var text = node.textContent;
        for (var i = 0; i < text.length; i++) {
          if (text[i] === " " || text[i] === "\u00A0") continue;
          var range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          var rects = range.getClientRects();
          if (rects.length) {
            var r = rects[0];
            letters.push({
              x: r.left - rect.left + PAD + r.width / 2,
              y: r.top - rect.top + PAD + r.height / 2,
              h: r.height
            });
          }
        }
      }

      gaps = [];
      var maxY = 0, avgH = 0;
      for (var k = 0; k < letters.length; k++) {
        avgH += letters[k].h;
        if (letters[k].y + letters[k].h / 2 > maxY) maxY = letters[k].y + letters[k].h / 2;
      }
      avgH = letters.length ? avgH / letters.length : 12;
      baselineY = maxY + 4;

      for (var g = 0; g < letters.length - 1; g++) {
        gaps.push({
          x: (letters[g].x + letters[g + 1].x) / 2,
          dipY: baselineY - avgH * 0.55 // "dalış" derinliği: harflerin arasına doğru
        });
      }
    }

    measure();

    var resizeTimer = null;
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 120); }
    window.addEventListener("resize", onResize, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(area);
    new MutationObserver(onResize).observe(link, { childList: true, characterData: true, subtree: true });
    document.addEventListener("visibilitychange", function () { pageHidden = document.hidden; });

    /* -------------------------------------------------------------- *
     * 10 saniyede bir yenilenen döngü parametreleri: renk tonu,
     * karınca hızı, bekleme/dalış sıklığı ("rota")
     * -------------------------------------------------------------- */
    var cycle = {
      hue: baseHsl.h,
      hueSpan: 30,
      breathe: 0.9,
      antSpeed: 16,
      dipChance: 0.35
    };
    function rollNewCycle() {
      cycle = {
        hue: (baseHsl.h + (Math.random() * 60 - 30) + 360) % 360,
        hueSpan: 20 + Math.random() * 34,
        breathe: 0.6 + Math.random() * 0.8,
        antSpeed: 11 + Math.random() * 14,
        dipChance: 0.2 + Math.random() * 0.4
      };
    }
    var cycleTimer = setInterval(rollNewCycle, 10000);

    /* -------------------------------------------------------------- *
     * Karınca durum makinesi
     * -------------------------------------------------------------- */
    var ant = {
      x: letters.length ? letters[0].x : 0,
      y: baselineY,
      dir: 1,
      mode: "walk",        // walk | idle | dip-down | dip-pause | dip-up
      modeT: 0,
      walkPhase: 0,
      dipY: baselineY,
      cooldown: 1.2
    };

    function nearestGapAhead() {
      var best = null, bestDist = 9999;
      for (var i = 0; i < gaps.length; i++) {
        var d = Math.abs(gaps[i].x - ant.x);
        if (d < bestDist) { bestDist = d; best = gaps[i]; }
      }
      return { gap: best, dist: bestDist };
    }

    function updateAnt(dt) {
      if (!letters.length) return;
      var firstX = letters[0].x, lastX = letters[letters.length - 1].x;
      ant.cooldown = Math.max(0, ant.cooldown - dt);

      switch (ant.mode) {
        case "walk": {
          ant.x += ant.dir * cycle.antSpeed * dt;
          ant.walkPhase += dt * 9;
          ant.y = baselineY + Math.sin(ant.walkPhase * 2) * 0.5;

          if (ant.dir === 1 && ant.x >= lastX) { ant.x = lastX; ant.dir = -1; ant.mode = "idle"; ant.modeT = 0; }
          else if (ant.dir === -1 && ant.x <= firstX) { ant.x = firstX; ant.dir = 1; ant.mode = "idle"; ant.modeT = 0; }
          else if (ant.cooldown <= 0) {
            var near = nearestGapAhead();
            if (near.gap && near.dist < 4 && Math.random() < cycle.dipChance) {
              ant.mode = "dip-down";
              ant.dipTarget = near.gap.dipY;
              ant.x = near.gap.x;
              ant.cooldown = 2.4 + Math.random() * 2;
            }
          }
          break;
        }
        case "idle": {
          ant.walkPhase += dt * 2; // anten titreşimi için yavaş faz
          ant.modeT += dt;
          if (ant.modeT > 0.35 + Math.random() * 0.35) ant.mode = "walk";
          break;
        }
        case "dip-down": {
          ant.walkPhase += dt * 9;
          ant.y -= 12 * dt;
          if (ant.y <= ant.dipTarget) { ant.y = ant.dipTarget; ant.mode = "dip-pause"; ant.modeT = 0; }
          break;
        }
        case "dip-pause": {
          ant.walkPhase += dt * 1.5;
          ant.modeT += dt;
          if (ant.modeT > 0.3 + Math.random() * 0.3) ant.mode = "dip-up";
          break;
        }
        case "dip-up": {
          ant.walkPhase += dt * 9;
          ant.y += 12 * dt;
          if (ant.y >= baselineY) { ant.y = baselineY; ant.mode = "walk"; }
          break;
        }
      }
    }

    /* -------------------------------------------------------------- *
     * Karıncayı çiz (bacaklar + anten animasyonlu, gerçekçi, düz renk)
     * -------------------------------------------------------------- */
    function drawAnt(t) {
      var angle;
      if (ant.mode === "dip-down") angle = -Math.PI / 2;
      else if (ant.mode === "dip-up") angle = Math.PI / 2;
      else angle = ant.dir === 1 ? 0 : Math.PI;

      ctx.save();
      ctx.translate(ant.x, ant.y);
      ctx.rotate(angle);

      var moving = (ant.mode === "walk" || ant.mode === "dip-down" || ant.mode === "dip-up");
      var gait = moving ? ant.walkPhase : 0;

      // yere değen minik gölge (gerçekçilik için)
      ctx.save();
      ctx.rotate(-angle);
      ctx.fillStyle = "rgba(20,15,10,0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 1.6, 3.4, 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // bacaklar (3 çift, tripod yürüyüş) — yumuşak eğri (quadratic), sivri/çatal
      // çizgi YOK; gerçek bir böcek bacağının doğal kavis hattı taklit edilir.
      ctx.strokeStyle = "#171009";
      ctx.lineWidth = 0.5;
      ctx.lineCap = "round";
      var legAttach = [-2.2, -0.1, 1.8];
      for (var i = 0; i < 3; i++) {
        for (var side = -1; side <= 1; side += 2) {
          var groupPhase = ((i % 2 === 0) ? 0 : Math.PI) + (side < 0 ? 0 : Math.PI);
          var swing = Math.sin(gait * 1.3 + groupPhase) * 0.35; // gait tatlılığı için amplitüd düşürüldü
          var ax = legAttach[i], ay = side * 0.85;
          var kneeX = ax + swing * 0.5;                 // diz (femur-tibia eklemi)
          var kneeY = side * 1.7;
          var footX = ax + swing * 0.8;                 // ayak ucu
          var footY = side * 2.9;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
          ctx.stroke();
        }
      }

      // gövde: abdomen - thorax - baş (hafif parlak, mat kitin dokusu)
      function seg(cx, cy, rx, ry) {
        var g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 0.2, cx, cy, rx);
        g.addColorStop(0, "#3a2a18");
        g.addColorStop(1, "#120d07");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      seg(-2.8, 0, 2.1, 1.55);   // abdomen
      seg(-0.3, 0, 1.55, 1.25);  // thorax
      seg(2.4, 0, 1.3, 1.15);    // baş

      // anten (yavaş titreşimli)
      var tw = Math.sin(t * 5) * 0.12;
      ctx.strokeStyle = "#1a120b";
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(3.4, -0.5); ctx.lineTo(5.6, -1.6 + tw);
      ctx.moveTo(3.4, 0.5); ctx.lineTo(5.6, 1.6 - tw);
      ctx.stroke();

      ctx.restore();
    }

    /* -------------------------------------------------------------- *
     * Harflerin etrafında yumuşak nefes alan glow (bolt/ok YOK)
     * -------------------------------------------------------------- */
    function drawLetterGlow(t) {
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < letters.length; i++) {
        var lt = letters[i];
        var breathe = 0.5 + 0.5 * Math.sin(t * cycle.breathe + i * 0.45);
        var hue = (cycle.hue + Math.sin(t * 0.2 + i) * (cycle.hueSpan / 2) + 360) % 360;
        var alpha = 0.10 + breathe * 0.16;
        var r = lt.h * 0.85;
        var g = ctx.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, r);
        g.addColorStop(0, "hsla(" + hue + ",90%,68%," + alpha + ")");
        g.addColorStop(1, "hsla(" + hue + ",90%,60%,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lt.x, lt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    var lastT = null, elapsed = 0, rafId = null;
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (pageHidden) { lastT = now; return; }
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      elapsed += dt;

      ctx.clearRect(0, 0, boxW, boxH);
      drawLetterGlow(elapsed);

      if (!reduceMotion) {
        updateAnt(dt);
        drawAnt(elapsed);
      }
    }
    rafId = requestAnimationFrame(frame);

    window.addEventListener("pagehide", function () {
      cancelAnimationFrame(rafId);
      clearInterval(cycleTimer);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
