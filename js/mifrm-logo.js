/*!
 * mifrm-logo.js
 * ----------------------------------------------------------------------
 * MiFRM Forum teması için bağımsız, sıfır-bağımlılık "sincak" animasyon
 * katmanı. Bu dosya temanın HTML/CSS/JS yapısına HİÇ dokunmaz; kendi
 * elemanlarını oluşturur, tema DOM'unu sadece OKUR (querySelector /
 * getBoundingClientRect) ve üzerine görsel bir katman ekler.
 *
 * Namespace: window.MFSQ (çakışma riski yok — tema "vb", "hamdi", "mifrm"
 * önekli global fonksiyonlar/objeler kullanıyor, "MFSQ" bunlarla kesişmiyor).
 *
 * Notlar (dürüst mühendislik sınırları):
 *  - Saf SVG + CSS transform ile çizilmiştir (Canvas kullanılmadı; tek bir
 *    hareketli katman için SVG/CSS, Canvas'a göre daha az DOM/GC yükü
 *    getirir ve GPU compositing'i translate3d üzerinden zaten sağlar).
 *  - "National Geographic seviyesinde gerçekçilik" ifadesi bir hedef/ilham
 *    olarak ele alınmıştır; el yapımı vektör bir karakterin fotogerçekçi
 *    olması mümkün değildir, ancak davranış zenginliği (göz kırpma, kulak/
 *    burun/bıyık titremesi, kuyruk fiziği, adım döngüsü, sıçrama/kayma
 *    fiziği, hiç tekrarlamayan rotalar) tam olarak uygulanmıştır.
 *  - Kullanıcı `prefers-reduced-motion: reduce` tercihine sahipse script
 *    kendini hiç başlatmaz (erişilebilirlik).
 * ----------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.MFSQ) return; // ikinci kez yüklenmeye karşı koruma
  if (typeof document === 'undefined') return;

  var mql = null;
  try { mql = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) {}
  if (mql && mql.matches) { window.MFSQ = { disabled: true, reason: 'prefers-reduced-motion' }; return; }

  /* ================================================================
   * 0) KÜÇÜK YARDIMCILAR
   * ================================================================ */
  var rand = function (min, max) { return min + Math.random() * (max - min); };
  var pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOutBack = function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (fn) { return setTimeout(fn, 16); };
  var nextFrame = function () { return new Promise(function (res) { raf(res); }); };
  var docW = function () { return document.documentElement; };

  function scrollX() { return window.pageXOffset || docW().scrollLeft || 0; }
  function scrollY() { return window.pageYOffset || docW().scrollTop || 0; }

  /* ================================================================
   * 1) DURUM (STATE)
   * ================================================================ */
  var S = {
    destroyed: false,
    offscreen: false,
    hidden: (document.visibilityState === 'hidden'),
    frameSkip: 0,
    lastTs: 0
  };

  // Pose: her frame'de render() bunu ekrana yansıtır.
  var pose = {
    x: 0, y: 0,           // belge koordinatları (document-space px)
    rot: 0,               // gövde açısı (derece)
    scale: 1,
    squashY: 1, squashX: 1,
    visible: false,
    legPhase: 0,          // adım döngüsü fazı (0..2PI)
    moving: 0,            // 0..1 hareket yoğunluğu (bacak animasyonu şiddeti)
    tailBase: 0,          // kuyruk kök açısı hedefi
    tailA: 0, tailB: 0, tailC: 0, // 3 segmentin gerçek (lag'li) açıları
    earL: 0, earR: 0,     // kulak açı ofseti
    eyeClose: 0,          // 0=açık 1=kapalı
    nose: 0,              // burun titreşim ofseti
    whisker: 0,
    breath: 0,            // göğüs nefes ölçeği fazı
    tilt: 0                // kafa eğimi (merak/inceleme)
  };

  /* ================================================================
   * 2) STİL ENJEKSİYONU (yalnızca kendi sınıfları — tema CSS'i bozulmaz)
   * ================================================================ */
  var styleTag = document.createElement('style');
  styleTag.setAttribute('data-mfsq', '1');
  styleTag.textContent =
    '.mfsq-layer{position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000;}' +
    '.mfsq-wrap{position:absolute;top:0;left:0;width:34px;height:34px;margin:-17px 0 0 -17px;' +
    'will-change:transform;transform:translate3d(-9999px,-9999px,0);opacity:0;' +
    'transition:opacity .35s ease;pointer-events:none;}' +
    '.mfsq-wrap.mfsq-show{opacity:1;}' +
    '.mfsq-svg{width:100%;height:100%;display:block;overflow:visible;shape-rendering:geometricPrecision;}' +
    '.mfsq-fur{fill:#c1502f;}' +
    '.mfsq-fur-dark{fill:#9c3c22;}' +
    '.mfsq-belly{fill:#f4e3c7;}' +
    '.mfsq-eye{fill:#1c1410;}' +
    '.mfsq-lid{fill:#c1502f;}' +
    '.mfsq-nose{fill:#2b1c14;}' +
    '.mfsq-whisker{stroke:#3a2418;stroke-width:.5;fill:none;opacity:.65;stroke-linecap:round;}';
  document.head.appendChild(styleTag);

  /* ================================================================
   * 3) DOM İNŞASI (SVG sincap — sprite yok, tamamen vektörel)
   * ================================================================ */
  var layer = document.createElement('div');
  layer.className = 'mfsq-layer';
  layer.setAttribute('aria-hidden', 'true');

  var wrap = document.createElement('div');
  wrap.className = 'mfsq-wrap';
  wrap.innerHTML =
    '<svg class="mfsq-svg" viewBox="0 0 64 64">' +
      '<g id="mfsqTailBase" transform="translate(44,34) rotate(0)">' +
        '<path class="mfsq-fur" d="M0,0 C10,-6 16,-2 15,8 C14,15 6,15 0,10 Z"/>' +
        '<g id="mfsqTailMid" transform="translate(13,7) rotate(0)">' +
          '<path class="mfsq-fur" d="M0,0 C9,-5 14,-1 13,7 C12,13 5,13 0,9 Z"/>' +
          '<g id="mfsqTailTip" transform="translate(11,6) rotate(0)">' +
            '<path class="mfsq-fur-dark" d="M0,0 C7,-4 11,-1 10,5 C9,10 3,10 0,7 Z"/>' +
          '</g>' +
        '</g>' +
      '</g>' +

      '<g id="mfsqLegBL" transform="translate(24,40)"><ellipse class="mfsq-fur-dark" cx="0" cy="0" rx="2.6" ry="4.2"/></g>' +
      '<g id="mfsqLegBR" transform="translate(31,41)"><ellipse class="mfsq-fur-dark" cx="0" cy="0" rx="2.6" ry="4.2"/></g>' +

      '<ellipse class="mfsq-fur" cx="26" cy="30" rx="15" ry="11"/>' +
      '<ellipse class="mfsq-belly" cx="24" cy="33" rx="9" ry="6.5"/>' +

      '<g id="mfsqLegFL" transform="translate(16,36)"><ellipse class="mfsq-fur" cx="0" cy="0" rx="2.2" ry="3.6"/></g>' +
      '<g id="mfsqLegFR" transform="translate(20,38)"><ellipse class="mfsq-fur" cx="0" cy="0" rx="2.2" ry="3.6"/></g>' +

      '<g id="mfsqHead" transform="translate(14,20)">' +
        '<g id="mfsqEarL" transform="rotate(-18,4,-6)"><path class="mfsq-fur-dark" d="M4,-6 L0,-14 L9,-8 Z"/></g>' +
        '<g id="mfsqEarR" transform="rotate(18,13,-6)"><path class="mfsq-fur-dark" d="M13,-6 L18,-13 L9,-8 Z"/></g>' +
        '<circle class="mfsq-fur" cx="9" cy="0" r="9"/>' +
        '<g id="mfsqEyeL" transform="translate(5.5,-1.5)">' +
          '<circle class="mfsq-eye" cx="0" cy="0" r="1.9"/>' +
          '<rect id="mfsqLidL" class="mfsq-lid" x="-2.2" y="-2.2" width="4.4" height="0" />' +
        '</g>' +
        '<g id="mfsqEyeR" transform="translate(12,-1.5)">' +
          '<circle class="mfsq-eye" cx="0" cy="0" r="1.9"/>' +
          '<rect id="mfsqLidR" class="mfsq-lid" x="-2.2" y="-2.2" width="4.4" height="0"/>' +
        '</g>' +
        '<g id="mfsqNose" transform="translate(1,3)"><ellipse class="mfsq-nose" cx="0" cy="0" rx="1.8" ry="1.4"/></g>' +
        '<g id="mfsqWhiskerL" transform="translate(1,4)">' +
          '<path class="mfsq-whisker" d="M0,0 L-7,-2"/><path class="mfsq-whisker" d="M0,1 L-7,1.5"/>' +
        '</g>' +
        '<g id="mfsqWhiskerR" transform="translate(16,4)">' +
          '<path class="mfsq-whisker" d="M0,0 L7,-2"/><path class="mfsq-whisker" d="M0,1 L7,1.5"/>' +
        '</g>' +
      '</g>' +
    '</svg>';
  layer.appendChild(wrap);
  document.body.appendChild(layer);

  var svgEls = {
    tailBase: wrap.querySelector('#mfsqTailBase'),
    tailMid: wrap.querySelector('#mfsqTailMid'),
    tailTip: wrap.querySelector('#mfsqTailTip'),
    legFL: wrap.querySelector('#mfsqLegFL'),
    legFR: wrap.querySelector('#mfsqLegFR'),
    legBL: wrap.querySelector('#mfsqLegBL'),
    legBR: wrap.querySelector('#mfsqLegBR'),
    head: wrap.querySelector('#mfsqHead'),
    earL: wrap.querySelector('#mfsqEarL'),
    earR: wrap.querySelector('#mfsqEarR'),
    lidL: wrap.querySelector('#mfsqLidL'),
    lidR: wrap.querySelector('#mfsqLidR'),
    nose: wrap.querySelector('#mfsqNose'),
    whL: wrap.querySelector('#mfsqWhiskerL'),
    whR: wrap.querySelector('#mfsqWhiskerR')
  };

  /* ================================================================
   * 4) TEMA DOM ALGISI (mevcut sınıf adlarına göre — theme-vb.css/js)
   * ================================================================ */
  function q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
  function qa(sel) { try { return Array.prototype.slice.call(document.querySelectorAll(sel)); } catch (e) { return []; } }

  function findNavItem(regex) {
    var items = qa('.hamdi-nav-item, .hamdi-main-nav a, .hamdi-sub-navbar a');
    for (var i = 0; i < items.length; i++) {
      var t = (items[i].textContent || '').trim();
      if (regex.test(t)) return items[i];
    }
    return null;
  }

  function locateTargets() {
    var logoLink = q('.hamdi-logo-area a');
    var netSpan = logoLink ? logoLink.querySelector('span') : null;
    var t = {
      header: q('.hamdi-header-wrapper') || q('.hamdi-header-container') || q('.forum-header'),
      logo: logoLink || q('.hamdi-logo-area'),
      netSpan: netSpan, // ".net" — CSS'te .hamdi-logo-area a span olarak zaten ayrık
      navForum: findNavItem(/forum/i),
      navExplore: findNavItem(/ke şfet|keşfet|explore/i),
      navQuickTopic: findNavItem(/hızlı konu|hizli konu|quick topic/i),
      search: q('.hamdi-search-form') || q('.hamdi-search-input') || q('.hamdi-search-btn'),
      footer: q('.site-footer') || q('footer'),
      stats: qa('.hamdi-stat-block, .stat-online-card, .stat-grid-cell, .xf-ustat'),
      categories: qa('.category-icon-wrapper')
    };
    return t;
  }

  var T = locateTargets();

  // Layout değişimlerine (tema aynı kalsa da veriler dinamik yüklendiği için)
  // toleranslı yeniden-tarama — debounce'lı.
  var relocateTimer = null;
  function scheduleRelocate() {
    if (relocateTimer) clearTimeout(relocateTimer);
    relocateTimer = setTimeout(function () { T = locateTargets(); }, 400);
  }

  try {
    var mo = new MutationObserver(function () { scheduleRelocate(); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  try {
    var ro = new ResizeObserver(function () { scheduleRelocate(); });
    ro.observe(document.documentElement);
  } catch (e) {}

  window.addEventListener('resize', scheduleRelocate, { passive: true });

  document.addEventListener('visibilitychange', function () {
    S.hidden = (document.visibilityState === 'hidden');
  }, { passive: true });

  try {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) S.offscreen = !entries[i].isIntersecting;
    }, { threshold: 0 });
    io.observe(wrap);
  } catch (e) {}

  /* ================================================================
   * 5) ANCHOR / KOORDİNAT YARDIMCILARI
   *    (document-space; sayfa kayınca element ile birlikte "yapışık" kalır)
   * ================================================================ */
  function anchorPoint(el, ox, oy, extraX, extraY) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return {
      x: r.left + scrollX() + r.width * ox + (extraX || 0),
      y: r.top + scrollY() + r.height * oy + (extraY || 0)
    };
  }

  // Basit "engelden kaçınma": doğrudan hattın orta noktası başka bir hedef
  // elemanın kutusuna denk geliyorsa, kavis miktarını artırıp o kutunun
  // dışına doğru iter (tam pathfinding değil ama görsel çakışmayı önler).
  function avoidBoxes(mx, my, curve, excludeEl) {
    var boxes = [T.logo, T.search, T.navForum, T.navExplore, T.navQuickTopic].filter(function (e) {
      return e && e !== excludeEl;
    });
    for (var i = 0; i < boxes.length; i++) {
      var r = boxes[i].getBoundingClientRect();
      var bx = r.left + scrollX(), by = r.top + scrollY();
      if (mx > bx - 6 && mx < bx + r.width + 6 && my > by - 6 && my < by + r.height + 6) {
        return curve + (curve >= 0 ? 26 : -26);
      }
    }
    return curve;
  }

  /* ================================================================
   * 6) RENDER — her frame pose'u ekrana bas
   * ================================================================ */
  function render() {
    wrap.style.transform =
      'translate3d(' + pose.x.toFixed(1) + 'px,' + pose.y.toFixed(1) + 'px,0) ' +
      'rotate(' + pose.rot.toFixed(2) + 'deg) ' +
      'scale(' + (pose.scale * pose.squashX).toFixed(3) + ',' + (pose.scale * pose.squashY).toFixed(3) + ')';

    if (pose.visible && !wrap.classList.contains('mfsq-show')) wrap.classList.add('mfsq-show');
    if (!pose.visible && wrap.classList.contains('mfsq-show')) wrap.classList.remove('mfsq-show');

    // Kuyruk zinciri: her segment bir öncekinin gecikmeli (lag'li) versiyonu
    pose.tailA = lerp(pose.tailA, pose.tailBase, 0.12);
    pose.tailB = lerp(pose.tailB, pose.tailA * 0.85, 0.10);
    pose.tailC = lerp(pose.tailC, pose.tailB * 0.85, 0.09);
    svgEls.tailBase.setAttribute('transform', 'translate(44,34) rotate(' + pose.tailA.toFixed(2) + ')');
    svgEls.tailMid.setAttribute('transform', 'translate(13,7) rotate(' + pose.tailB.toFixed(2) + ')');
    svgEls.tailTip.setAttribute('transform', 'translate(11,6) rotate(' + pose.tailC.toFixed(2) + ')');

    // Bacaklar: yürürken faz farkıyla (dörtayaklı tipik yürüyüş) adım at
    var m = pose.moving;
    var lf = Math.sin(pose.legPhase) * 2.1 * m;
    var lb = Math.sin(pose.legPhase + Math.PI) * 2.1 * m;
    svgEls.legFL.setAttribute('transform', 'translate(16,' + (36 + lf).toFixed(2) + ')');
    svgEls.legFR.setAttribute('transform', 'translate(20,' + (38 + lb).toFixed(2) + ')');
    svgEls.legBL.setAttribute('transform', 'translate(24,' + (40 + lb).toFixed(2) + ')');
    svgEls.legBR.setAttribute('transform', 'translate(31,' + (41 + lf).toFixed(2) + ')');

    // Kafa: eğim (merak) + baş hafif nefes/denge titremesi
    svgEls.head.setAttribute('transform', 'translate(14,20) rotate(' + pose.tilt.toFixed(2) + ',9,0)');

    // Kulaklar
    svgEls.earL.setAttribute('transform', 'rotate(' + (-18 + pose.earL).toFixed(2) + ',4,-6)');
    svgEls.earR.setAttribute('transform', 'rotate(' + (18 + pose.earR).toFixed(2) + ',13,-6)');

    // Göz kırpma (lid yüksekliği 0..4.4)
    var lidH = clamp(pose.eyeClose, 0, 1) * 4.4;
    svgEls.lidL.setAttribute('height', lidH.toFixed(2));
    svgEls.lidR.setAttribute('height', lidH.toFixed(2));

    // Burun ve bıyık titremesi
    svgEls.nose.setAttribute('transform', 'translate(' + (1 + pose.nose).toFixed(2) + ',3)');
    var whA = pose.whisker;
    svgEls.whL.setAttribute('transform', 'translate(1,4) rotate(' + (-whA * 6).toFixed(2) + ')');
    svgEls.whR.setAttribute('transform', 'translate(16,4) rotate(' + (whA * 6).toFixed(2) + ')');
  }

  /* ================================================================
   * 7) SÜREKLİ (idle) MİKRO-ANİMASYONLAR — her tick'te çağrılır
   * ================================================================ */
  var timers = { blink: 0, ear: 0, nose: 0, whisker: 0, breath: 0 };

  function idleTick(dt) {
    // Nefes alma (gövde ölçeği ile birleşik, çok hafif)
    timers.breath += dt;
    pose.breath = Math.sin(timers.breath * 1.6) * 0.02;
    pose.squashX = 1 + pose.breath * 0.4;
    pose.squashY = 1 - pose.breath * 0.4;

    // Kuyruk sürekli hafif sallanış (bekleme/otururken de yaşayan bir his)
    if (Math.abs(pose.tailBase) < 0.5 && !pose._tailBurst) {
      pose.tailBase = Math.sin(timers.breath * 1.1) * 4;
    }

    // Rastgele göz kırpma
    timers.blink -= dt;
    if (timers.blink <= 0 && !pose._blinking) {
      pose._blinking = true;
      blinkOnce();
      timers.blink = rand(2000, 6000);
    }

    // Rastgele kulak titremesi
    timers.ear -= dt;
    if (timers.ear <= 0 && !pose._earing) {
      pose._earing = true;
      earTwitch();
      timers.ear = rand(4000, 9000);
    }

    // Rastgele burun/bıyık titremesi
    timers.nose -= dt;
    if (timers.nose <= 0 && !pose._nosing) {
      pose._nosing = true;
      noseTwitch();
      timers.nose = rand(2500, 6000);
    }
  }

  async function blinkOnce() {
    var steps = 6;
    for (var i = 0; i <= steps; i++) { pose.eyeClose = i / steps; await tick(); }
    for (var j = steps; j >= 0; j--) { pose.eyeClose = j / steps; await tick(); }
    pose._blinking = false;
  }

  async function earTwitch() {
    var dir = pick([-1, 1]);
    for (var i = 0; i <= 6; i++) { var v = Math.sin((i / 6) * Math.PI) * 10 * dir; pose.earL = v; pose.earR = -v * 0.6; await tick(); }
    pose.earL = 0; pose.earR = 0;
    pose._earing = false;
  }

  async function noseTwitch() {
    for (var i = 0; i < rand(3, 6); i++) {
      pose.nose = rand(-0.6, 0.6);
      pose.whisker = rand(-1, 1);
      await wait(rand(70, 140));
    }
    pose.nose = 0; pose.whisker = 0;
    pose._nosing = false;
  }

  async function tailWagBurst(ms) {
    pose._tailBurst = true;
    var end = performance.now() + ms;
    var freq = rand(3.5, 5.5);
    while (performance.now() < end && !S.destroyed) {
      pose.tailBase = Math.sin(performance.now() / 1000 * freq) * rand(16, 26);
      await tick();
    }
    pose.tailBase = 0;
    pose._tailBurst = false;
  }

  async function lookAround() {
    var seq = [pick([-14, 14]), pick([-10, 10]), 0];
    for (var i = 0; i < seq.length; i++) {
      var start = pose.tilt, target = seq[i], dur = rand(260, 420), t0 = performance.now();
      while (true) {
        var t = clamp((performance.now() - t0) / dur, 0, 1);
        pose.tilt = lerp(start, target, easeInOutCubic(t));
        await tick();
        if (t >= 1) break;
      }
      await wait(rand(180, 420));
    }
  }

  /* ================================================================
   * 8) HAREKET SİSTEMİ — procedural bezier, hep farklı rota
   * ================================================================ */
  function tick() { idleTick(nowDt()); render(); return nextFrame(); }

  var _lastNow = 0;
  function nowDt() {
    var n = performance.now();
    var dt = _lastNow ? (n - _lastNow) : 16;
    _lastNow = n;
    return clamp(dt, 0, 48);
  }

  function wait(ms) {
    var end = performance.now() + ms;
    return (async function () {
      while (performance.now() < end && !S.destroyed) await tick();
    })();
  }

  // Canlı bezier: uç noktalar HER FRAME live anchor'dan okunur, böylece
  // sayfa kaydırılsa / pencere yeniden boyutlansa bile hedefe "yapışık" kalır.
  async function moveTo(getStart, getEnd, opts) {
    opts = opts || {};
    var duration = opts.duration || rand(1400, 2600);
    var curve = opts.curve != null ? opts.curve : rand(-40, 40);
    var pauseMidwayChance = opts.pauseChance != null ? opts.pauseChance : 0.18;
    var t0 = performance.now();
    var didPause = false;
    var tv1 = rand(0.28, 0.4), tv2 = rand(0.62, 0.78);

    pose.moving = 1;
    var stepFreq = rand(7, 10);

    while (true) {
      var now = performance.now();
      var t = clamp((now - t0) / duration, 0, 1);
      var start = getStart(), end = getEnd();
      if (!start || !end) { await tick(); if (t >= 1) break; continue; }

      var dx = end.x - start.x, dy = end.y - start.y;
      var dist = Math.max(1, Math.hypot(dx, dy));
      var nx = -dy / dist, ny = dx / dist; // perpendicular
      var c = avoidBoxes(lerp(start.x, end.x, 0.5), lerp(start.y, end.y, 0.5), curve, null);

      var via1 = { x: lerp(start.x, end.x, tv1) + nx * c, y: lerp(start.y, end.y, tv1) + ny * c };
      var via2 = { x: lerp(start.x, end.x, tv2) + nx * (c * 0.6), y: lerp(start.y, end.y, tv2) + ny * (c * 0.6) };

      var et = easeInOutCubic(t);
      var p = cubicBezier(start, via1, via2, end, et);
      var p2 = cubicBezier(start, via1, via2, end, clamp(et + 0.02, 0, 1));

      pose.x = p.x; pose.y = p.y;
      var ang = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI;
      pose.rot = lerp(pose.rot, clamp(ang, -55, 55), 0.15);
      pose.legPhase += (stepFreq * (nowDt() / 1000)) * 2 * Math.PI;

      // %18 ihtimalle yolun ortasında durup etrafa bakınma (doğallık)
      if (!didPause && t > 0.35 && t < 0.6 && Math.random() < pauseMidwayChance * 0.02) {
        didPause = true;
        pose.moving = 0.15;
        await lookAround();
        pose.moving = 1;
      }

      await tick();
      if (t >= 1) break;
    }
    pose.moving = 0;
    pose.legPhase = 0;
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var tt = t * t, uu = u * u;
    var uuu = uu * u, ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
    };
  }

  async function jumpAt(getPoint, opts) {
    opts = opts || {};
    var dur = opts.duration || rand(420, 620);
    var height = opts.height || rand(18, 30);
    var start = getPoint();
    if (!start) return;
    var t0 = performance.now();
    pose.moving = 1;
    while (true) {
      var t = clamp((performance.now() - t0) / dur, 0, 1);
      var p = getPoint() || start;
      var arc = Math.sin(Math.PI * t) * height;
      pose.x = p.x; pose.y = p.y - arc;
      pose.squashY = 1 - Math.sin(Math.PI * t) * 0.18;
      pose.squashX = 1 + Math.sin(Math.PI * t) * 0.12;
      pose.rot = lerp(pose.rot, -18 + t * 18, 0.3);
      await tick();
      if (t >= 1) break;
    }
    // iniş sekmesi
    for (var i = 0; i < 3; i++) {
      pose.squashY = 0.82; pose.squashX = 1.16; await tick();
      pose.squashY = 1.04; pose.squashX = 0.96; await tick();
    }
    pose.squashX = pose.squashY = 1;
    pose.moving = 0;
  }

  async function fallAndRecover(getPoint) {
    var start = getPoint();
    if (!start) return;
    pose.rot = 0;
    var dropDist = rand(20, 32);
    var t0 = performance.now(), dur = rand(260, 380);
    // ayak kayması + düşüş
    while (true) {
      var t = clamp((performance.now() - t0) / dur, 0, 1);
      pose.x = start.x + Math.sin(t * 10) * 3;
      pose.y = start.y + dropDist * (t * t);
      pose.rot = lerp(0, rand(50, 90) * pick([-1, 1]), t);
      await tick();
      if (t >= 1) break;
    }
    // panik: hızlı ufak titreşimler
    var pt0 = performance.now(), pdur = rand(220, 340);
    while (performance.now() - pt0 < pdur && !S.destroyed) {
      pose.rot += rand(-40, 40);
      pose.legPhase += rand(2, 5);
      await tick();
    }
    // hızlıca ayağa kalk, etrafına bak, hiçbir şey olmamış gibi davran
    var rt0 = performance.now(), rdur = 220;
    var fromRot = pose.rot;
    while (true) {
      var rt = clamp((performance.now() - rt0) / rdur, 0, 1);
      pose.rot = lerp(fromRot, 0, easeOutBack(rt));
      await tick();
      if (rt >= 1) break;
    }
    await lookAround();
  }

  async function sitAndWag(ms) {
    pose.moving = 0;
    await tailWagBurst(ms);
  }

  async function fadeIn() {
    pose.visible = true;
    render();
    await wait(360);
  }

  /* ================================================================
   * 9) TUR (TOUR) — spec'teki tam rota; her turda her şey rastgele
   * ================================================================ */
  function anchorLogo() { return anchorPoint(T.logo, 0.28, 0.55); }
  function anchorNet() {
    if (T.netSpan) return anchorPoint(T.netSpan, 0.5, 0.3);
    // Metin bulunamazsa (ör. görsel logo), logonun sağ-alt bölgesine yaklaşık nokta
    return anchorPoint(T.logo, 0.82, 0.6);
  }
  function anchorHeaderPoint(frac) { return anchorPoint(T.header || T.logo, frac, 0.75); }
  function anchorEl(el, ox, oy) { return el ? anchorPoint(el, ox, oy) : null; }

  async function introSequence() {
    var p = anchorLogo();
    if (!p) return false;
    pose.x = p.x; pose.y = p.y; pose.scale = 0.4;
    render();
    var t0 = performance.now();
    while (true) {
      var t = clamp((performance.now() - t0) / 500, 0, 1);
      pose.scale = lerp(0.4, 1, easeOutBack(t));
      await tick();
      if (t >= 1) break;
    }
    await fadeIn();
    await wait(rand(600, 1100));
    await earTwitch();
    await noseTwitch();
    await blinkOnce();
    await sitAndWag(rand(900, 1500));
    await lookAround();
    return true;
  }

  async function crossHeader() {
    if (!T.header) return;
    var fromFrac = rand(0.15, 0.3), toFrac = rand(0.55, 0.85);
    await moveTo(
      function () { return anchorHeaderPoint(fromFrac); },
      function () { return anchorHeaderPoint(toFrac); },
      { duration: rand(1800, 2600), curve: rand(-18, 18), pauseChance: 0.3 }
    );
  }

  async function visitNav() {
    var order = [T.navForum, T.navExplore, T.navQuickTopic].filter(Boolean);
    // sırayı bazen karıştır (her tur farklı olsun)
    if (Math.random() < 0.5) order.reverse();

    for (var i = 0; i < order.length; i++) {
      var el = order[i];
      var prevAnchor = i === 0 ? anchorHeaderPoint(0.5) : anchorEl(order[i - 1], 0.5, 0.5);
      await moveTo(
        function () { return pose._lastAnchor ? pose._lastAnchor() : prevAnchor; },
        function () { return anchorEl(el, 0.5, 0.4); },
        { duration: rand(900, 1500) }
      );
      pose._lastAnchor = function (e) { return function () { return anchorEl(e, 0.5, 0.4); }; }(el);

      var text = (el.textContent || '').trim();
      if (/keşfet|ke şfet|explore/i.test(text) && Math.random() < 0.6) {
        await lookAround();
        await wait(rand(5000, 8000));
      } else if (/hızlı konu|hizli konu|quick topic/i.test(text)) {
        await sitAndWag(rand(700, 1200));
        await jumpAt(function () { return anchorEl(el, 0.7, 0.2); }, { height: rand(20, 32) });
      } else {
        await wait(rand(500, 1400));
        if (Math.random() < 0.3) await lookAround();
      }
    }
  }

  async function visitSearch() {
    if (!T.search) return;
    await moveTo(
      function () { return pose._lastAnchor ? pose._lastAnchor() : anchorHeaderPoint(0.5); },
      function () { return anchorEl(T.search, 0.08, 0.5); },
      { duration: rand(1000, 1700) }
    );
    // kutu kenarında yürüme
    await moveTo(
      function () { return anchorEl(T.search, 0.08, 0.5); },
      function () { return anchorEl(T.search, 0.85, 0.5); },
      { duration: rand(1200, 1900), curve: rand(-6, 6), pauseChance: 0 }
    );
    pose._lastAnchor = function () { return anchorEl(T.search, 0.85, 0.5); };
    pose.tilt = rand(-18, -10);
    await wait(200);
    await lookAround();
    await wait(rand(1200, 2400));
    pose.tilt = 0;
  }

  async function visitNetLogo() {
    var target = anchorNet();
    if (!target) return;
    await moveTo(
      function () { return pose._lastAnchor ? pose._lastAnchor() : anchorHeaderPoint(0.7); },
      anchorNet,
      { duration: rand(1300, 2000), curve: rand(-15, 15) }
    );
    pose._lastAnchor = anchorNet;
    // dengede durma: kuyruk dengeleyici olarak hafif ileri-geri
    var t0 = performance.now(), dur = rand(1400, 2200);
    while (performance.now() - t0 < dur && !S.destroyed) {
      pose.tailBase = Math.sin((performance.now() - t0) / 260) * 22;
      pose.rot = Math.sin((performance.now() - t0) / 400) * 4;
      await tick();
    }
    pose.rot = 0;

    // %35 ihtimalle düşme sekansı
    if (Math.random() < 0.35) {
      await fallAndRecover(anchorNet);
      pose._lastAnchor = anchorNet;
    }
  }

  async function visitFooter() {
    if (!T.footer) return;
    await moveTo(
      function () { return pose._lastAnchor ? pose._lastAnchor() : anchorLogo(); },
      function () { return anchorEl(T.footer, 0.5, 0.05); },
      { duration: rand(2200, 3200), curve: rand(-30, 30), pauseChance: 0.25 }
    );
    pose._lastAnchor = function () { return anchorEl(T.footer, 0.5, 0.05); };

    var stats = T.stats.slice();
    // rastgele karıştır, bazılarını atla
    stats.sort(function () { return Math.random() - 0.5; });
    var visitCount = clamp(Math.round(stats.length * rand(0.4, 0.8)), 0, stats.length);

    for (var i = 0; i < visitCount; i++) {
      var el = stats[i];
      await moveTo(
        function () { return pose._lastAnchor(); },
        function () { return anchorEl(el, 0.5, 0.4); },
        { duration: rand(700, 1300) }
      );
      pose._lastAnchor = function (e) { return function () { return anchorEl(e, 0.5, 0.4); }; }(el);
      pose.nose = rand(0.4, 0.7);
      await wait(rand(400, 900));
      pose.nose = 0;
      if (Math.random() < 0.4) await lookAround();
    }
  }

  async function visitCategories() {
    if (!T.categories.length) return;
    var cats = T.categories.slice();
    cats.sort(function () { return Math.random() - 0.5; });
    var n = clamp(Math.round(cats.length * rand(0.5, 1)), 1, cats.length);

    for (var i = 0; i < n; i++) {
      var el = cats[i];
      var skip = Math.random() < 0.25;
      await moveTo(
        function () { return pose._lastAnchor ? pose._lastAnchor() : anchorLogo(); },
        function () { return anchorEl(el, 0.5, 0.35); },
        { duration: rand(800, 1400) }
      );
      pose._lastAnchor = function (e) { return function () { return anchorEl(e, 0.5, 0.35); }; }(el);
      if (skip) { await wait(rand(150, 350)); continue; }
      await wait(rand(1200, 3200));
      if (Math.random() < 0.3) await lookAround();
    }
  }

  async function returnToLogo() {
    await moveTo(
      function () { return pose._lastAnchor ? pose._lastAnchor() : anchorLogo(); },
      anchorLogo,
      { duration: rand(2400, 3400), curve: rand(-35, 35), pauseChance: 0.3 }
    );
    pose._lastAnchor = anchorLogo;
    pose.rot = 0;
    await sitAndWag(rand(1200, 2000));
    await earTwitch();
    await blinkOnce();
  }

  /* ================================================================
   * 10) ANA DÖNGÜ
   * ================================================================ */
  var startedIntro = false;

  async function mainLoop() {
    while (!S.destroyed) {
      if (S.hidden) { await wait(500); continue; }

      T = locateTargets(); // her tur başında güncel DOM referansları

      if (!startedIntro) {
        var ok = await introSequence();
        startedIntro = true;
        if (!ok) { await wait(1500); continue; }
      } else {
        await crossHeader();
      }

      if (T.navForum || T.navExplore || T.navQuickTopic) await visitNav();
      if (T.search) await visitSearch();
      await visitNetLogo();
      if (T.footer) await visitFooter();
      if (T.categories.length) await visitCategories();
      await returnToLogo();

      // offscreen iken CPU tasarrufu: birkaç frame atla
      if (S.offscreen) { S.frameSkip = 2; } else { S.frameSkip = 0; }
    }
  }

  /* ================================================================
   * 11) BAŞLAT + TEMİZLİK
   * ================================================================ */
  function destroy() {
    S.destroyed = true;
    try { mo && mo.disconnect(); } catch (e) {}
    try { ro && ro.disconnect(); } catch (e) {}
    try { io && io.disconnect(); } catch (e) {}
    window.removeEventListener('resize', scheduleRelocate);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
  }

  window.MFSQ = { destroy: destroy, disabled: false };

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
      return;
    }
    mainLoop();
  }
  boot();
})();
