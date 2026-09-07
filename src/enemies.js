import { floorLevelRange, rollStat } from './formulas.js';
import { CONFIG } from './config.js';

const A = (id, name, hp, atk, def, spd, obs, danger, trait, weakness, pattern) => ({ id, name, hp, atk, def, spd, obs, danger, trait, weakness, pattern });

const STRIKE = { id: 'strike', name: '攻撃', telegraph: 'こちらとの間合いを測っている。', text: '素早く踏み込み、攻撃した。', multiplier: 1 };
const HEAVY = { id: 'heavy', name: '強打', telegraph: '大きく武器を振りかぶった。次は危険だ。', text: '予告どおり渾身の一撃を振り下ろした！', multiplier: 1.75 };
const GUARD = { id: 'guard', name: '防御', telegraph: '身体を丸め、守りを固めようとしている。', text: '身体を固め、攻撃に備えた。', multiplier: 0 };
const LUNGE = { id: 'lunge', name: '突進', telegraph: '後ろへ大きく下がり、一直線に狙いを定めた。', text: '溜めた距離を使って突進した！', multiplier: 1.5 };
const FEINT = { id: 'feint', name: 'フェイント', telegraph: '視線を逸らし、足先だけがこちらを向いている。', text: '視線は囮だった。鋭い一撃が飛んできた！', multiplier: 1.25 };
const REST = { id: 'rest', name: '休息', telegraph: '荒い息を整えようとしている。攻撃は来なさそうだ。', text: '息を整え、隙を見せた。', multiplier: 0 };

export const ENEMIES = [
  A('slime','蒼雫スライム',1.05,.82,1.12,.72,.65,.8,'打撃を柔らかく受ける','演算強打',[STRIKE,GUARD]),
  A('rat','迷宮ネズミ',.72,.88,.62,1.35,.8,.75,'素早いが打たれ弱い','高いDEF',[STRIKE,FEINT,REST]),
  A('goblin','灰耳ゴブリン',.95,1,.85,1.05,.9,1,'規則正しく強打を準備する','強打前の防御',[STRIKE,STRIKE,HEAVY]),
  A('bat','反響コウモリ',.68,.82,.55,1.48,1.2,.85,'音でこちらを探る','観察',[FEINT,STRIKE,REST]),
  A('beetle','鉄殻ビートル',1.18,.85,1.45,.62,.7,1.05,'殻を閉じると非常に硬い','休息の隙',[GUARD,STRIKE,LUNGE]),
  A('wolf','黒牙ウルフ',.9,1.12,.72,1.34,1.05,1.15,'弱った相手への突進を好む','突進前の防御',[STRIKE,LUNGE,STRIKE]),
  A('skeleton','巡回スケルトン',1,1.04,1,1,.82,1,'同じ手順を何度も繰り返す','行動周期の把握',[STRIKE,GUARD,HEAVY]),
  A('moth','幻粉モス',.78,.9,.7,1.18,1.5,1.1,'紛らわしい動きで惑わせる','集中解析',[FEINT,REST,HEAVY]),
  A('orc','赤斧オーク',1.25,1.28,1.04,.72,.78,1.3,'重い一撃の後に息が切れる','強打後の隙',[STRIKE,HEAVY,REST]),
  A('snake','晶洞サーペント',.86,1.1,.7,1.3,1.15,1.15,'距離を取って突進する','予兆への防御',[STRIKE,LUNGE,REST]),
  A('mimic','飢えたミミック',1.25,1.18,1.2,.7,1.35,1.35,'守りと奇襲を交互に行う','観察',[GUARD,FEINT,HEAVY]),
  A('golem','刻印ゴーレム',1.55,1.18,1.55,.48,.9,1.5,'遅いが極めて頑丈','休息の隙',[GUARD,HEAVY,REST]),
  A('harpy','風切ハーピー',.82,1.08,.66,1.5,1.1,1.25,'速度を生かすが疲れやすい','休息の隙',[FEINT,LUNGE,REST]),
  A('ogre','大槌オーガ',1.5,1.4,1.08,.58,.72,1.55,'二撃の後に大技を放つ','強打への防御',[STRIKE,STRIKE,HEAVY,REST]),
  A('wisp','数霊ウィスプ',.75,1.2,.58,1.2,1.62,1.3,'実体が読みづらい','OBS',[REST,FEINT,HEAVY]),
  A('lizard','石鱗リザード',1.15,1.05,1.28,.92,1,1.2,'守りから反撃を狙う','防御中は観察',[GUARD,HEAVY,STRIKE]),
  A('knight','亡国の騎士',1.35,1.22,1.35,.9,1.25,1.5,'隙の少ない型を守る','行動周期の把握',[STRIKE,GUARD,HEAVY,FEINT]),
  A('spider','算糸スパイダー',.88,1.02,.76,1.42,1.45,1.25,'こちらの反応を見て仕掛ける','集中解析',[FEINT,GUARD,LUNGE]),
  A('drake','幼晶ドレイク',1.45,1.38,1.18,1.08,1.18,1.65,'息を整えてから猛攻する','休息中の攻撃',[REST,LUNGE,HEAVY]),
  A('sentinel','深層センチネル',1.62,1.3,1.5,.75,1.4,1.75,'解析しながら確実に攻める','高いOBS',[GUARD,STRIKE,FEINT,HEAVY]),
];

export function createEnemy(floor, rng, options = {}) {
  const [min, max] = floorLevelRange(floor);
  const archetype = options.archetype ?? rng.pick(ENEMIES);
  const elite = options.elite ?? rng.next() < (options.eliteChance ?? CONFIG.eliteChance);
  const level = elite ? Math.max(min + 1, Math.round(rng.int(min, max) * 1.75)) : rng.int(min, max);
  const scale = 1 + (level - 1) * 0.115;
  const stat = (base, factor) => rollStat(base * scale * factor, rng);
  const maxHp = stat(82, archetype.hp) * (elite ? 1.35 : 1);
  return {
    id: archetype.id, name: `${elite ? '異相の' : ''}${archetype.name}`, archetype,
    level, maxHp: Math.round(maxHp), hp: Math.round(maxHp),
    atk: stat(12, archetype.atk) * (elite ? 1.22 : 1), def: stat(10, archetype.def) * (elite ? 1.2 : 1),
    spd: stat(10, archetype.spd), obs: stat(10, archetype.obs), danger: archetype.danger * (elite ? 2 : 1),
    elite, guarded: false, patternIndex: rng.int(0, archetype.pattern.length - 1),
  };
}

export function currentIntent(enemy) {
  return enemy.archetype.pattern[enemy.patternIndex % enemy.archetype.pattern.length];
}

export function advanceIntent(enemy) {
  enemy.patternIndex = (enemy.patternIndex + 1) % enemy.archetype.pattern.length;
}

