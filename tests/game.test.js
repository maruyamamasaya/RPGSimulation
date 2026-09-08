import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { ENEMIES, advanceIntent, createEnemy, currentIntent, telegraphText } from '../src/enemies.js';
import { Game, createPlayer } from '../src/game.js';
import { damage, disclosureScore, escapeChance, expReward, goldReward } from '../src/formulas.js';
import { Rng } from '../src/rng.js';
import { createOwnedItem, itemById, rollDrop, shopItems } from '../src/items.js';
import { isEditableTarget, KEY_MAPS, resolveShortcut } from '../src/keyboard.js';
import { bestiaryEntries } from '../src/bestiary.js';
import { createRunStats, finishRun, normalizeRunHistory } from '../src/run-records.js';
import { displayItemName, EQUIPMENT_TRAITS, traitDescription } from '../src/equipment-traits.js';
import { EVENT_CHANCE, FLOOR_EVENTS, eventEquipment, rollFloorEvent } from '../src/events.js';

function equipTrait(game,definitionId,trait,instanceId=`test-${trait}`) {
  const definition=itemById(definitionId);
  const owned=createOwnedItem(definition,game.rng,{instanceId,source:'shop',rolled:false,trait});
  game.player.ownedItems.push(owned);game.player.inventory.push(definitionId);game.status='preparation';game.equip(instanceId);
  return owned;
}

test('drop equipment can be generated with no trait or exactly one seeded trait', () => {
  const definition=itemById('iron-sword');
  const noTraitRng={values:[.5,.9],next(){return this.values.shift()},pick(values){return values[0]}};
  const traitRng={values:[.5,.1],next(){return this.values.shift()},pick(values){return values[0]}};
  assert.equal(createOwnedItem(definition,noTraitRng,{instanceId:'none',source:'drop'}).trait,null);
  assert.equal(createOwnedItem(definition,traitRng,{instanceId:'trait',source:'drop'}).trait,'MIGHT');
  const first=createOwnedItem(definition,new Rng(912),{instanceId:'a',source:'drop'}),second=createOwnedItem(definition,new Rng(912),{instanceId:'b',source:'drop'});
  assert.equal(first.trait,second.trait);assert.ok(first.trait===null||EQUIPMENT_TRAITS[first.trait]);assert.equal(Array.isArray(first.trait),false);
});

test('trait generation never mutates the base item definition and shops have no traits', () => {
  const definition=itemById('iron-sword'),before=JSON.parse(JSON.stringify(definition));
  createOwnedItem(definition,new Rng(3),{instanceId:'drop',source:'drop'});
  const shop=createOwnedItem(definition,new Rng(3),{instanceId:'shop',source:'shop'});
  assert.deepEqual(definition,before);assert.equal(shop.trait,null);
  assert.equal(displayItemName(definition,{trait:'MIGHT'}),'鉄の剣 [豪腕]');assert.equal(traitDescription('MIGHT'),'攻撃力 +10%');
});

test('MIGHT, GUARD and VITAL update displayed player stats once and disappear when unequipped', () => {
  const might=new Game({seed:1,eliteChance:0});equipTrait(might,'rusty-sword','MIGHT');assert.equal(might.player.atk,Math.round((might.player.baseStats.atk+4)*1.1));assert.equal(might.unequip('test-MIGHT'),true);assert.equal(might.player.atk,might.player.baseStats.atk);
  const guard=new Game({seed:1,eliteChance:0});equipTrait(guard,'leather-armor','GUARD');assert.equal(guard.player.def,Math.round((guard.player.baseStats.def+5)*1.1));
  const vital=new Game({seed:1,eliteChance:0});equipTrait(vital,'leather-armor','VITAL');assert.equal(vital.player.maxHp,Math.round((vital.player.baseStats.maxHp+10)*1.1));
});

test('duplicate equipped stat traits are applied only once', () => {
  const game=new Game({seed:2,eliteChance:0});equipTrait(game,'rusty-sword','MIGHT','might-weapon');equipTrait(game,'battle-garb','MIGHT','might-armor');
  assert.equal(game.player.atk,Math.round((game.player.baseStats.atk+4+3)*1.1));
});

test('HUNTER increases damage only against strong enemies', () => {
  const strike=(trait,rank)=>{const game=new Game({seed:44,eliteChance:0});if(trait)equipTrait(game,'leather-armor',trait);game.status='combat';game.player.atk=100;game.enemy=createEnemy(10,game.rng,{archetype:ENEMIES[0],rank});game.enemy.hp=99999;game.hitEnemy(1,'攻撃');return game.feedback.amount};
  assert.equal(strike(null,'normal'),strike('HUNTER','normal'));assert.ok(strike('HUNTER','elite')>strike(null,'elite'));
});

test('FORTUNE increases only the victory Gold reward', () => {
  const win=trait=>{const game=new Game({seed:58,eliteChance:0});if(trait)equipTrait(game,'leather-armor',trait);game.status='combat';game.player.gold=100;game.enemy.hp=1;game.player.atk=99999;game.dispatch('attack');return game};
  const normal=win(null),fortunate=win('FORTUNE');
  assert.equal(fortunate.lastReward.gold,Math.round(normal.lastReward.gold*1.1));assert.equal(fortunate.player.gold,100+fortunate.lastReward.gold);
});

test('LAST_STAND increases damage only when current HP is at or below 30 percent', () => {
  const strike=(trait,hp)=>{const game=new Game({seed:71,eliteChance:0});if(trait)equipTrait(game,'leather-armor',trait);game.status='combat';game.player.hp=Math.round(game.player.maxHp*hp);game.enemy=createEnemy(10,game.rng,{archetype:ENEMIES[0],rank:'normal'});game.enemy.hp=99999;game.hitEnemy(1,'攻撃');return game.feedback.amount};
  assert.equal(strike(null,.8),strike('LAST_STAND',.8));assert.ok(strike('LAST_STAND',.3)>strike(null,.3));
});

test('first encounter registers an enemy and repeated deeper encounters update its history', () => {
  const game = new Game({seed:42,eliteChance:0});
  const enemy = game.enemy.archetype;
  const first = game.meta.bestiary[enemy.id];
  assert.equal(first.encounters,1); assert.equal(first.firstFloor,1); assert.equal(first.deepestFloor,1);
  game.floor=8; game.rng.pick=()=>enemy; game.spawnEnemy();
  const repeated = game.meta.bestiary[enemy.id];
  assert.equal(repeated.encounters,2); assert.equal(repeated.firstFloor,1); assert.equal(repeated.deepestFloor,8);
});

test('title preview can be created without registering an encounter', () => {
  const game = new Game({seed:42,eliteChance:0,recordInitialEncounter:false});
  assert.deepEqual(game.meta.bestiary,{});
});

test('only defeating an encountered enemy increases its bestiary defeat count', () => {
  const victory = new Game({seed:12,eliteChance:0}); const defeatedId=victory.enemy.id;
  victory.enemy.hp=1; victory.player.atk=99999; victory.dispatch('attack');
  assert.equal(victory.meta.bestiary[defeatedId].defeats,1);

  const escape = new Game({seed:14,eliteChance:0}); const escapedId=escape.enemy.id;
  escape.player.spd=99999; escape.rng.next=()=>0; escape.dispatch('escape');
  assert.equal(escape.meta.bestiary[escapedId].defeats,0);
});

test('unencountered bestiary entries hide their names and details', () => {
  const entries=bestiaryEntries({bestFloor:1,knowledge:{},bestiary:{}});
  assert.equal(entries.length,ENEMIES.length);
  assert.ok(entries.every(entry=>entry.name==='？？？'&&!entry.encountered&&entry.firstFloor===null));
});

test('bestiary history survives a version 3 save restore and merges persistent meta', () => {
  const game=new Game({seed:21,eliteChance:0}); const firstId=game.enemy.id;
  game.enemy.hp=1; game.player.atk=99999; game.dispatch('attack');
  const snapshot=JSON.parse(JSON.stringify(game.serialize()));
  const persistent=new Game({seed:31,eliteChance:0}).meta; const persistentId=Object.keys(persistent.bestiary)[0];
  const restored=new Game({savedState:snapshot,meta:persistent});
  assert.equal(restored.meta.bestiary[firstId].defeats,1);
  assert.ok(restored.meta.bestiary[persistentId].encounters>=1);
});

test('victories accumulate run kills, strong kills and earned Gold', () => {
  const normal=new Game({seed:120,eliteChance:0}); normal.enemy.hp=1; normal.player.atk=99999; normal.dispatch('attack');
  assert.equal(normal.runStats.kills,1); assert.equal(normal.runStats.strongKills,0); assert.equal(normal.runStats.goldEarned,normal.lastReward.gold);
  const strong=new Game({seed:121,eliteChance:0}); strong.enemy=createEnemy(10,strong.rng,{archetype:ENEMIES[0],rank:'elite'}); strong.enemy.hp=1; strong.player.atk=99999; strong.dispatch('attack');
  assert.equal(strong.runStats.kills,1); assert.equal(strong.runStats.strongKills,1); assert.equal(strong.runStats.goldEarned,strong.lastReward.gold);
});

test('maximum dealt damage and acquired equipment are tracked without changing combat results', () => {
  const game=new Game({seed:3,eliteChance:0}); game.enemy.hp=99999; game.player.atk=80; game.dispatch('attack');
  assert.equal(game.runStats.maxDamage,game.feedback.amount);
  game.status='shop'; game.player.gold=100; assert.equal(game.buy('rusty-sword'),true); assert.equal(game.runStats.equipmentAcquired,1);
});

test('starting a new run resets only run stats and preserves persistent records', () => {
  const game=new Game({seed:8,eliteChance:0}); const encounteredId=game.enemy.id;
  game.runStats={kills:4,strongKills:2,goldEarned:90,equipmentAcquired:3,maxDamage:44};
  game.meta.records.maxKills=9; game.meta.runHistory=[{id:'old',endedAt:'2026-01-01T00:00:00.000Z',floor:5,kills:3,strongKills:1,goldEarned:40,finalLevel:2}];
  game.startRun();
  assert.deepEqual(game.runStats,createRunStats()); assert.equal(game.meta.records.maxKills,9); assert.equal(game.meta.runHistory.length,1); assert.ok(game.meta.bestiary[encounteredId]);
});

test('game over saves a run result, history entry and newly improved records', () => {
  const game=new Game({seed:7,eliteChance:0,now:()=>Date.parse('2026-09-08T12:00:00Z')});
  game.floor=6; game.runStats={kills:5,strongKills:2,goldEarned:180,equipmentAcquired:3,maxDamage:77}; game.totalTurns=22; game.player.level=4; game.player.gold=35;
  game.player.hp=1; game.enemy.atk=99999; game.enemy.intent={id:'strike',name:'攻撃',text:'攻撃した。',telegraph:'攻撃。',multiplier:1}; game.dispatch('observe');
  assert.equal(game.status,'gameover'); assert.equal(game.meta.runHistory[0].floor,6); assert.equal(game.lastRunResult.finalGold,35);
  assert.deepEqual(new Set(game.lastRunResult.newRecords),new Set(['highestFloor','maxKills','maxStrongKills','maxGoldEarned','maxDamage']));
});

test('lower results do not overwrite best records', () => {
  const meta={bestFloor:20,records:{highestFloor:20,maxKills:10,maxStrongKills:4,maxGoldEarned:500,maxDamage:120},runHistory:[]};
  const result=finishRun(meta,{kills:2,strongKills:0,goldEarned:40,equipmentAcquired:0,maxDamage:30},{floor:3,totalTurns:9,finalLevel:2,finalGold:5,endedAt:'2026-09-08T00:00:00Z'});
  assert.deepEqual(meta.records,{highestFloor:20,maxKills:10,maxStrongKills:4,maxGoldEarned:500,maxDamage:120}); assert.deepEqual(result.newRecords,[]);
});

test('run history keeps only the ten most recent unique results', () => {
  const history=Array.from({length:12},(_,index)=>({id:String(index),endedAt:new Date(Date.UTC(2026,0,index+1)).toISOString(),floor:index+1,kills:index,strongKills:0,goldEarned:index*10,finalLevel:1}));
  const normalized=normalizeRunHistory(history);
  assert.equal(normalized.length,10); assert.equal(normalized[0].id,'11'); assert.equal(normalized.at(-1).id,'2');
});

test('persistent records, history and bestiary survive meta reload normalization', () => {
  const original=new Game({seed:18,eliteChance:0}).meta; const enemyId=Object.keys(original.bestiary)[0];
  original.records.maxKills=7; original.runHistory=[{id:'saved',endedAt:'2026-09-08T00:00:00Z',floor:8,kills:7,strongKills:1,goldEarned:90,finalLevel:3}];
  const reloaded=new Game({seed:19,eliteChance:0,meta:JSON.parse(JSON.stringify(original)),recordInitialEncounter:false});
  assert.equal(reloaded.meta.records.maxKills,7); assert.equal(reloaded.meta.runHistory[0].id,'saved'); assert.ok(reloaded.meta.bestiary[enemyId]);
});

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
  game.enemy.intent = game.enemy.archetype.pattern[0];
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
  assert.equal(game.status,'preparation'); assert.equal(game.floor,1); assert.ok(game.runExp>0); assert.equal(game.meta.knowledge[id],1);
  game.dispatch('advance'); assert.equal(game.floor,2);
});

test('same enemy varies actions across seeds but remains reproducible per seed', () => {
  const archetype = ENEMIES.find(enemy => enemy.id === 'goblin');
  const sequence = seed => {
    const rng = new Rng(seed);
    const enemy = createEnemy(10, rng, { archetype, elite:false });
    const actions = [];
    for (let turn=0; turn<12; turn++) { actions.push(currentIntent(enemy).id); advanceIntent(enemy, rng); }
    return actions;
  };
  assert.deepEqual(sequence(42), sequence(42));
  assert.notDeepEqual(sequence(42), sequence(99));
});

test('ogre ultimate is scheduled on turn 5 to 7 and always has a preparation turn', () => {
  const archetype = ENEMIES.find(enemy => enemy.id === 'ogre');
  for (let seed=1; seed<=40; seed++) {
    const rng = new Rng(seed);
    const enemy = createEnemy(10, rng, { archetype, elite:false });
    assert.ok(enemy.ultimateTurn >= 5 && enemy.ultimateTurn <= 7);
    while (enemy.combatTurn < enemy.ultimateTurn - 1) advanceIntent(enemy, rng);
    assert.equal(currentIntent(enemy).id, 'charge');
    assert.match(telegraphText(enemy), /次の攻撃は極めて危険/);
    advanceIntent(enemy, rng);
    assert.equal(currentIntent(enemy).id, 'ultimate');
    assert.match(telegraphText(enemy), /防御/);
  }
});

test('guard makes an ultimate survivable and records before/after damage', () => {
  const game = new Game({seed:8, eliteChance:0});
  const archetype = ENEMIES.find(enemy => enemy.id === 'ogre');
  game.enemy = createEnemy(1, game.rng, { archetype, elite:false });
  game.enemy.hp = 9999;
  while (game.enemy.combatTurn < game.enemy.ultimateTurn) game.dispatch('guard');
  game.player.hp = game.player.maxHp;
  game.dispatch('guard');
  assert.ok(game.player.hp > 0);
  assert.ok(game.feedback.raw >= game.player.maxHp * .7);
  assert.ok(game.feedback.amount <= game.player.maxHp * .4);
  assert.ok(game.logs.some(line => line.includes('防御成功：本来ダメージ')));
});

test('damage and block outcomes expose short UI feedback data', () => {
  const game = new Game({seed:19, eliteChance:0});
  game.enemy.hp = 9999;
  game.enemy.intent = { id:'strike', name:'攻撃', telegraph:'攻撃の構え。', text:'攻撃した。', multiplier:1 };
  game.dispatch('observe');
  assert.equal(game.feedback.target, 'player');
  assert.equal(game.feedback.type, 'damage');
  game.enemy.intent = { id:'strike', name:'攻撃', telegraph:'攻撃の構え。', text:'攻撃した。', multiplier:1 };
  game.dispatch('guard');
  assert.equal(game.feedback.type, 'block');
  assert.ok(game.feedback.amount < game.feedback.raw / 2);
});

test('blind attack spam is dangerous against an ogre', () => {
  const game = new Game({seed:31, eliteChance:0});
  const archetype = ENEMIES.find(enemy => enemy.id === 'ogre');
  game.enemy = createEnemy(1, game.rng, { archetype, elite:false });
  game.enemy.hp = 9999;
  game.player.atk = 1;
  for (let turn=0; turn<7 && game.status === 'combat'; turn++) game.dispatch('attack');
  assert.ok(game.logs.some(line => line.includes('破砕撃')));
  assert.ok(game.player.hp <= game.player.maxHp * .3);
});

test('victory awards Gold and stronger enemies yield more on average', () => {
  const game=new Game({seed:120,eliteChance:0}); game.enemy.hp=1; game.player.atk=999;
  game.dispatch('attack');
  assert.ok(game.player.gold > 0);
  const average = level => Array.from({length:500},(_,i)=>goldReward(20,level,5,1,new Rng(i+1))).reduce((a,b)=>a+b)/500;
  assert.ok(average(12) > average(5));
});

test('buying costs Gold and insufficient funds cannot buy', () => {
  const game=new Game({seed:2}); game.status='shop'; game.player.gold=100;
  assert.equal(game.buy('rusty-sword'),true); assert.equal(game.player.gold,20); assert.ok(game.player.inventory.includes('rusty-sword'));
  assert.equal(game.buy('leather-armor'),false); assert.equal(game.player.gold,20); assert.ok(!game.player.inventory.includes('leather-armor'));
});

test('equipment recalculates ATK, DEF and HP when changed', () => {
  const game=new Game({seed:3}); game.status='preparation';
  game.player.inventory.push('rusty-sword','leather-armor','dagger');
  const base={...game.player.baseStats};
  assert.equal(game.equip('rusty-sword'),true); assert.equal(game.player.atk,base.atk+4);
  assert.equal(game.equip('leather-armor'),true); assert.equal(game.player.def,base.def+5); assert.equal(game.player.maxHp,base.maxHp+10);
  assert.equal(game.equip('dagger'),true); assert.equal(game.player.atk,base.atk+8); assert.equal(game.player.spd,base.spd+6);
});

test('training stays on the floor, advancing adds one, and repeat rewards decay', () => {
  const game=new Game({seed:4}); game.status='preparation'; game.floor=12;
  game.dispatch('train'); assert.equal(game.floor,12); assert.equal(game.status,'combat');
  game.status='preparation'; game.sameFloorBattles=3; assert.equal(game.rewardRate,.9);
  game.sameFloorBattles=5; assert.equal(game.rewardRate,.75);
  game.sameFloorBattles=8; assert.equal(game.rewardRate,.5);
  game.dispatch('advance'); assert.equal(game.floor,13); assert.equal(game.sameFloorBattles,0);
});

test('save snapshot restores Gold, equipment, floor, HP, EXP and RNG state', () => {
  const game=new Game({seed:55}); game.status='preparation'; game.floor=27; game.player.gold=245; game.player.exp=33; game.player.hp=64;
  game.player.inventory.push('rusty-sword'); game.equip('rusty-sword'); game.sameFloorBattles=4;
  const restored=new Game({savedState:JSON.parse(JSON.stringify(game.serialize()))});
  assert.equal(restored.floor,27); assert.equal(restored.player.gold,245); assert.equal(restored.player.exp,33); assert.equal(restored.player.hp,64);
  assert.equal(restored.player.equipment.weapon,'rusty-sword'); assert.equal(restored.player.atk,restored.player.baseStats.atk+4);
  assert.equal(restored.sameFloorBattles,4); assert.equal(restored.rng.state,game.rng.state);
});

test('seeded equipment drops are reproducible and rolled within definition variance', () => {
  const archetype=ENEMIES.find(enemy=>enemy.id==='ogre');
  const make=()=>{const rng=new Rng(77);const enemy=createEnemy(35,rng,{archetype,rank:'aberrant'});return rollDrop(enemy,35,rng,1);};
  const first=make(),second=make(); assert.deepEqual(first,second); assert.ok(first);
  const definition=itemById(first.definitionId);
  for(const [stat,value] of Object.entries(first.rolledStats)){const base=definition.baseStats[stat];assert.ok(Math.abs(value)>=Math.max(1,Math.round(Math.abs(base)*.9)));assert.ok(Math.abs(value)<=Math.max(1,Math.round(Math.abs(base)*1.1)));}
});

test('defeated strong enemy drop is added to owned items and can be equipped', () => {
  const game=new Game({seed:77,eliteChance:0}); const archetype=ENEMIES.find(enemy=>enemy.id==='ogre');
  game.enemy=createEnemy(35,game.rng,{archetype,rank:'aberrant'}); game.floor=35; game.enemy.hp=1; game.player.atk=99999; game.dispatch('attack');
  assert.ok(game.lastReward.drop); const drop=game.lastReward.drop,definition=itemById(drop.definitionId);
  if(definition.type!=='consumable'){assert.ok(game.player.ownedItems.some(item=>item.instanceId===drop.instanceId));assert.equal(game.equip(drop.instanceId),true);}
});

test('shop series unlock independently after purchasing the previous tier', () => {
  const game=new Game({seed:9});game.status='shop';game.floor=40;game.player.gold=9999;
  assert.ok(!shopItems(40,game.player.shopProgress).some(x=>x.id==='iron-sword'));
  assert.equal(game.buy('rusty-sword'),true);assert.ok(shopItems(40,game.player.shopProgress).some(x=>x.id==='iron-sword'));
  assert.ok(!shopItems(40,game.player.shopProgress).some(x=>x.id==='dagger'));
  assert.equal(game.buy('small-knife'),true);assert.ok(shopItems(40,game.player.shopProgress).some(x=>x.id==='dagger'));
});

test('strong enemy rate follows base, rises with Threat, and respects cap', () => {
  const rate=chance=>{const rng=new Rng(321);let strong=0;for(let i=0;i<30000;i++)if(createEnemy(20,rng,{strongChance:chance}).rank!=='normal')strong++;return strong/30000};
  const base=rate(CONFIG.strongEnemyChance),raised=rate(.08);
  assert.ok(base>.025&&base<.035,`base=${base}`);assert.ok(raised>base+.035,`raised=${raised}`);
  const game=new Game({seed:1});game.threat=1000;assert.equal(game.strongEnemyChance,CONFIG.strongEnemyChanceCap);
});

test('Threat decays after a safe efficient battle', () => {
  const game=new Game({seed:10});game.threat=50;game.battleMetrics={turns:5,unguardedUltimateHits:0,failedEscapes:0,itemsUsed:0};game.player.hp=game.player.maxHp;game.updateThreat();assert.ok(game.threat<50);
});

test('elite and aberrant enemies are stronger and reward at least 10x', () => {
  const archetype=ENEMIES.find(enemy=>enemy.id==='knight'),normal=createEnemy(30,new Rng(5),{archetype,rank:'normal'}),elite=createEnemy(30,new Rng(5),{archetype,rank:'elite'}),aberrant=createEnemy(30,new Rng(5),{archetype,rank:'aberrant'});
  assert.ok(elite.maxHp>normal.maxHp&&elite.atk>normal.atk);assert.ok(aberrant.maxHp>elite.maxHp&&aberrant.atk>elite.atk);assert.match(elite.name,/異相/);assert.match(aberrant.name,/深淵/);
  const rewardFor=rank=>{const game=new Game({seed:18,eliteChance:0});game.enemy=createEnemy(20,new Rng(12),{archetype,rank});game.enemy.hp=1;game.player.atk=99999;game.dispatch('attack');return game.lastReward;};
  const common=rewardFor('normal'),rare=rewardFor('elite'),danger=rewardFor('aberrant');assert.ok(rare.exp>=common.exp*10);assert.ok(danger.exp>=common.exp*18);assert.ok(rare.gold>=common.gold*8);assert.ok(danger.gold>=rare.gold);
});

test('high OBS reveals more about a dangerous enemy and escape remains viable', () => {
  const enemy=createEnemy(20,new Rng(4),{rank:'aberrant'}),low=createPlayer(),high={...createPlayer(),obs:200};
  assert.ok(disclosureScore(high,enemy)>disclosureScore(low,enemy));assert.ok(escapeChance(low,enemy)>=.2);
  const game=new Game({seed:1});game.enemy=enemy;assert.equal(game.recommendedAction,'escape');
});

test('version 3 save preserves drops, shop unlocks, Threat and item identity', () => {
  const game=new Game({seed:88});game.status='shop';game.floor=40;game.player.gold=9999;game.buy('rusty-sword');game.status='preparation';game.threat=47;
  game.runStats.kills=3;game.runStats.goldEarned=140;game.runStats.maxDamage=52;
  const restored=new Game({savedState:JSON.parse(JSON.stringify(game.serialize()))});
  assert.equal(restored.threat,47);assert.equal(restored.player.shopProgress['standard-sword'],1);assert.equal(restored.player.ownedItems[0].instanceId,'rusty-sword');assert.ok(shopItems(40,restored.player.shopProgress).some(x=>x.id==='iron-sword'));
  assert.deepEqual(restored.runStats,game.runStats);
});

test('version 3 save preserves equipment traits and missing traits default to null', () => {
  const game=new Game({seed:17,eliteChance:0});equipTrait(game,'rusty-sword','MIGHT');game.status='preparation';
  const restored=new Game({savedState:JSON.parse(JSON.stringify(game.serialize()))});
  assert.equal(restored.player.ownedItems[0].trait,'MIGHT');assert.equal(restored.player.atk,game.player.atk);
  const legacy=game.serialize();delete legacy.player.ownedItems[0].trait;
  const legacyRestored=new Game({savedState:legacy});assert.equal(legacyRestored.player.ownedItems[0].trait,null);
});

test('unstable battles raise Threat and seeded strong-enemy draws reproduce', () => {
  const game=new Game({seed:7});game.threat=10;game.player.hp=10;game.battleMetrics={turns:20,unguardedUltimateHits:1,failedEscapes:1,itemsUsed:3};game.updateThreat();assert.ok(game.threat>10);
  const sequence=seed=>{const rng=new Rng(seed);return Array.from({length:100},()=>createEnemy(25,rng,{strongChance:.08}).rank)};
  assert.deepEqual(sequence(98),sequence(98));
});

test('version 2 equipment save migrates safely to OwnedItem', () => {
  const game=new Game({seed:6});game.status='preparation';game.player.inventory=['rusty-sword'];game.player.equipment.weapon='rusty-sword';
  const legacy=game.serialize();legacy.version=2;delete legacy.player.ownedItems;delete legacy.player.shopProgress;delete legacy.threat;delete legacy.itemCounter;
  delete legacy.runStats;delete legacy.meta.records;delete legacy.meta.runHistory;
  const restored=new Game({savedState:legacy});assert.equal(restored.player.ownedItems[0].definitionId,'rusty-sword');assert.equal(restored.player.ownedItems[0].trait,null);assert.equal(restored.player.equipment.weapon,'legacy-1');assert.equal(restored.player.atk,restored.player.baseStats.atk+4);assert.deepEqual(restored.runStats,createRunStats());assert.deepEqual(restored.meta.runHistory,[]);
});

test('state key maps expose the requested combat and preparation shortcuts', () => {
  assert.deepEqual(KEY_MAPS.combat,{a:'attack',d:'guard',o:'observe',s:'skills',r:'escape'});
  assert.equal(KEY_MAPS.preparation.n,'advance');assert.equal(KEY_MAPS.preparation.t,'train');assert.equal(KEY_MAPS.preparation.p,'openShop');
  assert.equal(KEY_MAPS.preparation.i,'items');assert.equal(KEY_MAPS.preparation.e,'equipment');assert.equal(KEY_MAPS.preparation.v,'save');
  assert.equal(KEY_MAPS.shop.x,'closeShop');assert.equal(KEY_MAPS.inventory.x,'closeInventory');
});

test('shortcut resolution is case-insensitive and screen-specific', () => {
  const event=key=>({key,repeat:false,metaKey:false,ctrlKey:false,altKey:false,target:{tagName:'BODY',isContentEditable:false}});
  assert.equal(resolveShortcut(event('A'),'combat'),'attack');assert.equal(resolveShortcut(event('d'),'combat'),'guard');assert.equal(resolveShortcut(event('O'),'combat'),'observe');assert.equal(resolveShortcut(event('R'),'combat'),'escape');
  assert.equal(resolveShortcut(event('R'),'skills'),null);assert.equal(resolveShortcut(event('Q'),'skills'),'powerStrike');assert.equal(resolveShortcut(event('X'),'skills'),'closeSkills');
});

test('reserved browser keys and arrows never resolve to game actions', () => {
  const base={repeat:false,metaKey:false,ctrlKey:false,altKey:false,target:{tagName:'BODY',isContentEditable:false}};
  for(const key of [' ','Enter','Escape','Tab','Backspace','Delete','ArrowUp','ArrowDown','1'])assert.equal(resolveShortcut({...base,key},'combat'),null,key);
});

test('repeat, input lock, editable fields and modifiers suppress shortcuts', () => {
  const base={key:'a',repeat:false,metaKey:false,ctrlKey:false,altKey:false,target:{tagName:'BODY',isContentEditable:false}};
  assert.equal(resolveShortcut({...base,repeat:true},'combat'),null);assert.equal(resolveShortcut(base,'combat',true),null);
  for(const modifier of ['metaKey','ctrlKey','altKey'])assert.equal(resolveShortcut({...base,[modifier]:true},'combat'),null);
  for(const tagName of ['INPUT','TEXTAREA','SELECT'])assert.equal(resolveShortcut({...base,target:{tagName}},'combat'),null);
  assert.equal(resolveShortcut({...base,target:{tagName:'DIV',isContentEditable:true}},'combat'),null);assert.equal(isEditableTarget({tagName:'INPUT'}),true);
});

test('floor event rolls are seeded, near fifteen percent, and include all five types', () => {
  const sequence=seed=>{const rng=new Rng(seed);return Array.from({length:300},()=>rollFloorEvent(rng));};
  assert.deepEqual(sequence(412),sequence(412));
  const rng=new Rng(91),results=Array.from({length:30000},()=>rollFloorEvent(rng)),events=results.filter(Boolean);
  assert.ok(events.length/30000>.14&&events.length/30000<.16);assert.deepEqual(new Set(events),new Set(FLOOR_EVENTS.map(event=>event.id)));assert.equal(EVENT_CHANCE,.15);
});

test('advance deterministically chooses combat or an event and event completion starts combat', () => {
  const normal=new Game({seed:1});normal.status='preparation';normal.rng.next=()=>.9;normal.dispatch('advance');assert.equal(normal.status,'combat');assert.equal(normal.floor,2);
  const event=new Game({seed:1});event.status='preparation';event.rng.next=()=>.1;event.dispatch('advance');assert.equal(event.status,'event');assert.equal(event.currentEvent.id,'fountain');
  assert.equal(event.chooseEvent('leave'),true);assert.equal(event.currentEvent.phase,'result');assert.equal(event.finishEvent(),true);assert.equal(event.status,'combat');assert.equal(event.floor,2);
});

test('fountain healing caps at maximum HP and leaving has no effect', () => {
  const game=new Game({seed:2});game.floor=4;game.player.hp=90;game.beginEvent('fountain');assert.equal(game.chooseEvent('drink'),true);assert.equal(game.player.hp,game.player.maxHp);
  const leave=new Game({seed:2});leave.player.hp=60;leave.beginEvent('fountain');leave.chooseEvent('leave');assert.equal(leave.player.hp,60);
});

test('altar costs are safe and grant run-only attack or defense modifiers', () => {
  const hp=new Game({seed:3});hp.player.hp=10;hp.beginEvent('altar');assert.equal(hp.chooseEvent('offerHp'),false);assert.equal(hp.player.hp,10);
  hp.player.hp=100;const beforeAtk=hp.player.atk;assert.equal(hp.chooseEvent('offerHp'),true);assert.equal(hp.runModifiers.atk,.05);assert.ok(hp.player.atk>beforeAtk);assert.ok(hp.player.hp>0);
  const gold=new Game({seed:4});gold.floor=8;gold.player.gold=20;gold.beginEvent('altar');assert.equal(gold.chooseEvent('offerGold'),false);assert.equal(gold.player.gold,20);
  gold.player.gold=100;const beforeDef=gold.player.def;assert.equal(gold.chooseEvent('offerGold'),true);assert.equal(gold.runModifiers.def,.05);assert.ok(gold.player.def>beforeDef);
});

test('chest choices support Gold, compatible trait equipment, damage, and ignore', () => {
  const gold=new Game({seed:5});gold.floor=10;gold.beginEvent('chest');gold.rng.next=()=>.1;assert.equal(gold.chooseEvent('open'),true);assert.ok(gold.player.gold>0);assert.equal(gold.runStats.goldEarned,gold.player.gold);
  const gear=new Game({seed:6});gear.floor=20;gear.beginEvent('chest');let values=[.6,.2,.5,.2,.1];gear.rng.next=()=>values.shift()??.1;assert.equal(gear.chooseEvent('open'),true);assert.equal(gear.player.ownedItems.length,1);assert.ok('trait' in gear.player.ownedItems[0]);assert.equal(gear.runStats.equipmentAcquired,1);
  const trap=new Game({seed:7});trap.player.hp=20;trap.beginEvent('chest');trap.rng.next=()=>.99;trap.chooseEvent('inspect');assert.ok(trap.player.hp>=1);
  const leave=new Game({seed:8});leave.beginEvent('chest');leave.chooseEvent('leave');assert.equal(leave.player.gold,0);
  const traitReward=Array.from({length:100},(_,seed)=>eventEquipment(20,new Rng(seed+1),`event-${seed}`)).find(item=>item.trait);
  assert.ok(traitReward);assert.ok(itemById(traitReward.definitionId));assert.equal(Object.keys(traitReward).includes('rolledStats'),true);
});

test('merchant purchases reuse normal prices and shop equipment has no trait', () => {
  const potion=new Game({seed:9});potion.player.gold=44;potion.beginEvent('merchant');assert.equal(potion.chooseEvent('buyPotion'),false);potion.player.gold=45;assert.equal(potion.chooseEvent('buyPotion'),true);assert.equal(potion.player.consumables.herb,1);assert.equal(potion.player.gold,0);
  const gear=new Game({seed:10});gear.floor=20;gear.player.gold=9999;gear.beginEvent('merchant');const price=itemById(gear.currentEvent.merchantEquipmentId).price;assert.equal(gear.chooseEvent('buyEquipment'),true);assert.equal(gear.player.gold,9999-price);assert.equal(gear.player.ownedItems[0].trait,null);
});

test('dangerous path distinguishes high-risk rewards from the safe route', () => {
  const risky=new Game({seed:11});risky.floor=9;risky.beginEvent('dangerousPath');risky.rng.next=()=>.1;risky.chooseEvent('proceed');assert.ok(risky.player.gold>=25+risky.floor*8);
  const hurt=new Game({seed:12});hurt.player.hp=15;hurt.beginEvent('dangerousPath');hurt.rng.next=()=>.99;hurt.chooseEvent('proceed');assert.equal(hurt.player.hp,1);
  const safe=new Game({seed:13});safe.floor=9;safe.beginEvent('dangerousPath');safe.rng.next=()=>.1;safe.chooseEvent('safe');assert.equal(safe.player.gold,4+safe.floor*2);
});

test('run modifiers survive v3 saves, default for old saves, and reset on a new run', () => {
  const game=new Game({seed:14});game.player.hp=100;game.beginEvent('altar');game.chooseEvent('offerHp');game.status='preparation';const saved=game.serialize();
  const restored=new Game({savedState:JSON.parse(JSON.stringify(saved))});assert.deepEqual(restored.runModifiers,{atk:.05,def:0});assert.equal(restored.player.atk,game.player.atk);
  const legacy=JSON.parse(JSON.stringify(saved));delete legacy.runModifiers;const old=new Game({savedState:legacy});assert.deepEqual(old.runModifiers,{atk:0,def:0});
  restored.startRun();assert.deepEqual(restored.runModifiers,{atk:0,def:0});
});
