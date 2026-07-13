/* ==========================================================================
   MiFRM — Logo Işık Noktası Efekti (v4.0 — sade & sağlam sürüm)
   --------------------------------------------------------------------------
   Önceki denemelerde sorun çıkardığı için bu sürümde KASITLI olarak riskli
   teknikler kullanılmıyor:
     - mask-composite YOK (tarayıcı desteği tutarsız, önceki sürümde
       bunun için görüntü bozuldu)
     - canvas / rAF döngüsü YOK
     - karınca / bacak çizimi YOK
   Sadece: mevcut logo linkine (::after) ile TEK bir küçük, yumuşak parlayan
   ışık noktası ekleniyor ve saf CSS "transform" animasyonu ile harflerin
   arasında ileri-geri gezdiriliyor. Bu; her tarayıcıda, her cihazda aynı
   görünecek en sağlam yöntemdir (radial-gradient + box-shadow, 15+ yıldır
   tüm tarayıcılarda tam destekli).

   * Temanın HTML/CSS/JS dosyalarına dokunulmuyor, tamamen ek bir modül.
   * Yeni DOM elemanı YOK (nokta, linkin ::after'ı olarak çiziliyor).
   * Animasyon "transform" ile compositor thread'de döner -> 60 FPS, JS'e
     per-frame maliyeti yok.
   * Her 10 saniyede bir: renk tonu (temaya uyumlu) + hız yenilenir.
   * Gidiş-dönüş (ping-pong) hareketi "animation-direction: alternate" ile
     doğal olarak sağlanır: nokta sağa gider, geri döner, sağa gider...
   ========================================================================== */
(function () {
  "use strict";

  if (window.__mifrmLogoFxLoaded) return;
  window.__mifrmLogoFxLoaded = true;

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function hexToHue(hex) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return 18; // varsayılan turuncu
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, d = max - min;
    if (d === 0) return 18;
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60; if (h < 0) h += 360;
    return h;
  }

  function injectStyle() {
    if (document.querySelector("style[data-mifrm-fx]")) return;
    var css =
      ".mifrm-walk-fx{position:relative;}" +
      ".mifrm-walk-fx::after{" +
        "content:\"\";position:absolute;top:52%;left:0;" +
        "width:7px;height:7px;margin-top:-4px;border-radius:50%;" +
        "background:radial-gradient(circle,#fff 0%,var(--mifrm-color,#ff7a3c) 45%,transparent 78%);" +
        "box-shadow:0 0 6px 1px var(--mifrm-color,#ff7a3c),0 0 16px 4px var(--mifrm-color-soft,rgba(255,122,60,.35));" +
        "pointer-events:none;z-index:3;will-change:transform;" +
        "animation:mifrm-walk var(--mifrm-duration,6s) cubic-bezier(.45,0,.55,1) infinite alternate;" +
      "}" +
      "@keyframes mifrm-walk{" +
        "0%{transform:translate(0,0) scale(.85);}" +
        "12%{transform:translate(calc(var(--mifrm-travel,60px)*.14),-4px) scale(1.05);}" +
        "25%{transform:translate(calc(var(--mifrm-travel,60px)*.28),3px) scale(.92);}" +
        "38%{transform:translate(calc(var(--mifrm-travel,60px)*.43),-3px) scale(1.08);}" +
        "50%{transform:translate(calc(var(--mifrm-travel,60px)*.58),2px) scale(.9);}" +
        "63%{transform:translate(calc(var(--mifrm-travel,60px)*.71),-4px) scale(1.05);}" +
        "76%{transform:translate(calc(var(--mifrm-travel,60px)*.85),3px) scale(.92);}" +
        "90%{transform:translate(calc(var(--mifrm-travel,60px)*.95),-2px) scale(1.05);}" +
        "100%{transform:translate(var(--mifrm-travel,60px),0) scale(1);}" +
      "}" +
      "@media (prefers-reduced-motion: reduce){" +
        ".mifrm-walk-fx::after{animation:none;left:50%;}" +
      "}";
    var style = document.createElement("style");
    style.setAttribute("data-mifrm-fx", "logo-walk");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return;
    var link = area.querySelector("a");
    if (!link) return;

    injectStyle();
    link.classList.add("mifrm-walk-fx");

    var baseHue = hexToHue(
      getComputedStyle(document.documentElement).getPropertyValue("--blue").trim()
    );

    function measure() {
      var w = link.getBoundingClientRect().width;
      var travel = Math.max(20, w - 14); // noktanın gidebileceği yatay mesafe
      link.style.setProperty("--mifrm-travel", travel + "px");
    }

    function rollCycle() {
      var hue = (baseHue + (Math.random() * 70 - 35) + 360) % 360;
      var color = "hsl(" + hue.toFixed(0) + ",88%,58%)";
      var soft = "hsla(" + hue.toFixed(0) + ",88%,58%,.4)";
      var duration = (4.5 + Math.random() * 3).toFixed(2) + "s";
      link.style.setProperty("--mifrm-color", color);
      link.style.setProperty("--mifrm-color-soft", soft);
      link.style.setProperty("--mifrm-duration", duration);
    }

    measure();
    rollCycle();

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 150);
    }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); }).observe(link);
    new MutationObserver(measure).observe(link, { childList: true, characterData: true, subtree: true });

    if (!reduceMotion) {
      setInterval(rollCycle, 10000);
    }

    document.addEventListener("visibilitychange", function () {
      link.style.setProperty(
        document.hidden ? "animation-play-state" : "",
        document.hidden ? "paused" : ""
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
