/* KaiSync Institution — Hero World Map Canvas
   Canvas-based star particle world map with global network effect.
   Respects prefers-reduced-motion. No external images. */

(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────── */
  const CFG = {
    particleCount: { desktop: 900, tablet: 500, mobile: 280 },
    twinkleFraction: 0.07,
    nodeCount: 10,
    baseColor: { r: 180, g: 200, b: 255 },   // cool white-blue stars
    accentPurple: 'rgba(139,92,246,',
    accentCyan:   'rgba(0,196,216,',
    nodePulseMax: 5,
    connectionOpacity: 0.18,
    travelSpeed: 0.0006,
  };

  /* ── Simplified continent polygons (normalised 0-1) ─────── */
  const CONTINENTS = [
    // North America
    [[0.04,0.13],[0.10,0.08],[0.16,0.08],[0.22,0.12],[0.28,0.09],[0.32,0.14],
     [0.36,0.19],[0.38,0.24],[0.35,0.30],[0.32,0.37],[0.27,0.42],[0.22,0.44],
     [0.17,0.50],[0.13,0.51],[0.09,0.46],[0.07,0.38],[0.04,0.28],[0.02,0.20]],
    // Greenland (small)
    [[0.27,0.04],[0.33,0.03],[0.37,0.06],[0.36,0.10],[0.31,0.12],[0.26,0.10]],
    // South America
    [[0.21,0.49],[0.27,0.47],[0.32,0.49],[0.34,0.54],[0.33,0.60],[0.30,0.66],
     [0.27,0.72],[0.24,0.75],[0.21,0.73],[0.19,0.67],[0.18,0.60],[0.19,0.54]],
    // Europe
    [[0.43,0.15],[0.47,0.13],[0.52,0.15],[0.55,0.19],[0.53,0.24],[0.50,0.27],
     [0.46,0.28],[0.44,0.26],[0.42,0.21],[0.42,0.17]],
    // Africa
    [[0.44,0.30],[0.48,0.28],[0.53,0.30],[0.57,0.34],[0.58,0.41],[0.57,0.49],
     [0.54,0.57],[0.52,0.63],[0.50,0.67],[0.48,0.65],[0.46,0.59],[0.44,0.52],
     [0.42,0.44],[0.42,0.36]],
    // Asia (West + Central)
    [[0.55,0.14],[0.62,0.11],[0.70,0.09],[0.78,0.11],[0.84,0.15],[0.88,0.21],
     [0.89,0.28],[0.86,0.34],[0.83,0.38],[0.79,0.37],[0.74,0.35],[0.70,0.37],
     [0.67,0.41],[0.63,0.39],[0.59,0.36],[0.56,0.32],[0.54,0.25],[0.53,0.18]],
    // Japan archipelago
    [[0.84,0.25],[0.86,0.24],[0.87,0.27],[0.85,0.29],[0.83,0.28]],
    // SE Asia / Indonesia (approximate)
    [[0.72,0.45],[0.77,0.44],[0.80,0.46],[0.82,0.50],[0.79,0.52],[0.74,0.51],[0.71,0.49]],
    // Australia
    [[0.77,0.58],[0.82,0.56],[0.87,0.58],[0.89,0.63],[0.87,0.68],[0.83,0.70],
     [0.78,0.69],[0.75,0.65],[0.75,0.60]],
    // British Isles (small)
    [[0.44,0.15],[0.46,0.14],[0.47,0.16],[0.46,0.18],[0.44,0.17]],
  ];

  /* ── Network nodes [normX, normY, label, color] ─────────── */
  const NODES = [
    [0.22, 0.35, 'New York',       CFG.accentCyan],
    [0.47, 0.20, 'London',         CFG.accentPurple],
    [0.49, 0.52, 'Lagos',          CFG.accentCyan],
    [0.60, 0.37, 'Dubai',          CFG.accentPurple],
    [0.64, 0.42, 'Mumbai',         CFG.accentCyan],
    [0.76, 0.27, 'Shanghai',       CFG.accentPurple],
    [0.84, 0.27, 'Tokyo',          CFG.accentCyan],
    [0.83, 0.64, 'Sydney',         CFG.accentPurple],
    [0.27, 0.60, 'São Paulo',      CFG.accentCyan],
    [0.52, 0.59, 'Johannesburg',   CFG.accentPurple],
  ];

  /* ── Connection pairs (node indices) ────────────────────── */
  const CONNECTIONS = [
    [0,1],[1,3],[3,4],[4,5],[5,6],[1,9],[2,9],[0,8],[8,9],[5,7],[6,7]
  ];

  /* ── Point-in-polygon (ray casting) ─────────────────────── */
  function pip(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ── Particle generation ─────────────────────────────────── */
  function generateParticles(n) {
    const pts = [];
    const limit = n * 12;
    for (let i = 0; i < limit && pts.length < n; i++) {
      const x = Math.random(), y = Math.random() * 0.85 + 0.05; // avoid poles
      if (CONTINENTS.some(c => pip(x, y, c))) {
        pts.push({
          x, y,
          r: Math.random() < 0.12 ? 1.6 : Math.random() < 0.3 ? 1.0 : 0.65,
          a: 0.25 + Math.random() * 0.55,
          twinkle: Math.random() < CFG.twinkleFraction,
          phase: Math.random() * Math.PI * 2,
          speed: 0.004 + Math.random() * 0.012,
          amp:   0.12 + Math.random() * 0.28,
        });
      }
    }
    return pts;
  }

  /* ── Traveling particle state ────────────────────────────── */
  function makeTraveler() {
    const ci = Math.floor(Math.random() * CONNECTIONS.length);
    return { ci, t: 0, alpha: 0 };
  }

  /* ── Main init ───────────────────────────────────────────── */
  function init() {
    const canvas = document.getElementById('ksi-world-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W, H, dpr, particles = [], nodePulse = [], traveler = null, travelTimer = 0;
    let raf = null;
    /* Origin pulse — Johannesburg node (index 9) */
    const ORIGIN_NODE = 9;
    let originRings = [];
    let originTimer = 0;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      W = rect.width;
      H = rect.height || W * 0.65;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isMobile = W < 640;
      const count = isMobile ? CFG.particleCount.mobile : W < 1024 ? CFG.particleCount.tablet : CFG.particleCount.desktop;
      particles = generateParticles(count);

      nodePulse = NODES.map(() => ({
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.012,
      }));
    }

    /* ── Map normalised coords to canvas px ─── */
    function cx(nx) { return nx * W; }
    function cy(ny) { return ny * H; }

    /* ── Draw one frame ──────────────────────── */
    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      t++;

      /* particles */
      for (const p of particles) {
        let alpha = p.a;
        if (!reduced && p.twinkle) {
          alpha += Math.sin(p.phase + t * p.speed) * p.amp;
          alpha = Math.max(0.05, Math.min(1, alpha));
        }
        const { r, g, b } = CFG.baseColor;
        ctx.beginPath();
        ctx.arc(cx(p.x), cy(p.y), p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }

      /* connection lines */
      if (!reduced) {
        for (let i = 0; i < CONNECTIONS.length; i++) {
          const [ai, bi] = CONNECTIONS[i];
          const ax = cx(NODES[ai][0]), ay = cy(NODES[ai][1]);
          const bx = cx(NODES[bi][0]), by = cy(NODES[bi][1]);
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0,   CFG.accentPurple + '0.22)');
          grad.addColorStop(0.5, CFG.accentCyan   + '0.14)');
          grad.addColorStop(1,   CFG.accentPurple + '0.22)');
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      /* network nodes */
      for (let i = 0; i < NODES.length; i++) {
        const [nx, ny, , col] = NODES[i];
        const px = cx(nx), py = cy(ny);
        const pulse = reduced ? 0 : (Math.sin(nodePulse[i].phase + t * nodePulse[i].speed) * 0.5 + 0.5);

        /* outer glow ring */
        const outerR = 4 + pulse * CFG.nodePulseMax;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, outerR * 2);
        grd.addColorStop(0,   col + '0.35)');
        grd.addColorStop(1,   col + '0)');
        ctx.beginPath();
        ctx.arc(px, py, outerR * 2, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        /* core dot */
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col + '0.9)';
        ctx.fill();
      }

      /* ── Origin pulse rings (Johannesburg) ── */
      if (!reduced) {
        originTimer++;
        if (originTimer > 90) { originRings.push({ r: 0, alpha: 0.6 }); originTimer = 0; }
        const ox = cx(NODES[ORIGIN_NODE][0]);
        const oy = cy(NODES[ORIGIN_NODE][1]);
        originRings = originRings.filter(function(ring) { return ring.alpha > 0.01; });
        for (var ri = 0; ri < originRings.length; ri++) {
          originRings[ri].r += 0.55;
          originRings[ri].alpha *= 0.975;
          ctx.beginPath();
          ctx.arc(ox, oy, originRings[ri].r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,196,216,' + originRings[ri].alpha + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      /* traveling particle */
      if (!reduced) {
        travelTimer++;
        if (!traveler && travelTimer > 160) { traveler = makeTraveler(); travelTimer = 0; }
        if (traveler) {
          traveler.t += CFG.travelSpeed * 60;
          traveler.alpha = Math.min(1, traveler.t < 0.1 ? traveler.t * 10 : traveler.t > 0.9 ? (1 - traveler.t) * 10 : 1);
          if (traveler.t >= 1) { traveler = null; }
          else {
            const [ai, bi] = CONNECTIONS[traveler.ci];
            const ax = cx(NODES[ai][0]), ay = cy(NODES[ai][1]);
            const bx = cx(NODES[bi][0]), by = cy(NODES[bi][1]);
            const px = ax + (bx - ax) * traveler.t;
            const py = ay + (by - ay) * traveler.t;
            const tr = ctx.createRadialGradient(px, py, 0, px, py, 5);
            tr.addColorStop(0,   'rgba(0,196,216,' + (traveler.alpha * 0.9) + ')');
            tr.addColorStop(1,   'rgba(0,196,216,0)');
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = tr;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,' + (traveler.alpha * 0.95) + ')';
            ctx.fill();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    }

    /* ── Start ───────────────────────────────── */
    resize();
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas.parentElement);
    draw();

    /* ── Cleanup on page hide ────────────────── */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (!raf) { draw(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
