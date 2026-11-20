// Traffic and pedestrians: the city alive around Danny. Traffic cars follow the
// road grid, turn at intersections and slow for the car ahead; pedestrians stroll
// the sidewalks and run for cover when a gun goes off or a car bears down on
// them. Both stay near the camera and respawn when they drift too far away.

import { PED_COUNT, TRAFFIC_COUNT } from './config.js';
import { collideCircle, nearestIntersection, nearestRoad, onRoad, randomRoadPoint, randomSidewalkPoint } from './world.js';
import { createCar } from './vehicles.js';
import { pick } from './random.js';

const TRAFFIC_COLORS = ['#c94f4f', '#4f7dc9', '#e8c94c', '#7dc94f', '#c9c9c9', '#8a5fc9', '#e88a4f', '#e8e8e8', '#3a3a3a'];
const PED_COLORS = ['#e8a34f', '#7dc9e8', '#c97dc9', '#a8d8a0', '#e88ca0', '#d8d8d8', '#8a7dc9', '#c9b458'];

/** Fill the world with traffic cars and pedestrians around the player. */
export function spawnCityLife(state) {
  state.traffic = [];
  state.peds = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(state, true);
  for (let i = 0; i < PED_COUNT; i += 1) spawnPedestrian(state, true);
}

/** One traffic car on a random road, near the player when `nearPlayer`. */
export function spawnTrafficCar(state, nearPlayer) {
  const random = state.random;
  let point;
  for (let tries = 0; tries < 12; tries += 1) {
    point = randomRoadPoint(random);
    const dist = Math.hypot(point.x - state.player.x, point.y - state.player.y);
    if (!nearPlayer || (dist > 250 && dist < 1100)) break;
  }
  // Never spawn directly in front of the player's car on its own road: the
  // player would rear-end it before the frame even starts.
  const playerCar = state.player.inCar;
  if (playerCar) {
    for (let tries = 0; tries < 8; tries += 1) {
      const ahead = (point.x - playerCar.x) * Math.cos(playerCar.angle) + (point.y - playerCar.y) * Math.sin(playerCar.angle);
      const side = Math.abs(-(point.x - playerCar.x) * Math.sin(playerCar.angle) + (point.y - playerCar.y) * Math.cos(playerCar.angle));
      if (!(ahead > 0 && ahead < 420 && side < 40)) break;
      point = randomRoadPoint(random);
    }
  }
  const road = nearestRoad(point.x, point.y);
  const dir = random() < 0.5 ? 1 : -1;
  const car = createCar(
    road.axis === 'v' ? road.at + dir * 24 : point.x,
    road.axis === 'v' ? point.y : road.at + dir * 24,
    road.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    pick(random, ['sedan', 'sedan', 'hatch', 'van']),
    pick(random, TRAFFIC_COLORS),
  );
  car.parked = false;
  car.speed = 130 + random() * 90;
  car.cruise = car.speed;
  car.axis = road.axis;
  car.dir = dir;
  state.traffic.push(car);
  return car;
}

/** One pedestrian on a sidewalk, near the player when `nearPlayer`. */
export function spawnPedestrian(state, nearPlayer) {
  const random = state.random;
  const point = nearPlayer
    ? randomSidewalkPoint(random, state.player.x, state.player.y)
    : { x: 200 + random() * 2800, y: 200 + random() * 2200 };
  const road = nearestRoad(point.x, point.y);
  const ped = {
    x: point.x, y: point.y,
    angle: random() * Math.PI * 2,
    speed: 45 + random() * 35,
    state: 'walk',
    color: pick(random, PED_COLORS),
    axis: road.axis,
    dir: random() < 0.5 ? 1 : -1,
    timer: 2 + random() * 6,
    vx: 0, vy: 0,
  };
  state.peds.push(ped);
  return ped;
}

/** The nearest car ahead of `car` on its road, within 90 px, or null. */
function carAhead(state, car) {
  let best = null;
  let bestDist = 90;
  for (const other of state.traffic.concat(state.cars, state.cops)) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < bestDist && side < 22) {
      bestDist = ahead;
      best = other;
    }
  }
  return best;
}

function stepTrafficCar(state, car, dt) {
  const random = state.random;
  if (car.hurtCd > 0) car.hurtCd -= dt;
  if (car.stun > 0) {
    // Shoved by the player: coasting clear, not braking to a stop in the way.
    car.stun -= dt;
    car.speed = Math.max(0, car.speed - 60 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    return;
  }
  // At an intersection, sometimes turn onto the crossing road.
  const cross = nearestIntersection(car.x, car.y);
  const atCrossing = Math.hypot(car.x - cross.x, car.y - cross.y) < 34;
  if (atCrossing && random() < 0.012) {
    if (car.axis === 'v') {
      car.axis = 'h';
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? 0 : Math.PI;
      car.y = cross.y + car.dir * 24;
      car.x = cross.x;
    } else {
      car.axis = 'v';
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x = cross.x + car.dir * 24;
      car.y = cross.y;
    }
  }
  // Ease toward cruise speed, slower when something is ahead.
  const ahead = carAhead(state, car);
  const target = ahead ? 0 : car.cruise;
  car.speed += Math.max(-260 * dt, Math.min(160 * dt, target - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const resolved = collideCircle(state.city, car.x, car.y, 17);
  if (resolved.hit) {
    car.x = resolved.x;
    car.y = resolved.y;
    car.speed *= 0.5;
  }
  // Too far from the action: respawn near the player instead of driving on forever.
  if (Math.hypot(car.x - state.player.x, car.y - state.player.y) > 1300) {
    const index = state.traffic.indexOf(car);
    if (index !== -1) state.traffic.splice(index, 1);
    spawnTrafficCar(state, true);
  }
}

function stepPedestrian(state, ped, dt) {
  const random = state.random;
  if (ped.state === 'down') {
    ped.timer -= dt;
    ped.x += (ped.vx || 0) * dt;
    ped.y += (ped.vy || 0) * dt;
    ped.vx = (ped.vx || 0) * 0.9;
    ped.vy = (ped.vy || 0) * 0.9;
    if (ped.timer <= 0) {
      const index = state.peds.indexOf(ped);
      if (index !== -1) state.peds.splice(index, 1);
      spawnPedestrian(state, true);
    }
    return;
  }
  // Danger near: a gunshot, a speeding car, or the player sprinting at them.
  const danger = state.danger;
  if (ped.state !== 'flee' && danger && Math.hypot(ped.x - danger.x, ped.y - danger.y) < 260) {
    ped.state = 'flee';
    ped.timer = 2.5 + random() * 2;
    ped.angle = Math.atan2(ped.y - danger.y, ped.x - danger.x);
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const speed = 190;
    const resolved = collideCircle(state.city, ped.x + Math.cos(ped.angle) * speed * dt, ped.y + Math.sin(ped.angle) * speed * dt, 12);
    ped.x = resolved.x;
    ped.y = resolved.y;
    if (ped.timer <= 0) ped.state = 'walk';
    return;
  }
  // Stroll along the sidewalk; at an intersection, sometimes change direction.
  ped.timer -= dt;
  if (ped.timer <= 0) {
    ped.timer = 3 + random() * 6;
    if (random() < 0.35) ped.dir *= -1;
    const road = nearestRoad(ped.x, ped.y);
    ped.axis = road.axis;
  }
  const step = ped.speed * ped.dir * dt;
  let nx = ped.x;
  let ny = ped.y;
  if (ped.axis === 'v') ny += step;
  else nx += step;
  if (!onRoad(nx, ny)) {
    const resolved = collideCircle(state.city, nx, ny, 12);
    ped.x = resolved.x;
    ped.y = resolved.y;
  } else {
    // Drifted onto the asphalt: step back onto the kerb.
    ped.dir *= -1;
  }
  // Too far away: recycle near the player.
  if (Math.hypot(ped.x - state.player.x, ped.y - state.player.y) > 1200) {
    const index = state.peds.indexOf(ped);
    if (index !== -1) state.peds.splice(index, 1);
    spawnPedestrian(state, true);
  }
}

/** Advance traffic and pedestrians one step; keep the streets populated. */
export function stepCityLife(state, dt) {
  for (let i = state.traffic.length - 1; i >= 0; i -= 1) stepTrafficCar(state, state.traffic[i], dt);
  for (let i = state.peds.length - 1; i >= 0; i -= 1) stepPedestrian(state, state.peds[i], dt);
  if (state.traffic.length < TRAFFIC_COUNT) spawnTrafficCar(state, true);
  if (state.peds.length < PED_COUNT) spawnPedestrian(state, true);
}
