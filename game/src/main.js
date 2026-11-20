// SOLMAR HEAT — boot and the one loop. The simulation lives in createGame()
// and takes a plain `control` object each step (movement, driving, mouse,
// one-shot actions), so the live loop and the screenshot staging drive the
// exact same rules. The game moves between four screens: title, play, paused
// and game over. ?seed=N fixes the city; ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { CAR, LANDMARKS, MONEY, SAVE_KEY, STEP, VIEW, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createSound } from './audio.js';
import { stepPlayer, toggleCar } from './player.js';
import { createCar, resolveCarCollisions, stepPlayerCar } from './vehicles.js';
import { spawnCityLife, stepCityLife } from './traffic.js';
import { respawn, stepPolice } from './police.js';
import { stepCombat } from './combat.js';
import { atMissionStart, createMissionState, startMission, stepMissions } from './missions.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, TITLE_BUTTONS } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const SAVE_INTERVAL = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

/** Build a fresh game: city, player, cars, police, missions, camera, stats. */
export function createGame(gameSeed) {
  const random = createRandom(gameSeed);
  const city = createCity(random);
  const state = {
    seed: gameSeed,
    time: 0,
    random,
    city,
    player: {
      x: LANDMARKS.ricoGarage.x, y: LANDMARKS.ricoGarage.y + 60,
      angle: -Math.PI / 2, aimAngle: 0,
      hp: 100, armor: 0, money: MONEY.start,
      inCar: null, fireCd: 0, meleeCd: 0, meleeSwing: 0, invuln: 0,
      wanted: 0, lastCrime: -999, crimeCd: 0, decayTimer: 0, bustTimer: 0,
      dead: false, deadReason: null,
    },
    cars: city.parkedCars.map((parked) => createCar(parked.x, parked.y, parked.angle, parked.kind, parked.color)),
    traffic: [],
    cops: [],
    footCops: [],
    peds: [],
    enemies: [],
    bullets: [],
    particles: [],
    skids: [],
    drops: [],
    mission: createMissionState(),
    camera: { x: 0, y: 0, shake: 0 },
    stats: { kills: 0, carsStolen: 0, stashes: 0, missions: 0, shots: 0 },
    banner: null,
    danger: null,
    repairCd: 0,
    lastSirenStars: 0,
    saveTimer: 0,
  };
  spawnCityLife(state);
  state.camera.x = Math.max(0, Math.min(state.player.x - VIEW.width / 2, WORLD.width - VIEW.width));
  state.camera.y = Math.max(0, Math.min(state.player.y - VIEW.height / 2, WORLD.height - VIEW.height));

  /** One fixed step of the whole simulation. */
  function step(dt, control, sound) {
    state.time += dt;
    const player = state.player;
    const actions = control.actions || 0;

    // E at Rico's Garage starts the next mission; E anywhere else gets in/out of a car.
    // The press that starts a mission is spent: it must not also complete a
    // pickup step standing at the same spot.
    let stepActions = actions;
    if (!state.mission.active && (actions & ACTION_ENTER) && atMissionStart(state)) {
      startMission(state, sound);
      stepActions = actions & ~ACTION_ENTER;
    } else if (actions & ACTION_ENTER) {
      toggleCar(state, sound);
    }

    if (player.inCar) stepPlayerCar(state, dt, control, sound);
    else stepPlayer(state, dt, control, sound);
    stepMissions(state, dt, stepActions, sound);
    stepCombat(state, dt, sound);
    stepCityLife(state, dt);
    stepPolice(state, dt, sound);
    resolveCarCollisions(state, sound);

    // The auto-repair garage: drive in, pay, drive out fixed.
    if (state.repairCd > 0) state.repairCd -= dt;
    if (player.inCar && state.repairCd <= 0 && player.inCar.hp < CAR.maxHp && player.money >= MONEY.repairCost
      && Math.hypot(player.x - LANDMARKS.repairGarage.x, player.y - LANDMARKS.repairGarage.y) < 80) {
      player.money -= MONEY.repairCost;
      player.inCar.hp = CAR.maxHp;
      state.repairCd = 5;
      state.banner = { text: 'CAR REPAIRED', sub: `-$${MONEY.repairCost} at the Auto Repair`, until: state.time + 2.5 };
      if (sound) sound.pickup();
    }

    // Particles and skid marks age out.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      particle.life -= dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    if (state.danger && state.time > state.danger.until) state.danger = null;

    // Siren follows the wanted level, changing only when the level changes.
    if (sound && player.wanted !== state.lastSirenStars) {
      state.lastSirenStars = player.wanted;
      sound.siren(player.wanted);
    }
    if (!player.inCar && sound) sound.engine(0);

    // Camera follows the player, with a little look-ahead while driving.
    const lookX = player.inCar ? Math.cos(player.inCar.angle) * 90 : 0;
    const lookY = player.inCar ? Math.sin(player.inCar.angle) * 90 : 0;
    const targetX = Math.max(0, Math.min(player.x + lookX - VIEW.width / 2, WORLD.width - VIEW.width));
    const targetY = Math.max(0, Math.min(player.y + lookY - VIEW.height / 2, WORLD.height - VIEW.height));
    const blend = Math.min(1, 6 * dt);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;
    state.camera.shake = Math.max(0, state.camera.shake - 30 * dt);
  }

  return { state, step };
}

/** Save progress to this browser (money, health, position, missions, pickups). */
export function saveGame(game) {
  try {
    const state = game.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      hp: state.player.hp,
      armor: state.player.armor,
      x: state.player.x,
      y: state.player.y,
      missionIndex: state.mission.index,
      stats: state.stats,
      stashes: state.city.stashes.map((stash) => stash.taken),
      pickups: state.city.pickups.map((pickup) => pickup.taken),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Load a save into a fresh game; returns false when there is none. */
export function loadGame(game) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const state = game.state;
    state.player.money = data.money ?? MONEY.start;
    state.player.hp = data.hp ?? 100;
    state.player.armor = data.armor ?? 0;
    state.player.x = data.x ?? LANDMARKS.ricoGarage.x;
    state.player.y = data.y ?? LANDMARKS.ricoGarage.y + 60;
    state.mission.index = data.missionIndex ?? 0;
    Object.assign(state.stats, data.stats ?? {});
    if (Array.isArray(data.stashes)) {
      data.stashes.forEach((taken, index) => { if (state.city.stashes[index]) state.city.stashes[index].taken = taken; });
    }
    if (Array.isArray(data.pickups)) {
      data.pickups.forEach((taken, index) => { if (state.city.pickups[index]) state.city.pickups[index].taken = taken; });
    }
    state.camera.x = Math.max(0, Math.min(state.player.x - VIEW.width / 2, WORLD.width - VIEW.width));
    state.camera.y = Math.max(0, Math.min(state.player.y - VIEW.height / 2, WORLD.height - VIEW.height));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function runShot(name) {
  const game = createGame(seed);
  const scene = stageShot(name, game);
  const renderer = createRenderer(document.getElementById('game'));
  window.__game = game;
  let painted = 0;
  function paint() {
    renderer.draw(game.state, scene.screen, { hasSave: false, selected: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const sound = createSound();
  let game = createGame(seed);
  let screen = SCREEN_TITLE;
  let selected = 0;
  let accumulator = 0;
  let last = performance.now();
  let lastTitleNav = 0;

  window.__game = game;

  function announce(message) {
    status.textContent = message;
  }

  function titleOptions() {
    return hasSave() ? ['new', 'continue'] : ['new'];
  }

  function startSelected() {
    sound.unlock();
    game = createGame(seed);
    window.__game = game;
    if (titleOptions()[selected] === 'continue') loadGame(game);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Follow the gold marker to Rico\'s Garage.');
  }

  function handleTitle(actions, now) {
    const options = titleOptions();
    const move = input.move();
    if (move.y !== 0 && now - lastTitleNav > 0.25) {
      lastTitleNav = now;
      selected = (selected + (move.y > 0 ? 1 : -1) + options.length) % options.length;
    }
    if (input.takeClick()) {
      const logical = renderer.toLogical(input.mouse().x, input.mouse().y);
      for (let index = 0; index < TITLE_BUTTONS.length; index += 1) {
        const button = TITLE_BUTTONS[index];
        if (button.id === 'continue' && !hasSave()) continue;
        if (logical.x >= button.x && logical.x <= button.x + button.w && logical.y >= button.y && logical.y <= button.y + button.h) {
          selected = options.indexOf(button.id);
          startSelected();
          return;
        }
      }
    }
    if (actions & ACTION_CONFIRM) startSelected();
  }

  function step() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) sound.toggleMute();
    if (screen === SCREEN_TITLE) {
      handleTitle(actions, performance.now());
      // The city stays alive behind the menu.
      game.step(STEP, {
        move: { x: 0, y: 0 }, running: false,
        drive: { throttle: 0, steer: 0, handbrake: false },
        mouse: { x: 640, y: 360, down: false }, actions: 0,
        aimWorld: (x, y) => ({ x: game.state.player.x + 100, y: game.state.player.y }),
      }, null);
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        saveGame(game);
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) return;
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        respawn(game.state);
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
      return;
    }
    // SCREEN_PLAY
    const control = {
      move: input.move(),
      running: input.running(),
      drive: input.drive(),
      mouse: input.mouse(),
      actions,
      aimWorld: (x, y) => renderer.toWorld(x, y, game.state.camera),
    };
    game.step(STEP, control, sound);
    game.state.saveTimer += STEP;
    if (game.state.saveTimer >= SAVE_INTERVAL) {
      game.state.saveTimer = 0;
      saveGame(game);
    }
    if (game.state.player.dead) {
      screen = SCREEN_OVER;
      saveGame(game);
      announce(game.state.player.deadReason === 'busted' ? 'Busted.' : 'Wasted.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Step in every screen: the title keeps the city alive behind the menu, and
    // the paused and game-over screens still need to read the keys that leave them.
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
    }
    renderer.draw(game.state, screen, { hasSave: hasSave(), selected });
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(game);
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
