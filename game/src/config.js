// SOLMAR HEAT — every tuning number, colour and city constant in one place.
// The world is a fixed 3600 x 2600 top-down city; the renderer scales a 1280x720
// view of it to the window, so no rule below depends on the screen size.

export const WORLD = { width: 3600, height: 2600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Logical view size the camera frames (the canvas is scaled to fit the window). */
export const VIEW = { width: 1280, height: 720 };

/** Vertical road centre x positions and horizontal road centre y positions (road width 110). */
export const ROADS_V = [360, 840, 1320, 1800, 2280, 2760];
export const ROADS_H = [300, 700, 1100, 1500, 1900, 2250];
export const ROAD_W = 110;

/** Beach strip: sand from BEACH_X to WATER_X, open water east of WATER_X. */
export const BEACH_X = 3050;
export const WATER_X = 3350;

/** Landmarks, in world coordinates. */
export const LANDMARKS = {
  ricoGarage: { x: 600, y: 500, label: "Rico's Garage" },
  safehouse: { x: 620, y: 1680, label: 'Safehouse' },
  hospital: { x: 1080, y: 1680, label: 'Solmar General' },
  bank: { x: 1560, y: 900, label: 'Solmar National Bank' },
  marina: { x: 3150, y: 2050, label: 'Marina' },
  docks: { x: 3150, y: 480, label: 'North Docks' },
  policeStation: { x: 2040, y: 1300, label: 'Solmar PD' },
  repairGarage: { x: 2520, y: 900, label: 'Auto Repair' },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 250,
  runSpeed: 330,
  maxHp: 100,
  maxArmor: 100,
  pistolDamage: 1,
  pistolCooldown: 0.22,
  bulletSpeed: 950,
  meleeRange: 62,
  meleeDamage: 2,
  meleeCooldown: 0.45,
};

export const CAR = {
  length: 52,
  width: 26,
  radius: 17,
  maxSpeed: 460,
  maxReverse: 170,
  accel: 320,
  brake: 520,
  steer: 2.6,
  grip: 6.5,
  maxHp: 100,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const ENEMY_HP = 3;

export const WANTED = {
  maxStars: 5,
  decayDelay: 12,
  decayInterval: 8,
  copCarPerStar: 2,
  copFootPerStar: 1,
  bustDistance: 30,
  bustTime: 1.4,
};

export const MONEY = {
  start: 500,
  bustFine: 250,
  wasteFine: 300,
  repairCost: 150,
  stashValue: 100,
  stashCount: 10,
};

export const SAVE_KEY = 'solmar-heat.save.v1';

export const PALETTE = {
  backdrop: '#1c1420',
  grass: '#8fae6b',
  grassDark: '#7d9d5c',
  sand: '#ecd9a0',
  sandDark: '#e0c98c',
  water: '#2f7f9e',
  waterDeep: '#256b8c',
  road: '#3d4149',
  roadEdge: '#33373f',
  lane: '#e8d98a',
  sidewalk: '#b3a184',
  sidewalkEdge: '#9c8c72',
  buildingShadow: 'rgba(60,30,20,0.35)',
  player: '#2ec4b6',
  playerDark: '#1d8a80',
  cop: '#2f6fd0',
  copCar: '#1e4fa0',
  enemy: '#c94f4f',
  money: '#7ddc7d',
  health: '#e5534b',
  armor: '#5aa9e6',
  star: '#ffd23f',
  text: '#fff6e8',
  muted: '#d8c9ae',
  panel: 'rgba(24,16,28,0.88)',
  panelEdge: '#ff9a5c',
  marker: '#ffd23f',
  mission: '#ff9a5c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
