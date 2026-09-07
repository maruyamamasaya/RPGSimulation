import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { ENEMIES, createEnemy, currentIntent } from '../src/enemies.js';
import { Game, createPlayer } from '../src/game.js';
import { damage, disclosureScore, expReward } from '../src/formulas.js';
import { Rng } from '../src/rng.js';

test('same seed generates the same enemy', () => {
  assert.deepEqual(createEnemy(27, new Rng(42)), createEnemy(27, new Rng(42)));
});

test('deeper floors produce stronger enemies on average', () => {
  const average = floor => Array.from({length:500},(_,i)=>createEnemy(floor,new Rng(i+1),{elite:false}).atk).reduce((a,b)=>a+b)/500;
  assert.ok(average(100) > average(20) * 2);
});

test('weak enemies and higher OBS disclose more', () => {
  const player = createPlayer();
  const weak = { level:1, obs:3 };
  const strong = { level:10, obs:20 };
  assert.ok(disclosureScore(player, weak) > disclosureScore(player, strong));
  assert.ok(disclosureScore({...player,obs:30}, strong) > disclosureScore(player,strong));
  assert.ok(disclosureScore(player,strong,0,2) > disclosureScore(player,strong,0,0));
});

test('guard substantially reduces incoming damage', () => {
  const full = damage(30,10,1,new Rng(5),1);
  const guarded = damage(30,10,1,new Rng(5),1-CONFIG.guardReduction);
  assert.ok(guarded < full / 2);
});

test('EXP discourages weak enemies and rewards stronger ones', () => {
  assert.ok(expReward(100,5,10) < expReward(100,10,10));
  assert.ok(expReward(100,15,10) > expReward(100,10,10));
});

test('elite generation rate follows configuration', () => {
  const rng = new Rng(99); let elites=0; const trials=30000;
  for(let i=0;i<trials;i++) if(createEnemy(10,rng,{eliteChance:.01}).elite) elites++;
  assert.ok(elites/trials > .007 && elites/trials < .013, `rate=${elites/trials}`);
});

test('zero HP causes game over', () => {
  const game = new Game({seed:7}); game.player.hp=1; game.enemy.atk=9999;
  game.enemy.archetype = { ...game.enemy.archetype, pattern: [{ id:'strike', name:'攻撃', telegraph:'攻撃の構え。', text:'攻撃した。', multiplier:1 }] };
  game.enemy.patternIndex = 0;
  game.dispatch('observe');
  assert.equal(game.status,'gameover'); assert.equal(game.player.hp,0);
});

test('displayed telegraph action is exactly the executed action', () => {
  for (const archetype of ENEMIES) {
    const game = new Game({seed:3});
    game.enemy=createEnemy(10,new Rng(8),{archetype,elite:false});
    game.enemy.patternIndex=0; game.player.hp=9999; game.player.maxHp=9999;
    const intent=currentIntent(game.enemy); game.dispatch('observe');
    assert.ok(game.logs.some(line=>line.includes(intent.text)), archetype.name);
  }
});

test('victory awards EXP, knowledge and advances floor', () => {
  const game=new Game({seed:12}); const id=game.enemy.id; game.enemy.hp=1; game.player.atk=999;
  game.dispatch('attack');
  assert.equal(game.floor,2); assert.ok(game.runExp>0); assert.equal(game.meta.knowledge[id],1);
});
