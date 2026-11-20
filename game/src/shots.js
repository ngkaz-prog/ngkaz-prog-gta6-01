// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh game for a fixed number of steps, steered
// by a simple autopilot that drives toward waypoints on the road grid, so the
// frame is what real play looks like and the same seed always gives the same
// frame. ?shot=start|drive|chase|mission with &seed=N stages that scene.

import { LANDMARKS, STEP } from './config.js';
import { nearestRoad } from './world.js';
import { startMission } from './missions.js';
import { createCar } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const DRIVE_SECONDS = 3.5;
const CHASE_SECONDS = 4.5;
const MISSION_SECONDS = 8;

/** Steering toward (tx, ty) from the car Danny is driving. */
function autopilotDrive(state, tx, ty) {
  const car = state.player.inCar;
  if (!car) return { throttle: 0, steer: 0, handbrake: false };
  let targetX = tx;
  let targetY = ty;
  // A car right ahead, going the same way: overtake on the far side of the
  // road, anchored to the road centre so the target never drifts off the
  // asphalt with the car. Oncoming cars are not an obstacle to pass.
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  let blocked = false;
  for (const other of state.traffic.concat(state.cops)) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * forwardX + dy * forwardY;
    const side = Math.abs(-dx * forwardY + dy * forwardX);
    const sameWay = Math.cos(other.angle) * forwardX + Math.sin(other.angle) * forwardY > 0.5;
    if (sameWay && ahead > 0 && ahead < 150 && side < 32) {
      blocked = true;
      break;
    }
  }
  if (blocked) {
    const road = nearestRoad(car.x, car.y);
    if (road.axis === 'v') {
      const north = ty < car.y;
      targetX = road.at + (north ? 34 : -34);
      targetY = car.y + (north ? -200 : 200);
    } else {
      const east = tx > car.x;
      targetX = car.x + (east ? 200 : -200);
      targetY = road.at + (east ? 34 : -34);
    }
  }
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const dist = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Brake for a sharp turn: at full speed the turn radius would carry the car
  // off the road and into the buildings on the corner.
  const absDiff = Math.abs(diff);
  const throttle = absDiff > 0.9 ? -0.6 : absDiff > 0.5 ? 0.3 : (dist > 80 ? 1 : 0.5);
  return {
    throttle,
    steer: Math.max(-1, Math.min(1, diff * 2.2)),
    handbrake: false,
  };
}

function driveControl(state, tx, ty) {
  return {
    move: { x: 0, y: 0 },
    running: false,
    drive: autopilotDrive(state, tx, ty),
    mouse: { x: 640, y: 360, down: false },
    actions: 0,
    aimWorld: (x, y) => ({ x: state.player.x + 100, y: state.player.y }),
  };
}

function idleControl(state) {
  return {
    move: { x: 0, y: 0 },
    running: false,
    drive: { throttle: 0, steer: 0, handbrake: false },
    mouse: { x: 640, y: 360, down: false },
    actions: 0,
    aimWorld: (x, y) => ({ x: state.player.x + 100, y: state.player.y }),
  };
}

/** Put Danny in a fresh car at (x, y), facing `angle`. */
function putPlayerInCar(state, x, y, angle, kind, color) {
  const car = createCar(x, y, angle, kind || 'sport', color || '#e88a4f');
  car.parked = false;
  car.isPlayer = true;
  state.cars.push(car);
  state.player.inCar = car;
  state.player.x = x;
  state.player.y = y;
  return car;
}

/** Drive the waypoints in order for `seconds`, one fixed step at a time. */
function followWaypoints(game, waypoints, seconds) {
  let waypoint = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const target = waypoints[Math.min(waypoint, waypoints.length - 1)];
    if (Math.hypot(target.x - game.state.player.x, target.y - game.state.player.y) < 60 && waypoint < waypoints.length - 1) {
      waypoint += 1;
    }
    game.step(STEP, driveControl(game.state, target.x, target.y), null);
  }
}

/** Run the named scene on a fresh game and return the screen to draw over it. */
export function stageShot(name, game) {
  const state = game.state;
  if (name === 'drive') {
    putPlayerInCar(state, 1800, 2250, -Math.PI / 2);
    // Traffic on the parallel roads, in the frame but never in the player's lane.
    const ahead1 = createCar(1320 + 24, 1500, -Math.PI / 2, 'sedan', '#4f7dc9');
    ahead1.parked = false;
    ahead1.speed = 200;
    ahead1.cruise = 200;
    state.traffic.push(ahead1);
    const ahead2 = createCar(2280 - 24, 1300, -Math.PI / 2, 'van', '#e8c94c');
    ahead2.parked = false;
    ahead2.speed = 170;
    ahead2.cruise = 170;
    state.traffic.push(ahead2);
    followWaypoints(game, [{ x: 1800, y: 400 }], DRIVE_SECONDS);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    putPlayerInCar(state, 1800, 2250, -Math.PI / 2);
    state.player.wanted = 3;
    state.player.lastCrime = 0;
    state.player.decayTimer = 0;
    followWaypoints(game, [{ x: 1800, y: 400 }], CHASE_SECONDS);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Mission 2, "Sunset Run": pick the package up at the garage, then drive.
    state.mission.index = 1;
    startMission(state, null);
    game.step(STEP, { ...idleControl(state), actions: 4 }, null);
    putPlayerInCar(state, 840, 560, Math.PI / 2, 'sedan', '#4f7dc9');
    followWaypoints(game, [
      { x: 840, y: 1900 },
      { x: 950, y: 1900 },
      { x: 1100, y: 1900 },
      { x: 2760, y: 1900 },
      { x: 3050, y: 2050 },
    ], MISSION_SECONDS);
    return { screen: SCREEN_PLAY };
  }
  // Default: the title screen over a living city.
  for (let i = 0; i < Math.floor(START_SECONDS / STEP); i += 1) {
    game.step(STEP, idleControl(state), null);
  }
  return { screen: SCREEN_TITLE };
}

export { LANDMARKS };
