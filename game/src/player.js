// Danny Vega on foot: walking and running, mouse aim, pistol and fists, getting in
// and out of cars, and picking up health, armour and cash stashes. Damage goes
// through armour first; crimes here (stealing, shooting, hurting a pedestrian)
// raise the wanted level through police.js.
//
// `actions` is the frame's one-shot ACTION_* flags, taken once by the main loop
// and handed in — this module never takes them itself.

import { MONEY, PLAYER } from './config.js';
import { collideCircle } from './world.js';
import { addWanted } from './police.js';
import { exitCar, nearestCar, enterCar } from './vehicles.js';
import { tryMelee } from './combat.js';
import { ACTION_MELEE } from './input.js';

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function collectPickups(state, sound) {
  const player = state.player;
  for (const pickup of state.city.pickups) {
    if (pickup.taken) continue;
    if (distance(player.x, player.y, pickup.x, pickup.y) > 34) continue;
    pickup.taken = true;
    if (pickup.kind === 'health') {
      player.hp = Math.min(PLAYER.maxHp, player.hp + 50);
      if (sound) sound.pickup();
      state.banner = { text: '+50 HEALTH', sub: 'Patched up at Solmar General', until: state.time + 2 };
    } else {
      player.armor = Math.min(PLAYER.maxArmor, player.armor + 50);
      if (sound) sound.pickup();
      state.banner = { text: '+50 ARMOUR', sub: 'Kevlar vest', until: state.time + 2 };
    }
  }
  for (const stash of state.city.stashes) {
    if (stash.taken) continue;
    if (distance(player.x, player.y, stash.x, stash.y) > 34) continue;
    stash.taken = true;
    player.money += MONEY.stashValue;
    state.stats.stashes += 1;
    if (sound) sound.cash();
    state.banner = { text: `+$${MONEY.stashValue} STASH`, sub: `Hidden cash ${state.stats.stashes} of ${MONEY.stashCount}`, until: state.time + 2 };
  }
  // Cash dropped by defeated enemies.
  for (const drop of state.drops) {
    if (drop.taken) continue;
    if (distance(player.x, player.y, drop.x, drop.y) > 34) continue;
    drop.taken = true;
    player.money += drop.value;
    if (sound) sound.cash();
  }
}

/** One step of on-foot play: movement, aim, shooting, melee, pickups.
 * `control` carries the frame's movement, mouse, one-shot actions and a
 * function turning mouse pixels into world coordinates. */
export function stepPlayer(state, dt, control, sound) {
  const player = state.player;
  if (player.hp <= 0 || player.inCar) return;

  const move = control.move;
  const speed = control.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const resolved = collideCircle(state.city, player.x + move.x * speed * dt, player.y + move.y * speed * dt, PLAYER.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  if (move.x !== 0 || move.y !== 0) player.angle = Math.atan2(move.y, move.x);

  // Aim follows the mouse (world coordinates through the camera).
  const mouse = control.mouse;
  const aim = control.aimWorld(mouse.x, mouse.y);
  player.aimAngle = Math.atan2(aim.y - player.y, aim.x - player.x);

  if (player.fireCd > 0) player.fireCd -= dt;
  if (player.meleeCd > 0) player.meleeCd -= dt;
  if (player.invuln > 0) player.invuln -= dt;
  if (player.crimeCd > 0) player.crimeCd -= dt;

  if (mouse.down && player.fireCd <= 0) {
    player.fireCd = PLAYER.pistolCooldown;
    state.stats.shots += 1;
    const spread = (state.random() - 0.5) * 0.06;
    const angle = player.aimAngle + spread;
    state.bullets.push({
      x: player.x + Math.cos(angle) * 20,
      y: player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: 0.6,
      from: 'player',
      damage: PLAYER.pistolDamage,
    });
    state.particles.push({ x: player.x + Math.cos(angle) * 24, y: player.y + Math.sin(angle) * 24, vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60, life: 0.08, max: 0.08, color: '#ffd23f', size: 5 });
    state.danger = { x: player.x, y: player.y, until: state.time + 1.5 };
    if (sound) sound.shoot();
    state.camera.shake = Math.max(state.camera.shake, 1.5);
    // Firing a gun in public draws the law — unless the mission says otherwise.
    if (!state.mission.noHeat && player.crimeCd <= 0) {
      player.crimeCd = 4;
      addWanted(state, 1, sound);
    }
  }

  if ((control.actions & ACTION_MELEE) && player.meleeCd <= 0) tryMelee(state, sound);

  collectPickups(state, sound);
}

/** Get into the nearest car, or out of the one being driven (E key). */
export function toggleCar(state, sound) {
  const player = state.player;
  if (player.inCar) {
    exitCar(state, sound);
    return;
  }
  const car = nearestCar(state, player.x, player.y, 64);
  if (car) enterCar(state, car, sound);
}
