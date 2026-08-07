#!/usr/bin/env node
/**
 * Icon generator for smart-chrome-toolkit (MockKit).
 *
 * Zero-dependency: rasterizes a vector design (rounded-square indigo gradient
 * background + bold white "M" monogram, round caps/joins) with NxN
 * supersampling and encodes PNGs via a hand-written encoder (Node's zlib for
 * deflate, manual CRC32/chunks).
 *
 *   node scripts/generate-icons.js
 *
 * Overwrites icons/tools{16,24,32,48,128}.png. Manifest references these by
 * name; sizes 16/24/32 are the toolbar action icon, 48/128 are the
 * chrome://extensions + Web Store icons.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.resolve(__dirname, '..', 'icons');
const SIZES = [16, 24, 32, 48, 128];
const SS = 16; // supersampling per output pixel (16x16 = 256 gray levels)

// --- Design (coordinates are normalized to [0,1]) ---------------------------

// Background: rounded square, full-bleed, vertical indigo gradient.
const BG_RADIUS = 0.22;
const BG_TOP = [99, 102, 241]; // #6366F1 indigo-500
const BG_BOTTOM = [79, 70, 229]; // #4F46E5 indigo-600

// "M" monogram as a stroked polyline with round caps/joins.
// Two verticals + a V dip. Stroke is a union of round-capped capsules, which
// yields round joins at interior vertices for free.
const M_POINTS = [
  [0.30, 0.72], // bottom-left
  [0.30, 0.30], // top-left
  [0.50, 0.55], // middle dip
  [0.70, 0.30], // top-right
  [0.70, 0.72], // bottom-right
];
const M_STROKE = 0.135;
const M_HALF = M_STROKE / 2;
const WHITE = [255, 255, 255];

// --- Geometry helpers -------------------------------------------------------

const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
};

const inMonogram = (u, v) => {
  for (let i = 0; i < M_POINTS.length - 1; i += 1) {
    const [ax, ay] = M_POINTS[i];
    const [bx, by] = M_POINTS[i + 1];
    if (distSeg(u, v, ax, ay, bx, by) <= M_HALF) return true;
  }
  return false;
};

const inRoundedRect = (u, v, r) => {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  const inXCorner = u < r || u > 1 - r;
  const inYCorner = v < r || v > 1 - r;
  if (inXCorner && inYCorner) {
    const cx = u < r ? r : 1 - r;
    const cy = v < r ? r : 1 - r;
    const dx = u - cx;
    const dy = v - cy;
    return dx * dx + dy * dy <= r * r;
  }
  return true;
};

const bgColor = (v) => {
  const r = BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * v;
  const g = BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * v;
  const b = BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * v;
  return [r, g, b];
};

// Render one output pixel by sampling SSxSS subpoints.
const renderPixel = (px, py, size) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const u = (px + (sx + 0.5) / SS) / size;
      const v = (py + (sy + 0.5) / SS) / size;
      if (!inRoundedRect(u, v, BG_RADIUS)) continue; // transparent corner
      let col = bgColor(v);
      if (inMonogram(u, v)) col = WHITE;
      r += col[0];
      g += col[1];
      b += col[2];
      a += 255;
    }
  }
  const n = SS * SS;
  return [r / n, g / n, b / n, a / n];
};

// --- Minimal PNG encoder (RGBA, 8-bit) -------------------------------------

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
};

const encodePNG = (width, height, rgba) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // Raw scanlines, each prefixed with filter byte 0.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  let s = 0;
  for (let y = 0; y < height; y += 1) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[p++] = rgba[s++];
      raw[p++] = rgba[s++];
      raw[p++] = rgba[s++];
      raw[p++] = rgba[s++];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// --- Driver -----------------------------------------------------------------

const render = (size) => {
  const rgba = Buffer.alloc(size * size * 4);
  let p = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = renderPixel(x, y, size);
      rgba[p++] = Math.round(r);
      rgba[p++] = Math.round(g);
      rgba[p++] = Math.round(b);
      rgba[p++] = Math.round(a);
    }
  }
  return rgba;
};

if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

SIZES.forEach((size) => {
  const rgba = render(size);
  const png = encodePNG(size, size, rgba);
  const out = path.join(ICONS_DIR, `tools${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`wrote ${path.relative(process.cwd(), out)}  ${size}x${size}  ${png.length} bytes`);
});

console.log('\nDesign: indigo gradient rounded square + white "M" monogram (round caps/joins).');
