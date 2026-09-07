import { CONFIG } from './config.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function floorLevelRange(floor) {
  const center = Math.max(1, floor);
  return [Math.max(1, Math.floor(center * 0.9)), Math.max(2, Math.ceil(center * 1.1))];
}

export function rollStat(base, rng, variance = CONFIG.statVariance) {
  return Math.max(1, Math.round(base * (1 + (rng.next() * 2 - 1) * variance)));
}

export function damage(atk, def, multiplier, rng, situational = 1) {
  const base = (atk * atk) / (atk + Math.max(1, def));
  const random = 1 - CONFIG.damageVariance + rng.next() * CONFIG.damageVariance * 2;
  return Math.max(1, Math.round(base * multiplier * situational * random));
}

export function expReward(baseExp, enemyLevel, playerLevel, danger = 1) {
  const levelFactor = clamp(1 + (enemyLevel - playerLevel) * 0.12, 0.15, 2.5);
  return Math.max(1, Math.round(baseExp * levelFactor * danger));
}

export function goldReward(baseGold, enemyLevel, playerLevel, danger, rng, rewardRate = 1) {
  const levelFactor = clamp(1 + (enemyLevel - playerLevel) * 0.1, 0.2, 2.25);
  const variance = 0.9 + rng.next() * 0.2;
  return Math.max(1, Math.round(baseGold * levelFactor * danger * variance * rewardRate));
}

export function expToNext(level) {
  return Math.round(30 + 18 * Math.pow(level, 1.35));
}

export function disclosureScore(player, enemy, kills = 0, observation = 0) {
  return clamp(0.38 + (player.obs - enemy.obs) / 70 + (player.level - enemy.level) / 18 + Math.log2(kills + 1) * 0.09 + observation * 0.23, 0, 1);
}

export function escapeChance(player, enemy, observation = 0) {
  const mercy = enemy.rank === 'aberrant' ? .18 : enemy.rank === 'elite' ? .1 : 0;
  return clamp(0.5 + (player.spd - enemy.spd) / 100 + observation * 0.08 + mercy, 0.2, 0.95);
}

export function efficiency(exp, turns, hpLost, danger) {
  if (exp === 0) return 0;
  return Math.round((exp * (1 + danger * 0.15) * 100) / Math.max(1, turns + hpLost / 12));
}

export function growPlayer(player, rng) {
  const growth = {};
  for (const [stat, [min, max]] of Object.entries(CONFIG.playerGrowth)) growth[stat] = rng.int(min, max);
  return growth;
}
