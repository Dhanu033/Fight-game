export type GameMode = 'fighting' | 'racing';

export type CharacterGender = 'boy' | 'girl';

export type Archetype = 'Brawler' | 'Speedster' | 'Grappler' | 'Tactician' | 'Blossom Striker';

export interface CharacterStats {
  health: number;
  attack: number;
  speed: number;
  defense: number;
  superPower: number;
}

export interface CharacterColors {
  primary: string;
  secondary: string;
  hair: string;
  skin: string;
  outfit: string;
  aura: string;
}

export interface SpecialMove {
  name: string;
  description: string;
  quote: string;
  damage: number;
  icon: string;
}

export interface KartConfig {
  modelName: string;
  color: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  gender: CharacterGender;
  archetype: Archetype;
  avatarUrl?: string;
  stats: CharacterStats;
  colors: CharacterColors;
  specialMove: SpecialMove;
  kart: KartConfig;
  lore: string;
  wins: number;
  losses: number;
  aiBehavior: 'aggressive' | 'defensive' | 'balanced' | 'erratic';
}

export interface RoomPlayerInfo {
  slot: 1 | 2;
  name: string;
  gender: CharacterGender;
  ready: boolean;
  isCPU: boolean;
  connected: boolean;
}

export type RoomPhase = 'LOBBY' | 'PLAYING';

export interface RoomStatePayload {
  roomCode: string;
  phase: RoomPhase;
  gameMode: GameMode;
  isSolo: boolean;
  yourSlot: 1 | 2;
  players: RoomPlayerInfo[];
}

export interface FightInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  guard: boolean;
  super: boolean;
}

export interface RaceInputState {
  gas: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  useItem: boolean;
}

export type FighterAction =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'guard'
  | 'super'
  | 'hurt'
  | 'ko';

export interface NetworkFighterSnapshot {
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
  superMeter: number;
  isBlocking: boolean;
  hitStun: number;
  roundsWon: number;
}

export interface FightMatchSnapshot {
  round: number;
  timeLeft: number;
  matchState: 'COUNTDOWN' | 'FIGHTING' | 'KO' | 'MATCH_OVER';
  countdownText: string;
  winnerSlot: 1 | 2 | null;
  fighters: [NetworkFighterSnapshot, NetworkFighterSnapshot];
}

export type RaceItemType = 'boost' | 'shield' | 'banana' | 'rocket' | null;

export interface NetworkRacerSnapshot {
  id: string;
  slot: 1 | 2 | null;
  playerName: string;
  gender: CharacterGender;
  color: string;
  hairColor: string;
  skinColor: string;
  kartName: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  isDrifting: boolean;
  driftCharge: number;
  boostTimer: number;
  shieldTimer: number;
  hasItem: RaceItemType;
  currentLap: number;
  bestLap: number;
  finished: boolean;
  rank: number;
  isHuman: boolean;
}

export interface RaceObstacleSnapshot {
  id: string;
  x: number;
  y: number;
  type: 'banana' | 'rocket';
}

export interface RaceItemBoxSnapshot {
  x: number;
  y: number;
  active: boolean;
}

export interface RaceMatchSnapshot {
  gameState: 'READY' | 'RACING' | 'FINISHED';
  countdown: string;
  racers: NetworkRacerSnapshot[];
  obstacles: RaceObstacleSnapshot[];
  itemBoxes: RaceItemBoxSnapshot[];
}

export interface GameEventPayload {
  kind:
    | 'fight_hit'
    | 'fight_block'
    | 'fight_super'
    | 'fight_punch'
    | 'fight_kick'
    | 'fight_jump'
    | 'fight_ko'
    | 'countdown'
    | 'race_boost'
    | 'race_item'
    | 'race_hit'
    | 'race_finish';
  x?: number;
  y?: number;
  text?: string;
  color?: string;
  isGo?: boolean;
  shake?: number;
  slot?: 1 | 2;
}
