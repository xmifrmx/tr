(function () {
  "use strict";

  if (window.__mifrmLogoFxLoaded) return;
  window.__mifrmLogoFxLoaded = true;

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ------------------------------------------------------------------ *
   * 1) hex -> HSL (tema vurgu rengini baz alan uyumlu ton üretimi için)
   * ------------------------------------------------------------------ */
  function hexToHsl(hex) {
    hex = (hex || "").trim().replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return { h: 18, s: 85, l: 55 }; // varsayılan turuncu-kırmızı
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

  /* ------------------------------------------------------------------ *
   * 2) Tek seferlik CSS enjeksiyonu (yeni stil, mevcut CSS'e dokunmaz)
   * ------------------------------------------------------------------ */
  function injectStyle() {
    var css =
      ".mifrm-ring-fx{position:relative;display:inline-block;}" +
      ".mifrm-ring-fx::before{" +
        "content:\"\";position:absolute;inset:-9px -16px;" +
        "border-radius:999px;padding:2px;pointer-events:none;z-index:-1;" +
        "background:conic-gradient(from 0deg," +
          "var(--mifrm-glow,#ff7a3c) 0%," +
          "transparent var(--mifrm-arc,26%)," +
          "transparent 100%);" +
        "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
        "-webkit-mask-composite:xor;" +
        "mask-composite:exclude;" +
        "animation:mifrm-ring-spin var(--mifrm-duration,3.4s) linear infinite;" +
        "animation-direction:var(--mifrm-dir,normal);" +
        "will-change:transform;" +
        "filter:drop-shadow(0 0 4px var(--mifrm-glow,#ff7a3c));" +
      "}" +
      "@keyframes mifrm-ring-spin{to{transform:rotate(360deg);}}" +
      "@media (prefers-reduced-motion: reduce){" +
        ".mifrm-ring-fx::before{animation:none;opacity:.55;}" +
      "}";
    var style = document.createElement("style");
    style.setAttribute("data-mifrm-fx", "logo-ring");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ *
   * 3) Kurulum: sadece logo linkine sınıf ekle, yeni DOM elemanı YOK
   * ------------------------------------------------------------------ */
  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return;
    var link = area.querySelector("a");
    if (!link) return;

    injectStyle();
    link.classList.add("mifrm-ring-fx");

    // Tema vurgu rengini (--blue) baz alan ilk ton
    var accentHex = getComputedStyle(document.documentElement)
      .getPropertyValue("--blue").trim() || "#ff7a3c";
    var baseHsl = hexToHsl(accentHex);
    applyCycle(baseHsl, true);

    if (!reduceMotion) {
      setInterval(function () { applyCycle(baseHsl, false); }, 10000);
    }

    document.addEventListener("visibilitychange", function () {
      link.style.setProperty(
        document.hidden ? "animation-play-state" : "",
        document.hidden ? "paused" : ""
      );
    });

    /* -------------------------------------------------------------- *
     * 10 saniyede bir: yeni renk tonu + yeni kuyruk uzunluğu (rota)
     * + yeni hız + yeni yön -> "kendini otomatik yenileme"
     * -------------------------------------------------------------- */
    function applyCycle(hsl, first) {
      var hue = (hsl.h + (Math.random() * 50 - 25) + 360) % 360;
      var sat = 80 + Math.random() * 15;
      var light = 55 + Math.random() * 12;
      var glow = "hsl(" + hue.toFixed(0) + "," + sat.toFixed(0) + "%," + light.toFixed(0) + "%)";
      var arc = (16 + Math.random() * 26).toFixed(0) + "%";     // ışık kuyruğunun rota uzunluğu
      var duration = (2.4 + Math.random() * 2.6).toFixed(2) + "s"; // dönüş hızı
      var dir = Math.random() < 0.5 ? "normal" : "reverse";        // dönüş yönü/rotası

      link.style.setProperty("--mifrm-glow", glow);
      link.style.setProperty("--mifrm-arc", arc);
      link.style.setProperty("--mifrm-duration", duration);
      link.style.setProperty("--mifrm-dir", dir);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
