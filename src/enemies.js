import { floorLevelRange, rollStat } from './formulas.js';
import { CONFIG } from './config.js';

const AFFINITIES={
  slime:[['BLUNT'],['SLASH']],rat:[['SLASH'],[]],goblin:[['BLUNT'],[]],bat:[['PIERCE'],[]],beetle:[['BLUNT'],['SLASH']],wolf:[['PIERCE'],[]],skeleton:[['BLUNT'],['PIERCE']],moth:[['SLASH'],['ARCANE']],orc:[['PIERCE'],[]],snake:[['SLASH'],['PIERCE']],mimic:[['ARCANE'],['SLASH']],golem:[['ARCANE'],['SLASH']],harpy:[['PIERCE'],[]],ogre:[['SLASH'],['BLUNT']],wisp:[['ARCANE'],['BLUNT']],lizard:[['BLUNT'],['SLASH']],knight:[['ARCANE'],['SLASH']],spider:[['SLASH'],['PIERCE']],drake:[['PIERCE'],['ARCANE']],sentinel:[['BLUNT'],['PIERCE']],
};
const A = (id, name, hp, atk, def, spd, obs, danger, trait, weakness, pattern) => {const [weaknesses,resistances]=AFFINITIES[id]||[[],[]];return { id, name, hp, atk, def, spd, obs, danger, baseGold: Math.round(12 + danger * 10), trait, weakness, weaknesses, resistances, pattern }};

const STRIKE = { id: 'strike', name: '攻撃', telegraph: 'こちらとの間合いを測っている。', text: '素早く踏み込み、攻撃した。', multiplier: 1 };
const HEAVY = { id: 'heavy', name: '強打', telegraph: '大きく武器を振りかぶった。次は危険だ。', text: '予告どおり渾身の一撃を振り下ろした！', multiplier: 1.75 };
const GUARD = { id: 'guard', name: '防御', telegraph: '身体を丸め、守りを固めようとしている。', text: '身体を固め、攻撃に備えた。', multiplier: 0 };
const LUNGE = { id: 'lunge', name: '突進', telegraph: '後ろへ大きく下がり、一直線に狙いを定めた。', text: '溜めた距離を使って突進した！', multiplier: 1.5 };
const FEINT = { id: 'feint', name: 'フェイント', telegraph: '視線を逸らし、足先だけがこちらを向いている。', text: '視線は囮だった。鋭い一撃が飛んできた！', multiplier: 1.25 };
const REST = { id: 'rest', name: '休息', telegraph: '荒い息を整えようとしている。攻撃は来なさそうだ。', text: '息を整え、隙を見せた。', multiplier: 0 };
const CHARGE = { id: 'charge', name: '破砕撃準備', telegraph: '空気が震えている。次の攻撃は極めて危険だ。', text: '大槌に集めた力を限界まで高めている。', multiplier: 0 };
const CRUSH = { id: 'ultimate', name: '破砕撃', telegraph: '大槌が赤く輝く。今すぐ防御しなければ致命傷になる！', text: '予告どおり「破砕撃」を放った！', multiplier: 0, ultimate: true };
const BLEED_STRIKE={...STRIKE,id:'bleed-strike',name:'裂傷撃',telegraph:'牙が赤く光る。次の一撃で出血する可能性がある。',text:'赤い牙で切り裂いた！',status:{id:'BLEED',chance:.35}};
const WEAKEN_FEINT={...FEINT,id:'weaken-feint',name:'幻惑粉',telegraph:'鈍い粉が漂う。次の攻撃で弱体する可能性がある。',text:'幻惑の粉を叩きつけた！',status:{id:'WEAKEN',chance:.4}};
const BREAK_HEAVY={...HEAVY,id:'break-heavy',name:'鎧砕き',telegraph:'防具へ狙いを定めた。次の強打で破防する可能性がある。',text:'防具を狙う強打を振り下ろした！',status:{id:'ARMOR_BREAK',chance:.4}};
const SLOW_LUNGE={...LUNGE,id:'slow-lunge',name:'絡め糸',telegraph:'粘つく糸を張った。次の突進で鈍足になる可能性がある。',text:'糸を絡めながら突進した！',status:{id:'SLOW',chance:.45}};

export const ENEMIES = [
  A('slime','蒼雫スライム',1.05,.82,1.12,.72,.65,.8,'打撃を柔らかく受ける','演算強打',[STRIKE,GUARD]),
  A('rat','迷宮ネズミ',.72,.88,.62,1.35,.8,.75,'素早いが打たれ弱い','高いDEF',[STRIKE,FEINT,REST]),
  A('goblin','灰耳ゴブリン',.95,1,.85,1.05,.9,1,'規則正しく強打を準備する','強打前の防御',[STRIKE,STRIKE,HEAVY]),
  A('bat','反響コウモリ',.68,.82,.55,1.48,1.2,.85,'音でこちらを探る','観察',[FEINT,STRIKE,REST]),
  A('beetle','鉄殻ビートル',1.18,.85,1.45,.62,.7,1.05,'殻を閉じると非常に硬い','休息の隙',[GUARD,STRIKE,LUNGE]),
  A('wolf','黒牙ウルフ',.9,1.12,.72,1.34,1.05,1.15,'弱った相手への突進を好む','突進前の防御',[BLEED_STRIKE,LUNGE,STRIKE]),
  A('skeleton','巡回スケルトン',1,1.04,1,1,.82,1,'同じ手順を何度も繰り返す','行動周期の把握',[STRIKE,GUARD,HEAVY]),
  A('moth','幻粉モス',.78,.9,.7,1.18,1.5,1.1,'紛らわしい動きで惑わせる','集中解析',[WEAKEN_FEINT,REST,HEAVY]),
  A('orc','赤斧オーク',1.25,1.28,1.04,.72,.78,1.3,'重い一撃の後に息が切れる','強打後の隙',[STRIKE,HEAVY,REST]),
  A('snake','晶洞サーペント',.86,1.1,.7,1.3,1.15,1.15,'距離を取って突進する','予兆への防御',[STRIKE,LUNGE,REST]),
  A('mimic','飢えたミミック',1.25,1.18,1.2,.7,1.35,1.35,'守りと奇襲を交互に行う','観察',[GUARD,FEINT,HEAVY]),
  A('golem','刻印ゴーレム',1.55,1.18,1.55,.48,.9,1.5,'遅いが極めて頑丈','休息の隙',[GUARD,HEAVY,REST]),
  A('harpy','風切ハーピー',.82,1.08,.66,1.5,1.1,1.25,'速度を生かすが疲れやすい','休息の隙',[FEINT,LUNGE,REST]),
  A('ogre','大槌オーガ',1.5,1.4,1.08,.58,.72,1.55,'二撃の後に大技を放つ','強打への防御',[STRIKE,STRIKE,BREAK_HEAVY,REST]),
  A('wisp','数霊ウィスプ',.75,1.2,.58,1.2,1.62,1.3,'実体が読みづらい','OBS',[REST,FEINT,HEAVY]),
  A('lizard','石鱗リザード',1.15,1.05,1.28,.92,1,1.2,'守りから反撃を狙う','防御中は観察',[GUARD,HEAVY,STRIKE]),
  A('knight','亡国の騎士',1.35,1.22,1.35,.9,1.25,1.5,'隙の少ない型を守る','行動周期の把握',[STRIKE,GUARD,HEAVY,FEINT]),
  A('spider','算糸スパイダー',.88,1.02,.76,1.42,1.45,1.25,'こちらの反応を見て仕掛ける','集中解析',[FEINT,GUARD,SLOW_LUNGE]),
  A('drake','幼晶ドレイク',1.45,1.38,1.18,1.08,1.18,1.65,'息を整えてから猛攻する','休息中の攻撃',[REST,LUNGE,HEAVY]),
  A('sentinel','深層センチネル',1.62,1.3,1.5,.75,1.4,1.75,'解析しながら確実に攻める','高いOBS',[GUARD,STRIKE,FEINT,HEAVY]),
];

export function createEnemy(floor, rng, options = {}) {
  const [min, max] = floorLevelRange(floor);
  const archetype = options.archetype ?? rng.pick(ENEMIES);
  let rank=options.rank;
  if(!rank){
    const strong=rng.next()<(options.strongChance??options.eliteChance??CONFIG.eliteChance);
    rank=strong?(options.eliteChance!==undefined?'elite':rng.next()<CONFIG.aberrantShare?'aberrant':'elite'):'normal';
  }
  const elite=rank!=='normal', rankScale=rank==='aberrant'?1.9:rank==='elite'?1.38:1;
  const level = elite ? Math.max(min + 1, Math.round(rng.int(min, max) * rankScale)) : rng.int(min, max);
  const scale = 1 + (level - 1) * 0.115;
  const stat = (base, factor) => rollStat(base * scale * factor, rng);
  const maxHp = stat(82, archetype.hp) * (rank==='aberrant'?1.85:rank==='elite'?1.32:1);
  const enemy = {
    id: archetype.id, name: `${rank==='aberrant'?'深淵の':rank==='elite'?'異相の':''}${archetype.name}`, archetype, rank,
    level, maxHp: Math.round(maxHp), hp: Math.round(maxHp),
    atk: stat(12, archetype.atk) * (rank==='aberrant'?1.8:rank==='elite'?1.28:1), def: stat(10, archetype.def) * (rank==='aberrant'?1.65:rank==='elite'?1.25:1),
    spd: stat(10, archetype.spd)*(rank==='aberrant'?1.3:rank==='elite'?1.12:1), obs: stat(10, archetype.obs)*(rank==='aberrant'?1.55:rank==='elite'?1.18:1), danger: archetype.danger*(rank==='aberrant'?2.4:rank==='elite'?1.7:1),
    elite, guarded: false, statuses:{}, patternIndex: 0, combatTurn: 1,
    ultimateTurn: ['ogre', 'drake'].includes(archetype.id) ? rng.int(5, 7) : null,
  };
  enemy.intent = chooseIntent(enemy, rng);
  return enemy;
}

export function currentIntent(enemy) {
  return enemy.intent || enemy.archetype.pattern[enemy.patternIndex % enemy.archetype.pattern.length];
}

function weightedPick(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry.intent;
  }
  return entries.at(-1).intent;
}

export function chooseIntent(enemy, rng) {
  if (enemy.ultimateTurn && enemy.combatTurn === enemy.ultimateTurn - 1) return CHARGE;
  if (enemy.ultimateTurn && enemy.combatTurn === enemy.ultimateTurn) return CRUSH;

  const lowHp = enemy.hp / enemy.maxHp <= 0.3;
  const counts = new Map();
  for (const intent of enemy.archetype.pattern) counts.set(intent, (counts.get(intent) || 0) + 1);
  const entries = [...counts].map(([intent, count]) => ({ intent, weight: count }));

  // Conditional personality: wounded predators press harder; defensive enemies turtle.
  for (const entry of entries) {
    if (lowHp && ['wolf', 'orc', 'ogre'].includes(enemy.id) && ['heavy', 'lunge', 'strike'].includes(entry.intent.id)) entry.weight *= 1.7;
    if (lowHp && ['knight', 'beetle', 'lizard'].includes(enemy.id) && entry.intent.id === 'guard') entry.weight *= 2;
    if (enemy.id === 'goblin' && entry.intent.id === 'strike') entry.weight *= 1.4;
  }
  return weightedPick(entries, rng);
}

export function advanceIntent(enemy, rng) {
  enemy.combatTurn += 1;
  enemy.patternIndex += 1;
  enemy.intent = chooseIntent(enemy, rng);
}

export function telegraphText(enemy) {
  const intent = currentIntent(enemy);
  if (enemy.ultimateTurn && enemy.combatTurn === enemy.ultimateTurn - 2) {
    return `${intent.telegraph} 敵の周囲に力が集まり始めている。`;
  }
  return intent.telegraph;
}
