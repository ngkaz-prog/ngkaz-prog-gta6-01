// Cars: arcade driving physics (accelerate, steer, drift, handbrake), collisions
// with buildings and other cars, damage and wrecks, and stealing: E gets Danny
// into the nearest car, E again gets him out. A stolen traffic car makes its
// driver flee and raises the wanted level; a stolen police car raises it more.

import { CAR } from './config.js';
import { collideCircle } from './world.js';
import { addWanted } from './police.js';

const CAR_COLORS = ['#c94f4f', '#4f7dc9', '#e8c94c', '#7dc94f', '#c9c9c9', '#8a5fc9', '#e88a4f', '#4fc9b8', '#e8e8e8', '#3a3a3a'];

/** Build a car object. `kind` is sedan, hatch, sport, van, taxi or cop. */
export function createCar(x, y, angle, kind, color) {
  const sport = kind === 'sport';
  return {
    x, y, angle,
    speed: 0,
    lateral: 0,
    kind,
    color: color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    hp: CAR.maxHp,
    parked: true,
    isPlayer: false,
    wrecked: false,
    maxSpeed: sport ? CAR.maxSpeed * 1.12 : CAR.maxSpeed,
    skid: 0,
    stuck: 0,
    /** Seconds a traffic car waits, stopped, after a crash with the player. */
    stun: 0,
    /** Seconds until this car can take collision damage again. */
    hurtCd: 0,
  };
}

/** Every car the player could get into: parked, traffic and police cars alike. */
export function allCars(state) {
  return state.cars.concat(state.traffic, state.cops);
}

/** The nearest car to (x, y) within maxDist, or null. Wrecks cannot be entered. */
export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of allCars(state)) {
    if (car.wrecked) continue;
    const dist = Math.hypot(car.x - x, car.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

/** Steal (or simply take) a car: Danny is in it, it is no longer parked. */
export function enterCar(state, car, sound) {
  const player = state.player;
  if (car.kind === 'cop') {
    addWanted(state, 2, sound);
    state.banner = { text: 'STOLE A POLICE CAR', sub: 'The whole department is coming', until: state.time + 2.5 };
  } else if (!car.parked) {
    // A traffic car with a driver: the driver bails and the law notices.
    addWanted(state, 1, sound);
    state.stats.carsStolen += 1;
    const driver = { x: car.x, y: car.y, angle: 0, speed: 0, state: 'flee', color: '#e8a34f', timer: 0 };
    state.peds.push(driver);
    state.banner = { text: 'CAR JACKED', sub: 'That one had a driver', until: state.time + 2 };
  } else {
    state.stats.carsStolen += 1;
  }
  car.parked = false;
  car.isPlayer = true;
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  if (sound) sound.door();
}

/** Get out beside the car, leaving it rolling gently. */
export function exitCar(state, sound) {
  const player = state.player;
  const car = player.inCar;
  if (!car) return;
  car.isPlayer = false;
  car.speed *= 0.25;
  const side = Math.PI / 2;
  const px = car.x + Math.cos(car.angle + side) * 34;
  const py = car.y + Math.sin(car.angle + side) * 34;
  const resolved = collideCircle(state.city, px, py, 13);
  player.x = resolved.x;
  player.y = resolved.y;
  player.inCar = null;
  if (sound) sound.door();
}

/** One step of the car Danny is driving. `control.drive` is throttle/steer/handbrake. */
export function stepPlayerCar(state, dt, control, sound) {
  const car = state.player.inCar;
  if (!car) return;
  if (car.hurtCd > 0) car.hurtCd -= dt;
  const drive = control.drive;
  const forward = Math.cos(car.angle);
  const right = Math.sin(car.angle);

  // Throttle along the heading; braking reverses when nearly stopped.
  if (drive.throttle > 0) car.speed += CAR.accel * dt;
  else if (drive.throttle < 0) {
    car.speed -= (car.speed > 20 ? CAR.brake : CAR.accel * 0.55) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  }
  if (drive.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 420 * dt);
  car.speed = Math.max(-CAR.maxReverse, Math.min(car.maxSpeed, car.speed));

  // Steering bites harder at speed, and the handbrake breaks the rear loose.
  const steerAmount = drive.steer * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 140 + 0.25) * Math.sign(car.speed || 1);
  car.angle += steerAmount * (drive.handbrake ? 1.5 : 1);
  const grip = drive.handbrake ? 2.2 : CAR.grip;
  car.lateral += -car.lateral * Math.min(1, grip * dt);

  const vx = forward * car.speed + -right * car.lateral;
  const vy = right * car.speed + forward * car.lateral;
  let nx = car.x + vx * dt;
  let ny = car.y + vy * dt;

  // Two collision circles (nose and tail) so the car cannot clip a wall sideways.
  const nose = collideCircle(state.city, nx + Math.cos(car.angle) * 18, ny + Math.sin(car.angle) * 18, CAR.radius);
  const tail = collideCircle(state.city, nx - Math.cos(car.angle) * 18, ny - Math.sin(car.angle) * 18, CAR.radius);
  if (nose.hit || tail.hit) {
    const impact = Math.abs(car.speed);
    if (impact > 160) {
      damageCar(state, car, impact * 0.06, sound);
      if (sound) sound.crash();
      state.camera.shake = Math.max(state.camera.shake, Math.min(10, impact * 0.02));
      spawnSparks(state, car.x, car.y);
    }
    car.speed *= 0.7;
    nx = (nose.x + tail.x) / 2;
    ny = (nose.y + tail.y) / 2;
  }
  car.x = nx;
  car.y = ny;
  state.player.x = car.x;
  state.player.y = car.y;

  // Skid marks and tyre smoke when sliding hard.
  const sliding = Math.abs(drive.steer) > 0.4 && Math.abs(car.speed) > 220;
  if (sliding || drive.handbrake) {
    car.skid += dt;
    if (car.skid > 0.05) {
      car.skid = 0;
      state.skids.push({ x: car.x - Math.cos(car.angle) * 14, y: car.y - Math.sin(car.angle) * 14, angle: car.angle, life: 4 });
      if (state.skids.length > 220) state.skids.shift();
    }
  }

  // Pedestrians in the way get hit — and the law notices.
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 60) {
      ped.state = 'down';
      ped.timer = 6;
      ped.vx = Math.cos(car.angle) * 260;
      ped.vy = Math.sin(car.angle) * 260;
      addWanted(state, 1, sound);
      if (sound) sound.thud();
      state.camera.shake = Math.max(state.camera.shake, 4);
    }
  }
  if (sound) sound.engine(Math.min(1, Math.abs(car.speed) / CAR.maxSpeed));
}

/** Damage a car; at 0 hp it wrecks (and ejects Danny, hurt, if he was in it). */
export function damageCar(state, car, amount, sound) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp > 0) return;
  car.hp = 0;
  car.wrecked = true;
  car.speed = 0;
  car.color = '#2a2a2a';
  spawnExplosion(state, car.x, car.y);
  if (sound) sound.explosion();
  state.camera.shake = Math.max(state.camera.shake, 12);
  if (car.isPlayer) {
    car.isPlayer = false;
    state.player.inCar = null;
    const px = car.x + 40;
    const py = car.y + 40;
    const resolved = collideCircle(state.city, px, py, 13);
    state.player.x = resolved.x;
    state.player.y = resolved.y;
    state.player.hp = Math.max(1, state.player.hp - 25);
    state.banner = { text: 'CAR WRECKED', sub: 'That one is done', until: state.time + 2 };
  }
}

function spawnSparks(state, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const angle = state.random() * Math.PI * 2;
    state.particles.push({ x, y, vx: Math.cos(angle) * 220, vy: Math.sin(angle) * 220, life: 0.3, max: 0.3, color: '#ffd23f', size: 3 });
  }
}

function spawnExplosion(state, x, y) {
  for (let i = 0; i < 26; i += 1) {
    const angle = state.random() * Math.PI * 2;
    const speed = 60 + state.random() * 320;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.5 + state.random() * 0.5, max: 1,
      color: ['#ff9a5c', '#ffd23f', '#e5534b', '#5a5a5a'][i % 4],
      size: 4 + state.random() * 6,
    });
  }
}

/**
 * Car-on-car collisions for every car in the world: they push apart with a
 * small bounce along the impact normal, take damage on a hard hit, and the
 * car that was hit swerves — so a shunt does not weld two cars together and
 * the player's car can push through traffic instead of grinding to a halt.
 */
export function resolveCarCollisions(state, sound) {
  const cars = allCars(state);
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.wrecked && b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 4;
      if (dist >= min || dist === 0) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const push = (min - dist) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      // Velocities along the impact normal: if they are closing, bounce apart.
      const avx = Math.cos(a.angle) * a.speed;
      const avy = Math.sin(a.angle) * a.speed;
      const bvx = Math.cos(b.angle) * b.speed;
      const bvy = Math.sin(b.angle) * b.speed;
      const closing = (bvx - avx) * nx + (bvy - avy) * ny;
      if (closing < 0) {
        const impulse = -(1 + 0.4) * closing / 2;
        const aAlong = Math.cos(a.angle) * nx + Math.sin(a.angle) * ny;
        const bAlong = Math.cos(b.angle) * nx + Math.sin(b.angle) * ny;
        a.speed = Math.max(-CAR.maxReverse, Math.min(a.maxSpeed, a.speed - impulse * aAlong));
        b.speed = Math.max(-CAR.maxReverse, Math.min(b.maxSpeed, b.speed + impulse * bAlong));
        if (-closing > 140) {
          // One hard hit, not a drain: damage has a cooldown per car.
          if (a.hurtCd <= 0) {
            damageCar(state, a, -closing * 0.03, sound);
            a.hurtCd = 0.8;
          }
          if (b.hurtCd <= 0) {
            damageCar(state, b, -closing * 0.03, sound);
            b.hurtCd = 0.8;
          }
          if (sound) sound.crash();
          if (a.isPlayer || b.isPlayer) state.camera.shake = Math.max(state.camera.shake, 5);
        }
        // A traffic car the player shoves gets a push and swerves, then coasts:
        // it must keep rolling clear, never stop dead in the player's path.
        const hit = a.isPlayer ? b : a;
        if (!hit.isPlayer && hit.kind !== 'cop') {
          hit.stun = 0.8;
          hit.angle += (state.random() - 0.5) * 0.5;
        }
      }
    }
  }
}
