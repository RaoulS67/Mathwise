(function () {
  var wrap = document.querySelector('.mw-deco-wrap');
  if (!wrap) return;

  var paths = Array.prototype.slice.call(wrap.querySelectorAll('.mw-deco-line'));
  var segments = Array.prototype.slice.call(wrap.querySelectorAll('.mw-deco-segment-glow'));
  var origin = document.querySelector('.mw-path-origin');
  var pathEnd = document.querySelector('.mw-path-end');
  var heroShell = document.querySelector('.mw-hero-shell');
  var teamShell = document.querySelector('.mw-team-shell');
  var pricingShell = document.querySelector('.mw-pricing-shell');
  if (!paths.length) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var breakpoint = window.matchMedia('(max-width: 900px)');

  var DROP = 50;
  var CYCLE_MS = 3000;
  var HIGHLIGHT_HALF = 36;
  var SEGMENT_SAMPLES = 10;
  var SWAY_DESKTOP = 18;
  var SWAY_MOBILE = 7;
  var LATERAL_PER_DROP = 0.45;
  var MAX_LEAN = 1.6;
  var SLOPE_SAMPLES = 24;
  var X_MIN = 4;
  var X_MAX = 96;

  // `inside` marks an anchor whose following segment runs behind a card.
  var SECTION_ANCHORS = [
    { sel: '.mw-team-shell .mw-path-anchor--team-bottom' },
    { sel: '.mw-review-row--about .mw-about-card .mw-path-anchor--top', inside: true },
    { sel: '.mw-review-row--about .mw-about-card .mw-path-anchor--bottom' },
    { sel: '.mw-flow-block--center .mw-about-card .mw-path-anchor--top', inside: true },
    { sel: '.mw-flow-block--center .mw-about-card .mw-path-anchor--bottom' },
    { sel: '.mw-review-row--why .mw-about-card .mw-path-anchor--top', inside: true },
    { sel: '.mw-review-row--why .mw-about-card .mw-path-anchor--bottom' }
  ];

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

  function fmt(n) {
    return n.toFixed(2);
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

  function anchorCoords(el) {
    var wrapRect = wrap.getBoundingClientRect();
    var rect = el.getBoundingClientRect();
    var px = rect.left + rect.width / 2 - wrapRect.left;
    var py = rect.top + rect.height / 2 - wrapRect.top;
    return toViewBox(px, py);
  }

  function collectAnchorPoints(defs) {
    var points = [];
    for (var i = 0; i < defs.length; i++) {
      var el = wrap.querySelector(defs[i].sel);
      if (!el) continue;
      var p = anchorCoords(el);
      p.inside = !!defs[i].inside;
      points.push(p);
    }
    return points;
  }

  function clampX(x, pad) {
    var lo = X_MIN + (pad || 0);
    var hi = X_MAX - (pad || 0);
    if (lo > hi) return (X_MIN + X_MAX) / 2;
    return x < lo ? lo : (x > hi ? hi : x);
  }

  // The viewBox stretches x and y independently (preserveAspectRatio="none"),
  // so one x unit covers far more screen than one y unit. This ratio converts
  // between them, letting the detour be measured as real visual slope.
  function xUnitsPerYUnit() {
    var r = wrap.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return 0;
    return (r.width / 100) / (r.height / 1000);
  }

  // Hash rather than Math.random: the route has to come out identical on every
  // rebuild (resize, font load, breakpoint flip) or the line would jump around.
  function jitter(idx, salt) {
    var v = Math.sin((idx + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  // Cubic with vertical tangents at both ends: the line leaves p0 going
  // straight down and arrives at p1 going straight down, so cards are
  // entered/exited cleanly and consecutive segments join without kinks.
  function smoothVertical(p0, p1, ease) {
    var k = ease == null ? 0.5 : ease;
    var dy = p1.y - p0.y;
    var c1y = p0.y + dy * k;
    var c2y = p1.y - dy * k;
    return ' C ' + fmt(p0.x) + ' ' + fmt(c1y) + ', ' +
           fmt(p1.x) + ' ' + fmt(c2y) + ', ' +
           fmt(p1.x) + ' ' + fmt(p1.y);
  }

  // Two cubics from p0 to p1 via an off-axis waypoint. Both ends keep vertical
  // tangents; the waypoint's shared tangent keeps the join smooth.
  function swingCurves(p0, p1, side, amount, shape) {
    var dy = p1.y - p0.y;
    var tx = (p1.x - p0.x) * 0.24 + side * amount * 0.30;
    // Cap the tangent against the shorter half so neither cubic's control
    // points fall out of order, which is what puts a wobble in the curve.
    var ty = dy * Math.min(shape.tMid, 1 - shape.tMid) * 0.42;
    var midY = p0.y + dy * shape.tMid;
    // Inset the waypoint by the tangent reach so both of its control points
    // land on-canvas without being clamped, which would kink the join.
    var midX = clampX(p0.x + (p1.x - p0.x) * shape.tMid + side * amount, Math.abs(tx));
    var mid = { x: midX, y: midY };
    return [
      [p0,
       { x: p0.x, y: p0.y + dy * shape.tMid * shape.lead },
       { x: midX - tx, y: midY - ty },
       mid],
      [mid,
       { x: midX + tx, y: midY + ty },
       { x: p1.x, y: p1.y - dy * (1 - shape.tMid) * shape.tail },
       p1]
    ];
  }

  // Steepness of a cubic at t, as on-screen dx per dy. The ratio is what makes
  // this a real visual angle rather than a viewBox-unit one.
  function slopeAt(c, t, ratio) {
    var mt = 1 - t;
    var a = 3 * mt * mt, b = 6 * mt * t, k = 3 * t * t;
    var dx = a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + k * (c[3].x - c[2].x);
    var dy = a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + k * (c[3].y - c[2].y);
    if (Math.abs(dy) < 1e-6) return Math.abs(dx) < 1e-6 ? 0 : Infinity;
    return Math.abs((dx * ratio) / dy);
  }

  function steepest(curves, ratio) {
    var worst = 0;
    for (var c = 0; c < curves.length; c++) {
      for (var i = 0; i <= SLOPE_SAMPLES; i++) {
        var s = slopeAt(curves[c], i / SLOPE_SAMPLES, ratio);
        if (s > worst) worst = s;
      }
    }
    return worst;
  }

  function curvesToD(curves) {
    var d = '';
    for (var i = 0; i < curves.length; i++) {
      var c = curves[i];
      d += ' C ' + fmt(c[1].x) + ' ' + fmt(c[1].y) + ', ' +
                   fmt(c[2].x) + ' ' + fmt(c[2].y) + ', ' +
                   fmt(c[3].x) + ' ' + fmt(c[3].y);
    }
    return d;
  }

  // Detours through a waypoint whose side, distance, height and timing all vary
  // per segment, then relaxes that detour until the curve's steepest point is
  // within MAX_LEAN. Anchor spacing alone can demand a diagonal, so once the
  // detour is spent the end tangents shorten too, trading a little of the
  // vertical entry for a straighter, calmer traverse.
  function swingSegment(p0, p1, idx, opts) {
    var dy = p1.y - p0.y;
    if (Math.abs(dy) < 1) return smoothVertical(p0, p1);

    var side = jitter(idx, 1) < 0.5 ? -1 : 1;
    var budget = opts.sway;
    if (opts.ratio > 0) {
      budget = Math.min(budget, (Math.abs(dy) / opts.ratio) * LATERAL_PER_DROP);
    }
    var amount = budget * (0.5 + jitter(idx, 2) * 0.5);
    var shape = {
      tMid: 0.38 + jitter(idx, 3) * 0.24,
      lead: 0.38 + jitter(idx, 4) * 0.20,
      tail: 0.38 + jitter(idx, 5) * 0.20
    };

    var curves = swingCurves(p0, p1, side, amount, shape);
    if (opts.ratio > 0) {
      for (var i = 0; i < 12 && steepest(curves, opts.ratio) > MAX_LEAN; i++) {
        if (amount > 0.02) {
          amount *= 0.6;
        } else {
          amount = 0;
          shape.lead *= 0.7;
          shape.tail *= 0.7;
        }
        curves = swingCurves(p0, p1, side, amount, shape);
      }
    }
    return curvesToD(curves);
  }

  // Segments hidden behind a card stay straight; a detour there is either
  // invisible or pokes out of the card's sides.
  function linkTo(p0, p1, idx, opts) {
    return p0.inside ? smoothVertical(p0, p1) : swingSegment(p0, p1, idx, opts);
  }

  function pathD(el) {
    var o = originCoords();
    var e = endCoords();
    var join = { x: o.x, y: o.y + DROP };
    var points = collectAnchorPoints(SECTION_ANCHORS);
    var ratio = xUnitsPerYUnit();
    var opts = {
      ratio: ratio,
      sway: el && el.classList.contains('mw-deco-line-mobile')
        ? SWAY_MOBILE
        : SWAY_DESKTOP
    };

    var d = 'M ' + fmt(o.x) + ' ' + fmt(o.y) +
            ' L ' + fmt(join.x) + ' ' + fmt(join.y);

    if (!points.length) {
      return d + swingSegment(join, e, 0, opts);
    }

    d += linkTo(join, points[0], 0, opts);
    for (var i = 0; i < points.length - 1; i++) {
      d += linkTo(points[i], points[i + 1], i + 1, opts);
    }
    // The final approach is the payoff of the journey, so damp its detour and
    // let the line settle into the CTA rather than clip its corner.
    return d + linkTo(points[points.length - 1], e, points.length, {
      ratio: ratio,
      sway: opts.sway * 0.5
    });
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
    var seg = '';
    for (var i = 0; i <= SEGMENT_SAMPLES; i++) {
      var t = start + (end - start) * (i / SEGMENT_SAMPLES);
      var pt = pathEl.getPointAtLength(t);
      seg += (i === 0 ? 'M ' : ' L ') + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2);
    }
    return seg;
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
    if (teamShell) ro.observe(teamShell);
    if (pricingShell) ro.observe(pricingShell);
    var aboutCards = wrap.querySelectorAll(
      '.mw-review-row--about .mw-about-card, ' +
      '.mw-flow-block--center .mw-about-card, ' +
      '.mw-review-row--why .mw-about-card'
    );
    for (var c = 0; c < aboutCards.length; c++) {
      ro.observe(aboutCards[c]);
    }
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(onLayoutChange);
  }

  window.addEventListener('load', onLayoutChange);
  bindMedia(breakpoint, onLayoutChange);
  bindMedia(reduceMotion, onLayoutChange);
})();
