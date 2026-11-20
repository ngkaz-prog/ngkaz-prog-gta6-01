// The law: a wanted level of 0 to 5 stars, police cars that chase and ram, and
// officers on foot who run Danny down and arrest him if they hold him. Crimes
// raise the level; staying clean and out of sight lets it cool off, one star
// at a time.

import { LANDMARKS, WANTED } from './config.js';
import { collideCircle, randomRoadPoint } from './world.js';
import { createCar, damageCar } from './vehicles.js';
import { damagePlayer } from './health.js';

/** Raise the wanted level (clamped at 5) and restart the cool-off clock. */
export function addWanted(state, stars, sound) {
  const player = state.player;
  const before = player.wanted;
  player.wanted = Math.min(WANTED.maxStars, player.wanted + stars);
  player.lastCrime = state.time;
  player.decayTimer = 0;
  if (player.wanted > before && sound) sound.siren(player.wanted);
}

/** Drop the wanted level to zero (safehouse, mission escape, respawn). */
export function clearWanted(state) {
  state.player.wanted = 0;
  state.player.bustTimer = 0;
}

function spawnCopCar(state) {
  const random = state.random;
  let point;
  for (let tries = 0; tries < 12; tries += 1) {
    point = randomRoadPoint(random);
    const dist = Math.hypot(point.x - state.player.x, point.y - state.player.y);
    if (dist > 500 && dist < 900) break;
  }
  const car = createCar(point.x, point.y, random() * Math.PI * 2, 'cop', '#1e4fa0');
  car.parked = false;
  car.speed = 200;
  car.cruise = 300;
  car.stuck = 0;
  state.cops.push(car);
  return car;
}

function spawnFootCop(state) {
  const random = state.random;
  const angle = random() * Math.PI * 2;
  const dist = 260 + random() * 200;
  const cop = {
    x: state.player.x + Math.cos(angle) * dist,
    y: state.player.y + Math.sin(angle) * dist,
    angle: 0,
    speed: 0,
    bust: 0,
    timer: 0,
  };
  const resolved = collideCircle(state.city, cop.x, cop.y, 13);
  cop.x = resolved.x;
  cop.y = resolved.y;
  state.footCops.push(cop);
  return cop;
}

function stepCopCar(state, car, dt, sound) {
  const player = state.player;
  if (car.hurtCd > 0) car.hurtCd -= dt;
  // Each unit holds a slot on a ring around the player, so the pursuit spreads
  // out instead of every car piling into the same spot.
  const slot = state.cops.indexOf(car);
  const slotAngle = slot * 2.4 + state.time * 0.15;
  const tx = player.x + Math.cos(slotAngle) * 150;
  const ty = player.y + Math.sin(slotAngle) * 150;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : 0;
  const targetSpeed = dist > 260 ? 430 : Math.min(430, playerSpeed * 0.9 + 90);
  car.speed += Math.max(-380 * dt, Math.min(300 * dt, targetSpeed - car.speed));
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const resolved = collideCircle(state.city, nx, ny, 17);
  if (resolved.hit) {
    car.x = resolved.x;
    car.y = resolved.y;
    car.speed *= 0.5;
    car.stuck += dt;
    if (car.stuck > 1.2) {
      // Wedged on a wall: back out and turn around.
      car.angle += Math.PI * 0.9;
      car.speed = -160;
      car.stuck = 0;
    }
  } else {
    car.x = nx;
    car.y = ny;
    car.stuck = Math.max(0, car.stuck - dt);
  }

  // Ramming the player's car damages it; running Danny over on foot hurts him.
  const toPlayer = Math.hypot(player.x - car.x, player.y - car.y);
  if (player.inCar) {
    if (toPlayer < 46 && Math.abs(car.speed) > 120) {
      damageCar(state, player.inCar, 2.5, sound);
      car.speed *= 0.7;
      state.camera.shake = Math.max(state.camera.shake, 4);
      if (sound) sound.crash();
    }
  } else if (toPlayer < 34 && Math.abs(car.speed) > 60) {
    damagePlayer(state, 12, sound);
    car.speed *= 0.6;
  }
}

function stepFootCop(state, cop, dt, sound) {
  const player = state.player;
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const dist = Math.hypot(dx, dy);
  if (player.inCar) {
    // On foot no more: the officer runs back to the road and despawns.
    cop.timer += dt;
    if (cop.timer > 2) {
      const index = state.footCops.indexOf(cop);
      if (index !== -1) state.footCops.splice(index, 1);
    }
    return;
  }
  const speed = 285;
  cop.angle = Math.atan2(dy, dx);
  const resolved = collideCircle(state.city, cop.x + Math.cos(cop.angle) * speed * dt, cop.y + Math.sin(cop.angle) * speed * dt, 13);
  cop.x = resolved.x;
  cop.y = resolved.y;
  if (dist < WANTED.bustDistance) {
    cop.bust += dt;
    state.player.bustTimer = Math.max(state.player.bustTimer, cop.bust);
    if (cop.bust >= WANTED.bustTime) {
      state.player.dead = true;
      state.player.deadReason = 'busted';
      if (sound) sound.busted();
    }
  } else {
    cop.bust = Math.max(0, cop.bust - dt * 2);
  }
  if (dist > 1100) {
    const index = state.footCops.indexOf(cop);
    if (index !== -1) state.footCops.splice(index, 1);
  }
}

/** One step of the wanted system and every police unit. */
export function stepPolice(state, dt, sound) {
  const player = state.player;
  if (player.wanted > 0) {
    // Cool-off: no fresh crime for a while and no cop close by, and a star fades.
    const nearestCop = Math.min(
      ...state.cops.map((car) => Math.hypot(car.x - player.x, car.y - player.y)),
      ...state.footCops.map((cop) => Math.hypot(cop.x - player.x, cop.y - player.y)),
      Infinity,
    );
    if (state.time - player.lastCrime > WANTED.decayDelay && nearestCop > 480) {
      player.decayTimer += dt;
      if (player.decayTimer >= WANTED.decayInterval) {
        player.decayTimer = 0;
        player.wanted -= 1;
        if (player.wanted === 0 && sound) sound.clear();
      }
    } else {
      player.decayTimer = 0;
    }
  }

  const wantedCars = Math.min(8, player.wanted * WANTED.copCarPerStar);
  const wantedFoot = player.wanted >= 2 ? Math.min(4, (player.wanted - 1) * WANTED.copFootPerStar) : 0;
  while (state.cops.length < wantedCars) spawnCopCar(state);
  while (state.footCops.length < wantedFoot) spawnFootCop(state);
  // Wanted gone: the police drift away instead of vanishing on the spot.
  if (player.wanted === 0) {
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const car = state.cops[i];
      car.speed = Math.max(0, car.speed - 200 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (Math.hypot(car.x - player.x, car.y - player.y) > 900 || car.speed <= 0) state.cops.splice(i, 1);
    }
    for (let i = state.footCops.length - 1; i >= 0; i -= 1) state.footCops.splice(i, 1);
    return;
  }

  for (let i = state.cops.length - 1; i >= 0; i -= 1) {
    const car = state.cops[i];
    if (car.wrecked) {
      state.cops.splice(i, 1);
      continue;
    }
    stepCopCar(state, car, dt, sound);
    if (Math.hypot(car.x - player.x, car.y - player.y) > 1400) state.cops.splice(i, 1);
  }
  for (let i = state.footCops.length - 1; i >= 0; i -= 1) stepFootCop(state, state.footCops[i], dt, sound);
}

/** Respawn after being wasted or busted: hospital steps, a fine, a clean slate. */
export function respawn(state) {
  const player = state.player;
  const reason = player.deadReason;
  const fine = reason === 'busted' ? 250 : 300;
  player.money = Math.max(0, player.money - fine);
  player.hp = 100;
  player.armor = 0;
  player.dead = false;
  player.deadReason = null;
  player.wanted = 0;
  player.bustTimer = 0;
  player.inCar = null;
  player.x = LANDMARKS.hospital.x;
  player.y = LANDMARKS.hospital.y + 80;
  state.cops = [];
  state.footCops = [];
  state.enemies = [];
  state.bullets = [];
  state.camera.x = player.x - 640;
  state.camera.y = player.y - 360;
  state.banner = { text: reason === 'busted' ? 'BUSTED' : 'WASTED', sub: `Fine $${fine} — Solmar General patched you up`, until: state.time + 3 };
  state.mission.active = false;
}
