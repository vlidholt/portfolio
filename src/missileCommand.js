/**
 * Missile Command — 1-bit Mac monochrome (black on white).
 *
 * Rendering contract:
 *   • background.png provides the Mac chrome (menu bar + rounded border).
 *   • All game elements are drawn in pure #000000.
 *   • After every frame the canvas is quantised to true 2-colour (1-bit
 *     threshold pass): every pixel becomes either 0x000000 or 0xffffff.
 *     This eliminates all antialiasing / sub-pixel grey values.
 *
 * Game rules:
 *   • 6 cities at the bottom; missiles target them.
 *   • Player clicks → expanding black filled circle (explosion).
 *   • Explosion touching a missile → missile destroyed + NEW explosion
 *     spawns at the missile head (chain reactions).
 *   • Explosion touching a city  → city destroyed (own small explosion).
 *   • When the last city dies    → screen flashes black/white, then restart.
 */

import backgroundUrl from '../assets/missile/background.png';

export const GAME_W = 512;
export const GAME_H = 342;

// ── Layout ────────────────────────────────────────────────────────────
const MENU_H      = 20;    // Mac menu bar height
const CITY_BASE_Y = 323;   // building base line  (gap below = ~13 px)
const GROUND_Y    = 324;   // 1-px ground line

// ── Game-over flash sequence ─────────────────────────────────────────
const FLASH_PERIOD       = 200;   // ms per half-cycle (black or white)
const GAME_OVER_DURATION = 2400;  // ms total (6 complete flashes)
const GAME_OVER_DELAY    = 900;   // ms pause after last city dies

// ── Cities ────────────────────────────────────────────────────────────
// 6 cities evenly spaced: first at x=56, last at x=456, step=80.
const CITY_X = [56, 136, 216, 296, 376, 456];

// Per-city building definitions: [dx_from_centre, width, height]
// Every building is exactly 4 px wide with 2 px gaps → uniform, pixel-perfect.
// Left-edge offsets from city centre: -14, -8, -2, 4, 10
const CITY_SHAPES = [
  [[-14,4,12],[-8,4,20],[-2,4,24],[4,4,18],[10,4,12]],
  [[-14,4,16],[-8,4,24],[-2,4,20],[4,4,26],[10,4,14]],
  [[-14,4,14],[-8,4,22],[-2,4,28],[4,4,18],[10,4,16]],
  [[-14,4,18],[-8,4,26],[-2,4,20],[4,4,14],[10,4,22]],
  [[-14,4,14],[-8,4,22],[-2,4,18],[4,4,28],[10,4,16]],
  [[-14,4,16],[-8,4,20],[-2,4,24],[4,4,20],[10,4,16]],
];

// City bounding box for collision (half-width = 14 px from centre)
const CITY_HALF_W = 14;
const CITY_HALF_H = 28;

// ── Helpers ───────────────────────────────────────────────────────────
function rand(a, b) { return a + Math.random() * (b - a); }

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── MissileCommand class ──────────────────────────────────────────────
export class MissileCommand {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.missiles   = [];
    this.explosions = [];
    this.cityAlive  = new Array(CITY_X.length).fill(true);

    this.spawnTimer    = 2000;
    this.spawnInterval = 3000;
    this.maxMissiles   = 5;

    // Game-over state machine
    this._goDelay = 0;     // countdown before flash starts (ms)
    this._goTimer = null;  // null = playing; number = ms into flash sequence

    // Background image
    this._bg      = new Image();
    this._bg.src  = backgroundUrl;
    this._bgReady = false;
    this._bg.onload = () => { this._bgReady = true; };
  }

  // ── Public API ────────────────────────────────────────────────────

  start() { this._spawn(); }

  addExplosion(x, y) {
    this._addExplosion(x, y, rand(32, 52));
  }

  update(dt) {
    if (dt <= 0 || dt > 300) return;

    // ── Flash / restart sequence ────────────────────────────────
    if (this._goTimer !== null) {
      this._goTimer += dt;
      if (this._goTimer >= GAME_OVER_DURATION) this._restart();
      return;
    }

    // ── Post-city-death delay ───────────────────────────────────
    if (this._goDelay > 0) {
      this._goDelay -= dt;
      if (this._goDelay <= 0) {
        this._goDelay = 0;
        this._goTimer = 0;
      }
      this._stepExplosions(dt); // let the last city explosion play out
      return;
    }

    // ── Normal gameplay ─────────────────────────────────────────
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval && this.missiles.length < this.maxMissiles) {
      this._spawn();
      this.spawnTimer = 0;
    }

    for (const m of this.missiles) {
      if (m.destroyed) continue;
      m.progress += m.speed * dt;
      if (m.progress >= 1) {
        m.destroyed = true;
        // Impact explosion — triggers city-hit check next tick
        this._addExplosion(m.x2, m.y2, rand(18, 28));
      }
    }
    this.missiles = this.missiles.filter(m => !m.destroyed);

    this._stepExplosions(dt);
    this._checkCityHits();
  }

  render() {
    const ctx = this.ctx;

    // ── Game-over flash ─────────────────────────────────────────
    if (this._goTimer !== null) {
      const phase = Math.floor(this._goTimer / FLASH_PERIOD) % 2;
      ctx.fillStyle = phase === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      return; // solid colours — no quantise needed
    }

    // ── Background ──────────────────────────────────────────────
    if (this._bgReady) {
      ctx.drawImage(this._bg, 0, 0);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    ctx.fillStyle   = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 2;

    // ── Missile trails ──────────────────────────────────────────
    for (const m of this.missiles) {
      if (m.destroyed) continue;
      const hx = m.x1 + (m.x2 - m.x1) * m.progress;
      const hy = m.y1 + (m.y2 - m.y1) * m.progress;
      ctx.beginPath();
      ctx.moveTo(m.x1 + 0.5 | 0, m.y1 + 0.5 | 0);
      ctx.lineTo(hx  + 0.5 | 0, hy  + 0.5 | 0);
      ctx.stroke();
      // Solid dot at head
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Explosions (solid filled circles) ───────────────────────
    for (const e of this.explosions) {
      if (e.done) continue;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(1, e.radius), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Cities ──────────────────────────────────────────────────
    this._drawCities(ctx);

    // ── Ground line ─────────────────────────────────────────────
    ctx.fillRect(0, GROUND_Y, GAME_W, 2);

    // ── Restore menu bar ─────────────────────────────────────────
    // Missile trails start near y=0 and can corrupt the menu bar area.
    // Re-stamp just the top strip of background.png last so it is always clean.
    if (this._bgReady) {
      ctx.drawImage(this._bg,
        0, 0, GAME_W, MENU_H,
        0, 0, GAME_W, MENU_H,
      );
    }

    // Threshold every pixel to pure black or white.
    // The Three.js screen texture samples this 2-colour buffer with bilinear
    // filtering when it maps to the 3D surface — that smooth up-scale is fine.
    this._quantise();
  }

  // ── Private ───────────────────────────────────────────────────

  _quantise() {
    const img = this.ctx.getImageData(0, 0, GAME_W, GAME_H);
    const u32 = new Uint32Array(img.data.buffer);
    // ImageData is RGBA little-endian → u32 layout is 0xAABBGGRR.
    // Threshold on the red channel: > 127 → white (0xFFFFFFFF), else → black (0xFF000000).
    for (let i = 0; i < u32.length; i++) {
      u32[i] = (u32[i] & 0xff) > 127 ? 0xffffffff : 0xff000000;
    }
    this.ctx.putImageData(img, 0, 0);
  }

  _drawCities(ctx) {
    for (let i = 0; i < CITY_X.length; i++) {
      if (!this.cityAlive[i]) continue;
      const cx = CITY_X[i];
      for (const [dx, bw, bh] of CITY_SHAPES[i]) {
        // All coords snapped to integers for pixel-perfect rendering
        ctx.fillRect((cx + dx) | 0, (CITY_BASE_Y - bh) | 0, bw | 0, bh | 0);
      }
    }
  }

  _addExplosion(x, y, maxRadius) {
    this.explosions.push({
      x, y,
      radius:      2,
      maxRadius,
      growSpeed:   rand(0.05, 0.07),
      shrinkSpeed: rand(0.035, 0.055),
      expanding:   true,
      done:        false,
    });
  }

  _stepExplosions(dt) {
    const newExp = [];

    for (const e of this.explosions) {
      if (e.done) continue;
      if (e.expanding) {
        e.radius += e.growSpeed * dt;
        if (e.radius >= e.maxRadius) e.expanding = false;

        // Missile collision → chain reaction
        for (const m of this.missiles) {
          if (m.destroyed) continue;
          const hx = m.x1 + (m.x2 - m.x1) * m.progress;
          const hy = m.y1 + (m.y2 - m.y1) * m.progress;
          if (distToSegment(e.x, e.y, m.x1, m.y1, hx, hy) <= e.radius) {
            m.destroyed = true;
            newExp.push({ x: hx, y: hy, r: rand(24, 44) });
          }
        }
      } else {
        e.radius -= e.shrinkSpeed * dt;
        if (e.radius <= 0) e.done = true;
      }
    }

    for (const { x, y, r } of newExp) this._addExplosion(x, y, r);
    this.explosions = this.explosions.filter(e => !e.done);
    this.missiles   = this.missiles.filter(m => !m.destroyed);
  }

  _checkCityHits() {
    for (let i = 0; i < CITY_X.length; i++) {
      if (!this.cityAlive[i]) continue;

      const cx = CITY_X[i];
      const cy = CITY_BASE_Y - CITY_HALF_H / 2; // city rectangle centre Y

      for (const e of this.explosions) {
        if (e.done) continue;
        // Circle-vs-AABB: find the closest point in the rectangle to the circle centre
        const nx   = Math.max(cx - CITY_HALF_W, Math.min(cx + CITY_HALF_W, e.x));
        const ny   = Math.max(CITY_BASE_Y - CITY_HALF_H, Math.min(CITY_BASE_Y, e.y));
        const dist = Math.hypot(e.x - nx, e.y - ny);
        if (dist < e.radius) {
          this.cityAlive[i] = false;
          this._addExplosion(cx, CITY_BASE_Y - 14, rand(18, 30));

          // Trigger game-over sequence if this was the last city
          if (this.cityAlive.every(v => !v) && this._goDelay === 0 && this._goTimer === null) {
            this._goDelay = GAME_OVER_DELAY;
          }
          break;
        }
      }
    }
  }

  _spawn() {
    const alive = CITY_X.filter((_, i) => this.cityAlive[i]);
    if (alive.length === 0) return;
    const tx = alive[Math.floor(Math.random() * alive.length)] + rand(-12, 12);
    this.missiles.push({
      x1: rand(30, GAME_W - 30), y1: MENU_H,
      x2: tx,                    y2: CITY_BASE_Y,
      progress:  0,
      speed:     rand(0.00010, 0.00018),
      destroyed: false,
    });
  }

  _restart() {
    this.missiles   = [];
    this.explosions = [];
    this.cityAlive  = new Array(CITY_X.length).fill(true);
    this.spawnTimer = 1500;
    this._goDelay   = 0;
    this._goTimer   = null;
    this._spawn();
  }
}
