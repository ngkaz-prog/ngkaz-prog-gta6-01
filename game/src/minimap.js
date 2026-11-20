// The minimap: the whole city shrunk into the bottom-left corner — roads,
// buildings, water, and dots for Danny, his car, traffic, police, enemies and
// the mission marker, with a north indicator and a zoom that keeps the player
// centred on the local streets.

import { BEACH_X, FONT, PALETTE, ROADS_H, ROADS_V, ROAD_W, VIEW, WATER_X, WORLD } from './config.js';

const MAP = { x: 16, y: VIEW.height - 176, width: 230, height: 160 };
const SCALE_X = MAP.width / WORLD.width;
const SCALE_Y = MAP.height / WORLD.height;

function toMap(x, y) {
  return { x: MAP.x + x * SCALE_X, y: MAP.y + y * SCALE_Y };
}

function dot(ctx, x, y, radius, color) {
  const point = toMap(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the minimap for the play screen. */
export function drawMinimap(ctx, state, marker) {
  ctx.save();
  ctx.fillStyle = 'rgba(16,12,20,0.82)';
  ctx.fillRect(MAP.x - 4, MAP.y - 4, MAP.width + 8, MAP.height + 8);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MAP.x - 4, MAP.y - 4, MAP.width + 8, MAP.height + 8);

  // Clip everything to the map frame.
  ctx.beginPath();
  ctx.rect(MAP.x, MAP.y, MAP.width, MAP.height);
  ctx.clip();

  // Ground, water and beach.
  ctx.fillStyle = '#5d7a4a';
  ctx.fillRect(MAP.x, MAP.y, MAP.width, MAP.height);
  ctx.fillStyle = '#2f7f9e';
  ctx.fillRect(MAP.x + WATER_X * SCALE_X, MAP.y, MAP.width, MAP.height);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(MAP.x + BEACH_X * SCALE_X, MAP.y, (WATER_X - BEACH_X) * SCALE_X, MAP.height);

  // Roads.
  ctx.fillStyle = '#3d4149';
  for (const roadX of ROADS_V) ctx.fillRect(MAP.x + (roadX - ROAD_W / 2) * SCALE_X, MAP.y, ROAD_W * SCALE_X, MAP.height);
  for (const roadY of ROADS_H) ctx.fillRect(MAP.x, MAP.y + (roadY - ROAD_W / 2) * SCALE_Y, MAP.width, ROAD_W * SCALE_Y);

  // Buildings.
  ctx.fillStyle = 'rgba(30,26,34,0.85)';
  for (const building of state.city.buildings) {
    ctx.fillRect(MAP.x + building.x * SCALE_X, MAP.y + building.y * SCALE_Y, building.w * SCALE_X, building.h * SCALE_Y);
  }

  // Mission marker: a pulsing diamond.
  if (marker) {
    const point = toMap(marker.x, marker.y);
    const pulse = 5 + Math.sin(state.time * 5) * 2;
    ctx.fillStyle = marker.start ? '#7ddc7d' : '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - pulse);
    ctx.lineTo(point.x + pulse, point.y);
    ctx.lineTo(point.x, point.y + pulse);
    ctx.lineTo(point.x - pulse, point.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Enemies, then police, then traffic, then Danny on top.
  for (const enemy of state.enemies) dot(ctx, enemy.x, enemy.y, 2.5, '#e5534b');
  for (const car of state.cops) dot(ctx, car.x, car.y, 3, '#5aa9e6');
  for (const car of state.traffic) dot(ctx, car.x, car.y, 2, '#c9c9c9');
  const player = state.player;
  const point = toMap(player.x, player.y);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Facing tick.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(point.x + Math.cos(player.angle) * 8, point.y + Math.sin(player.angle) * 8);
  ctx.stroke();

  ctx.restore();

  // North indicator.
  ctx.font = `800 13px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('N', MAP.x + MAP.width - 12, MAP.y - 8);
  ctx.fillText('SOLMAR CITY', MAP.x, MAP.y - 8);
}
