import { CONFIG } from './config.js';
import { advanceIntent, createEnemy, currentIntent } from './enemies.js';
import { damage, disclosureScore, efficiency, escapeChance, expReward, expToNext, growPlayer } from './formulas.js';
import { Rng } from './rng.js';

export function createPlayer() {
  return { level: 1, maxHp: 100, hp: 100, atk: 12, def: 10, spd: 10, obs: 10, maxSp: 30, sp: 30, exp: 0 };
}

export class Game {
  constructor({ seed = Date.now(), meta = {}, eliteChance } = {}) {
    this.rng = new Rng(seed);
    this.eliteChance = eliteChance;
    this.meta = { bestFloor: Math.max(1, Number(meta.bestFloor) || 1), knowledge: { ...(meta.knowledge || {}) } };
    this.startRun();
  }

  startRun() {
    this.floor = 1;
    this.player = createPlayer();
    this.status = 'combat';
    this.turn = 1;
    this.observation = 0;
    this.runExp = 0;
    this.totalTurns = 0;
    this.totalHpLost = 0;
    this.logs = ['演算灯を掲げ、終わりのない地下迷宮へ足を踏み入れた。'];
    this.spawnEnemy();
  }

  spawnEnemy() {
    this.enemy = createEnemy(this.floor, this.rng, { eliteChance: this.eliteChance });
    this.observation = 0;
    this.turn = 1;
    this.logs.unshift(this.enemy.elite ? '異質な気配を感じる――戦う必要はない。' : `${this.enemy.name}が道を塞いだ。`);
    this.logs.unshift(`予兆：${currentIntent(this.enemy).telegraph}`);
    this.meta.bestFloor = Math.max(this.meta.bestFloor, this.floor);
  }

  get knowledge() { return this.meta.knowledge[this.enemy.id] || 0; }
  get disclosure() { return disclosureScore(this.player, this.enemy, this.knowledge, this.observation); }
  get efficiency() { return efficiency(this.runExp, this.totalTurns, this.totalHpLost, this.enemy?.danger || 1); }

  dispatch(action) {
    if (action === 'restart' && this.status === 'gameover') { this.startRun(); return; }
    if (this.status !== 'combat') return;
    const beforeHp = this.player.hp;
    let guard = false;
    let enemyActs = true;

    if (action === 'attack') {
      this.hitEnemy(1, '攻撃');
      this.player.sp = Math.min(this.player.maxSp, this.player.sp + 3);
    } else if (action === 'guard') {
      guard = true;
      this.player.sp = Math.min(this.player.maxSp, this.player.sp + 5);
      this.addLog('防御姿勢を取り、衝撃に備えた。');
    } else if (action === 'observe') {
      this.observation = Math.min(CONFIG.maxObservation, this.observation + 1);
      this.player.sp = Math.min(this.player.maxSp, this.player.sp + 2);
      this.addLog(`敵の動きを観察した。情報精度が上がった（解析 ${this.observation}/3）。`);
    } else if (action === 'powerStrike') {
      if (!this.spendSp(CONFIG.skills.powerStrike.cost)) return;
      this.hitEnemy(CONFIG.skills.powerStrike.multiplier, CONFIG.skills.powerStrike.name);
    } else if (action === 'firstAid') {
      if (!this.spendSp(CONFIG.skills.firstAid.cost)) return;
      const healed = Math.min(this.player.maxHp - this.player.hp, Math.round(this.player.maxHp * 0.24 + this.player.obs * 0.4));
      this.player.hp += healed;
      this.addLog(`応急手当でHPを${healed}回復した。`);
    } else if (action === 'focus') {
      if (!this.spendSp(CONFIG.skills.focus.cost)) return;
      this.observation = Math.min(CONFIG.maxObservation, this.observation + 2);
      this.addLog('集中解析により、二段階深く見抜いた。');
    } else if (action === 'escape') {
      const chance = escapeChance(this.player, this.enemy, this.observation);
      if (this.rng.next() < chance) {
        this.addLog(`退路を見切り、逃走に成功した（成功率 ${Math.round(chance * 100)}%）。`);
        enemyActs = false;
        this.spawnEnemy();
      } else this.addLog(`逃走に失敗した（成功率 ${Math.round(chance * 100)}%）。`);
    } else return;

    if (this.enemy.hp <= 0) {
      this.totalTurns += 1;
      this.totalHpLost += Math.max(0, beforeHp - this.player.hp);
      this.win();
      return;
    }
    if (enemyActs) this.enemyTurn(guard);
    this.totalTurns += 1;
    this.totalHpLost += Math.max(0, beforeHp - this.player.hp);
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.status = 'gameover';
      this.addLog(`HPが尽きた。地下${this.floor}階で探索を終えた。敗因は直前の「${this.lastEnemyAction}」。`);
      return;
    }
    this.turn += 1;
    this.addLog(`予兆：${currentIntent(this.enemy).telegraph}`);
  }

  spendSp(cost) {
    if (this.player.sp < cost) { this.addLog(`SPが足りない（必要 ${cost}）。別の行動を選ぼう。`); return false; }
    this.player.sp -= cost;
    return true;
  }

  hitEnemy(multiplier, label) {
    const reduction = this.enemy.guarded ? 0.48 : 1;
    const dealt = damage(this.player.atk, this.enemy.def, multiplier, this.rng, reduction);
    this.enemy.hp = Math.max(0, this.enemy.hp - dealt);
    this.addLog(`${label}で${dealt}ダメージ。${this.enemy.guarded ? '敵の防御に阻まれた。' : ''}`);
    this.enemy.guarded = false;
  }

  enemyTurn(guard) {
    const intent = currentIntent(this.enemy);
    this.lastEnemyAction = intent.name;
    if (intent.id === 'guard') {
      this.enemy.guarded = true;
      this.addLog(`${this.enemy.name}は${intent.text}`);
    } else if (intent.id === 'rest') {
      this.addLog(`${this.enemy.name}は${intent.text} 今が好機だ。`);
    } else {
      const dealt = damage(this.enemy.atk, this.player.def, intent.multiplier, this.rng, guard ? 1 - CONFIG.guardReduction : 1);
      this.player.hp = Math.max(0, this.player.hp - dealt);
      this.addLog(`${this.enemy.name}は${intent.text} ${dealt}ダメージ${guard ? '（防御で軽減）' : ''}。`);
    }
    advanceIntent(this.enemy);
  }

  win() {
    const reward = expReward(18 + this.enemy.level * 8, this.enemy.level, this.player.level, this.enemy.danger);
    this.player.exp += reward;
    this.runExp += reward;
    this.meta.knowledge[this.enemy.id] = this.knowledge + 1;
    this.addLog(`${this.enemy.name}を倒し、${reward} EXPを得た。`);
    while (this.player.exp >= expToNext(this.player.level)) {
      this.player.exp -= expToNext(this.player.level);
      this.levelUp();
    }
    this.floor += 1;
    this.spawnEnemy();
  }

  levelUp() {
    const growth = growPlayer(this.player, this.rng);
    this.player.level += 1;
    for (const stat of ['atk', 'def', 'spd', 'obs', 'maxSp']) this.player[stat] += growth[stat];
    this.player.maxHp += growth.hp;
    this.player.hp = this.player.maxHp;
    this.player.sp = this.player.maxSp;
    this.addLog(`レベル${this.player.level}へ！ HP+${growth.hp} ATK+${growth.atk} DEF+${growth.def} SPD+${growth.spd} OBS+${growth.obs}`);
  }

  addLog(message) {
    this.logs.unshift(message);
    this.logs = this.logs.slice(0, 40);
  }
}
