/* ==========================================================================
   MiFRM — Dijital Karınca / Işık Parçacığı AI Karakteri (v3.0)
   --------------------------------------------------------------------------
   * TAMAMEN EK (additive) bir modüldür. Mevcut HTML/CSS/JS'e dokunmaz,
     üzerine yazmaz. Gerçek arama kutusuna asla değer YAZMAZ (input.value
     değiştirilmez) — "ARA" yazma efekti tamamen canvas üzerinde, görsel
     bir illüzyondur.
   * Sahne (stage): ".hamdi-header-wrapper" (varsa) — sticky üst çubuğun
     tamamı. Yoksa ".hamdi-header-container", o da yoksa logo alanının
     kendisi kullanılır. Sahneye TEK bir <canvas> eklenir.
   * Karınca; harflerin üzerinde yürür, harfler arası boşluklardan geçer,
     ara sıra durup "etrafına bakar", kısa süre "düşünür" (rengi hafifçe
     kehribara kayar), bazen "tökezleyip" toparlanır — hepsi rastgele
     zamanlamalarla, asla sabit bir rotada değil.
   * Periyodik olarak (ortalama ~40-70 sn'de bir): bildirim ikonuna gider,
     inceler, arama kutusuna gider, "ARA" yazar, sonra hızlanarak parlak
     bir ışık izi bırakıp "MiFRM FORUM" yazısını neon bir parıltıyla
     kısaca ortaya çıkarır, sonra tekrar doğal gezinmeye döner.
   * Her 50 saniyede makro davranış profili (hız, bekleme/']düşünme/
     tökezleme olasılıkları) yeniden rastgelenir — hareket asla aynı
     örüntüyü tekrarlamaz.
   * Fizik: seek/steering tabanlı ivme + sönümleme (damping) — doğrusal
     "git-gel" değil, organik hızlanma/yavaşlama.
   * Performans: sabit boyutlu halka tampon (trail), per-frame ağır DOM
     ölçümü yok (ölçüm sadece init/resize'da), devicePixelRatio ≤ 1.5,
     sekme arka plandayken tamamen durur. rAF ekranın doğal hızına
     (genelde 60 FPS) bağlıdır. Bildirim/arama elemanları bulunamazsa
     sahne içinde güvenli "temsili" noktalara geçilir — asla hata vermez,
     asla layout'u bozmaz. SEO/Core Web Vitals'a etkisi yoktur.
   ========================================================================== */
(function () {
  "use strict";

  if (window.__mifrmAntFxLoaded) return;
  window.__mifrmAntFxLoaded = true;

  var reduceMotionMQ = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduceMotion = !!(reduceMotionMQ && reduceMotionMQ.matches);
  var pageHidden = false;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function init() {
    var area = document.querySelector(".hamdi-logo-area");
    if (!area) return;
    var link = area.querySelector("a");
    if (!link) return;

    var stage = document.querySelector(".hamdi-header-wrapper") ||
                document.querySelector(".hamdi-header-container") ||
                area.parentElement || area;

    var stageComputed = getComputedStyle(stage);
    if (stageComputed.position === "static") stage.style.position = "relative";

    var canvas = document.createElement("canvas");
    canvas.className = "mifrm-antfx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    canvas.style.willChange = "transform";
    stage.insertBefore(canvas, stage.firstChild);

    var ctx = canvas.getContext("2d", { alpha: true });
    var dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));

    var stageW = 0, stageH = 0;
    var letters = [];   // harf merkezleri {x,y,h}
    var gaps = [];      // olası boşluk geçiş noktaları {x,y}
    var baselineY = 0;
    var bellPt = { x: 0, y: 0, real: false };
    var searchPt = { x: 0, y: 0, real: false };

    /* ---------------------------------------------------------------- *
     * Bildirim / arama elemanını sahne içinde ara; yoksa güvenli bir
     * "temsili" nokta (sahnenin sağ tarafında) döndür.
     * ---------------------------------------------------------------- */
    function findTarget(selectors, fallbackXRatio) {
      for (var i = 0; i < selectors.length; i++) {
        var el;
        try { el = stage.querySelector(selectors[i]); } catch (e) { el = null; }
        if (el && stage.contains(el)) {
          var r = el.getBoundingClientRect();
          var sr = stage.getBoundingClientRect();
          if (r.width && r.height) {
            return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2, real: true };
          }
        }
      }
      var sr2 = stage.getBoundingClientRect();
      return { x: sr2.width * fallbackXRatio, y: sr2.height / 2, real: false };
    }

    function measure() {
      var sr = stage.getBoundingClientRect();
      stageW = sr.width; stageH = sr.height;
      if (stageW < 10 || stageH < 10) return;

      canvas.width = Math.round(stageW * dpr);
      canvas.height = Math.round(stageH * dpr);
      canvas.style.width = stageW + "px";
      canvas.style.height = stageH + "px";
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
              x: r.left - sr.left + r.width / 2,
              y: r.top - sr.top + r.height / 2,
              h: r.height
            });
          }
        }
      }

      gaps = [];
      for (var k = 1; k < letters.length; k++) {
        var dx = letters[k].x - letters[k - 1].x;
        if (dx > letters[k].h * 1.35) {
          gaps.push({ x: (letters[k].x + letters[k - 1].x) / 2, y: (letters[k].y + letters[k - 1].y) / 2 });
        }
      }
      baselineY = letters.length ? letters[0].y : stageH / 2;

      bellPt = findTarget(["#vbNotifBell", "#vbNotif", '[id*="Notif" i]', '[class*="notif" i]'], 0.74);
      searchPt = findTarget([".hamdi-search-input", ".hamdi-search-form", 'input[type="search"]'], 0.9);
    }

    measure();

    var resizeTimer = null;
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 150); }
    window.addEventListener("resize", onResize, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
    new MutationObserver(onResize).observe(link, { childList: true, characterData: true, subtree: true });
    document.addEventListener("visibilitychange", function () { pageHidden = document.hidden; });

    /* ---------------------------------------------------------------- *
     * Karınca fizik durumu — steering (seek) tabanlı ivme + sönümleme.
     * ---------------------------------------------------------------- */
    var ant = {
      x: letters.length ? letters[0].x : stageW / 2,
      y: letters.length ? letters[0].y : stageH / 2,
      vx: 0, vy: 0, ax: 0, ay: 0,
      angle: 0,
      wobblePhase: Math.random() * Math.PI * 2
    };

    var TRAIL_LEN = 20;
    var trail = [];
    for (var t = 0; t < TRAIL_LEN; t++) trail.push(null);
    var trailHead = 0;

    var hueBase = 182;
    var hueShift = 0, hueShiftTarget = 0;

    /* ---------------------------------------------------------------- *
     * Makro davranış profili — her 50 sn'de yeniden rastgelenir, böylece
     * hareket örüntüsü hiçbir zaman tekrar etmez.
     * ---------------------------------------------------------------- */
    var profile = {};
    function rollProfile() {
      profile = {
        maxSpeed: rand(16, 30),
        pauseChance: rand(0.10, 0.28),
        thinkChance: rand(0.06, 0.20),
        stumbleChance: rand(0.03, 0.11),
        pauseDur: rand(0.7, 1.6),
        thinkDur: rand(1.0, 2.3)
      };
    }
    rollProfile();
    var profileTimer = setInterval(rollProfile, 50000);

    /* ---------------------------------------------------------------- *
     * Durum makinesi (FSM)
     * ---------------------------------------------------------------- */
    var state = "WANDER";
    var stateT = 0;
    var target = null;
    var raceProgress = 0;
    var typedIdx = 0;
    var typedTimer = 0;
    var stumbleDur = 0;
    var TYPED_LETTERS = ["A", "R", "A"];

    function pickWanderTarget() {
      var r = Math.random();
      if (letters.length && r < 0.55) {
        var lt = letters[Math.floor(Math.random() * letters.length)];
        return { x: lt.x, y: lt.y + rand(-2, 2) };
      } else if (gaps.length && r < 0.8) {
        var g = gaps[Math.floor(Math.random() * gaps.length)];
        return { x: g.x, y: g.y };
      }
      return { x: rand(stageW * 0.06, stageW * 0.94), y: baselineY + rand(-9, 9) };
    }

    function enterState(s) {
      state = s; stateT = 0;
      if (s === "WANDER") target = pickWanderTarget();
      else if (s === "TO_BELL") target = { x: bellPt.x, y: bellPt.y };
      else if (s === "TO_SEARCH") target = { x: searchPt.x, y: searchPt.y };
      else if (s === "TYPING") { typedIdx = 0; typedTimer = 0; }
      else if (s === "RACE") { raceProgress = 0; }
      else if (s === "STUMBLE") {
        stumbleDur = rand(0.4, 0.7);
        ant.vy += rand(14, 22);
        ant.vx += rand(-6, 6);
      }
    }

    var tourTimer = null;
    function scheduleTour() {
      clearTimeout(tourTimer);
      tourTimer = setTimeout(function () {
        if (state === "WANDER" || state === "PAUSE" || state === "THINK") {
          enterState("TO_BELL");
          scheduleTour();
        } else {
          scheduleTour(); // meşgulse bir sonraki pencereyi dene
        }
      }, rand(38000, 70000));
    }
    scheduleTour();

    function seek(tx, ty, maxSpeed, maxForce) {
      var dx = tx - ant.x, dy = ty - ant.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      var dvx = dx / dist * maxSpeed, dvy = dy / dist * maxSpeed;
      var sx = dvx - ant.vx, sy = dvy - ant.vy;
      var smag = Math.sqrt(sx * sx + sy * sy);
      if (smag > maxForce) { sx = sx / smag * maxForce; sy = sy / smag * maxForce; }
      ant.ax += sx; ant.ay += sy;
      return dist;
    }

    function integrate(dt, damping) {
      ant.vx += ant.ax * dt; ant.vy += ant.ay * dt;
      ant.vx *= damping; ant.vy *= damping;
      ant.x += ant.vx * dt; ant.y += ant.vy * dt;
      ant.x = clamp(ant.x, 4, stageW - 4);
      ant.y = clamp(ant.y, 4, stageH - 4);
      ant.ax = 0; ant.ay = 0;
      var spd = Math.sqrt(ant.vx * ant.vx + ant.vy * ant.vy);
      if (spd > 0.3) ant.angle = Math.atan2(ant.vy, ant.vx);
    }

    var elapsed = 0, lastT = null, rafId = null;

    function updateState(dt) {
      hueShiftTarget = (state === "THINK") ? 42 : 0;
      hueShift = lerp(hueShift, hueShiftTarget, dt * 2.2);

      switch (state) {
        case "WANDER": {
          var dist = seek(target.x, target.y, profile.maxSpeed, profile.maxSpeed * 3);
          integrate(dt, 0.90);
          if (dist < 4) {
            var r = Math.random();
            if (r < profile.stumbleChance) enterState("STUMBLE");
            else if (r < profile.stumbleChance + profile.thinkChance) enterState("THINK");
            else if (r < profile.stumbleChance + profile.thinkChance + profile.pauseChance) enterState("PAUSE");
            else enterState("WANDER");
          }
          break;
        }
        case "PAUSE": {
          integrate(dt, 0.85);
          if (stateT > profile.pauseDur) enterState("WANDER");
          break;
        }
        case "THINK": {
          integrate(dt, 0.80);
          if (stateT > profile.thinkDur) enterState("WANDER");
          break;
        }
        case "STUMBLE": {
          integrate(dt, 0.72);
          if (stateT > stumbleDur) enterState("WANDER");
          break;
        }
        case "TO_BELL": {
          var d1 = seek(target.x, target.y, profile.maxSpeed * 1.15, profile.maxSpeed * 3.5);
          integrate(dt, 0.90);
          if (d1 < 6) enterState("AT_BELL");
          break;
        }
        case "AT_BELL": {
          var orbitR = 7, orbitSpeed = 3.1;
          var ox = bellPt.x + Math.cos(elapsed * orbitSpeed) * orbitR;
          var oy = bellPt.y + Math.sin(elapsed * orbitSpeed) * orbitR * 0.6;
          seek(ox, oy, profile.maxSpeed * 0.8, profile.maxSpeed * 3);
          integrate(dt, 0.88);
          if (stateT > rand(1.2, 2.0)) enterState("TO_SEARCH");
          break;
        }
        case "TO_SEARCH": {
          var d2 = seek(target.x, target.y, profile.maxSpeed * 1.15, profile.maxSpeed * 3.5);
          integrate(dt, 0.90);
          if (d2 < 6) enterState("TYPING");
          break;
        }
        case "TYPING": {
          integrate(dt, 0.8);
          typedTimer += dt;
          if (typedTimer > 0.32 && typedIdx < TYPED_LETTERS.length) { typedIdx++; typedTimer = 0; }
          if (typedIdx >= TYPED_LETTERS.length && stateT > 1.3) enterState("RACE");
          break;
        }
        case "RACE": {
          var fastSpeed = profile.maxSpeed * 3.2;
          seek(stageW * 0.5, baselineY, fastSpeed, fastSpeed * 4);
          integrate(dt, 0.95);
          raceProgress += dt * 0.9;
          if (stateT > 2.6) enterState("WANDER");
          break;
        }
      }

      var addTrail = (state === "RACE") ? true : (Math.random() < 0.5);
      if (addTrail) {
        trail[trailHead] = { x: ant.x, y: ant.y, fast: state === "RACE" };
        trailHead = (trailHead + 1) % TRAIL_LEN;
      }
    }

    function drawAnt(hue) {
      ctx.save();
      ctx.translate(ant.x, ant.y);
      var wob = Math.sin(elapsed * 14 + ant.wobblePhase) * 0.10;
      ctx.rotate(ant.angle + wob);

      var legPhase = elapsed * 18;

      var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
      glow.addColorStop(0, "hsla(" + hue + ",100%,80%,0.9)");
      glow.addColorStop(1, "hsla(" + hue + ",100%,60%,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "hsla(" + hue + ",100%,92%,0.95)";
      ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-3.6, 0, 1.6, 1.2, 0, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "hsla(" + hue + ",100%,85%,0.75)";
      ctx.lineWidth = 0.6;
      for (var l = -1; l <= 1; l += 2) {
        var lp = Math.sin(legPhase + l) * 1.6;
        ctx.beginPath(); ctx.moveTo(0, l * 1.3); ctx.lineTo(3 + lp, l * 3.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2.2, l * 1.3); ctx.lineTo(-2.2 + lp, l * 3); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(2.4, -0.5); ctx.lineTo(4.6, -2);
      ctx.moveTo(2.4, 0.5); ctx.lineTo(4.6, 2);
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, stageW, stageH);
      ctx.globalCompositeOperation = "lighter";
      var hue = hueBase + hueShift + Math.sin(elapsed * 0.2) * 10;

      for (var k = 1; k <= TRAIL_LEN; k++) {
        var idx = (trailHead - k + TRAIL_LEN * 2) % TRAIL_LEN;
        var p = trail[idx];
        if (!p) continue;
        var life = 1 - k / TRAIL_LEN;
        if (life <= 0) continue;
        var a = life * (p.fast ? 0.65 : 0.38);
        ctx.fillStyle = "hsla(" + hue + ",100%,65%," + a + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + life * (p.fast ? 3 : 2), 0, Math.PI * 2);
        ctx.fill();
      }

      drawAnt(hue);

      if (state === "TYPING" && searchPt.real) {
        var strTyped = TYPED_LETTERS.slice(0, typedIdx).join("");
        if (strTyped) {
          ctx.font = "700 12px Arial,Tahoma,sans-serif";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "hsla(" + hue + ",100%,60%,0.9)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = "hsla(" + hue + ",100%,85%,0.95)";
          ctx.fillText(strTyped, searchPt.x - 14, searchPt.y - 14);
          ctx.shadowBlur = 0;
        }
      }

      if (state === "RACE" && raceProgress > 0.12) {
        var text = "MiFRM FORUM";
        ctx.font = "800 14px Arial,Tahoma,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var fullW = ctx.measureText(text).width;
        var reveal = clamp((raceProgress - 0.12) / 0.65, 0, 1);
        var fadeOut = stateT > 1.9 ? clamp(1 - (stateT - 1.9) / 0.6, 0, 1) : 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(stageW / 2 - fullW / 2 - 4, 0, fullW * reveal + 8, stageH);
        ctx.clip();
        ctx.shadowColor = "hsla(" + hue + ",100%,60%,0.95)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "hsla(" + hue + ",100%,88%," + (0.95 * fadeOut) + ")";
        ctx.fillText(text, stageW / 2, baselineY);
        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    function drawStatic() {
      ctx.clearRect(0, 0, stageW, stageH);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "hsla(" + hueBase + ",100%,70%,0.35)";
      ctx.beginPath();
      ctx.arc(letters.length ? letters[0].x : stageW / 2, baselineY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (pageHidden) { lastT = now; return; }
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      elapsed += dt; stateT += dt;

      if (reduceMotion) { drawStatic(); return; }
      if (!stageW || !stageH) return;

      updateState(dt);
      draw();
    }

    rafId = requestAnimationFrame(frame);

    window.addEventListener("pagehide", function () {
      cancelAnimationFrame(rafId);
      clearInterval(profileTimer);
      clearTimeout(tourTimer);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
