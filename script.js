(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;

  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const octx = off.getContext("2d", { willReadFrequently: true });

  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = W; bgCanvas.height = H;
  const bgCtx = bgCanvas.getContext("2d");

  let cells = [];
  let cols = 0, rows = 0;
  let playing = true;
  let matrixDrops = [];
  let grainTile = null;

  const img = new Image();
  img.onload = init;
  img.onerror = () => {
    ctx.fillStyle = "#300";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "16px monospace";
    ctx.fillText("Could not load " + CONFIG.imageSrc, 20, 40);
  };
  img.src = CONFIG.imageSrc;

  // ---------- color adjustment helpers ----------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function adjustColor(r, g, b, cfg) {
    // brightness (-100..100)
    const bAdd = (cfg.brightness / 100) * 255;
    r += bAdd; g += bAdd; b += bAdd;

    // contrast (0..200, 100 = neutral) — simple scale about mid-grey. The
    // classic (259*(c+255))/(255*(259-c)) formula expects a -255..255 input;
    // feeding it a 0..200 value multiplies by ~3x and clips every highlight.
    const cFactor = cfg.contrast / 100;
    r = (r - 128) * cFactor + 128;
    g = (g - 128) * cFactor + 128;
    b = (b - 128) * cFactor + 128;

    // saturation (0..200, 100 = neutral)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = cfg.saturation / 100;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    // grayscale (0..100 mix amount)
    if (cfg.grayscale > 0) {
      const gLum = 0.299 * r + 0.587 * g + 0.114 * b;
      const mix = cfg.grayscale / 100;
      r = r + (gLum - r) * mix;
      g = g + (gLum - g) * mix;
      b = b + (gLum - b) * mix;
    }

    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  }

  // Piecewise-linear lookup through the toneCurve control points.
  function evalCurve(pts, t) {
    if (!pts || pts.length < 2) return t;
    if (t <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].x) {
        const p0 = pts[i - 1], p1 = pts[i];
        const span = p1.x - p0.x;
        const f = span <= 0 ? 0 : (t - p0.x) / span;
        return p0.y + (p1.y - p0.y) * f;
      }
    }
    return pts[pts.length - 1].y;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // blend a tint color over [r,g,b] using a simplified overlay/screen/multiply blend
  function applyTint(r, g, b, tint, opacity, mode) {
    const [tr, tg, tb] = tint;
    const a = opacity / 100;
    let mr = r, mg = g, mb = b;
    const blendChannel = (base, top) => {
      base /= 255; top /= 255;
      let out;
      switch (mode) {
        case "multiply": out = base * top; break;
        case "screen": out = 1 - (1 - base) * (1 - top); break;
        case "overlay":
        default:
          out = base < 0.5 ? 2 * base * top : 1 - 2 * (1 - base) * (1 - top);
      }
      return out * 255;
    };
    mr = blendChannel(r, tr);
    mg = blendChannel(g, tg);
    mb = blendChannel(b, tb);
    return [
      clamp(r + (mr - r) * a, 0, 255),
      clamp(g + (mg - g) * a, 0, 255),
      clamp(b + (mb - b) * a, 0, 255)
    ];
  }

  // ---------- setup ----------
  function init() {
    // Pick the source rect: an explicit crop if configured, else the whole image.
    let sx, sy, sw, sh;
    if (CONFIG.crop) {
      sx = CONFIG.crop.x * img.width;
      sy = CONFIG.crop.y * img.height;
      sw = CONFIG.crop.w * img.width;
      sh = CONFIG.crop.h * img.height;
    } else {
      sx = 0; sy = 0; sw = img.width; sh = img.height;
    }

    // Cover-fit that rect to the canvas aspect, trimming the long axis.
    const rectAspect = sw / sh, canvasAspect = W / H;
    if (rectAspect > canvasAspect) {
      const nw = sh * canvasAspect;
      sx += (sw - nw) / 2; sw = nw;
    } else {
      const nh = sw / canvasAspect;
      sy += (sh - nh) / 2; sh = nh;
    }
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);

    // background variants, precomputed once
    bgCtx.clearRect(0, 0, W, H);
    if (CONFIG.bgMode === "photo") {
      bgCtx.globalAlpha = CONFIG.bgOpacity / 100;
      bgCtx.drawImage(off, 0, 0);
      bgCtx.globalAlpha = 1;
    } else if (CONFIG.bgMode === "blur") {
      bgCtx.filter = `blur(${CONFIG.bgBlur}px)`;
      bgCtx.globalAlpha = CONFIG.bgOpacity / 100;
      bgCtx.drawImage(off, 0, 0);
      bgCtx.filter = "none";
      bgCtx.globalAlpha = 1;
    } else if (CONFIG.bgMode === "solid") {
      bgCtx.globalAlpha = CONFIG.bgOpacity / 100;
      bgCtx.fillStyle = CONFIG.bgColor;
      bgCtx.fillRect(0, 0, W, H);
      bgCtx.globalAlpha = 1;
    }
    // bgMode "none" -> leave transparent (canvas clear color shows through)

    sampleCells();
    buildGrainTile();

    canvas.addEventListener("click", () => { playing = !playing; if (playing) requestAnimationFrame(loop); });
    loop(0); // paint the first frame now rather than waiting on rAF
  }

  function sampleCells() {
    const size = CONFIG.cellSize;
    cols = Math.ceil(W / size);
    rows = Math.ceil(H / size);
    const data = octx.getImageData(0, 0, W, H).data;
    cells = [];
    let idx = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x0 = gx * size, y0 = gy * size;
        const x1 = Math.min(x0 + size, W), y1 = Math.min(y0 + size, H);
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y += 2) {
          for (let x = x0; x < x1; x += 2) {
            const p = (y * W + x) * 4;
            r += data[p]; g += data[p + 1]; b += data[p + 2];
            n++;
          }
        }
        r /= n; g /= n; b /= n;
        [r, g, b] = adjustColor(r, g, b, CONFIG);

        // Tonal shaping runs on the exposure-corrected colour *before* the
        // tint, so the curve's control points stay tied to real photo
        // luminance rather than to post-tint values.
        let rawLum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (CONFIG.invert) rawLum = 1 - rawLum;
        let lum = clamp(evalCurve(CONFIG.toneCurve, rawLum), 0, 1);

        // Knock out the background: bright + colour-neutral is wall, bright +
        // warm is skin. Only bites above fromLum, so dark neutral things (the
        // hoodie, the mic) keep their ink.
        const wg = CONFIG.warmthGate;
        if (wg && wg.enabled) {
          const warmth = (r - b) / 255;
          const keep = clamp((warmth - wg.min) / (wg.max - wg.min), 0, 1);
          const inZone = clamp((rawLum - wg.fromLum) / wg.feather, 0, 1);
          lum *= (1 - inZone) + inZone * keep;
        }

        [r, g, b] = applyTint(r, g, b, hexToRgb(CONFIG.tint), CONFIG.tintOpacity, CONFIG.overlayBlend);

        // Phosphor ramp: colour the cell by the tint scaled to its luminance,
        // with the hottest cells blooming toward white like a real CRT.
        if (CONFIG.phosphor > 0) {
          const [tr, tg, tb] = hexToRgb(CONFIG.tint);
          const hot = clamp((lum - 0.86) / 0.14, 0, 1) * 0.5;
          const pr = (tr * lum) + (255 - tr * lum) * hot;
          const pg = (tg * lum) + (255 - tg * lum) * hot;
          const pb = (tb * lum) + (255 - tb * lum) * hot;
          const mix = CONFIG.phosphor / 100;
          r += (pr - r) * mix;
          g += (pg - g) * mix;
          b += (pb - b) * mix;
        }
        // deterministic per-cell pseudo-random for coverage/density/glitch seeding
        const seed = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        cells.push({ gx, gy, x: x0, y: y0, r, g, b, lum, rnd, idx: idx++ });
      }
    }
    matrixDrops = new Array(cols).fill(0).map(() => Math.random() * rows);
  }

  function buildGrainTile() {
    const t = document.createElement("canvas");
    t.width = 128; t.height = 128;
    const tctx = t.getContext("2d");
    const id = tctx.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    tctx.putImageData(id, 0, 0);
    grainTile = t;
  }

  // ---------- edge emphasis ----------
  function edgeFactor(gx, gy) {
    const at = (x, y) => {
      x = clamp(x, 0, cols - 1); y = clamp(y, 0, rows - 1);
      return cells[y * cols + x].lum;
    };
    const gxv = at(gx + 1, gy) - at(gx - 1, gy);
    const gyv = at(gx, gy + 1) - at(gx, gy - 1);
    return clamp(Math.sqrt(gxv * gxv + gyv * gyv), 0, 1);
  }

  // ---------- animation modulation ----------
  function animMod(t, cell) {
    if (!CONFIG.animated) return { dx: 0, dy: 0, scale: 1, alpha: 1 };
    const speed = (CONFIG.animSpeed.enabled ? CONFIG.animSpeed.intensity : 0) / 100;
    const amp = (CONFIG.animIntensity.enabled ? CONFIG.animIntensity.intensity : 0) / 100;
    const time = t * 0.001 * (0.3 + speed * 1.7);
    const nx = cell.gx / cols, ny = cell.gy / rows;

    switch (CONFIG.animStyle) {
      case "wave": {
        const w = Math.sin(nx * 10 + time * 2) * amp;
        return { dx: 0, dy: w * CONFIG.cellSize * 0.6, scale: 1, alpha: 1 };
      }
      case "pulse": {
        const p = 1 + Math.sin(time * 3 + (nx + ny) * 4) * amp * 0.3;
        return { dx: 0, dy: 0, scale: p, alpha: 1 };
      }
      case "shimmer": {
        const s = Math.sin(time * 6 + cell.rnd * 20) * 0.5 + 0.5;
        return { dx: 0, dy: 0, scale: 1, alpha: 1 - amp * 0.6 * (1 - s) };
      }
      case "ripple": {
        const dx = nx - 0.5, dy = ny - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = Math.sin(dist * 20 - time * 4) * amp;
        return { dx: 0, dy: 0, scale: 1 + r * 0.3, alpha: 1 };
      }
      case "flicker":
      default: {
        const f = Math.sin(time * 9 + cell.rnd * 50) * Math.sin(time * 3.3 + cell.rnd * 13);
        const a = 1 - amp * 0.5 * (0.5 - f * 0.5);
        return { dx: 0, dy: 0, scale: 1, alpha: clamp(a, 0.15, 1) };
      }
    }
  }

  // ---------- glyph / shape drawing per renderMode ----------
  function drawCell(cell, t) {
    const size = CONFIG.cellSize;
    const mod = animMod(t, cell);
    if (mod.alpha <= 0.02) return;

    const edge = CONFIG.edgeEmphasis > 0 ? edgeFactor(cell.gx, cell.gy) * (CONFIG.edgeEmphasis / 100) : 0;
    let lum = clamp(cell.lum + edge * 0.5, 0, 1);
    const densityBoost = 1 + CONFIG.density / 100;

    const cx = cell.x + size / 2 + mod.dx;
    const cy = cell.y + size / 2 + mod.dy;
    const rgb = `rgb(${cell.r | 0},${cell.g | 0},${cell.b | 0})`;

    ctx.save();
    ctx.globalAlpha = mod.alpha;
    ctx.globalCompositeOperation = CONFIG.styleBlend || "source-over";
    ctx.fillStyle = rgb;
    ctx.strokeStyle = rgb;

    const s = size * 0.9 * mod.scale * densityBoost;

    switch (CONFIG.renderMode) {
      case "characters": {
        const set = CONFIG.customChars || CHARSETS[CONFIG.charSet] || CHARSETS.ascii;
        const ch = set[clamp(Math.floor(lum * (set.length - 1)), 0, set.length - 1)];
        ctx.font = `${size}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, cx, cy);
        break;
      }
      case "hexdump": {
        const hex = "0123456789ABCDEF";
        const ch = hex[clamp(Math.floor(lum * 15), 0, 15)];
        ctx.font = `${size * 0.9}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, cx, cy);
        break;
      }
      case "braille": {
        const dots = "⠀⠁⠃⠇⠏⠟⠿⡿⣿";
        const ch = dots[clamp(Math.floor(lum * (dots.length - 1)), 0, dots.length - 1)];
        ctx.font = `${size}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, cx, cy);
        break;
      }
      case "matrix": {
        const chars = "アイウエオ01ｱｲｳｴｵ";
        const drop = matrixDrops[cell.gx];
        const glow = clamp(1 - Math.abs(cell.gy - drop) / 6, 0, 1);
        if (glow > 0.02) {
          ctx.font = `${size}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = glow > 0.85 ? "#d4ffe0" : `rgba(0,255,102,${glow})`;
          ctx.fillText(chars[Math.floor(Math.random() * chars.length)], cx, cy);
        }
        break;
      }
      case "dither": {
        const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        const bx = cell.gx % 4, by = cell.gy % 4;
        const threshold = bayer[by * 4 + bx] / 16;
        if (lum > threshold * (1 - CONFIG.density / 200)) {
          ctx.fillRect(cell.x + mod.dx, cell.y + mod.dy, size, size);
        }
        break;
      }
      case "mosaic":
      case "pixel": {
        ctx.fillRect(cell.x + mod.dx, cell.y + mod.dy, size * mod.scale, size * mod.scale);
        break;
      }
      case "voxel":
      case "lego": {
        const r2 = s * 0.35;
        ctx.beginPath();
        ctx.arc(cx, cy - r2 * 0.3, r2 * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cell.x + size * 0.1, cy, size * 0.8, size * 0.35);
        break;
      }
      case "dots": {
        ctx.beginPath();
        ctx.arc(cx, cy, (s / 2) * lum, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "bubbles": {
        ctx.beginPath();
        ctx.arc(cx, cy, (s / 2) * lum, 0, Math.PI * 2);
        ctx.globalAlpha = mod.alpha * 0.6;
        ctx.fill();
        ctx.globalAlpha = mod.alpha;
        ctx.stroke();
        break;
      }
      case "rings": {
        ctx.beginPath();
        ctx.arc(cx, cy, (s / 2) * lum, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, size * 0.12);
        ctx.stroke();
        break;
      }
      case "cross": {
        const r3 = (s / 2) * lum;
        ctx.lineWidth = Math.max(1, size * 0.18);
        ctx.beginPath();
        ctx.moveTo(cx - r3, cy); ctx.lineTo(cx + r3, cy);
        ctx.moveTo(cx, cy - r3); ctx.lineTo(cx, cy + r3);
        ctx.stroke();
        break;
      }
      case "diamond": {
        const r4 = (s / 2) * lum;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r4); ctx.lineTo(cx + r4, cy);
        ctx.lineTo(cx, cy + r4); ctx.lineTo(cx - r4, cy);
        ctx.closePath(); ctx.fill();
        break;
      }
      case "hexagons": {
        drawPolygon(cx, cy, (s / 2) * lum, 6);
        ctx.fill();
        break;
      }
      case "triangles": {
        drawPolygon(cx, cy, (s / 2) * lum, 3, (cell.gx + cell.gy) % 2 ? Math.PI : 0);
        ctx.fill();
        break;
      }
      case "stars": {
        drawStar(cx, cy, (s / 2) * lum, (s / 4) * lum, 5);
        ctx.fill();
        break;
      }
      case "hearts": {
        drawHeart(cx, cy, (s / 2) * lum);
        ctx.fill();
        break;
      }
      case "lines": {
        ctx.lineWidth = Math.max(1, size * 0.25 * lum);
        ctx.beginPath();
        ctx.moveTo(cell.x, cy); ctx.lineTo(cell.x + size, cy);
        ctx.stroke();
        break;
      }
      case "diagonal":
      case "hatch": {
        ctx.lineWidth = Math.max(1, size * 0.2 * lum);
        ctx.beginPath();
        ctx.moveTo(cell.x, cell.y + size); ctx.lineTo(cell.x + size, cell.y);
        ctx.stroke();
        if (CONFIG.renderMode === "hatch" && lum > 0.5) {
          ctx.beginPath();
          ctx.moveTo(cell.x, cell.y); ctx.lineTo(cell.x + size, cell.y + size);
          ctx.stroke();
        }
        break;
      }
      case "halfblocks": {
        ctx.fillRect(cell.x, cell.y, size, size * lum);
        break;
      }
      case "contour": {
        const band = Math.floor(lum * 6);
        if (band % 2 === 0) ctx.fillRect(cell.x, cell.y, size, size);
        break;
      }
      case "disco": {
        const hue = (cell.rnd * 360 + t * 0.05) % 360;
        ctx.fillStyle = `hsl(${hue}, 90%, ${40 + lum * 30}%)`;
        ctx.beginPath();
        ctx.arc(cx, cy, (s / 2) * lum, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "mixed":
      default: {
        if (cell.rnd < 0.33) ctx.fillRect(cell.x, cell.y, size * lum, size * lum);
        else if (cell.rnd < 0.66) { ctx.beginPath(); ctx.arc(cx, cy, (s / 2) * lum, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.font = `${size}px monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lum > 0.5 ? "1" : "0", cx, cy); }
      }
    }
    ctx.restore();
  }

  function drawPolygon(cx, cy, r, sides, rotate = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotate + (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawStar(cx, cy, rOuter, rInner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawHeart(cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.6);
    ctx.bezierCurveTo(cx - r, cy - r * 0.3, cx - r * 0.4, cy - r, cx, cy - r * 0.3);
    ctx.bezierCurveTo(cx + r * 0.4, cy - r, cx + r, cy - r * 0.3, cx, cy + r * 0.6);
    ctx.closePath();
  }

  // ---------- post effects ----------
  function applyPostFX(t) {
    const p = CONFIG.pfx;

    if (p.chromatic.enabled) {
      const amt = (p.chromatic.intensity / 100) * 6;
      const snapshot = ctx.getImageData(0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.5;
      putShifted(snapshot, -amt, 0, "r");
      putShifted(snapshot, amt, 0, "b");
      ctx.restore();
    }

    if (p.bloom.enabled) {
      ctx.save();
      ctx.filter = `blur(${(p.bloom.intensity / 100) * 12}px)`;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(p.bloom.intensity / 200, 0, 0.6);
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }

    if (p.glitch.enabled && CONFIG.animated) {
      const bands = 4;
      const amt = (p.glitch.intensity / 100) * 30;
      for (let i = 0; i < bands; i++) {
        if (Math.random() > 0.85) {
          const y = Math.floor(Math.random() * H);
          const h = 4 + Math.random() * 20;
          const dx = (Math.random() - 0.5) * amt;
          const slice = ctx.getImageData(0, y, W, h);
          ctx.putImageData(slice, dx, y);
        }
      }
    }

    if (p.scanLines.enabled) {
      ctx.save();
      ctx.globalAlpha = p.scanLines.intensity / 100 * 0.5;
      ctx.fillStyle = "#000";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.restore();
    }

    if (p.filmGrain.enabled && grainTile) {
      ctx.save();
      ctx.globalAlpha = (p.filmGrain.intensity / 100) * 0.25;
      ctx.globalCompositeOperation = "overlay";
      for (let y = 0; y < H; y += grainTile.height) {
        for (let x = 0; x < W; x += grainTile.width) {
          ctx.drawImage(grainTile, x, y);
        }
      }
      ctx.restore();
    }

    if (p.filmDust.enabled) {
      ctx.save();
      ctx.fillStyle = "#fff";
      const n = Math.floor((p.filmDust.intensity / 100) * 40);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = Math.random() * 0.5;
        ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1 + Math.random() * 2);
      }
      ctx.restore();
    }

    if (p.pixelate.enabled) {
      const factor = 1 + (p.pixelate.intensity / 100) * 12;
      const tw = Math.max(1, Math.floor(W / factor));
      const th = Math.max(1, Math.floor(H / factor));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, W, H, 0, 0, tw, th);
      ctx.drawImage(canvas, 0, 0, tw, th, 0, 0, W, H);
      ctx.restore();
    }

    if (p.vignette.enabled) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${p.vignette.intensity / 100})`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function putShifted(imgData, dx, dy, channel) {
    const tmp = document.createElement("canvas");
    tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext("2d");
    const filtered = new ImageData(new Uint8ClampedArray(imgData.data), W, H);
    for (let i = 0; i < filtered.data.length; i += 4) {
      if (channel === "r") { filtered.data[i + 1] = 0; filtered.data[i + 2] = 0; }
      if (channel === "b") { filtered.data[i] = 0; filtered.data[i + 1] = 0; }
    }
    tctx.putImageData(filtered, 0, 0);
    ctx.drawImage(tmp, dx, dy);
  }

  function applyLights() {
    if (!CONFIG.lights.enabled) return;
    for (const pt of CONFIG.lights.points) {
      const x = pt.x * W, y = pt.y * H;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, pt.radius || 150);
      grad.addColorStop(0, `rgba(255,255,255,${pt.intensity ?? 0.5})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ---------- main loop ----------
  function loop(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgCanvas, 0, 0);

    if (CONFIG.blurType !== "off") {
      ctx.save();
      ctx.filter = `blur(${(CONFIG.blurAmount / 100) * 8}px)`;
    }

    for (const cell of cells) {
      if (cell.rnd > CONFIG.coverage / 100) continue;
      drawCell(cell, t);
    }

    if (CONFIG.renderMode === "matrix" && Math.random() > 0.6) {
      for (let c = 0; c < cols; c++) {
        matrixDrops[c] += 0.3 + Math.random() * 0.4;
        if (matrixDrops[c] > rows + 5) matrixDrops[c] = -Math.random() * 10;
      }
    }

    if (CONFIG.blurType !== "off") ctx.restore();

    applyLights();
    applyPostFX(t);

    if (playing) requestAnimationFrame(loop);
  }
})();
