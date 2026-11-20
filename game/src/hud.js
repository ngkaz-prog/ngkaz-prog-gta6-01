// The HUD: health and armour bars, money, wanted stars, the mission tracker,
// context prompts, banners and the speedometer. All of it is drawn in screen
// space (1280x720 logical), on top of the world.

import { FONT, PALETTE, VIEW, WANTED } from './config.js';
import { MISSIONS, missionObjective } from './missions.js';

const STAR_SIZE = 26;

function text(ctx, value, x, y, size, color, align = 'left', weight = '600') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function bar(ctx, x, y, width, height, fraction, color, background) {
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, fraction)), height);
}

function drawWantedStars(ctx, state) {
  const wanted = state.player.wanted;
  const total = WANTED.maxStars;
  const width = total * (STAR_SIZE + 4);
  const x0 = VIEW.width - 24 - width;
  const y0 = 76;
  for (let star = 0; star < total; star += 1) {
    const cx = x0 + star * (STAR_SIZE + 4) + STAR_SIZE / 2;
    const cy = y0 + STAR_SIZE / 2;
    drawStar(ctx, cx, cy, STAR_SIZE / 2, star < wanted ? PALETTE.star : 'rgba(255,255,255,0.22)');
  }
  if (wanted > 0 && Math.floor(state.time * 2) % 2 === 0) {
    text(ctx, 'WANTED', x0 - 8, y0 + STAR_SIZE - 4, 16, '#ff8a7a', 'right', '800');
  }
}

function drawStar(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** The context line at the bottom: what E does right now, or the controls. */
export function contextPrompt(state) {
  const player = state.player;
  if (player.dead) return '';
  if (!player.inCar) {
    for (const car of state.cars.concat(state.traffic, state.cops)) {
      if (car.wrecked) continue;
      if (Math.hypot(car.x - player.x, car.y - player.y) < 64) {
        return car.kind === 'cop' ? 'E — Steal police car (2 stars)' : 'E — Get in car';
      }
    }
  }
  if (player.inCar) return 'E — Get out    Space — Handbrake';
  return 'WASD — Move    Click — Shoot    F — Punch    E — Enter car';
}

/** Draw the whole HUD for the play screen. */
export function drawHud(ctx, state, prompt) {
  const player = state.player;
  // Top right: money, health, armour, wanted stars.
  text(ctx, `$${player.money.toLocaleString('en-US')}`, VIEW.width - 24, 40, 30, PALETTE.money, 'right', '800');
  bar(ctx, VIEW.width - 224, 50, 200, 12, player.hp / 100, PALETTE.health, 'rgba(0,0,0,0.45)');
  bar(ctx, VIEW.width - 224, 66, 200, 8, player.armor / 100, PALETTE.armor, 'rgba(0,0,0,0.45)');
  drawWantedStars(ctx, state);

  // Top left: mission tracker, or the free-roam line.
  const objective = missionObjective(state);
  ctx.fillStyle = PALETTE.panel;
  if (objective) {
    const lines = [objective.name, objective.text];
    const width = 420;
    ctx.fillRect(16, 16, width, 24 + lines.length * 24 + (objective.time !== null ? 26 : 8));
    text(ctx, objective.name, 28, 42, 20, PALETTE.mission, 'left', '800');
    text(ctx, objective.text, 28, 68, 17, PALETTE.text, 'left', '500');
    if (objective.time !== null) {
      const urgent = objective.time < 15;
      text(ctx, `TIME  ${Math.max(0, Math.ceil(objective.time))}s`, 28, 94, 18, urgent ? '#ff6a5a' : PALETTE.marker, 'left', '800');
    }
  } else if (state.mission.index < MISSIONS.length) {
    ctx.fillRect(16, 16, 420, 62);
    text(ctx, 'FREE ROAM', 28, 42, 20, PALETTE.muted, 'left', '800');
    text(ctx, "Head to Rico's Garage to start the next mission", 28, 64, 15, PALETTE.text, 'left', '500');
  } else {
    ctx.fillRect(16, 16, 420, 62);
    text(ctx, 'STORY COMPLETE', 28, 42, 20, PALETTE.mission, 'left', '800');
    text(ctx, 'Solmar is yours — free roam, collect stashes, raise hell', 28, 64, 15, PALETTE.text, 'left', '500');
  }

  // Bottom centre: context prompt.
  if (prompt) {
    ctx.font = `600 17px ${FONT}`;
    const width = ctx.measureText(prompt).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect((VIEW.width - width) / 2, VIEW.height - 44, width, 30);
    text(ctx, prompt, VIEW.width / 2, VIEW.height - 23, 17, PALETTE.text, 'center', '600');
  }

  // Speedometer, bottom right, while driving.
  if (player.inCar) {
    const car = player.inCar;
    const mph = Math.round(Math.abs(car.speed) * 0.14);
    text(ctx, `${mph}`, VIEW.width - 24, VIEW.height - 62, 44, PALETTE.text, 'right', '800');
    text(ctx, 'MPH', VIEW.width - 24, VIEW.height - 36, 15, PALETTE.muted, 'right', '700');
    bar(ctx, VIEW.width - 224, VIEW.height - 24, 200, 8, car.hp / 100, car.hp > 35 ? '#7ddc7d' : '#e5534b', 'rgba(0,0,0,0.45)');
    text(ctx, 'CAR', VIEW.width - 232, VIEW.height - 16, 13, PALETTE.muted, 'right', '700');
  }

  // Arrest progress: a cop has hold of Danny.
  if (player.bustTimer > 0.1 && !player.inCar) {
    const width = 260;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect((VIEW.width - width) / 2, 120, width, 34);
    text(ctx, 'BREAK FREE — MOVE!', VIEW.width / 2, 141, 18, '#ff8a7a', 'center', '800');
    bar(ctx, (VIEW.width - width) / 2 + 8, 146, width - 16, 6, player.bustTimer / 1.4, '#ff8a7a', 'rgba(255,255,255,0.2)');
  }

  // Centre banner (mission start / complete / pickup).
  if (state.banner && state.time < state.banner.until) {
    const alpha = Math.min(1, (state.banner.until - state.time) / 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 34px ${FONT}`;
    const width = ctx.measureText(state.banner.text).width + 60;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect((VIEW.width - width) / 2, 180, width, 64);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect((VIEW.width - width) / 2, 180, width, 64);
    text(ctx, state.banner.text, VIEW.width / 2, 210, 30, PALETTE.marker, 'center', '800');
    text(ctx, state.banner.sub, VIEW.width / 2, 234, 16, PALETTE.text, 'center', '500');
    ctx.restore();
  }
}
