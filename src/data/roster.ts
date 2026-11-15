import { Character, CharacterGender } from '../types/game';

export const BOY_CHARACTER: Character = {
  id: 'kenji-karate-boy',
  name: 'Kenji',
  title: 'Sakura Black Belt',
  gender: 'boy',
  archetype: 'Brawler',
  stats: {
    health: 110,
    attack: 14,
    speed: 11,
    defense: 10,
    superPower: 38,
  },
  colors: {
    primary: '#3b82f6',
    secondary: '#60a5fa',
    hair: '#3b200e',
    skin: '#fbd3b6',
    outfit: '#ffffff',
    aura: '#60a5fa',
  },
  specialMove: {
    name: 'Dragon Heart Fist',
    description: 'Explosive cherry-blossom dash punch.',
    quote: 'My fist carries the strength of dedication!',
    damage: 38,
    icon: 'punch',
  },
  kart: {
    modelName: 'Sakura Striker GP',
    color: '#3b82f6',
    topSpeed: 8.6,
    acceleration: 0.23,
    handling: 0.068,
  },
  lore: 'A determined martial artist who trains amidst falling cherry blossoms.',
  wins: 0,
  losses: 0,
  aiBehavior: 'balanced',
};

export const GIRL_CHARACTER: Character = {
  id: 'hana-martial-maiden',
  name: 'Hana',
  title: 'Blossom Maiden',
  gender: 'girl',
  archetype: 'Blossom Striker',
  stats: {
    health: 105,
    attack: 13,
    speed: 12,
    defense: 10,
    superPower: 40,
  },
  colors: {
    primary: '#ec4899',
    secondary: '#f472b6',
    hair: '#3e2316',
    skin: '#fbd3b6',
    outfit: '#fff1f2',
    aura: '#f43f5e',
  },
  specialMove: {
    name: 'Petal Dance Whirlwind',
    description: 'Airborne spiral of rose petals.',
    quote: 'Grace and power in perfect harmony!',
    damage: 40,
    icon: 'kick',
  },
  kart: {
    modelName: 'Floral Heart Cruiser',
    color: '#ec4899',
    topSpeed: 8.7,
    acceleration: 0.24,
    handling: 0.072,
  },
  lore: 'Blends traditional dance footwork with swift roundhouse kicks.',
  wins: 0,
  losses: 0,
  aiBehavior: 'aggressive',
};

export function getCharacterForSlot(
  gender: CharacterGender,
  slot: 1 | 2,
  playerName?: string
): Character {
  const base = gender === 'girl' ? GIRL_CHARACTER : BOY_CHARACTER;
  // Give Slot 2 a distinct secondary palette if both players choose the same gender
  const isAlt = slot === 2;
  const primary = isAlt
    ? gender === 'girl'
      ? '#8b5cf6'
      : '#f59e0b'
    : base.colors.primary;
  const outfit = isAlt
    ? gender === 'girl'
      ? '#f3e8ff'
      : '#fef3c7'
    : base.colors.outfit;

  return {
    ...base,
    name: playerName?.trim() || base.name,
    colors: {
      ...base.colors,
      primary,
      aura: primary,
      outfit,
    },
    kart: {
      ...base.kart,
      color: primary,
    },
  };
}
