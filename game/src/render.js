// Drawing only: the world's state and the current screen in, pixels out. The
// camera frames a 1280x720 logical view of Solmar; the canvas scales it to the
// window. Warm sunset light, long shadows, and a HUD on top. No rules here —
// just paint.

import { BEACH_X, FONT, LANDMARKS, PALETTE, ROADS_H, ROADS_V, ROAD_W, VIEW, WATER_X, WORLD } from './config.js';
import { missionMarker } from './missions.js';
import { drawHud, contextPrompt } from './hud.js';
import { drawMinimap } from './minimap.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Title-screen buttons, in logical 1280x720 coordinates (hit-tested by main). */
export const TITLE_BUTTONS = [
  { id: 'new', x: 440, y: 470, w: 400, h: 52, label: 'NEW GAME' },
  { id: 'continue', x: 440, y: 534, w: 400, h: 52, label: 'CONTINUE' },
];

const SUNSET_TOP = 'rgba(255,150,70,0.10)';
const SUNSET_BOTTOM = 'rgba(255,90,40,0.18)';

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '600') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  /** CSS-pixel mouse position to world coordinates, through the camera. */
  function toWorld(cssX, cssY, camera) {
    const logicalX = (cssX * view.dpr - view.x) / view.scale;
    const logicalY = (cssY * view.dpr - view.y) / view.scale;
    return { x: logicalX + camera.x, y: logicalY + camera.y };
  }

  /** CSS-pixel mouse position to logical 1280x720 coordinates. */
  function toLogical(cssX, cssY) {
    return {
      x: (cssX * view.dpr - view.x) / view.scale,
      y: (cssY * view.dpr - view.y) / view.scale,
    };
  }

  function drawGround(state) {
    const cam = state.camera;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + VIEW.width + 40);
    const y1 = Math.min(WORLD.height, cam.y + VIEW.height + 40);

    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mow stripes, for the suburbs.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = Math.floor(y0 / 120) * 120; y < y1; y += 240) {
      ctx.fillRect(x0, y, x1 - x0, 120);
    }

    // Water and sand on the east edge.
    if (x1 > BEACH_X) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(Math.max(BEACH_X, x0), y0, Math.min(WATER_X, x1) - Math.max(BEACH_X, x0), y1 - y0);
      ctx.fillStyle = PALETTE.sandDark;
      for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
        ctx.fillRect(Math.max(BEACH_X, x0), y, Math.min(WATER_X, x1) - Math.max(BEACH_X, x0), 3);
      }
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(Math.max(WATER_X, x0), y0, x1 - Math.max(WATER_X, x0), y1 - y0);
      // Wave lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      const wave = Math.sin(state.time * 1.2) * 6;
      for (let y = Math.floor(y0 / 130) * 130; y < y1; y += 130) {
        ctx.beginPath();
        ctx.moveTo(WATER_X + 8 + wave, y);
        ctx.lineTo(Math.min(x1, WATER_X + 90), y);
        ctx.stroke();
      }
    }

    // Roads: asphalt, kerbs, centre dashes, and crosswalks at intersections.
    ctx.fillStyle = PALETTE.road;
    for (const roadX of ROADS_V) ctx.fillRect(roadX - ROAD_W / 2, y0, ROAD_W, y1 - y0);
    for (const roadY of ROADS_H) ctx.fillRect(x0, roadY - ROAD_W / 2, x1 - x0, ROAD_W);
    ctx.fillStyle = PALETTE.sidewalk;
    for (const roadX of ROADS_V) {
      ctx.fillRect(roadX - ROAD_W / 2 - 18, y0, 18, y1 - y0);
      ctx.fillRect(roadX + ROAD_W / 2, y0, 18, y1 - y0);
    }
    for (const roadY of ROADS_H) {
      ctx.fillRect(x0, roadY - ROAD_W / 2 - 18, x1 - x0, 18);
      ctx.fillRect(x0, roadY + ROAD_W / 2, x1 - x0, 18);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const roadX of ROADS_V) {
      for (let y = Math.floor(y0 / 64) * 64; y < y1; y += 64) ctx.fillRect(roadX - 2, y, 4, 30);
    }
    for (const roadY of ROADS_H) {
      for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) ctx.fillRect(x, roadY - 2, 30, 4);
    }
    // Crosswalks.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const roadX of ROADS_V) {
      for (const roadY of ROADS_H) {
        for (let i = -2; i <= 2; i += 1) ctx.fillRect(roadX - 40 + i * 16, roadY - ROAD_W / 2 - 14, 8, 12);
        for (let i = -2; i <= 2; i += 1) ctx.fillRect(roadX - ROAD_W / 2 - 14, roadY - 40 + i * 16, 12, 8);
      }
    }

    // Buildings with long sunset shadows and roof detail.
    for (const building of state.city.buildings) {
      if (building.x > x1 || building.x + building.w < x0 || building.y > y1 || building.y + building.h < y0) continue;
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(building.x + 16, building.y + 14, building.w, building.h);
      ctx.fillStyle = building.color;
      ctx.fillRect(building.x, building.y, building.w, building.h);
      ctx.fillStyle = building.roof;
      ctx.fillRect(building.x + 8, building.y + 8, building.w - 16, building.h - 16);
      // Roof furniture: AC units and vents, placed from the building's own seed.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      const units = 2 + Math.floor(building.seed * 3);
      for (let i = 0; i < units; i += 1) {
        const ux = building.x + 14 + ((building.seed * 997 + i * 53) % 100) / 100 * Math.max(1, building.w - 34);
        const uy = building.y + 14 + ((building.seed * 571 + i * 91) % 100) / 100 * Math.max(1, building.h - 34);
        ctx.fillRect(ux, uy, 12, 10);
      }
      if (building.tall) {
        // Glass tower: window rows on the south face.
        ctx.fillStyle = 'rgba(255,240,200,0.5)';
        for (let wy = building.y + 16; wy < building.y + building.h - 10; wy += 18) {
          for (let wx = building.x + 12; wx < building.x + building.w - 10; wx += 20) {
            ctx.fillRect(wx, wy, 10, 7);
          }
        }
      }
    }

    // Palms along the beach and the blocks.
    for (const palm of state.city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      ctx.strokeStyle = '#7a5a38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(palm.x + 4, palm.y - palm.size);
      ctx.stroke();
      ctx.fillStyle = '#4f8a4a';
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.ellipse(palm.x + 4 + Math.cos(angle) * palm.size * 0.55, palm.y - palm.size + Math.sin(angle) * palm.size * 0.55, palm.size * 0.6, 4, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Landmark pads: the garage, the safehouse, the hospital, the bank, the marina.
    drawLandmarkPad(state, LANDMARKS.ricoGarage, '#7ddc7d', 'R');
    drawLandmarkPad(state, LANDMARKS.safehouse, '#5aa9e6', 'H');
    drawLandmarkPad(state, LANDMARKS.hospital, '#ff8a7a', '+');
    drawLandmarkPad(state, LANDMARKS.bank, '#ffd23f', '$');
    drawLandmarkPad(state, LANDMARKS.repairGarage, '#e8a34f', 'W');
  }

  function drawLandmarkPad(state, place, color, letter) {
    const cam = state.camera;
    if (place.x < cam.x - 80 || place.x > cam.x + VIEW.width + 80 || place.y < cam.y - 80 || place.y > cam.y + VIEW.height + 80) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(place.x, place.y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(place.x, place.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    text(place.label, place.x, place.y - 36, 14, '#fff', 'center', '700');
    ctx.font = `800 18px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(letter, place.x, place.y + 6);
  }

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundedRect(ctx, -24, -10, 52, 26, 6);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundedRect(ctx, -26, -13, 52, 26, 7);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = 'rgba(20,24,32,0.85)';
    roundedRect(ctx, -8, -11, 18, 22, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.5)';
    roundedRect(ctx, 8, -10, 6, 20, 2);
    ctx.fill();
    if (car.kind === 'cop') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-14, -13, 8, 26);
      // Light bar, flashing red and blue.
      const phase = Math.floor(Date.now() / 300) % 2;
      ctx.fillStyle = phase === 0 ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-4, -13, 8, 6);
      ctx.fillStyle = phase === 0 ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-4, 7, 8, 6);
    }
    if (car.kind === 'van') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-24, -11, 16, 22);
    }
    // Headlights and tail lights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(24, -10, 3, 5);
    ctx.fillRect(24, 5, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-27, -10, 3, 5);
    ctx.fillRect(-27, 5, 3, 5);
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (opts.down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body and head.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 6, 0, Math.PI * 2);
    ctx.fill();
    if (opts.gun) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      ctx.lineTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
      ctx.stroke();
    }
    if (opts.cop) {
      ctx.fillStyle = '#1e3a6e';
      ctx.beginPath();
      ctx.arc(0, -2, 7, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMarker(state, marker) {
    if (!marker) return;
    const cam = state.camera;
    const onScreen = marker.x > cam.x && marker.x < cam.x + VIEW.width && marker.y > cam.y && marker.y < cam.y + VIEW.height;
    if (onScreen) {
      // Light beam and bouncing diamond on the objective.
      const bounce = Math.sin(state.time * 4) * 8;
      const gradient = ctx.createLinearGradient(marker.x, marker.y - 120, marker.x, marker.y);
      gradient.addColorStop(0, 'rgba(255,210,63,0)');
      gradient.addColorStop(1, 'rgba(255,210,63,0.35)');
      ctx.fillStyle = gradient;
      ctx.fillRect(marker.x - 12, marker.y - 120, 24, 120);
      ctx.fillStyle = marker.start ? '#7ddc7d' : PALETTE.marker;
      ctx.save();
      ctx.translate(marker.x, marker.y - 44 + bounce);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-11, -11, 22, 22);
      ctx.restore();
      ctx.strokeStyle = marker.start ? '#7ddc7d' : PALETTE.marker;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 26 + Math.sin(state.time * 4) * 5, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // Off screen: an arrow on the screen edge, with the distance.
    const cx = Math.max(cam.x, Math.min(marker.x, cam.x + VIEW.width));
    const cy = Math.max(cam.y, Math.min(marker.y, cam.y + VIEW.height));
    const ex = Math.max(cam.x + 40, Math.min(cx, cam.x + VIEW.width - 40));
    const ey = Math.max(cam.y + 40, Math.min(cy, cam.y + VIEW.height - 40));
    const angle = Math.atan2(marker.y - (cam.y + VIEW.height / 2), marker.x - (cam.x + VIEW.width / 2));
    const dist = Math.round(Math.hypot(marker.x - state.player.x, marker.y - state.player.y));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = marker.start ? '#7ddc7d' : PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(`${dist}m`, ex, ey - 18, 15, '#fff', 'center', '800');
  }

  function drawWorld(state) {
    drawGround(state);
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.5)';
    ctx.lineWidth = 5;
    for (const skid of state.skids) {
      ctx.beginPath();
      ctx.moveTo(skid.x - Math.cos(skid.angle) * 12, skid.y - Math.sin(skid.angle) * 12);
      ctx.lineTo(skid.x + Math.cos(skid.angle) * 12, skid.y + Math.sin(skid.angle) * 12);
      ctx.stroke();
    }
    // Pickups, stashes and cash drops.
    for (const pickup of state.city.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(state.time * 3 + pickup.x) * 3;
      ctx.fillStyle = pickup.kind === 'health' ? '#fff' : '#5aa9e6';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y + bob, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pickup.kind === 'health' ? '#e5534b' : '#fff';
      ctx.font = `800 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(pickup.kind === 'health' ? '+' : 'A', pickup.x, pickup.y + bob + 6);
    }
    for (const stash of state.city.stashes) {
      if (stash.taken) continue;
      const sparkle = 0.6 + Math.sin(state.time * 5 + stash.x) * 0.4;
      ctx.fillStyle = `rgba(255,210,63,${sparkle})`;
      ctx.beginPath();
      ctx.arc(stash.x, stash.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a00';
      ctx.font = `800 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', stash.x, stash.y + 4);
    }
    for (const drop of state.drops) {
      if (drop.taken) continue;
      ctx.fillStyle = '#7ddc7d';
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d5a1d';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', drop.x, drop.y + 4);
    }
    // People and cars, in depth order (southmost last).
    const drawables = [];
    for (const ped of state.peds) drawables.push({ y: ped.y, draw: () => drawPerson(ped.x, ped.y, ped.angle, ped.color, { down: ped.state === 'down' }) });
    for (const cop of state.footCops) drawables.push({ y: cop.y, draw: () => drawPerson(cop.x, cop.y, cop.angle, '#2f6fd0', { cop: true, gun: true }) });
    for (const enemy of state.enemies) drawables.push({ y: enemy.y, draw: () => drawPerson(enemy.x, enemy.y, enemy.angle, '#c94f4f', { gun: true }) });
    for (const car of state.cars) drawables.push({ y: car.y, draw: () => drawCar(car) });
    for (const car of state.traffic) drawables.push({ y: car.y, draw: () => drawCar(car) });
    for (const car of state.cops) drawables.push({ y: car.y, draw: () => drawCar(car) });
    const player = state.player;
    if (!player.inCar && !player.dead) {
      drawables.push({
        y: player.y,
        draw: () => {
          drawPerson(player.x, player.y, player.aimAngle, PALETTE.player, { gun: true });
          if (player.meleeSwing > 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 46, player.aimAngle - 1, player.aimAngle + 1);
            ctx.stroke();
          }
        },
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const item of drawables) item.draw();

    // Bullets.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    for (const bullet of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    // Particles.
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawMarker(state, missionMarker(state));
  }

  function drawSunset() {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, SUNSET_TOP);
    gradient.addColorStop(1, SUNSET_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Vignette.
    const vignette = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(20,8,16,0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 120 + lines.length * 32 + 64;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent || PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.text, 'center', '800');
    lines.forEach((line, index) => {
      text(line, VIEW.width / 2, y + 112 + index * 32, 19, PALETTE.muted, 'center', '500');
    });
    if (prompt) text(prompt, VIEW.width / 2, y + height - 26, 20, PALETTE.marker, 'center', '700');
  }

  function drawTitle(state, hasSave, selected) {
    drawWorld(state);
    // Back to screen space: the overlay, title and buttons are screen-space.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = 'rgba(16,10,18,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawSunset();

    const gradient = ctx.createLinearGradient(0, 120, 0, 260);
    gradient.addColorStop(0, '#ffd23f');
    gradient.addColorStop(0.55, '#ff9a5c');
    gradient.addColorStop(1, '#e5534b');
    ctx.font = `800 96px ${FONT}`;
    ctx.fillStyle = gradient;
    ctx.textAlign = 'center';
    ctx.fillText('SOLMAR HEAT', VIEW.width / 2, 210);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('An open-world crime story — one city, one wheelman, one last score.', VIEW.width / 2, 252);
    text('Danny Vega is back in Solmar City. Rico Marlow has work. Vic Kessler has other plans.', VIEW.width / 2, 292, 17, PALETTE.muted, 'center', '500');

    TITLE_BUTTONS.forEach((button, index) => {
      if (button.id === 'continue' && !hasSave) return;
      const active = index === selected;
      ctx.fillStyle = active ? '#ff9a5c' : 'rgba(24,16,28,0.85)';
      ctx.fillRect(button.x, button.y, button.w, button.h);
      ctx.strokeStyle = active ? '#ffd23f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(button.x, button.y, button.w, button.h);
      text(button.label, button.x + button.w / 2, button.y + 34, 22, active ? '#1c1420' : PALETTE.text, 'center', '800');
    });
    text('WASD move · Mouse aim · Click shoot · F punch · E enter / steal car · P pause · M mute', VIEW.width / 2, 640, 16, PALETTE.muted, 'center', '500');
    text('Steal cars, lose the cops, run Rico\'s missions — and watch the sunset over Solmar Bay.', VIEW.width / 2, 668, 16, PALETTE.muted, 'center', '500');
  }

  /** Paint one frame: the world, the sunset, then the HUD or a screen panel. */
  function draw(state, screen, saveInfo) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    const shakeY = state.camera.shake > 0 ? (Math.random() - 0.5) * state.camera.shake : 0;
    if (screen === SCREEN_TITLE) {
      // A slow cinematic pan over downtown behind the menu.
      state.camera.x = 1250 + Math.sin(state.time * 0.07) * 260;
      state.camera.y = 750 + Math.cos(state.time * 0.05) * 180;
    }
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - state.camera.x * view.scale + shakeX * view.scale, view.y - state.camera.y * view.scale + shakeY * view.scale);

    if (screen === SCREEN_TITLE) {
      drawTitle(state, saveInfo.hasSave, saveInfo.selected);
      return;
    }
    drawWorld(state);
    // Back to screen space for the sunset and the HUD.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSunset();
    if (screen === SCREEN_PLAY) {
      drawHud(ctx, state, contextPrompt(state));
      drawMinimap(ctx, state, missionMarker(state));
    } else if (screen === SCREEN_PAUSED) {
      drawHud(ctx, state, '');
      drawMinimap(ctx, state, missionMarker(state));
      ctx.fillStyle = 'rgba(16,10,18,0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', [
        'WASD move · Mouse aim · Click shoot · F punch',
        'E enter / steal car · Space handbrake · M mute',
        'Missions start at Rico\'s Garage — follow the gold marker.',
      ], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const busted = state.player.deadReason === 'busted';
      drawPanel(busted ? 'BUSTED' : 'WASTED', [
        busted ? 'The Solmar PD took you in.' : 'Solmar General patched you up.',
        `You lost $${busted ? 250 : 300} — and your wanted level.`,
        `Missions done: ${state.stats.missions} · Cars stolen: ${state.stats.carsStolen} · Cash: $${state.player.money}`,
      ], 'Press Space to get back out there', busted ? '#5aa9e6' : '#e5534b');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, toLogical };
}
