(function () {
  var wrap = document.querySelector('.mw-deco-wrap');
  if (!wrap) return;

  var paths = Array.prototype.slice.call(wrap.querySelectorAll('.mw-deco-line'));
  var segments = Array.prototype.slice.call(wrap.querySelectorAll('.mw-deco-segment-glow'));
  var origin = document.querySelector('.mw-path-origin');
  var pathEnd = document.querySelector('.mw-path-end');
  var heroShell = document.querySelector('.mw-hero-shell');
  var pricingShell = document.querySelector('.mw-pricing-shell');
  if (!paths.length) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var breakpoint = window.matchMedia('(max-width: 900px)');

  var DROP = 50;
  var CYCLE_MS = 3000;
  var HIGHLIGHT_HALF = 36;
  var SEGMENT_SAMPLES = 10;

  var active = null;
  var len = 0;
  var startTime = 0;
  var animating = false;
  var rafId = null;

  function activePath() {
    for (var i = 0; i < paths.length; i++) {
      if (getComputedStyle(paths[i]).display !== 'none') return paths[i];
    }
    return paths[0];
  }

  function pathForSegment(seg) {
    var isMobile = seg.classList.contains('mw-deco-segment-glow-mobile');
    for (var i = 0; i < paths.length; i++) {
      var mobile = paths[i].classList.contains('mw-deco-line-mobile');
      if (isMobile === mobile) return paths[i];
    }
    return paths[0];
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function toViewBox(px, py) {
    var wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width <= 0 || wrapRect.height <= 0) {
      return { x: px, y: py };
    }
    return {
      x: (px / wrapRect.width) * 100,
      y: (py / wrapRect.height) * 1000
    };
  }

  function originCoords() {
    var wrapRect = wrap.getBoundingClientRect();
    if (!origin || wrapRect.width <= 0 || wrapRect.height <= 0) {
      return { x: 50, y: 200 };
    }
    var oRect = origin.getBoundingClientRect();
    var px = oRect.left + oRect.width / 2 - wrapRect.left;
    var py = oRect.top + oRect.height / 2 - wrapRect.top;
    return toViewBox(px, py);
  }

  function endCoords() {
    var wrapRect = wrap.getBoundingClientRect();
    if (!pathEnd || wrapRect.width <= 0 || wrapRect.height <= 0) {
      return { x: 50, y: 980 };
    }
    var eRect = pathEnd.getBoundingClientRect();
    var px = eRect.left + eRect.width / 2 - wrapRect.left;
    var py = eRect.top + eRect.height / 2 - wrapRect.top;
    return toViewBox(px, py);
  }

  function pathD(el) {
    var o = originCoords();
    var e = endCoords();
    var joinY = o.y + DROP;
    var tail = el.getAttribute('data-tail') || '';
    var prefix = 'M ' + o.x.toFixed(2) + ' ' + o.y.toFixed(2) +
                 ' L ' + o.x.toFixed(2) + ' ' + joinY.toFixed(2) + ' ' + tail;
    var isMobile = el.classList.contains('mw-deco-line-mobile');
    if (isMobile) {
      var MOBILE_TAIL_END_Y = 700;
      var c1y = e.y <= MOBILE_TAIL_END_Y ? e.y : (MOBILE_TAIL_END_Y + e.y) * 0.5;
      var c2y = e.y <= MOBILE_TAIL_END_Y ? e.y : MOBILE_TAIL_END_Y + (e.y - MOBILE_TAIL_END_Y) * 0.7;
      return prefix + ' C 18 ' + c1y.toFixed(2) + ', 12 ' + c2y.toFixed(2) + ', ' +
             e.x.toFixed(2) + ' ' + e.y.toFixed(2);
    }
    var TAIL_END_Y = 640;
    var approachY = e.y <= TAIL_END_Y ? e.y : TAIL_END_Y + (e.y - TAIL_END_Y) * 0.6;
    return prefix + ' S 50 ' + approachY.toFixed(2) + ', ' +
           e.x.toFixed(2) + ' ' + e.y.toFixed(2);
  }

  function buildPaths() {
    for (var i = 0; i < paths.length; i++) {
      paths[i].setAttribute('d', pathD(paths[i]));
    }
  }

  function buildSegmentD(pathEl, atLen, halfLen) {
    var totalLen = pathEl.getTotalLength();
    var start = Math.max(0, atLen - halfLen);
    var end = Math.min(totalLen, atLen + halfLen);
    if (end - start < 0.5) return '';
    var d = '';
    for (var i = 0; i <= SEGMENT_SAMPLES; i++) {
      var t = start + (end - start) * (i / SEGMENT_SAMPLES);
      var pt = pathEl.getPointAtLength(t);
      d += (i === 0 ? 'M ' : ' L ') + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2);
    }
    return d;
  }

  function updateSegmentGlow(atLen) {
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (getComputedStyle(seg).display === 'none') {
        seg.setAttribute('d', '');
        continue;
      }
      if (reduceMotion.matches) {
        seg.setAttribute('d', '');
        seg.style.opacity = '0';
        continue;
      }
      var base = pathForSegment(seg);
      seg.style.opacity = '0.85';
      seg.setAttribute('d', buildSegmentD(base, atLen, HIGHLIGHT_HALF));
    }
  }

  function progressAt(now) {
    if (reduceMotion.matches) return 0;
    return ((now - startTime) % CYCLE_MS) / CYCLE_MS;
  }

  function renderAtProgress(p) {
    if (!active) return;
    var travel = Math.max(0, len - 2 * HIGHLIGHT_HALF);
    var atLen = HIGHLIGHT_HALF + clamp01(p) * travel;
    updateSegmentGlow(atLen);
  }

  function tick(now) {
    if (!animating) return;
    rafId = requestAnimationFrame(tick);
    renderAtProgress(progressAt(now));
  }

  function setup() {
    buildPaths();
    active = activePath();
    len = active.getTotalLength();
    renderAtProgress(reduceMotion.matches ? 0 : progressAt(performance.now()));
  }

  function startAnim() {
    if (animating) return;
    animating = true;
    startTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopAnim() {
    animating = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onLayoutChange() {
    stopAnim();
    setup();
    startTime = performance.now();
    if (wrap.getBoundingClientRect().height > 0) {
      var rect = wrap.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh && rect.bottom > 0) startAnim();
    }
  }

  function bindMedia(mql, handler) {
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler);
  }

  setup();
  startTime = performance.now();

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) startAnim();
        else stopAnim();
      }
    });
    io.observe(wrap);
  } else {
    startAnim();
  }

  window.addEventListener('resize', onLayoutChange, { passive: true });

  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(onLayoutChange);
    ro.observe(wrap);
    if (heroShell) ro.observe(heroShell);
    if (pricingShell) ro.observe(pricingShell);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(onLayoutChange);
  }

  window.addEventListener('load', onLayoutChange);
  bindMedia(breakpoint, onLayoutChange);
  bindMedia(reduceMotion, onLayoutChange);
})();
