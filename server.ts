import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  CharacterGender,
  FightInputState,
  FightMatchSnapshot,
  FighterAction,
  GameEventPayload,
  GameMode,
  NetworkFighterSnapshot,
  NetworkRacerSnapshot,
  RaceInputState,
  RaceItemType,
  RaceMatchSnapshot,
  RoomPlayerInfo,
  RoomPhase,
  RoomStatePayload,
} from './src/types/game.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface PlayerSession {
  ws: WebSocket;
  slot: 1 | 2;
  name: string;
  gender: CharacterGender;
  ready: boolean;
  connected: boolean;
  fightInput: FightInputState;
  raceInput: RaceInputState;
}

interface InternalFighter {
  slot: 1 | 2;
  playerName: string;
  gender: CharacterGender;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  isGrounded: boolean;
  action: FighterAction;
  actionTimer: number;
  actionDuration: number;
  health: number;
  maxHealth: number;
  attack: number;
  speed: number;
  superDamage: number;
  superMeter: number;
  isBlocking: boolean;
  hitStun: number;
  roundsWon: number;
  isAI: boolean;
}

interface InternalFightMatch {
  round: number;
  timeLeft: number;
  timeAccum: number;
  matchState: 'COUNTDOWN' | 'FIGHTING' | 'KO' | 'MATCH_OVER';
  countdownText: string;
  phaseTimer: number;
  countdownStep: number;
  winnerSlot: 1 | 2 | null;
  fighters: [InternalFighter, InternalFighter];
}

interface InternalRacer extends NetworkRacerSnapshot {
  vx: number;
  vy: number;
  checkpointsPassed: number;
  lapStartTime: number;
  totalTime: number;
  topSpeed: number;
  acceleration: number;
  handling: number;
}

interface InternalObstacle {
  id: string;
  x: number;
  y: number;
  type: 'banana' | 'rocket';
  vx: number;
  vy: number;
  life: number;
  ownerId: string;
}

interface InternalItemBox {
  x: number;
  y: number;
  active: boolean;
  respawnTimer: number;
}

interface InternalRaceMatch {
  gameState: 'READY' | 'RACING' | 'FINISHED';
  countdown: string;
  phaseTimer: number;
  countdownStep: number;
  elapsedMs: number;
  firstFinishElapsedMs: number | null;
  racers: InternalRacer[];
  obstacles: InternalObstacle[];
  itemBoxes: InternalItemBox[];
}

interface Room {
  code: string;
  phase: RoomPhase;
  gameMode: GameMode;
  isSolo: boolean;
  players: Map<1 | 2, PlayerSession>;
  fightMatch: InternalFightMatch | null;
  raceMatch: InternalRaceMatch | null;
  tickCount: number;
  cpuGender: CharacterGender;
}

interface SocketMeta {
  roomCode: string | null;
  slot: 1 | 2 | null;
}

const DEFAULT_FIGHT_INPUT = (): FightInputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  punch: false,
  kick: false,
  guard: false,
  super: false,
});

const DEFAULT_RACE_INPUT = (): RaceInputState => ({
  gas: false,
  brake: false,
  left: false,
  right: false,
  drift: false,
  useItem: false,
});

const TRACK_CHECKPOINTS = [
  { x: 480, y: 110, r: 85 },
  { x: 740, y: 150, r: 85 },
  { x: 830, y: 300, r: 85 },
  { x: 700, y: 440, r: 85 },
  { x: 480, y: 460, r: 85 },
  { x: 260, y: 440, r: 85 },
  { x: 130, y: 300, r: 85 },
  { x: 220, y: 150, r: 85 },
];

const BOOST_PADS = [
  { x: 480, y: 95, w: 46, h: 34 },
  { x: 480, y: 445, w: 46, h: 34 },
];

const rooms = new Map<string, Room>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function generateRoomCode(): string {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-5);
}

function sendJson(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastEvent(room: Room, event: GameEventPayload) {
  for (const player of room.players.values()) {
    if (player.connected) {
      sendJson(player.ws, { type: 'game_event', payload: event });
    }
  }
}

function broadcastRoomState(room: Room) {
  const playerList: RoomPlayerInfo[] = [];
  const p1 = room.players.get(1);
  const p2 = room.players.get(2);

  if (p1) {
    playerList.push({
      slot: 1,
      name: p1.name,
      gender: p1.gender,
      ready: p1.ready,
      isCPU: false,
      connected: p1.connected,
    });
  }

  if (p2) {
    playerList.push({
      slot: 2,
      name: p2.name,
      gender: p2.gender,
      ready: p2.ready,
      isCPU: false,
      connected: p2.connected,
    });
  } else if (room.isSolo) {
    playerList.push({
      slot: 2,
      name: 'CPU Rival',
      gender: room.cpuGender,
      ready: true,
      isCPU: true,
      connected: true,
    });
  }

  for (const player of room.players.values()) {
    if (player.connected) {
      const payload: RoomStatePayload = {
        roomCode: room.code,
        phase: room.phase,
        gameMode: room.gameMode,
        isSolo: room.isSolo,
        yourSlot: player.slot,
        players: playerList,
      };
      sendJson(player.ws, { type: 'room_state', payload });
    }
  }
}

function createFighterForSlot(
  slot: 1 | 2,
  name: string,
  gender: CharacterGender,
  isAI: boolean,
  roundsWon: number
): InternalFighter {
  const isGirl = gender === 'girl';
  return {
    slot,
    playerName: name,
    gender,
    x: slot === 1 ? 280 : 680,
    y: 440,
    vx: 0,
    vy: 0,
    facing: slot === 1 ? 1 : -1,
    isGrounded: true,
    action: 'idle',
    actionTimer: 0,
    actionDuration: 0,
    health: isGirl ? 105 : 110,
    maxHealth: isGirl ? 105 : 110,
    attack: isGirl ? 13 : 14,
    speed: isGirl ? 12 : 11,
    superDamage: isGirl ? 40 : 38,
    superMeter: 30,
    isBlocking: false,
    hitStun: 0,
    roundsWon,
    isAI,
  };
}

function initFightMatch(room: Room): InternalFightMatch {
  const p1 = room.players.get(1);
  const p2 = room.players.get(2);
  const p1Name = p1?.name || 'Player 1';
  const p1Gender = p1?.gender || 'boy';
  const p2Name = p2 ? p2.name : 'CPU Rival';
  const p2Gender = p2 ? p2.gender : p1Gender === 'boy' ? 'girl' : 'boy';

  const match: InternalFightMatch = {
    round: 1,
    timeLeft: 99,
    timeAccum: 0,
    matchState: 'COUNTDOWN',
    countdownText: 'ROUND 1',
    phaseTimer: 0,
    countdownStep: 0,
    winnerSlot: null,
    fighters: [
      createFighterForSlot(1, p1Name, p1Gender, false, 0),
      createFighterForSlot(2, p2Name, p2Gender, !p2, 0),
    ],
  };

  broadcastEvent(room, { kind: 'countdown', isGo: false });
  return match;
}

function resetFightRound(room: Room, match: InternalFightMatch, nextRound: number) {
  const [f1, f2] = match.fighters;
  match.round = nextRound;
  match.timeLeft = 99;
  match.timeAccum = 0;
  match.matchState = 'COUNTDOWN';
  match.countdownText = `ROUND ${nextRound}`;
  match.phaseTimer = 0;
  match.countdownStep = 0;
  match.fighters = [
    createFighterForSlot(1, f1.playerName, f1.gender, f1.isAI, f1.roundsWon),
    createFighterForSlot(2, f2.playerName, f2.gender, f2.isAI, f2.roundsWon),
  ];
  broadcastEvent(room, { kind: 'countdown', isGo: false });
}

function initRaceMatch(room: Room): InternalRaceMatch {
  const p1 = room.players.get(1);
  const p2 = room.players.get(2);

  const p1Gender = p1?.gender || 'boy';
  const p2Gender = p2 ? p2.gender : p1Gender === 'boy' ? 'girl' : 'boy';

  const makeRacer = (
    id: string,
    slot: 1 | 2 | null,
    playerName: string,
    gender: CharacterGender,
    color: string,
    hairColor: string,
    kartName: string,
    startX: number,
    startY: number,
    rank: number,
    isHuman: boolean
  ): InternalRacer => ({
    id,
    slot,
    playerName,
    gender,
    color,
    hairColor,
    skinColor: '#fbd3b6',
    kartName,
    x: startX,
    y: startY,
    angle: 0,
    speed: 0,
    vx: 0,
    vy: 0,
    isDrifting: false,
    driftCharge: 0,
    boostTimer: 0,
    shieldTimer: 0,
    hasItem: null,
    currentLap: 1,
    checkpointsPassed: 0,
    lapStartTime: 0,
    bestLap: 999,
    totalTime: 0,
    finished: false,
    rank,
    isHuman,
    topSpeed: gender === 'girl' ? 8.7 : 8.6,
    acceleration: gender === 'girl' ? 0.24 : 0.23,
    handling: gender === 'girl' ? 0.074 : 0.07,
  });

  const racers: InternalRacer[] = [
    makeRacer(
      'p1',
      1,
      p1?.name || 'Player 1',
      p1Gender,
      p1Gender === 'girl' ? '#ec4899' : '#3b82f6',
      p1Gender === 'girl' ? '#3e2316' : '#3b200e',
      p1Gender === 'girl' ? 'Floral Cruiser' : 'Sakura Striker',
      400,
      124,
      1,
      true
    ),
    makeRacer(
      p2 ? 'p2' : 'cpu-1',
      p2 ? 2 : null,
      p2 ? p2.name : 'Rival CPU',
      p2Gender,
      p2Gender === 'girl' ? '#8b5cf6' : '#f59e0b',
      p2Gender === 'girl' ? '#3e2316' : '#1e293b',
      p2Gender === 'girl' ? 'Violet Comet' : 'Amber Turbo',
      365,
      96,
      2,
      Boolean(p2)
    ),
    makeRacer('cpu-2', null, 'Ryuuto', 'boy', '#10b981', '#1e293b', 'Jade Buggy', 330, 124, 3, false),
    makeRacer('cpu-3', null, 'Aimi', 'girl', '#06b6d4', '#f43f5e', 'Starlight GT', 295, 96, 4, false),
  ];

  broadcastEvent(room, { kind: 'countdown', isGo: false });

  return {
    gameState: 'READY',
    countdown: '3',
    phaseTimer: 0,
    countdownStep: 0,
    elapsedMs: 0,
    firstFinishElapsedMs: null,
    racers,
    obstacles: [],
    itemBoxes: [
      { x: 350, y: 110, active: true, respawnTimer: 0 },
      { x: 800, y: 220, active: true, respawnTimer: 0 },
      { x: 600, y: 450, active: true, respawnTimer: 0 },
      { x: 150, y: 380, active: true, respawnTimer: 0 },
    ],
  };
}

function processFighterInput(
  room: Room,
  fighter: InternalFighter,
  input: FightInputState
) {
  if (
    fighter.action === 'punch' ||
    fighter.action === 'kick' ||
    fighter.action === 'super' ||
    fighter.action === 'hurt'
  ) {
    return;
  }

  fighter.isBlocking = input.guard;

  if (input.super && fighter.superMeter >= 100) {
    fighter.action = 'super';
    fighter.actionTimer = 0;
    fighter.actionDuration = 0.55;
    fighter.superMeter = 0;
    fighter.vx = fighter.facing * 9;
    broadcastEvent(room, {
      kind: 'fight_super',
      x: fighter.x,
      y: fighter.y - 60,
      color: fighter.gender === 'girl' ? '#f43f5e' : '#60a5fa',
      shake: 14,
    });
    return;
  }

  if (input.punch) {
    fighter.action = 'punch';
    fighter.actionTimer = 0;
    fighter.actionDuration = 0.22;
    fighter.vx = fighter.facing * 2;
    broadcastEvent(room, { kind: 'fight_punch' });
    return;
  }

  if (input.kick) {
    fighter.action = 'kick';
    fighter.actionTimer = 0;
    fighter.actionDuration = 0.28;
    fighter.vx = fighter.facing * 3;
    broadcastEvent(room, { kind: 'fight_kick' });
    return;
  }

  if (input.down && fighter.isGrounded) {
    fighter.action = 'crouch';
    fighter.vx = 0;
    return;
  }

  if (input.up && fighter.isGrounded) {
    fighter.vy = -14.5;
    fighter.isGrounded = false;
    fighter.action = 'jump';
    broadcastEvent(room, { kind: 'fight_jump' });
    return;
  }

  const moveSpeed = fighter.speed * 0.45;
  if (input.left && !input.right) {
    fighter.vx = -moveSpeed;
    fighter.action = fighter.isGrounded ? 'walk' : fighter.action;
  } else if (input.right && !input.left) {
    fighter.vx = moveSpeed;
    fighter.action = fighter.isGrounded ? 'walk' : fighter.action;
  } else {
    fighter.vx = 0;
    if (fighter.isGrounded) {
      fighter.action = fighter.isBlocking ? 'guard' : 'idle';
    }
  }
}

function runFighterAI(room: Room, ai: InternalFighter, target: InternalFighter) {
  if (
    ai.action === 'punch' ||
    ai.action === 'kick' ||
    ai.action === 'super' ||
    ai.action === 'hurt'
  ) {
    return;
  }

  const dist = Math.abs(ai.x - target.x);
  const inRange = dist < 105;

  if (ai.superMeter >= 100 && inRange && Math.random() < 0.08) {
    processFighterInput(room, ai, { ...DEFAULT_FIGHT_INPUT(), super: true });
    return;
  }

  if (
    inRange &&
    (target.action === 'punch' || target.action === 'kick') &&
    Math.random() < 0.04
  ) {
    processFighterInput(room, ai, { ...DEFAULT_FIGHT_INPUT(), guard: true });
    return;
  }

  if (inRange && Math.random() < 0.045) {
    const isPunch = Math.random() > 0.45;
    processFighterInput(room, ai, {
      ...DEFAULT_FIGHT_INPUT(),
      punch: isPunch,
      kick: !isPunch,
    });
    return;
  }

  const moveInput = DEFAULT_FIGHT_INPUT();
  if (dist > 90) {
    if (target.x > ai.x) moveInput.right = true;
    else moveInput.left = true;
  } else if (dist < 55) {
    if (target.x > ai.x) moveInput.left = true;
    else moveInput.right = true;
  }

  if (Math.random() < 0.008 && ai.isGrounded) {
    moveInput.up = true;
  }

  processFighterInput(room, ai, moveInput);
}

function stepFighterPhysics(fighter: InternalFighter, dt: number) {
  const groundY = 440;

  if (fighter.actionDuration > 0) {
    fighter.actionTimer += dt;
    if (fighter.actionTimer >= fighter.actionDuration) {
      fighter.action = fighter.isGrounded ? 'idle' : 'jump';
      fighter.actionDuration = 0;
      fighter.actionTimer = 0;
    }
  }

  if (!fighter.isGrounded) {
    fighter.vy += 32 * dt;
  }

  fighter.x += fighter.vx;
  fighter.y += fighter.vy;

  if (fighter.hitStun > 0) {
    fighter.hitStun -= dt;
    if (fighter.hitStun <= 0 && fighter.action === 'hurt') {
      fighter.action = 'idle';
    }
  }

  if (fighter.y >= groundY) {
    fighter.y = groundY;
    fighter.vy = 0;
    fighter.isGrounded = true;
    if (fighter.action === 'jump') {
      fighter.action = 'idle';
    }
  }

  if (fighter.x < 110) fighter.x = 110;
  if (fighter.x > 850) fighter.x = 850;
}

function checkFighterHit(
  room: Room,
  attacker: InternalFighter,
  defender: InternalFighter
) {
  if (
    attacker.action !== 'punch' &&
    attacker.action !== 'kick' &&
    attacker.action !== 'super'
  ) {
    return;
  }
  if (attacker.actionDuration <= 0) return;

  const progress = attacker.actionTimer / attacker.actionDuration;
  if (progress < 0.3 || progress > 0.7) return;

  const reach =
    attacker.action === 'super' ? 125 : attacker.action === 'kick' ? 95 : 75;
  const diffX = (defender.x - attacker.x) * attacker.facing;
  const diffY = Math.abs(defender.y - attacker.y);

  if (diffX > 10 && diffX < reach && diffY < 62) {
    if (defender.hitStun > 0.05) return;

    const baseDmg =
      attacker.action === 'super'
        ? attacker.superDamage
        : attacker.action === 'kick'
        ? attacker.attack * 1.3
        : attacker.attack;

    let finalDmg = Math.round(baseDmg);
    const isBlocked = defender.isBlocking && defender.facing !== attacker.facing;

    if (isBlocked) {
      finalDmg = Math.max(2, Math.round(finalDmg * 0.2));
      defender.hitStun = 0.14;
      broadcastEvent(room, {
        kind: 'fight_block',
        x: defender.x,
        y: defender.y - 55,
        text: 'BLOCK!',
        color: '#38bdf8',
      });
    } else {
      defender.action = 'hurt';
      defender.hitStun = 0.22;
      defender.vx = attacker.facing * (attacker.action === 'super' ? 8 : 4);
      attacker.superMeter = Math.min(100, attacker.superMeter + 18);
      defender.superMeter = Math.min(100, defender.superMeter + 12);
      broadcastEvent(room, {
        kind: 'fight_hit',
        x: defender.x,
        y: defender.y - 55,
        text: `-${finalDmg}`,
        color: '#f43f5e',
        shake: attacker.action === 'super' ? 12 : 6,
      });
    }

    defender.health = Math.max(0, defender.health - finalDmg);
  }
}

function finishFightRound(
  room: Room,
  match: InternalFightMatch,
  winner: InternalFighter
) {
  match.matchState = 'KO';
  match.countdownText = 'K.O.!';
  match.phaseTimer = 0;
  winner.roundsWon += 1;
  broadcastEvent(room, { kind: 'fight_ko' });
}

function stepFightMatch(room: Room, dt: number) {
  const match = room.fightMatch;
  if (!match) return;

  const [f1, f2] = match.fighters;

  if (match.matchState === 'COUNTDOWN') {
    match.phaseTimer += dt;
    if (match.countdownStep === 0 && match.phaseTimer >= 0.85) {
      match.countdownStep = 1;
      match.countdownText = 'READY...';
    } else if (match.countdownStep === 1 && match.phaseTimer >= 1.65) {
      match.countdownStep = 2;
      match.countdownText = 'FIGHT!';
      match.matchState = 'FIGHTING';
      broadcastEvent(room, { kind: 'countdown', isGo: true });
    }
  } else if (match.matchState === 'FIGHTING') {
    match.timeAccum += dt;
    if (match.timeAccum >= 1) {
      match.timeAccum -= 1;
      match.timeLeft = Math.max(0, match.timeLeft - 1);
      if (match.timeLeft <= 0) {
        const r1 = f1.health / f1.maxHealth;
        const r2 = f2.health / f2.maxHealth;
        finishFightRound(room, match, r1 >= r2 ? f1 : f2);
        return;
      }
    }

    if (f1.action !== 'ko' && f2.action !== 'ko') {
      f1.facing = f1.x < f2.x ? 1 : -1;
      f2.facing = f2.x < f1.x ? 1 : -1;
    }

    const p1Session = room.players.get(1);
    const p2Session = room.players.get(2);

    if (!f1.isAI && f1.action !== 'ko' && f1.hitStun <= 0 && p1Session) {
      processFighterInput(room, f1, p1Session.fightInput);
    }

    if (f2.isAI) {
      if (f2.action !== 'ko' && f2.hitStun <= 0) {
        runFighterAI(room, f2, f1);
      }
    } else if (f2.action !== 'ko' && f2.hitStun <= 0 && p2Session) {
      processFighterInput(room, f2, p2Session.fightInput);
    }

    stepFighterPhysics(f1, dt);
    stepFighterPhysics(f2, dt);

    checkFighterHit(room, f1, f2);
    checkFighterHit(room, f2, f1);

    if (f1.health <= 0) {
      f1.health = 0;
      f1.action = 'ko';
      finishFightRound(room, match, f2);
    } else if (f2.health <= 0) {
      f2.health = 0;
      f2.action = 'ko';
      finishFightRound(room, match, f1);
    }
  } else if (match.matchState === 'KO') {
    match.phaseTimer += dt;
    if (match.phaseTimer >= 2.2) {
      if (f1.roundsWon >= 2) {
        match.matchState = 'MATCH_OVER';
        match.winnerSlot = 1;
        match.countdownText = '';
      } else if (f2.roundsWon >= 2) {
        match.matchState = 'MATCH_OVER';
        match.winnerSlot = 2;
        match.countdownText = '';
      } else {
        resetFightRound(room, match, match.round + 1);
      }
    }
  }

  if (room.tickCount % 2 === 0 || match.matchState !== 'FIGHTING') {
    const toNet = (f: InternalFighter): NetworkFighterSnapshot => ({
      slot: f.slot,
      playerName: f.playerName,
      gender: f.gender,
      x: Math.round(f.x * 10) / 10,
      y: Math.round(f.y * 10) / 10,
      vx: f.vx,
      vy: f.vy,
      facing: f.facing,
      isGrounded: f.isGrounded,
      action: f.action,
      actionTimer: f.actionTimer,
      actionDuration: f.actionDuration,
      health: f.health,
      maxHealth: f.maxHealth,
      superMeter: Math.round(f.superMeter),
      isBlocking: f.isBlocking,
      hitStun: f.hitStun,
      roundsWon: f.roundsWon,
    });

    const snapshot: FightMatchSnapshot = {
      round: match.round,
      timeLeft: match.timeLeft,
      matchState: match.matchState,
      countdownText: match.countdownText,
      winnerSlot: match.winnerSlot,
      fighters: [toNet(f1), toNet(f2)],
    };

    for (const player of room.players.values()) {
      if (player.connected) {
        sendJson(player.ws, { type: 'fight_state', payload: snapshot });
      }
    }
  }
}

function triggerRaceItem(room: Room, match: InternalRaceMatch, racer: InternalRacer) {
  const item = racer.hasItem;
  racer.hasItem = null;

  if (item === 'boost') {
    racer.boostTimer = 2.2;
    if (racer.isHuman) {
      broadcastEvent(room, { kind: 'race_boost', slot: racer.slot || 1 });
    }
  } else if (item === 'shield') {
    racer.shieldTimer = 5.0;
    if (racer.isHuman) {
      broadcastEvent(room, { kind: 'race_item', slot: racer.slot || 1 });
    }
  } else if (item === 'banana') {
    match.obstacles.push({
      id: `obs-${Date.now()}-${Math.random()}`,
      x: racer.x - Math.cos(racer.angle) * 36,
      y: racer.y - Math.sin(racer.angle) * 36,
      type: 'banana',
      vx: 0,
      vy: 0,
      life: 16.0,
      ownerId: racer.id,
    });
  } else if (item === 'rocket') {
    match.obstacles.push({
      id: `obs-${Date.now()}-${Math.random()}`,
      x: racer.x + Math.cos(racer.angle) * 36,
      y: racer.y + Math.sin(racer.angle) * 36,
      type: 'rocket',
      vx: Math.cos(racer.angle) * 360,
      vy: Math.sin(racer.angle) * 360,
      life: 3.5,
      ownerId: racer.id,
    });
  }
}

function stepRaceMatch(room: Room, dt: number) {
  const match = room.raceMatch;
  if (!match) return;

  if (match.gameState === 'READY') {
    match.phaseTimer += dt;
    if (match.countdownStep === 0 && match.phaseTimer >= 0.9) {
      match.countdownStep = 1;
      match.countdown = '2';
      broadcastEvent(room, { kind: 'countdown', isGo: false });
    } else if (match.countdownStep === 1 && match.phaseTimer >= 1.8) {
      match.countdownStep = 2;
      match.countdown = '1';
      broadcastEvent(room, { kind: 'countdown', isGo: false });
    } else if (match.countdownStep === 2 && match.phaseTimer >= 2.7) {
      match.countdownStep = 3;
      match.countdown = 'GO!';
      match.gameState = 'RACING';
      match.elapsedMs = 0;
      for (const r of match.racers) {
        r.lapStartTime = 0;
      }
      broadcastEvent(room, { kind: 'countdown', isGo: true });
    }
  } else if (match.gameState === 'RACING') {
    match.elapsedMs += dt * 1000;
    if (match.elapsedMs > 1200) {
      match.countdown = '';
    }

    for (const box of match.itemBoxes) {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) box.active = true;
      }
    }

    for (const obs of match.obstacles) {
      if (obs.type === 'rocket') {
        obs.x += obs.vx * dt;
        obs.y += obs.vy * dt;
      }
      obs.life -= dt;
    }
    match.obstacles = match.obstacles.filter((o) => o.life > 0);

    for (const racer of match.racers) {
      if (racer.boostTimer > 0) racer.boostTimer -= dt;
      if (racer.shieldTimer > 0) racer.shieldTimer -= dt;

      if (racer.isHuman && !racer.finished && racer.slot) {
        const session = room.players.get(racer.slot);
        const inp = session?.raceInput || DEFAULT_RACE_INPUT();

        const turnRate = racer.handling * (racer.isDrifting ? 1.38 : 1.0);
        if (inp.left) racer.angle -= turnRate;
        if (inp.right) racer.angle += turnRate;

        const maxSpd = racer.topSpeed * (racer.boostTimer > 0 ? 1.42 : 1.0);
        const accel = racer.acceleration * (racer.boostTimer > 0 ? 2.0 : 1.0);

        if (inp.gas) {
          racer.speed = Math.min(maxSpd, racer.speed + accel);
        } else if (inp.brake) {
          racer.speed = Math.max(-2, racer.speed - accel * 1.5);
        } else {
          racer.speed = Math.max(0, racer.speed - 0.08);
        }

        if (inp.drift && racer.speed > 3) {
          racer.isDrifting = true;
          racer.driftCharge = Math.min(100, racer.driftCharge + 60 * dt);
        } else if (racer.isDrifting) {
          if (racer.driftCharge > 50) {
            racer.boostTimer = 1.25;
            broadcastEvent(room, { kind: 'race_boost', slot: racer.slot });
          }
          racer.isDrifting = false;
          racer.driftCharge = 0;
        }

        if (inp.useItem && racer.hasItem) {
          triggerRaceItem(room, match, racer);
        }
      } else if (!racer.isHuman && !racer.finished) {
        const cpIndex = racer.checkpointsPassed % TRACK_CHECKPOINTS.length;
        const target = TRACK_CHECKPOINTS[cpIndex];
        const dx = target.x - racer.x;
        const dy = target.y - racer.y;
        const targetAngle = Math.atan2(dy, dx);
        let diff = targetAngle - racer.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const turnRate = racer.handling * 0.9;
        if (diff > 0.05) racer.angle += turnRate;
        else if (diff < -0.05) racer.angle -= turnRate;

        const maxSpd = racer.topSpeed * 0.88 * (racer.boostTimer > 0 ? 1.38 : 1.0);
        racer.speed = Math.min(maxSpd, racer.speed + racer.acceleration);

        if (racer.hasItem && Math.random() < 0.015) {
          triggerRaceItem(room, match, racer);
        }
      }

      racer.vx = Math.cos(racer.angle) * racer.speed;
      racer.vy = Math.sin(racer.angle) * racer.speed;
      racer.x = Math.max(36, Math.min(924, racer.x + racer.vx));
      racer.y = Math.max(36, Math.min(504, racer.y + racer.vy));

      const cpIdx = racer.checkpointsPassed % TRACK_CHECKPOINTS.length;
      const cp = TRACK_CHECKPOINTS[cpIdx];
      if (!racer.finished && Math.hypot(racer.x - cp.x, racer.y - cp.y) < cp.r) {
        racer.checkpointsPassed += 1;
        if (racer.checkpointsPassed % TRACK_CHECKPOINTS.length === 0) {
          const lapDuration = (match.elapsedMs - racer.lapStartTime) / 1000;
          if (lapDuration < racer.bestLap) {
            racer.bestLap = lapDuration;
          }
          racer.currentLap += 1;
          racer.lapStartTime = match.elapsedMs;

          if (racer.currentLap > 3) {
            racer.finished = true;
            racer.totalTime = match.elapsedMs / 1000;
            if (racer.isHuman && match.firstFinishElapsedMs === null) {
              match.firstFinishElapsedMs = match.elapsedMs;
            }
          }
        }
      }

      for (const pad of BOOST_PADS) {
        if (
          racer.x >= pad.x - pad.w / 2 &&
          racer.x <= pad.x + pad.w / 2 &&
          racer.y >= pad.y - pad.h / 2 &&
          racer.y <= pad.y + pad.h / 2
        ) {
          if (racer.boostTimer <= 0.2 && racer.isHuman) {
            broadcastEvent(room, { kind: 'race_boost', slot: racer.slot || 1 });
          }
          racer.boostTimer = 1.6;
        }
      }

      for (const box of match.itemBoxes) {
        if (box.active && Math.hypot(racer.x - box.x, racer.y - box.y) < 28) {
          box.active = false;
          box.respawnTimer = 4.0;
          if (!racer.hasItem) {
            const pool: Exclude<RaceItemType, null>[] = ['boost', 'shield', 'banana', 'rocket'];
            racer.hasItem = pool[Math.floor(Math.random() * pool.length)];
            if (racer.isHuman) {
              broadcastEvent(room, { kind: 'race_item', slot: racer.slot || 1 });
            }
          }
        }
      }

      for (const obs of match.obstacles) {
        if (obs.life <= 0) continue;
        if (obs.ownerId === racer.id && obs.life > 15.2) continue;
        if (Math.hypot(racer.x - obs.x, racer.y - obs.y) < 22) {
          if (racer.shieldTimer <= 0) {
            racer.speed = 1.0;
            racer.angle += Math.PI * 0.65;
            if (racer.isHuman) {
              broadcastEvent(room, { kind: 'race_hit', slot: racer.slot || 1 });
            }
          }
          obs.life = 0;
        }
      }
    }

    const sorted = [...match.racers].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.totalTime - b.totalTime;
      if (a.currentLap !== b.currentLap) return b.currentLap - a.currentLap;
      return b.checkpointsPassed - a.checkpointsPassed;
    });
    sorted.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    const humans = match.racers.filter((r) => r.isHuman);
    const allHumansFinished = humans.length > 0 && humans.every((h) => h.finished);
    const graceExpired =
      match.firstFinishElapsedMs !== null &&
      match.elapsedMs - match.firstFinishElapsedMs >= 8000;

    if (allHumansFinished || graceExpired) {
      match.gameState = 'FINISHED';
      broadcastEvent(room, { kind: 'race_finish' });
    }
  }

  if (room.tickCount % 2 === 0 || match.gameState !== 'RACING') {
    const snapshot: RaceMatchSnapshot = {
      gameState: match.gameState,
      countdown: match.countdown,
      racers: match.racers.map((r) => ({
        id: r.id,
        slot: r.slot,
        playerName: r.playerName,
        gender: r.gender,
        color: r.color,
        hairColor: r.hairColor,
        skinColor: r.skinColor,
        kartName: r.kartName,
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        angle: Math.round(r.angle * 1000) / 1000,
        speed: Math.round(r.speed * 100) / 100,
        isDrifting: r.isDrifting,
        driftCharge: Math.round(r.driftCharge),
        boostTimer: Math.round(r.boostTimer * 10) / 10,
        shieldTimer: Math.round(r.shieldTimer * 10) / 10,
        hasItem: r.hasItem,
        currentLap: r.currentLap,
        bestLap: r.bestLap,
        finished: r.finished,
        rank: r.rank,
        isHuman: r.isHuman,
      })),
      obstacles: match.obstacles.map((o) => ({
        id: o.id,
        x: Math.round(o.x),
        y: Math.round(o.y),
        type: o.type,
      })),
      itemBoxes: match.itemBoxes.map((b) => ({
        x: b.x,
        y: b.y,
        active: b.active,
      })),
    };

    for (const player of room.players.values()) {
      if (player.connected) {
        sendJson(player.ws, { type: 'race_state', payload: snapshot });
      }
    }
  }
}

function handleLeaveRoom(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode || !meta.slot) return;

  const room = rooms.get(meta.roomCode);
  meta.roomCode = null;
  meta.slot = null;
  if (!room) return;

  const leaving = room.players.get(1)?.ws === ws
    ? room.players.get(1)
    : room.players.get(2)?.ws === ws
    ? room.players.get(2)
    : undefined;

  if (!leaving) return;
  room.players.delete(leaving.slot);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  // Promote remaining player to slot 1 if host left
  const remaining = room.players.get(2);
  if (remaining && !room.players.has(1)) {
    room.players.delete(2);
    remaining.slot = 1;
    room.players.set(1, remaining);
    const remMeta = socketMeta.get(remaining.ws);
    if (remMeta) remMeta.slot = 1;
  }

  room.phase = 'LOBBY';
  room.fightMatch = null;
  room.raceMatch = null;

  for (const p of room.players.values()) {
    sendJson(p.ws, { type: 'opponent_left', name: leaving.name });
  }
  broadcastRoomState(room);
}

function startRoomGame(room: Room) {
  room.phase = 'PLAYING';
  room.tickCount = 0;
  if (room.gameMode === 'fighting') {
    room.raceMatch = null;
    room.fightMatch = initFightMatch(room);
  } else {
    room.fightMatch = null;
    room.raceMatch = initRaceMatch(room);
  }
  broadcastRoomState(room);
}

async function main() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    socketMeta.set(ws, { roomCode: null, slot: null });

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');
      const meta = socketMeta.get(ws) || { roomCode: null, slot: null };

      if (type === 'create_room') {
        handleLeaveRoom(ws);
        const name = String(msg.name || '').trim().slice(0, 16) || 'Player 1';
        const isSolo = Boolean(msg.solo);
        const code = generateRoomCode();

        const room: Room = {
          code,
          phase: 'LOBBY',
          gameMode: 'fighting',
          isSolo,
          players: new Map(),
          fightMatch: null,
          raceMatch: null,
          tickCount: 0,
          cpuGender: 'girl',
        };

        room.players.set(1, {
          ws,
          slot: 1,
          name,
          gender: 'boy',
          ready: true,
          connected: true,
          fightInput: DEFAULT_FIGHT_INPUT(),
          raceInput: DEFAULT_RACE_INPUT(),
        });

        rooms.set(code, room);
        socketMeta.set(ws, { roomCode: code, slot: 1 });
        broadcastRoomState(room);
        return;
      }

      if (type === 'join_room') {
        handleLeaveRoom(ws);
        const name = String(msg.name || '').trim().slice(0, 16) || 'Player 2';
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const room = rooms.get(roomCode);

        if (!room) {
          sendJson(ws, { type: 'error', message: `Room "${roomCode}" not found. Check the code and try again.` });
          return;
        }

        if (room.players.size >= 2) {
          sendJson(ws, { type: 'error', message: `Room "${roomCode}" is already full.` });
          return;
        }

        const p1 = room.players.get(1);
        const defaultGender: CharacterGender = p1?.gender === 'girl' ? 'boy' : 'girl';

        room.isSolo = false;
        room.players.set(2, {
          ws,
          slot: 2,
          name,
          gender: defaultGender,
          ready: true,
          connected: true,
          fightInput: DEFAULT_FIGHT_INPUT(),
          raceInput: DEFAULT_RACE_INPUT(),
        });

        socketMeta.set(ws, { roomCode: room.code, slot: 2 });
        broadcastRoomState(room);
        return;
      }

      if (type === 'leave_room') {
        handleLeaveRoom(ws);
        return;
      }

      if (!meta.roomCode || !meta.slot) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.get(meta.slot);
      if (!player) return;

      if (type === 'select_gender') {
        const g = msg.gender === 'girl' ? 'girl' : 'boy';
        player.gender = g;
        if (room.isSolo) {
          room.cpuGender = g === 'boy' ? 'girl' : 'boy';
        }
        broadcastRoomState(room);
      } else if (type === 'set_mode') {
        const mode: GameMode = msg.gameMode === 'racing' ? 'racing' : 'fighting';
        room.gameMode = mode;
        broadcastRoomState(room);
      } else if (type === 'toggle_ready') {
        player.ready = !player.ready;
        broadcastRoomState(room);
      } else if (type === 'start_game') {
        if (room.players.size < 2 && !room.isSolo) {
          // Allow host to start vs CPU if waiting alone or switch to solo
          room.isSolo = true;
          room.cpuGender = player.gender === 'boy' ? 'girl' : 'boy';
        }
        startRoomGame(room);
      } else if (type === 'rematch') {
        startRoomGame(room);
      } else if (type === 'back_to_lobby') {
        room.phase = 'LOBBY';
        room.fightMatch = null;
        room.raceMatch = null;
        broadcastRoomState(room);
      } else if (type === 'fight_input' && msg.input && typeof msg.input === 'object') {
        const inp = msg.input as Partial<FightInputState>;
        player.fightInput = {
          left: Boolean(inp.left),
          right: Boolean(inp.right),
          up: Boolean(inp.up),
          down: Boolean(inp.down),
          punch: Boolean(inp.punch),
          kick: Boolean(inp.kick),
          guard: Boolean(inp.guard),
          super: Boolean(inp.super),
        };
      } else if (type === 'race_input' && msg.input && typeof msg.input === 'object') {
        const inp = msg.input as Partial<RaceInputState>;
        player.raceInput = {
          gas: Boolean(inp.gas),
          brake: Boolean(inp.brake),
          left: Boolean(inp.left),
          right: Boolean(inp.right),
          drift: Boolean(inp.drift),
          useItem: Boolean(inp.useItem),
        };
      }
    });

    ws.on('close', () => {
      handleLeaveRoom(ws);
    });
  });

  // 60Hz Server-Authoritative Simulation Loop
  setInterval(() => {
    const dt = 1 / 60;
    for (const room of rooms.values()) {
      if (room.phase !== 'PLAYING') continue;
      room.tickCount += 1;
      if (room.gameMode === 'fighting') {
        stepFightMatch(room, dt);
      } else {
        stepRaceMatch(room, dt);
      }
    }
  }, 1000 / 60);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chibi Clash & Drift server running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
