/* ==========================================================================
   MiFRM — Logo / Başlık Neon Karınca-Işık Efekti (v2.0)
   --------------------------------------------------------------------------
   * TAMAMEN EK (additive) bir modüldür. Mevcut HTML/CSS/JS'e dokunmaz.
   * ".hamdi-logo-area" içine TEK bir <canvas> ekler, metni asla değiştirmez.
   * Karınca gibi görünen küçük bir ışık parçacığı, logonun/metnin etrafında
     kapalı bir OVAL (elips) yörünge üzerinde sonsuz döner.
   * Hız zaman zaman organik biçimde hızlanıp yavaşlar (rastgele hedef hıza
     yumuşak "ease" ile geçiş + hafif sinüs modülasyonu).
   * Arkasında soluklaşan bir iz (trail) bırakır, renk paleti neon
     mavi-yeşil (hue ~155–205) bandında yavaşça salınır.
   * Performans: sabit boyutlu halka-tampon (ring buffer) iz, per-frame ağır
     gradient/parçacık fiziği yok, devicePixelRatio 1.5 ile sınırlı,
     requestAnimationFrame ekranın doğal yenileme hızına (genelde 60 FPS)
     bağlı çalışır — sekme arka plandayken tamamen durur (CPU tasarrufu).
   * Kütüphane / CDN yok. Sadece Vanilla JS + Canvas2D. Layout'a etkisi
     yoktur (position: absolute, pointer-events: none, aria-hidden) —
     SEO ve Core Web Vitals (CLS/INP) açısından güvenlidir.
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

  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return; // Bu alan yoksa hiçbir şey yapma
    var link = area.querySelector("a");
    if (!link) return;

    // Konumlandırma bağlamı — mevcut CSS'e dokunmadan minimum inline ayar
    var areaComputed = getComputedStyle(area);
    if (areaComputed.position === "static") area.style.position = "relative";
    if (!link.style.position) link.style.position = "relative";
    link.style.zIndex = "2";

    // Canvas — DOM ağacına eklenen TEK yeni eleman
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

    var ctx = canvas.getContext("2d", { alpha: true });
    var PAD_X = 26, PAD_Y = 20; // yörüngenin metnin dışına taşacağı pay
    var dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));

    var boxW = 0, boxH = 0;
    var ellipse = { cx: 0, cy: 0, rx: 0, ry: 0 };

    /* ---------------------------------------------------------------- *
     * Ölçüm: alanın gerçek boyutuna göre kapalı oval yörünge hesapla.
     * Harf bazlı ölçüm YOK — bu hem daha az CPU hem de responsive'te
     * daha kararlı bir oval üretir (mobil/masaüstü fark etmeksizin).
     * ---------------------------------------------------------------- */
    function measure() {
      var rect = area.getBoundingClientRect();
      boxW = rect.width + PAD_X * 2;
      boxH = rect.height + PAD_Y * 2;

      canvas.width = Math.round(boxW * dpr);
      canvas.height = Math.round(boxH * dpr);
      canvas.style.width = boxW + "px";
      canvas.style.height = boxH + "px";
      canvas.style.left = -PAD_X + "px";
      canvas.style.top = -PAD_Y + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ellipse.cx = boxW / 2;
      ellipse.cy = boxH / 2;
      ellipse.rx = rect.width / 2 + PAD_X * 0.62;
      ellipse.ry = rect.height / 2 + PAD_Y * 0.78;
    }

    measure();

    var resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 120);
    }
    window.addEventListener("resize", onResize, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(area);
    // Başlık metni admin panelden değişirse yörüngeyi otomatik güncelle
    new MutationObserver(onResize).observe(link, {
      childList: true, characterData: true, subtree: true
    });

    document.addEventListener("visibilitychange", function () {
      pageHidden = document.hidden;
    });

    /* ---------------------------------------------------------------- *
     * İz (trail) — sabit boyutlu halka tampon. Her frame'de yeni particle
     * oluşturup/silmek yerine üzerine yazılan sabit dizi kullanılır; bu
     * garbage-collector baskısını ve CPU kullanımını düşük tutar.
     * ---------------------------------------------------------------- */
    var TRAIL_LEN = 16;
    var trail = [];
    for (var i = 0; i < TRAIL_LEN; i++) trail.push(null);
    var trailHead = 0;

    /* ---------------------------------------------------------------- *
     * Hız kontrolü: rastgele bir "hedef hız" belirlenir, mevcut hız o
     * hedefe yumuşakça (ease) yaklaşır -> organik hızlanma/yavaşlama.
     * Üzerine hafif bir sinüs "wobble" eklenir ki hareket monoton olmasın.
     * ---------------------------------------------------------------- */
    var speedBase = 0.09;      // devir/saniye (ortalama)
    var speedCur = speedBase;
    var speedTarget = speedBase;
    var speedTimer = setInterval(function () {
      speedTarget = 0.045 + Math.random() * 0.15; // yavaş <-> hızlı aralık
    }, 3000 + Math.random() * 2000);

    var angle = Math.random() * Math.PI * 2;
    var elapsed = 0;
    var lastT = null;
    var rafId = null;

    var hueBase = 178; // neon mavi-yeşil merkez ton (cyan/teal civarı)

    function pointOnEllipse(a) {
      return {
        x: ellipse.cx + Math.cos(a) * ellipse.rx,
        y: ellipse.cy + Math.sin(a) * ellipse.ry
      };
    }

    // Elips üzerindeki teğet (hareket) açısı — karıncanın yönünü belirler
    function tangentAngle(a) {
      return Math.atan2(ellipse.ry * Math.cos(a), -ellipse.rx * Math.sin(a));
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (pageHidden) { lastT = now; return; } // arka planda tamamen dur

      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      elapsed += dt;

      if (reduceMotion) { drawStatic(); return; }

      speedCur += (speedTarget - speedCur) * Math.min(dt * 0.8, 1);
      var wobble = 1 + Math.sin(elapsed * 0.35) * 0.18;
      angle = (angle + dt * speedCur * Math.PI * 2 * wobble) % (Math.PI * 2);

      var head = pointOnEllipse(angle);
      trail[trailHead] = { x: head.x, y: head.y };
      trailHead = (trailHead + 1) % TRAIL_LEN;

      var hue = hueBase + Math.sin(elapsed * 0.22) * 22; // ~156–200 salınım

      ctx.clearRect(0, 0, boxW, boxH);
      ctx.globalCompositeOperation = "lighter";

      // İz: soluklaşan minik neon noktalar
      for (var k = 1; k <= TRAIL_LEN; k++) {
        var idx = (trailHead - k + TRAIL_LEN * 2) % TRAIL_LEN;
        var p = trail[idx];
        if (!p) continue;
        var life = 1 - k / TRAIL_LEN;
        if (life <= 0) continue;
        ctx.fillStyle = "hsla(" + hue + ",100%,65%," + (life * 0.5) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + life * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Karınca gövdesi + halo, yön açısına göre döndürülmüş
      var dirAngle = tangentAngle(angle);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(dirAngle);

      var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      glow.addColorStop(0, "hsla(" + hue + ",100%,80%,0.9)");
      glow.addColorStop(1, "hsla(" + hue + ",100%,60%,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "hsla(" + hue + ",100%,92%,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "hsla(" + hue + ",100%,85%,0.8)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(2.6, -0.6); ctx.lineTo(5.4, -2.3);
      ctx.moveTo(2.6, 0.6); ctx.lineTo(5.4, 2.3);
      ctx.stroke();

      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }

    function drawStatic() {
      // prefers-reduced-motion: dönüş yok, sadece sabit yumuşak neon iz
      ctx.clearRect(0, 0, boxW, boxH);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "hsla(" + hueBase + ",100%,65%,0.32)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    rafId = requestAnimationFrame(frame);

    window.addEventListener("pagehide", function () {
      cancelAnimationFrame(rafId);
      clearInterval(speedTimer);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
