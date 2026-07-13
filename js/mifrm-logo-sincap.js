/*!
 * mifrm-logo.js
 * ----------------------------------------------------------------------
 * MiFRM Forum teması için bağımsız, sıfır-bağımlılık "sincak" animasyon
 * katmanı. Bu dosya temanın HTML/CSS/JS yapısına HİÇ dokunmaz; kendi
 * elemanlarını oluşturur, tema DOM'unu sadece OKUR (querySelector /
 * getBoundingClientRect) ve üzerine görsel bir katman ekler.
 *
 * Karakter: 🐿️ emoji (istek üzerine — vektör çizim yerine sistem/OS emoji
 * fontu kullanılıyor; ekstra dosya/görsel indirmesi yok, her cihazda
 * mevcut, telif riski yok).
 *
 * Namespace: window.MFSQ (çakışma riski yok).
 *
 * Notlar:
 *  - Emoji tek bir glif olduğu için kulak/kuyruk/göz gibi ayrı parçaları
 *    fiziksel olarak oynatamıyoruz. Bunun yerine aynı "canlılık" hissini
 *    orantılı vekil (proxy) animasyonlarla veriyoruz:
 *      göz kırpma      -> hafif dikey sıkışma (blink-squish)
 *      kulak titremesi -> küçük hızlı açı titreşimi
 *      burun titremesi -> minik pozisyon jitter'ı
 *      kuyruk sallama  -> gövde wiggle (yumuşak yana-yana rotasyon)
 *      nefes alma      -> çok hafif sürekli scale nefes döngüsü
 *  - Hareket yönüne göre otomatik yatay flip (sağa/sola bakış).
 *  - `prefers-reduced-motion: reduce` varsa script kendini başlatmaz.
 * ----------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.MFSQ) return;
  if (typeof document === 'undefined') return;

  var mql = null;
  try { mql = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) {}
  if (mql && mql.matches) { window.MFSQ = { disabled: true, reason: 'prefers-reduced-motion' }; return; }

  /* ================================================================
   * 0) YARDIMCILAR
   * ================================================================ */
  var rand = function (min, max) { return min + Math.random() * (max - min); };
  var pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOutBack = function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (fn) { return setTimeout(fn, 16); };
  var nextFrame = function () { return new Promise(function (res) { raf(res); }); };

  function scrollX() { return window.pageXOffset || document.documentElement.scrollLeft || 0; }
  function scrollY() { return window.pageYOffset || document.documentElement.scrollTop || 0; }

  /* ================================================================
   * 1) DURUM
   * ================================================================ */
  var S = { destroyed: false, offscreen: false, hidden: (document.visibilityState === 'hidden') };

  var pose = {
    x: 0, y: 0,
    rot: 0, wiggle: 0,      // wiggle: kuyruk-sallama vekili (gövde salınımı)
    scale: 1, squashX: 1, squashY: 1,
    facing: 1,              // 1 = varsayılan yön, -1 = yatay flip
    bob: 0,                 // yürüyüş/nefes dikey ofseti
    visible: false,
    moving: 0,
    legPhase: 0,
    tilt: 0,                // "merak" eğimi (lookAround)
    jitterX: 0, jitterY: 0, // burun titremesi vekili
    _tailBurst: false, _blinking: false, _earing: false, _nosing: false,
    breathT: 0
  };

  /* ================================================================
   * 2) STİL
   * ================================================================ */
  var styleTag = document.createElement('style');
  styleTag.setAttribute('data-mfsq', '1');
  styleTag.textContent =
    '.mfsq-layer{position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483000;}' +
    '.mfsq-wrap{position:absolute;top:0;left:0;width:32px;height:32px;margin:-16px 0 0 -16px;' +
    'will-change:transform;transform:translate3d(-9999px,-9999px,0);opacity:0;' +
    'transition:opacity .35s ease;pointer-events:none;display:flex;align-items:center;justify-content:center;}' +
    '.mfsq-wrap.mfsq-show{opacity:1;}' +
    '.mfsq-emoji{font-size:26px;line-height:1;user-select:none;' +
    'filter:drop-shadow(0 2px 2px rgba(0,0,0,.28));transform-origin:50% 80%;}';
  document.head.appendChild(styleTag);

  /* ================================================================
   * 3) DOM
   * ================================================================ */
  var layer = document.createElement('div');
  layer.className = 'mfsq-layer';
  layer.setAttribute('aria-hidden', 'true');

  var wrap = document.createElement('div');
  wrap.className = 'mfsq-wrap';
  wrap.innerHTML = '<div class="mfsq-emoji">\uD83D\uDC3F\uFE0F</div>'; // 🐿️
  layer.appendChild(wrap);
  document.body.appendChild(layer);

  var emojiEl = wrap.querySelector('.mfsq-emoji');

  /* ================================================================
   * 4) TEMA DOM ALGISI (theme-vb.css/js sınıf adlarına göre)
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
    return {
      header: q('.hamdi-header-wrapper') || q('.hamdi-header-container') || q('.forum-header'),
      logo: logoLink || q('.hamdi-logo-area'),
      netSpan: netSpan,
      navForum: findNavItem(/forum/i),
      navExplore: findNavItem(/ke\u015ffet|explore/i),
      navQuickTopic: findNavItem(/h\u0131zl\u0131 konu|hizli konu|quick topic/i),
      search: q('.hamdi-search-form') || q('.hamdi-search-input') || q('.hamdi-search-btn'),
      footer: q('.site-footer') || q('footer'),
      stats: qa('.hamdi-stat-block, .stat-online-card, .stat-grid-cell, .xf-ustat'),
      categories: qa('.category-icon-wrapper')
    };
  }

  var T = locateTargets();

  var relocateTimer = null;
  function scheduleRelocate() {
    if (relocateTimer) clearTimeout(relocateTimer);
    relocateTimer = setTimeout(function () { T = locateTargets(); }, 400);
  }

  var mo, ro, io;
  try { mo = new MutationObserver(function () { scheduleRelocate(); }); mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  try { ro = new ResizeObserver(function () { scheduleRelocate(); }); ro.observe(document.documentElement); } catch (e) {}
  window.addEventListener('resize', scheduleRelocate, { passive: true });
  document.addEventListener('visibilitychange', function () { S.hidden = (document.visibilityState === 'hidden'); }, { passive: true });
  try {
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) S.offscreen = !entries[i].isIntersecting;
    }, { threshold: 0 });
    io.observe(wrap);
  } catch (e) {}

  /* ================================================================
   * 5) ANCHOR YARDIMCILARI (document-space; sayfa kayınca yapışık kalır)
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

  function avoidBoxes(mx, my, curve, excludeEl) {
    var boxes = [T.logo, T.search, T.navForum, T.navExplore, T.navQuickTopic].filter(function (e) { return e && e !== excludeEl; });
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
   * 6) RENDER
   * ================================================================ */
  function render() {
    var extraY = pose.bob;
    wrap.style.transform =
      'translate3d(' + pose.x.toFixed(1) + 'px,' + (pose.y + extraY).toFixed(1) + 'px,0) ' +
      'rotate(' + (pose.rot + pose.wiggle).toFixed(2) + 'deg) ' +
      'scale(' + (pose.scale * pose.squashX * pose.facing).toFixed(3) + ',' + (pose.scale * pose.squashY).toFixed(3) + ')';

    if (pose.visible && !wrap.classList.contains('mfsq-show')) wrap.classList.add('mfsq-show');
    if (!pose.visible && wrap.classList.contains('mfsq-show')) wrap.classList.remove('mfsq-show');

    emojiEl.style.transform = 'translate(' + pose.jitterX.toFixed(2) + 'px,' + pose.jitterY.toFixed(2) + 'px) rotate(' + pose.tilt.toFixed(2) + 'deg)';
  }

  /* ================================================================
   * 7) SÜREKLİ (idle) MİKRO-ANİMASYONLAR
   * ================================================================ */
  var timers = { blink: 0, ear: 0, nose: 0 };

  function idleTick(dt) {
    pose.breathT += dt;
    var breath = Math.sin(pose.breathT / 1000 * 1.6) * 0.02;
    pose.squashX = 1 + breath * 0.4;
    pose.squashY = 1 - breath * 0.4;

    if (Math.abs(pose.wiggle) < 0.4 && !pose._tailBurst) {
      pose.wiggle = Math.sin(pose.breathT / 1000 * 1.1) * 2.4;
    }

    timers.blink -= dt;
    if (timers.blink <= 0 && !pose._blinking) { pose._blinking = true; blinkOnce(); timers.blink = rand(2000, 6000); }

    timers.ear -= dt;
    if (timers.ear <= 0 && !pose._earing) { pose._earing = true; earTwitch(); timers.ear = rand(4000, 9000); }

    timers.nose -= dt;
    if (timers.nose <= 0 && !pose._nosing) { pose._nosing = true; noseTwitch(); timers.nose = rand(2500, 6000); }
  }

  // Göz kırpma vekili: minik dikey "sıkışma" (blink-squish)
  async function blinkOnce() {
    var steps = 5;
    for (var i = 0; i <= steps; i++) { var v = i / steps; pose.squashY *= (1 - v * 0.14); await tick(); }
    for (var j = steps; j >= 0; j--) { await tick(); }
    pose._blinking = false;
  }

  // Kulak titremesi vekili: küçük hızlı açı titreşimi
  async function earTwitch() {
    var dir = pick([-1, 1]);
    for (var i = 0; i <= 6; i++) { pose.tilt += Math.sin((i / 6) * Math.PI) * 6 * dir * 0.4; await tick(); }
    pose._earing = false;
  }

  // Burun titremesi vekili: minik pozisyon jitter'ı
  async function noseTwitch() {
    for (var i = 0; i < rand(3, 6); i++) {
      pose.jitterX = rand(-0.7, 0.7);
      pose.jitterY = rand(-0.5, 0.5);
      await wait(rand(70, 140));
    }
    pose.jitterX = 0; pose.jitterY = 0;
    pose._nosing = false;
  }

  // Kuyruk sallama vekili: yumuşak gövde wiggle patlaması
  async function tailWagBurst(ms) {
    pose._tailBurst = true;
    var end = performance.now() + ms;
    var freq = rand(3.5, 5.5);
    while (performance.now() < end && !S.destroyed) {
      pose.wiggle = Math.sin(performance.now() / 1000 * freq) * rand(6, 11);
      await tick();
    }
    pose.wiggle = 0;
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
   * 8) HAREKET SİSTEMİ
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
    return (async function () { while (performance.now() < end && !S.destroyed) await tick(); })();
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t, tt = t * t, uu = u * u, uuu = uu * u, ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
    };
  }

  async function moveTo(getStart, getEnd, opts) {
    opts = opts || {};
    var duration = opts.duration || rand(1400, 2600);
    var curve = opts.curve != null ? opts.curve : rand(-40, 40);
    var pauseChance = opts.pauseChance != null ? opts.pauseChance : 0.18;
    var t0 = performance.now();
    var didPause = false;
    var tv1 = rand(0.28, 0.4), tv2 = rand(0.62, 0.78);

    pose.moving = 1;
    var stepFreq = rand(7, 10);
    var lastX = null;

    while (true) {
      var now = performance.now();
      var t = clamp((now - t0) / duration, 0, 1);
      var start = getStart(), end = getEnd();
      if (!start || !end) { await tick(); if (t >= 1) break; continue; }

      var dx = end.x - start.x, dy = end.y - start.y;
      var dist = Math.max(1, Math.hypot(dx, dy));
      var nx = -dy / dist, ny = dx / dist;
      var c = avoidBoxes(lerp(start.x, end.x, 0.5), lerp(start.y, end.y, 0.5), curve, null);

      var via1 = { x: lerp(start.x, end.x, tv1) + nx * c, y: lerp(start.y, end.y, tv1) + ny * c };
      var via2 = { x: lerp(start.x, end.x, tv2) + nx * (c * 0.6), y: lerp(start.y, end.y, tv2) + ny * (c * 0.6) };

      var et = easeInOutCubic(t);
      var p = cubicBezier(start, via1, via2, end, et);

      if (lastX !== null) {
        var dxFrame = p.x - lastX;
        if (Math.abs(dxFrame) > 0.15) pose.facing = dxFrame >= 0 ? 1 : -1;
      }
      lastX = p.x;

      pose.x = p.x; pose.y = p.y;
      pose.legPhase += (stepFreq * (nowDt() / 1000)) * 2 * Math.PI;
      pose.bob = Math.abs(Math.sin(pose.legPhase)) * 2.2;

      if (!didPause && t > 0.35 && t < 0.6 && Math.random() < pauseChance * 0.02) {
        didPause = true;
        pose.moving = 0.15;
        await lookAround();
        pose.moving = 1;
      }

      await tick();
      if (t >= 1) break;
    }
    pose.moving = 0;
    pose.bob = 0;
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
      await tick();
      if (t >= 1) break;
    }
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
    var dropDist = rand(20, 32);
    var t0 = performance.now(), dur = rand(260, 380);
    while (true) {
      var t = clamp((performance.now() - t0) / dur, 0, 1);
      pose.x = start.x + Math.sin(t * 10) * 3;
      pose.y = start.y + dropDist * (t * t);
      pose.rot = lerp(0, rand(50, 90) * pick([-1, 1]), t);
      await tick();
      if (t >= 1) break;
    }
    var pt0 = performance.now(), pdur = rand(220, 340);
    while (performance.now() - pt0 < pdur && !S.destroyed) {
      pose.rot += rand(-40, 40);
      await tick();
    }
    var rt0 = performance.now(), rdur = 220, fromRot = pose.rot;
    while (true) {
      var rt = clamp((performance.now() - rt0) / rdur, 0, 1);
      pose.rot = lerp(fromRot, 0, easeOutBack(rt));
      await tick();
      if (rt >= 1) break;
    }
    await lookAround();
  }

  async function sitAndWag(ms) { pose.moving = 0; await tailWagBurst(ms); }

  async function fadeIn() { pose.visible = true; render(); await wait(360); }

  /* ================================================================
   * 9) TUR
   * ================================================================ */
  function anchorLogo() { return anchorPoint(T.logo, 0.28, 0.55); }
  function anchorNet() {
    if (T.netSpan) return anchorPoint(T.netSpan, 0.5, 0.3);
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
    if (Math.random() < 0.5) order.reverse();

    for (var i = 0; i < order.length; i++) {
      var el = order[i];
      var prevAnchor = i === 0 ? anchorHeaderPoint(0.5) : anchorEl(order[i - 1], 0.5, 0.5);
      await moveTo(
        function () { return pose._lastAnchor ? pose._lastAnchor() : prevAnchor; },
        function () { return anchorEl(el, 0.5, 0.4); },
        { duration: rand(900, 1500) }
      );
      pose._lastAnchor = (function (e) { return function () { return anchorEl(e, 0.5, 0.4); }; })(el);

      var text = (el.textContent || '').trim();
      if (/ke\u015ffet|explore/i.test(text) && Math.random() < 0.6) {
        await lookAround();
        await wait(rand(5000, 8000));
      } else if (/h\u0131zl\u0131 konu|hizli konu|quick topic/i.test(text)) {
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
    var t0 = performance.now(), dur = rand(1400, 2200);
    while (performance.now() - t0 < dur && !S.destroyed) {
      pose.wiggle = Math.sin((performance.now() - t0) / 260) * 9;
      pose.rot = Math.sin((performance.now() - t0) / 400) * 4;
      await tick();
    }
    pose.rot = 0;

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
    stats.sort(function () { return Math.random() - 0.5; });
    var visitCount = clamp(Math.round(stats.length * rand(0.4, 0.8)), 0, stats.length);

    for (var i = 0; i < visitCount; i++) {
      var el = stats[i];
      await moveTo(
        function () { return pose._lastAnchor(); },
        function () { return anchorEl(el, 0.5, 0.4); },
        { duration: rand(700, 1300) }
      );
      pose._lastAnchor = (function (e) { return function () { return anchorEl(e, 0.5, 0.4); }; })(el);
      pose.jitterX = rand(0.4, 0.8);
      await wait(rand(400, 900));
      pose.jitterX = 0;
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
      pose._lastAnchor = (function (e) { return function () { return anchorEl(e, 0.5, 0.35); }; })(el);
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

      T = locateTargets();

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
