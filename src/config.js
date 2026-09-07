export const CONFIG = Object.freeze({
  eliteChance: 0.01,
  strongEnemyChance: 0.03,
  strongEnemyChanceCap: 0.1,
  aberrantShare: 0.2,
  statVariance: 0.1,
  damageVariance: 0.1,
  guardReduction: 0.65,
  maxObservation: 3,
  playerGrowth: {
    hp: [8, 14], atk: [1, 3], def: [1, 3], spd: [0, 2], obs: [0, 2], maxSp: [1, 3],
  },
  skills: {
    powerStrike: { name: '演算強打', cost: 8, multiplier: 1.65 },
    firstAid: { name: '応急手当', cost: 12 },
    focus: { name: '集中解析', cost: 7 },
  },
});
