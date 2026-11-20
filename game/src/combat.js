// Combat: bullets, fists, and the Harbor Kings henchmen who show up for the
// marina showdown. Enemies walk toward Danny, shoot back with shaky aim, and
// drop cash when they fall. A bullet that hits a bystander is a crime.

import { ENEMY_HP, PLAYER } from './config.js';
import { collideCircle, insideBuilding } from './world.js';
import { addWanted } from './police.js';
import { damagePlayer } from './health.js';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Spawn `count` henchmen around (x, y), clear of walls. */
export function spawnEnemies(state, x, y, count) {
  const random = state.random;
  for (let i = 0; i < count; i += 1) {
    let ex = x;
    let ey = y;
    for (let tries = 0; tries < 20; tries += 1) {
      ex = x + (random() - 0.5) * 420;
      ey = y + (random() - 0.5) * 420;
      if (!insideBuilding(state.city, ex, ey, 16)) break;
    }
    state.enemies.push({
      x: ex, y: ey, angle: 0, hp: ENEMY_HP,
      fireCd: 1 + random() * 1.5, moveCd: 0, strafe: random() < 0.5 ? 1 : -1,
    });
  }
}

function stepEnemy(state, enemy, dt, sound) {
  const player = state.player;
  const d = dist(enemy.x, enemy.y, player.x, player.y);
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  // Close in until shooting range, then strafe; never walk through walls.
  let mx = 0;
  let my = 0;
  if (d > 300) {
    mx = Math.cos(enemy.angle);
    my = Math.sin(enemy.angle);
  } else if (d < 160) {
    mx = -Math.cos(enemy.angle) * 0.5;
    my = -Math.sin(enemy.angle) * 0.5;
  } else {
    enemy.moveCd -= dt;
    if (enemy.moveCd <= 0) {
      enemy.moveCd = 1.2 + state.random() * 1.5;
      enemy.strafe *= -1;
    }
    mx = Math.cos(enemy.angle + Math.PI / 2) * enemy.strafe * 0.6;
    my = Math.sin(enemy.angle + Math.PI / 2) * enemy.strafe * 0.6;
  }
  const speed = 165;
  const resolved = collideCircle(state.city, enemy.x + mx * speed * dt, enemy.y + my * speed * dt, 13);
  enemy.x = resolved.x;
  enemy.y = resolved.y;

  enemy.fireCd -= dt;
  if (enemy.fireCd <= 0 && d < 380 && !player.dead) {
    enemy.fireCd = 0.9 + state.random() * 0.9;
    const spread = (state.random() - 0.5) * 0.35;
    const angle = enemy.angle + spread;
    state.bullets.push({
      x: enemy.x + Math.cos(angle) * 20,
      y: enemy.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 780,
      vy: Math.sin(angle) * 780,
      life: 0.7,
      from: 'enemy',
      damage: 1,
    });
    if (sound) sound.enemyShoot();
  }
}

function hitEnemy(state, enemy, damage, sound) {
  enemy.hp -= damage;
  state.particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: -40, life: 0.25, max: 0.25, color: '#e5534b', size: 6 });
  if (enemy.hp > 0) return;
  const index = state.enemies.indexOf(enemy);
  if (index !== -1) state.enemies.splice(index, 1);
  state.stats.kills += 1;
  state.mission.kills += 1;
  const value = 50 + Math.floor(state.random() * 100);
  state.drops.push({ x: enemy.x, y: enemy.y, value, taken: false });
  for (let i = 0; i < 10; i += 1) {
    const angle = state.random() * Math.PI * 2;
    state.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 160, vy: Math.sin(angle) * 160, life: 0.4, max: 0.4, color: '#c94f4f', size: 4 });
  }
  if (sound) sound.enemyDown();
}

function stepBullets(state, dt, sound) {
  const player = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let gone = bullet.life <= 0;
    // Walls stop bullets with a spark.
    if (!gone && insideBuilding(state.city, bullet.x, bullet.y, 2)) {
      gone = true;
      state.particles.push({ x: bullet.x, y: bullet.y, vx: 0, vy: 0, life: 0.15, max: 0.15, color: '#ffd23f', size: 3 });
    }
    if (!gone && bullet.from === 'player') {
      for (const enemy of [...state.enemies]) {
        if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < 16) {
          hitEnemy(state, enemy, bullet.damage, sound);
          gone = true;
          break;
        }
      }
    }
    if (!gone && bullet.from === 'player') {
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(bullet.x, bullet.y, ped.x, ped.y) < 14) {
          ped.state = 'down';
          ped.timer = 8;
          ped.vx = bullet.vx * 0.2;
          ped.vy = bullet.vy * 0.2;
          state.danger = { x: bullet.x, y: bullet.y };
          addWanted(state, 1, sound);
          gone = true;
          break;
        }
      }
    }
    if (!gone && bullet.from === 'enemy' && !player.inCar && !player.dead) {
      if (dist(bullet.x, bullet.y, player.x, player.y) < 14) {
        damagePlayer(state, 8, sound);
        gone = true;
      }
    }
    if (!gone && bullet.from === 'enemy' && player.inCar) {
      if (dist(bullet.x, bullet.y, player.inCar.x, player.inCar.y) < 24) gone = true;
    }
    if (gone) state.bullets.splice(i, 1);
  }
}

/** Danny's fist: an arc in front of him, hurting enemies and bystanders alike. */
export function tryMelee(state, sound) {
  const player = state.player;
  player.meleeCd = PLAYER.meleeCooldown;
  player.meleeSwing = 0.25;
  if (sound) sound.swing();
  const range = PLAYER.meleeRange;
  const aim = player.aimAngle;
  for (const enemy of [...state.enemies]) {
    const d = dist(player.x, player.y, enemy.x, enemy.y);
    if (d > range) continue;
    const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    let diff = angle - aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 1.1) hitEnemy(state, enemy, PLAYER.meleeDamage, sound);
  }
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const d = dist(player.x, player.y, ped.x, ped.y);
    if (d > range) continue;
    const angle = Math.atan2(ped.y - player.y, ped.x - player.x);
    let diff = angle - aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 1.1) {
      ped.state = 'down';
      ped.timer = 8;
      addWanted(state, 1, sound);
      if (sound) sound.thud();
    }
  }
}

/** Advance bullets and enemies one step. */
export function stepCombat(state, dt, sound) {
  const player = state.player;
  if (player.meleeSwing > 0) player.meleeSwing -= dt;
  stepBullets(state, dt, sound);
  for (const enemy of [...state.enemies]) stepEnemy(state, enemy, dt, sound);
}
