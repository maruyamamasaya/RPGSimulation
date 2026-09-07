import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { ENEMIES, advanceIntent, createEnemy, currentIntent, telegraphText } from '../src/enemies.js';
import { Game, createPlayer } from '../src/game.js';
import { damage, disclosureScore, escapeChance, expReward, goldReward } from '../src/formulas.js';
import { Rng } from '../src/rng.js';
import { itemById, rollDrop, shopItems } from '../src/items.js';
import { isEditableTarget, KEY_MAPS, resolveShortcut } from '../src/keyboard.js';

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
  const restored=new Game({savedState:JSON.parse(JSON.stringify(game.serialize()))});
  assert.equal(restored.threat,47);assert.equal(restored.player.shopProgress['standard-sword'],1);assert.equal(restored.player.ownedItems[0].instanceId,'rusty-sword');assert.ok(shopItems(40,restored.player.shopProgress).some(x=>x.id==='iron-sword'));
});

test('unstable battles raise Threat and seeded strong-enemy draws reproduce', () => {
  const game=new Game({seed:7});game.threat=10;game.player.hp=10;game.battleMetrics={turns:20,unguardedUltimateHits:1,failedEscapes:1,itemsUsed:3};game.updateThreat();assert.ok(game.threat>10);
  const sequence=seed=>{const rng=new Rng(seed);return Array.from({length:100},()=>createEnemy(25,rng,{strongChance:.08}).rank)};
  assert.deepEqual(sequence(98),sequence(98));
});

test('version 2 equipment save migrates safely to OwnedItem', () => {
  const game=new Game({seed:6});game.status='preparation';game.player.inventory=['rusty-sword'];game.player.equipment.weapon='rusty-sword';
  const legacy=game.serialize();legacy.version=2;delete legacy.player.ownedItems;delete legacy.player.shopProgress;delete legacy.threat;delete legacy.itemCounter;
  const restored=new Game({savedState:legacy});assert.equal(restored.player.ownedItems[0].definitionId,'rusty-sword');assert.equal(restored.player.equipment.weapon,'legacy-1');assert.equal(restored.player.atk,restored.player.baseStats.atk+4);
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
