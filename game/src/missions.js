// The story: Danny Vega, ex-wheelman back in Solmar after two years away, works
// for Rico Marlow against Vic Kessler's Harbor Kings. Six missions, each a list
// of steps; the state machine below runs one step at a time, tracks timers and
// kill counts, and pays out on completion. Missions start at Rico's Garage
// (press E at the marker) and can be retried after a failure.

import { LANDMARKS } from './config.js';
import { addWanted, clearWanted } from './police.js';
import { spawnEnemies } from './combat.js';

const G = LANDMARKS.ricoGarage;
const S = LANDMARKS.safehouse;
const B = LANDMARKS.bank;
const M = LANDMARKS.marina;
const D = LANDMARKS.docks;

/**
 * Every mission: a name, a briefing from Rico, a reward, and steps.
 * Step types: enterCar, reach, timedReach, pickup, setWanted, loseWanted,
 * kill, escape. `noHeat` means shooting during the mission draws no police.
 */
export const MISSIONS = [
  {
    name: 'Back in the Game',
    briefing: 'Rico: "Danny! You are back. Steal a car — any car — and bring it to my garage."',
    reward: 400,
    steps: [
      { type: 'enterCar', text: 'Steal a car — any car will do' },
      { type: 'reach', x: G.x, y: G.y, r: 100, text: "Drive to Rico's Garage" },
    ],
  },
  {
    name: 'Sunset Run',
    briefing: 'Rico: "A package needs to reach the Marina before the sun sets. Drive fast, drive clean."',
    reward: 800,
    steps: [
      { type: 'pickup', x: G.x, y: G.y, r: 80, text: 'Pick up the package at the garage (E)' },
      { type: 'timedReach', x: M.x, y: M.y, r: 100, time: 100, text: 'Deliver to the Marina — beat the clock' },
    ],
  },
  {
    name: 'Heat Check',
    briefing: 'Rico: "The cops are watching the garage. Make some noise, then vanish. Lose them."',
    reward: 600,
    steps: [
      { type: 'setWanted', stars: 2, text: 'The cops are onto you' },
      { type: 'loseWanted', time: 150, text: 'Lose the cops — stay out of sight' },
    ],
  },
  {
    name: 'The Pickup',
    briefing: 'Rico: "The goods are waiting at the North Docks. Bring them back — the Kings will be watching."',
    reward: 1200,
    steps: [
      { type: 'reach', x: D.x, y: D.y, r: 100, text: 'Drive to the North Docks' },
      { type: 'pickup', x: D.x, y: D.y, r: 80, text: 'Grab the goods (E)' },
      { type: 'escape', x: G.x, y: G.y, r: 100, stars: 2, text: "Bring the goods back to Rico's Garage" },
    ],
  },
  {
    name: 'Marina Showdown',
    briefing: 'Rico: "Kessler sent his boys to the Marina. End it. No cops on this one — I paid them off."',
    reward: 1500,
    noHeat: true,
    steps: [
      { type: 'reach', x: M.x, y: M.y, r: 130, text: 'Get to the Marina' },
      { type: 'kill', x: M.x, y: M.y, r: 300, count: 6, text: 'Take out the Harbor Kings (0/6)' },
    ],
  },
  {
    name: 'The Big Score',
    briefing: 'Rico: "Solmar National Bank. In, out, gone. Four stars of heat — reach the Safehouse and we are rich."',
    reward: 5000,
    steps: [
      { type: 'reach', x: B.x, y: B.y, r: 100, text: 'Drive to Solmar National Bank' },
      { type: 'pickup', x: B.x, y: B.y, r: 80, text: 'Grab the cash (E)' },
      { type: 'escape', x: S.x, y: S.y, r: 110, stars: 4, text: 'Escape to the Safehouse' },
    ],
  },
];

/** Fresh mission state: nothing active, first mission offered. */
export function createMissionState() {
  return {
    index: 0,
    active: false,
    step: 0,
    timer: 0,
    kills: 0,
    noHeat: false,
    done: false,
    failed: false,
  };
}

/** The mission currently on offer (null once the story is finished). */
export function nextMission(state) {
  if (state.mission.index >= MISSIONS.length) return null;
  return MISSIONS[state.mission.index];
}

/** Is the player standing at Rico's Garage, where missions start? */
export function atMissionStart(state) {
  const player = state.player;
  return !state.mission.active && nextMission(state) !== null
    && Math.hypot(player.x - G.x, player.y - G.y) < 110;
}

/** Start the next mission: briefing banner, first step armed. */
export function startMission(state, sound) {
  const mission = nextMission(state);
  if (!mission) return;
  state.mission.active = true;
  state.mission.step = 0;
  state.mission.kills = 0;
  state.mission.noHeat = Boolean(mission.noHeat);
  state.mission.done = false;
  state.mission.failed = false;
  armStep(state);
  state.banner = { text: `MISSION: ${mission.name}`, sub: mission.briefing, until: state.time + 5 };
  if (sound) sound.missionStart();
}

/** The objective marker the world and the minimap draw, or null. */
export function missionMarker(state) {
  if (state.mission.active) {
    const mission = MISSIONS[state.mission.index];
    const step = mission.steps[state.mission.step];
    if (!step) return null;
    if (step.x !== undefined) return { x: step.x, y: step.y, text: step.text };
    if (step.type === 'enterCar') return null;
    return null;
  }
  const mission = nextMission(state);
  if (!mission) return null;
  return { x: G.x, y: G.y, text: `Start mission: ${mission.name}`, start: true };
}

/** The objective line the HUD tracker shows, or null when free-roaming. */
export function missionObjective(state) {
  if (!state.mission.active) return null;
  const mission = MISSIONS[state.mission.index];
  const step = mission.steps[state.mission.step];
  if (!step) return null;
  let text = step.text;
  if (step.type === 'kill') text = `Take out the Harbor Kings (${state.mission.kills}/${step.count})`;
  return {
    name: mission.name,
    text,
    time: step.time !== undefined ? state.mission.timer : null,
  };
}

function armStep(state) {
  const mission = MISSIONS[state.mission.index];
  const step = mission.steps[state.mission.step];
  if (!step) return;
  state.mission.timer = step.time ?? 0;
  if (step.type === 'kill') {
    state.mission.kills = 0;
    spawnEnemies(state, step.x, step.y, step.count);
  }
  if (step.type === 'setWanted') addWanted(state, step.stars);
  if (step.type === 'escape') addWanted(state, step.stars);
}

function completeStep(state, sound) {
  const mission = MISSIONS[state.mission.index];
  state.mission.step += 1;
  if (state.mission.step >= mission.steps.length) {
    completeMission(state, sound);
    return;
  }
  armStep(state);
  if (sound) sound.objective();
}

function completeMission(state, sound) {
  const mission = MISSIONS[state.mission.index];
  state.player.money += mission.reward;
  state.mission.active = false;
  state.mission.done = true;
  state.mission.noHeat = false;
  state.mission.index += 1;
  state.stats.missions += 1;
  state.enemies = [];
  if (state.mission.index >= MISSIONS.length) {
    state.banner = { text: 'STORY COMPLETE', sub: `All six missions done — Solmar is yours. +$${mission.reward}`, until: state.time + 6 };
  } else {
    state.banner = { text: 'MISSION COMPLETE', sub: `${mission.name} — +$${mission.reward}`, until: state.time + 4 };
  }
  if (sound) sound.missionComplete();
}

function failMission(state, sound, reason) {
  const mission = MISSIONS[state.mission.index];
  state.mission.active = false;
  state.mission.failed = true;
  state.mission.noHeat = false;
  state.enemies = [];
  clearWanted(state);
  state.banner = { text: 'MISSION FAILED', sub: `${mission.name} — ${reason}`, until: state.time + 4 };
  if (sound) sound.missionFail();
}

/**
 * One step of the mission state machine. `actions` carries the frame's one-shot
 * flags (E confirms a pickup step); `near` is true when the player is inside
 * the current step's radius, so the HUD can prompt.
 */
export function stepMissions(state, dt, actions, sound) {
  const mission = state.mission;
  if (!mission.active) return;
  const def = MISSIONS[mission.index];
  const step = def.steps[mission.step];
  if (!step) return;
  const player = state.player;
  const nearTarget = step.x !== undefined && Math.hypot(player.x - step.x, player.y - step.y) < step.r;

  if (step.time !== undefined) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      failMission(state, sound, 'Out of time');
      return;
    }
  }

  switch (step.type) {
    case 'enterCar':
      if (player.inCar) completeStep(state, sound);
      break;
    case 'reach':
    case 'timedReach':
      if (nearTarget) completeStep(state, sound);
      break;
    case 'pickup':
      if (nearTarget && (actions & 4)) { // ACTION_ENTER
        completeStep(state, sound);
        if (sound) sound.pickup();
      }
      break;
    case 'setWanted':
      completeStep(state, sound);
      break;
    case 'loseWanted':
      if (player.wanted === 0) completeStep(state, sound);
      break;
    case 'kill':
      if (mission.kills >= step.count) completeStep(state, sound);
      break;
    case 'escape':
      if (nearTarget) {
        clearWanted(state);
        completeStep(state, sound);
      }
      break;
    default:
      break;
  }
}
