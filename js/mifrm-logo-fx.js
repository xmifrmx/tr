/* ==========================================================================
   MiFRM — Logo / Başlık Enerji-Işık Efekti (v1.0)
   --------------------------------------------------------------------------
   * Bu dosya TAMAMEN EK (additive) bir modüldür.
   * Temanın mevcut HTML (Mifrm-tema.xml), CSS (theme-vb.css) ve
     JS (theme-vb.js) dosyalarına HİÇBİR ŞEKİLDE dokunmaz, üzerine yazmaz.
   * Sadece ".hamdi-logo-area" içindeki başlık linkini bulur, etrafına
     TEK bir <canvas> ekler ve o canvas üzerinde efekti çizer.
   * Başlık metni (data:blog.title) Blogger admin panelden değiştirilse
     bile script metni sabit kod olarak TUTMAZ — DOM'dan okur, bu yüzden
     her başlık değişikliğinde otomatik uyum sağlar.
   * Kütüphane / CDN kullanılmaz. Sadece Vanilla JS (ES2025) + Canvas2D.
   ========================================================================== */
(function () {
  "use strict";

  // Çift yüklenmeyi engelle (aynı sayfada iki kez çağrılırsa görmezden gel)
  if (window.__mifrmLogoFxLoaded) return;
  window.__mifrmLogoFxLoaded = true;

  /* ------------------------------------------------------------------ *
   * 0) Erişilebilirlik / performans ön kontrolleri
   * ------------------------------------------------------------------ */
  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduceMotion = !!(reduceMotionMQ && reduceMotionMQ.matches);

  // Sekme arka plandayken animasyonu durdurmak için
  var pageHidden = false;

  /* ------------------------------------------------------------------ *
   * 1) Yardımcı: hex renk -> HSL  (tema rengini baz almak için)
   * ------------------------------------------------------------------ */
  function hexToHsl(hex) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) return { h: 210, s: 70, l: 55 };
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    var d = max - min;
    if (d === 0) { h = 0; s = 0; }
    else {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  /* ------------------------------------------------------------------ *
   * 2) Kurulum
   * ------------------------------------------------------------------ */
  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return; // Bu başlık alanı yoksa hiçbir şey yapma
    var link = area.querySelector("a");
    if (!link) return;

    // Tema vurgu rengini (--blue) oku; efekt buna göre uyumlu tonlar üretir
    var accentHex = getComputedStyle(document.documentElement)
      .getPropertyValue("--blue")
      .trim() || "#c15f3c";
    var baseHsl = hexToHsl(accentHex);

    // Konumlandırma bağlamı: mevcut stile dokunmadan, gerekli olan minimum
    // inline ayarı elementin kendi style özelliğine ekliyoruz (CSS dosyasına
    // yeni satır eklemiyoruz).
    var areaComputed = getComputedStyle(area);
    if (areaComputed.position === "static") area.style.position = "relative";
    if (!link.style.position) link.style.position = "relative";
    link.style.zIndex = "2";

    // Canvas — tema DOM ağacına eklenen TEK yeni eleman
    var canvas = document.createElement("canvas");
    canvas.className = "mifrm-logofx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.willChange = "transform"; // GPU katmanına ipucu
    area.insertBefore(canvas, area.firstChild);

    var ctx = canvas.getContext("2d");
    var PAD = 18; // ışığın harflerin dışına taşabileceği güvenlik payı

    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    var boxW = 0, boxH = 0;
    var letters = []; // her harfin canvas'a göre merkez koordinatı

    /* -------------------------------------------------------------- *
     * 2a) Harf pozisyonlarını DOM'a hiç eleman eklemeden ölç
     *     (Range.getClientRects ile — "gereksiz HTML üretmesin" şartı)
     * -------------------------------------------------------------- */
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
    }

    measure();

    // Boyut değişimlerinde yeniden ölç (responsive / mobil-masaüstü)
    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 120);
    }
    window.addEventListener("resize", onResize, { passive: true });
    if (window.ResizeObserver) {
      new ResizeObserver(onResize).observe(area);
    }
    // Başlık metni admin panelden değişip DOM'a farklı yansırsa da yakala
    new MutationObserver(onResize).observe(link, {
      childList: true, characterData: true, subtree: true
    });

    document.addEventListener("visibilitychange", function () {
      pageHidden = document.hidden;
    });

    /* -------------------------------------------------------------- *
     * 2b) Her 10 saniyede kendini yenileyen rota / renk / hız durumu
     * -------------------------------------------------------------- */
    var cycle = {
      hue: baseHsl.h,
      hueSpan: 40,
      ampTop: 10,
      ampBottom: 9,
      freq: 1.6,
      speed: 0.16,      // döngü/saniye
      dir: 1,
      seed: Math.random() * Math.PI * 2
    };

    function rollNewCycle() {
      cycle = {
        hue: (baseHsl.h + (Math.random() * 70 - 35) + 360) % 360,
        hueSpan: 28 + Math.random() * 44,
        ampTop: 7 + Math.random() * 9,
        ampBottom: 6 + Math.random() * 8,
        freq: 1.1 + Math.random() * 1.6,
        speed: 0.11 + Math.random() * 0.14,
        dir: Math.random() < 0.5 ? -1 : 1,
        seed: Math.random() * Math.PI * 2
      };
    }

    var cycleTimer = setInterval(rollNewCycle, 10000);

    /* -------------------------------------------------------------- *
     * 2c) Kapalı bir "rota" üzerinde ilerleyen ışık başı (comet)
     *     s ∈ [0,2): [0,1) üst geçiş, [1,2) alt geçiş -> yazının
     *     etrafında sürekli dönen kapalı bir döngü oluşturur.
     * -------------------------------------------------------------- */
    function pathPoint(s, t) {
      if (!letters.length) return { x: boxW / 2, y: boxH / 2 };
      var first = letters[0], last = letters[letters.length - 1];
      var minY = Math.min.apply(null, letters.map(function (l) { return l.y - l.h / 2; }));
      var maxY = Math.max.apply(null, letters.map(function (l) { return l.y + l.h / 2; }));
      var x0 = first.x, x1 = last.x;

      var top = s < 1;
      var local = top ? s : s - 1; // 0..1
      var dirLocal = top ? local : 1 - local; // üstte soldan sağa, altta sağdan sola
      var x = x0 + (x1 - x0) * dirLocal;
      var wave = Math.sin(local * Math.PI * cycle.freq + cycle.seed + t * 0.6) * 4;

      var y = top
        ? minY - 10 - cycle.ampTop - wave
        : maxY + 10 + cycle.ampBottom + wave;

      return { x: x, y: y };
    }

    /* -------------------------------------------------------------- *
     * 2d) Parçacık (particle) havuzu — trail hissi için
     * -------------------------------------------------------------- */
    var particles = [];
    var MAX_PARTICLES = 26;

    function spawnParticle(pos, hue) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      particles.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        size: 1.1 + Math.random() * 1.6,
        hue: hue
      });
    }

    /* -------------------------------------------------------------- *
     * 2e) Ana çizim döngüsü — requestAnimationFrame, delta-time bazlı
     * -------------------------------------------------------------- */
    var lastT = null;
    var elapsed = 0;
    var progress = 0;
    var rafId = null;

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (pageHidden) { lastT = now; return; }

      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      elapsed += dt;

      if (reduceMotion) {
        // Hareketi azalt tercihine uyum: sabit yumuşak parıltı, dönüş yok
        drawStaticGlow();
        return;
      }

      progress += dt * cycle.speed * cycle.dir;
      progress = ((progress % 2) + 2) % 2; // 0..2 aralığında tut

      ctx.clearRect(0, 0, boxW, boxH);

      var head = pathPoint(progress, elapsed);
      var hue = (cycle.hue + Math.sin(elapsed * 0.25) * (cycle.hueSpan / 2) + 360) % 360;

      // Işık başının hemen arkasına parçacık bırak (sabit adımda, DOM'suz)
      if (Math.random() < 0.6) spawnParticle(head, hue);

      // --- Harflerin çevresindeki yumuşak halo (comet yaklaşınca parlar) ---
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < letters.length; i++) {
        var lt = letters[i];
        var dx = lt.x - head.x, dy = lt.y - head.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var proximity = Math.max(0, 1 - dist / 70); // 0..1
        var baseGlow = 0.16 + proximity * 0.55;
        var r = lt.h * 0.9 + proximity * 6;

        var grad = ctx.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, r);
        grad.addColorStop(0, "hsla(" + hue + ",95%,70%," + (baseGlow * 0.9) + ")");
        grad.addColorStop(1, "hsla(" + hue + ",95%,60%,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lt.x, lt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Rota boyunca akan ince enerji çizgisi ---
      ctx.beginPath();
      var STEPS = 40;
      for (var s = 0; s <= STEPS; s++) {
        var sp = ((progress - s * 0.012) % 2 + 2) % 2;
        var p = pathPoint(sp, elapsed);
        if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "hsla(" + hue + ",95%,68%,0.55)";
      ctx.lineWidth = 1.6;
      ctx.shadowColor = "hsla(" + hue + ",95%,60%,0.9)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- Işık başı (comet head) ---
      var headGrad = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 9);
      headGrad.addColorStop(0, "hsla(" + hue + ",100%,88%,0.95)");
      headGrad.addColorStop(1, "hsla(" + hue + ",100%,70%,0)");
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
      ctx.fill();

      // --- Parçacıklar ---
      for (var pi = particles.length - 1; pi >= 0; pi--) {
        var pt = particles[pi];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt * 1.4;
        if (pt.life <= 0) { particles.splice(pi, 1); continue; }
        ctx.fillStyle = "hsla(" + pt.hue + ",95%,75%," + (pt.life * 0.7) + ")";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    function drawStaticGlow() {
      ctx.clearRect(0, 0, boxW, boxH);
      ctx.globalCompositeOperation = "lighter";
      var hue = cycle.hue;
      for (var i = 0; i < letters.length; i++) {
        var lt = letters[i];
        var grad = ctx.createRadialGradient(lt.x, lt.y, 0, lt.x, lt.y, lt.h * 0.9);
        grad.addColorStop(0, "hsla(" + hue + ",90%,70%,0.28)");
        grad.addColorStop(1, "hsla(" + hue + ",90%,60%,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lt.x, lt.y, lt.h * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    rafId = requestAnimationFrame(frame);

    // Sayfa/bileşen kaldırılırsa temizle (SPA benzeri Blogger geçişleri için)
    window.addEventListener("pagehide", function () {
      cancelAnimationFrame(rafId);
      clearInterval(cycleTimer);
    });
  }

  /* ------------------------------------------------------------------ *
   * 3) Başlat — DOM hazır olduğunda, ana thread'i bloklamadan
   * ------------------------------------------------------------------ */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
