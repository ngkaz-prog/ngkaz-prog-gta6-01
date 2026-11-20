// The city of Solmar itself: a seeded grid of roads, blocks, buildings, palms,
// parked cars and pickups, plus the collision and road helpers every other module
// uses. No drawing and no browser in it — just data and geometry.
//
// Layout: six vertical and six horizontal roads make the grid; the east edge is a
// beach and open water; downtown (taller, glassier blocks) sits in the middle;
// the marina and the north docks hug the beach; Rico's garage, the safehouse,
// the hospital, the bank and the police station are fixed landmarks.

import { BEACH_X, LANDMARKS, MONEY, ROADS_H, ROADS_V, ROAD_W, WATER_X, WORLD } from './config.js';
import { pick, shuffle } from './random.js';

const BUILDING_COLORS = ['#e88ca0', '#f2b880', '#8fc3e8', '#c9a0e8', '#a8d8a0', '#e8e0c8', '#d98a6a', '#7fb8a8'];
const DOWNTOWN_COLORS = ['#6a8fb5', '#5d7ea6', '#7a9cc0', '#4f6f92', '#8aa8c8'];
const ROOF_COLORS = ['#8a6f5c', '#6b7a8a', '#a08a6a', '#5c6b5c'];

/** True when the point is on a road (asphalt), including the beach boardwalk strip. */
export function onRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
  for (const roadX of ROADS_V) if (Math.abs(x - roadX) <= ROAD_W / 2) return true;
  for (const roadY of ROADS_H) if (Math.abs(y - roadY) <= ROAD_W / 2) return true;
  return false;
}

/** True when the point is on a sidewalk (the ring just outside a road). */
export function onSidewalk(x, y) {
  if (onRoad(x, y)) return false;
  for (const roadX of ROADS_V) if (Math.abs(x - roadX) <= ROAD_W / 2 + 22) return true;
  for (const roadY of ROADS_H) if (Math.abs(y - roadY) <= ROAD_W / 2 + 22) return true;
  return false;
}

function nearestRoadY(y) {
  let best = ROADS_H[0];
  for (const roadY of ROADS_H) if (Math.abs(y - roadY) < Math.abs(y - best)) best = roadY;
  return best;
}

/** The nearest road centre to a point, and which axis it runs on. */
export function nearestRoad(x, y) {
  let bestV = ROADS_V[0];
  for (const roadX of ROADS_V) if (Math.abs(x - roadX) < Math.abs(x - bestV)) bestV = roadX;
  let bestH = ROADS_H[0];
  for (const roadY of ROADS_H) if (Math.abs(y - roadY) < Math.abs(y - bestH)) bestH = roadY;
  if (Math.abs(x - bestV) <= Math.abs(y - bestH)) return { axis: 'v', at: bestV };
  return { axis: 'h', at: bestH };
}

/** A point on a road near (x, y): the closest intersection, snapped onto the road. */
export function nearestIntersection(x, y) {
  const road = nearestRoad(x, y);
  if (road.axis === 'v') return { x: road.at, y: nearestRoadY(y) };
  const bestV = ROADS_V[0];
  let bx = bestV;
  for (const roadX of ROADS_V) if (Math.abs(x - roadX) < Math.abs(x - bx)) bx = roadX;
  return { x: bx, y: road.at };
}

function circleHitsRect(x, y, radius, rect) {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Push a circle out of every building it overlaps and out of the world bounds and
 * the water. Returns true when anything was hit, for damage and sound.
 */
export function collideCircle(city, x, y, radius) {
  let hit = false;
  for (const building of city.buildings) {
    if (!circleHitsRect(x, y, radius, building)) continue;
    hit = true;
    const nearestX = Math.max(building.x, Math.min(x, building.x + building.w));
    const nearestY = Math.max(building.y, Math.min(y, building.y + building.h));
    let dx = x - nearestX;
    let dy = y - nearestY;
    if (dx === 0 && dy === 0) {
      // Centre inside the block: push out along the shortest side.
      const left = x - building.x;
      const right = building.x + building.w - x;
      const top = y - building.y;
      const bottom = building.y + building.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) dx = -1;
      else if (min === right) dx = 1;
      else if (min === top) dy = -1;
      else dy = 1;
    }
    const length = Math.hypot(dx, dy) || 1;
    const push = radius - Math.hypot(x - nearestX, y - nearestY) + 0.5;
    x += (dx / length) * push;
    y += (dy / length) * push;
  }
  if (x < 24) { x = 24; hit = true; }
  if (y < 24) { y = 24; hit = true; }
  if (x > WORLD.width - 24) { x = WORLD.width - 24; hit = true; }
  if (y > WORLD.height - 24) { y = WORLD.height - 24; hit = true; }
  if (x > WATER_X - 10) { x = WATER_X - 10; hit = true; }
  return { x, y, hit };
}

/** True when a circle overlaps any building (used to keep spawns out of walls). */
export function insideBuilding(city, x, y, radius) {
  for (const building of city.buildings) {
    if (circleHitsRect(x, y, radius, building)) return true;
  }
  return false;
}

/** A random point on a road, at least `margin` from the world edge. */
export function randomRoadPoint(random, margin = 120) {
  if (random() < 0.5) {
    const roadX = pick(random, ROADS_V);
    return { x: roadX + (random() - 0.5) * (ROAD_W - 50), y: margin + random() * (WORLD.height - margin * 2) };
  }
  const roadY = pick(random, ROADS_H);
  return { x: margin + random() * (WORLD.width - margin * 2), y: roadY + (random() - 0.5) * (ROAD_W - 50) };
}

/** A random sidewalk point near (cx, cy): used to scatter pedestrians around the player. */
export function randomSidewalkPoint(random, cx, cy) {
  for (let tries = 0; tries < 20; tries += 1) {
    const road = nearestRoad(cx + (random() - 0.5) * 500, cy + (random() - 0.5) * 500);
    const along = (random() < 0.5 ? pick(random, ROADS_H) : pick(random, ROADS_V)) + (random() - 0.5) * 700;
    const offset = (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 12 + random() * 8);
    const point = road.axis === 'v' ? { x: road.at + offset, y: along } : { x: along, y: road.at + offset };
    if (point.x > 30 && point.y > 30 && point.x < BEACH_X - 10 && point.y < WORLD.height - 30) return point;
  }
  return { x: cx + 80, y: cy };
}

/** Build the whole city from a seed: buildings, palms, parked cars, stashes, pickups. */
export function createCity(random) {
  const buildings = [];
  const palms = [];
  const parkedCars = [];
  const stashes = [];
  const pickups = [];

  const blockXs = [0, ...ROADS_V.map((x) => x + ROAD_W / 2), BEACH_X];
  const blockXe = [...ROADS_V.map((x) => x - ROAD_W / 2), BEACH_X, WORLD.width];
  const blockYs = [0, ...ROADS_H.map((y) => y + ROAD_W / 2)];
  const blockYe = [...ROADS_H.map((y) => y - ROAD_W / 2), WORLD.height];

  // Landmark plazas: no building may cover a landmark, so the garage, the
  // safehouse, the hospital, the bank and the repair shop are always reachable.
  const plazas = Object.values(LANDMARKS).map((place) => ({
    x: place.x - 150, y: place.y - 150, w: 300, h: 300,
  }));
  function onPlaza(x, y, w, h) {
    for (const plaza of plazas) {
      if (x < plaza.x + plaza.w && x + w > plaza.x && y < plaza.y + plaza.h && y + h > plaza.y) return true;
    }
    return false;
  }

  // One or two buildings per block, with a margin for sidewalks and alleys.
  for (let bx = 0; bx < blockXs.length - 1; bx += 1) {
    for (let by = 0; by < blockYs.length - 1; by += 1) {
      const x0 = blockXs[bx] + 26;
      const x1 = blockXe[bx] - 26;
      const y0 = blockYs[by] + 26;
      const y1 = blockYe[by] - 26;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The beach blocks stay open: palms and sand, no buildings.
      if (x0 > BEACH_X - 140) {
        for (let p = 0; p < 3; p += 1) {
          palms.push({ x: x0 + random() * (x1 - x0), y: y0 + random() * (y1 - y0), size: 14 + random() * 8 });
        }
        continue;
      }
      const downtown = x0 > 1100 && x0 < 2400 && y0 > 500 && y0 < 1700;
      const count = downtown ? 1 : (random() < 0.55 ? 2 : 1);
      for (let b = 0; b < count; b += 1) {
        const w = downtown ? 150 + random() * 120 : 90 + random() * 110;
        const h = downtown ? 150 + random() * 120 : 80 + random() * 100;
        const x = x0 + random() * Math.max(1, (x1 - x0) - w);
        const y = y0 + random() * Math.max(1, (y1 - y0) - h);
        if (onPlaza(x, y, w, h)) continue;
        const tall = downtown && random() < 0.6;
        buildings.push({
          x, y, w, h,
          color: downtown ? pick(random, DOWNTOWN_COLORS) : pick(random, BUILDING_COLORS),
          roof: pick(random, ROOF_COLORS),
          tall,
          seed: random(),
        });
      }
      // A palm or two on the block corners, for the sunset look.
      if (random() < 0.5) {
        palms.push({ x: x0 + 14, y: y0 + 14, size: 13 + random() * 6 });
      }
    }
  }

  // Parked cars along the roads, on the kerb.
  const carColors = ['#c94f4f', '#4f7dc9', '#e8c94c', '#7dc94f', '#c9c9c9', '#8a5fc9', '#e88a4f', '#4fc9b8'];
  for (let index = 0; index < 26; index += 1) {
    const point = randomRoadPoint(random);
    const road = nearestRoad(point.x, point.y);
    const angle = road.axis === 'v' ? Math.PI / 2 : 0;
    const offset = (index % 2 === 0 ? -1 : 1) * (ROAD_W / 2 - 16);
    parkedCars.push({
      x: road.axis === 'v' ? road.at + offset : point.x,
      y: road.axis === 'v' ? point.y : road.at + offset,
      angle: angle + (random() < 0.5 ? 0 : Math.PI),
      color: pick(random, carColors),
      kind: pick(random, ['sedan', 'sedan', 'hatch', 'sport', 'van']),
      parked: true,
      hp: 100,
    });
  }

  // Hidden cash stashes, tucked into alleys and corners across the city.
  const stashSpots = shuffle(random, [
    { x: 480, y: 820 }, { x: 1560, y: 420 }, { x: 2400, y: 1620 }, { x: 960, y: 2020 },
    { x: 2040, y: 480 }, { x: 720, y: 1380 }, { x: 2880, y: 1380 }, { x: 1200, y: 2200 },
    { x: 2640, y: 2100 }, { x: 1800, y: 2200 }, { x: 3200, y: 900 }, { x: 3200, y: 1600 },
  ]);
  for (let index = 0; index < MONEY.stashCount; index += 1) {
    stashes.push({ ...stashSpots[index], taken: false });
  }

  // Health at the hospital, armour at the garage and the police station.
  pickups.push({ x: LANDMARKS.hospital.x + 60, y: LANDMARKS.hospital.y, kind: 'health', taken: false });
  pickups.push({ x: LANDMARKS.hospital.x - 60, y: LANDMARKS.hospital.y + 40, kind: 'health', taken: false });
  pickups.push({ x: LANDMARKS.ricoGarage.x + 70, y: LANDMARKS.ricoGarage.y, kind: 'armor', taken: false });
  pickups.push({ x: LANDMARKS.policeStation.x + 70, y: LANDMARKS.policeStation.y, kind: 'armor', taken: false });
  pickups.push({ x: LANDMARKS.safehouse.x + 70, y: LANDMARKS.safehouse.y, kind: 'health', taken: false });

  return { buildings, palms, parkedCars, stashes, pickups };
}
