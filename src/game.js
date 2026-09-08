import { CONFIG } from './config.js';
import { advanceIntent, createEnemy, currentIntent, telegraphText } from './enemies.js';
import { damage, disclosureScore, efficiency, escapeChance, expReward, expToNext, goldReward, growPlayer } from './formulas.js';
import { Rng } from './rng.js';
import { createOwnedItem, initialShopProgress, itemById, rollDrop, shopItems } from './items.js';
import { mergeMeta, normalizeMeta, recordDefeat, recordEncounter } from './bestiary.js';
import { createRunStats, finishRun, normalizeRunStats } from './run-records.js';
import { equippedTraits, goldRewardMultiplier, normalizeTrait, outgoingDamageMultiplier, displayItemName } from './equipment-traits.js';
import { createFloorEvent, eventById, eventEquipment, normalizeRunModifiers, rollFloorEvent } from './events.js';
import { mutationBonus, mutationById, mutationMultiplier, normalizeFloorMutation, rollFloorMutation } from './mutations.js';
import { buildDamageMultiplier, buildDropBonus, buildGoldMultiplier, buildIncomingMultiplier, createSpecializations, MAX_SPECIALIZATIONS, normalizeSpecializations, rollSpecializationCandidates, SPECIALIZATION_MILESTONES, specializationById, specializationCount } from './specializations.js';
import { affinity, affinityMultiplier, applyStatus, beginStatusTurn, createStatuses, damageTypeById, effectiveStat, endStatusTurn, normalizeStatuses, outgoingStatusMultiplier, statusById, weaponDamageType } from './combat-effects.js';

export function createPlayer() {
  return { level: 1, maxHp: 100, hp: 100, atk: 12, def: 10, spd: 10, obs: 10, maxSp: 30, sp: 30, exp: 0,
    baseStats: { maxHp:100, atk:12, def:10, spd:10, obs:10 }, statuses:createStatuses(), gold:0, inventory:[], ownedItems:[], consumables:{}, equipment:{weapon:null,armor:null}, shopProgress:initialShopProgress(), newShopItems:[] };
}

export class Game {
  constructor({ seed = Date.now(), meta = {}, eliteChance, savedState, recordInitialEncounter = true, now = () => Date.now() } = {}) {
    this.rng = new Rng(seed);
    this.eliteChance = eliteChance;
    this.now = now;
    const persistentMeta = normalizeMeta(meta);
    if (savedState) { this.restore(savedState); this.meta = mergeMeta(this.meta, persistentMeta); }
    else { this.meta = persistentMeta; this.startRun(recordInitialEncounter); }
  }

  startRun(recordInitialEncounter = true) {
    this.floor = 1;
    this.player = createPlayer();
    this.status = 'combat';
    this.turn = 1;
    this.observation = 0;
    this.runExp = 0;
    this.runStats = createRunStats();
    this.runModifiers = normalizeRunModifiers();
    this.currentEvent = null;
    this.floorMutation = null;
    this.mutationNotice = null;
    this.specializations=createSpecializations();
    this.specializationMilestones=[];
    this.specializationQueue=[];
    this.pendingSpecialization=null;
    this.lastRunResult = null;
    this.totalTurns = 0;
    this.totalHpLost = 0;
    this.sameFloorBattles = 0;
    this.lastReward = null;
    this.threat = 0;
    this.itemCounter = 0;
    this.battleMetrics = null;
    this.logs = ['演算灯を掲げ、終わりのない地下迷宮へ足を踏み入れた。'];
    this.feedback = null;
    this.feedbackId = 0;
    this.spawnEnemy(recordInitialEncounter);
  }

  spawnEnemy(record = true) {
    const strongChance=this.eliteChance!==undefined?this.eliteChance:Math.min(CONFIG.strongEnemyChanceCap,CONFIG.strongEnemyChance+this.threat*.000625+mutationBonus(this.floorMutation,'ELITE_ZONE',.03));
    this.enemy = createEnemy(this.floor, this.rng, this.eliteChance!==undefined?{eliteChance:this.eliteChance}:{strongChance});
    this.player.statuses=createStatuses();
    this.observation = 0;
    this.turn = 1;
    this.battleMetrics={turns:0,unguardedUltimateHits:0,failedEscapes:0,itemsUsed:0};
    this.logs.unshift(this.enemy.rank==='aberrant' ? '【危険個体】空間が歪んでいる。逃走は正しい判断だ。' : this.enemy.elite ? '【強敵】異質な気配を感じる――戦う必要はない。' : `${this.enemy.name}が道を塞いだ。`);
    this.logs.unshift(`予兆：${telegraphText(this.enemy)}`);
    this.meta.bestFloor = Math.max(this.meta.bestFloor, this.floor);
    if (record) recordEncounter(this.meta, this.enemy.id, this.floor);
  }

  get knowledge() { return this.meta.knowledge[this.enemy.id] || 0; }
  get disclosure() { return disclosureScore(this.player, this.enemy, this.knowledge, this.observation); }
  get efficiency() { return efficiency(this.runExp, this.totalTurns, this.totalHpLost, this.enemy?.danger || 1); }
  get rewardRate() { return this.sameFloorBattles >= 8 ? .5 : this.sameFloorBattles >= 5 ? .75 : this.sameFloorBattles >= 3 ? .9 : 1; }
  get strongEnemyChance() { return Math.min(CONFIG.strongEnemyChanceCap,CONFIG.strongEnemyChance+this.threat*.000625+mutationBonus(this.floorMutation,'ELITE_ZONE',.03)); }
  get threatLabel() { return this.threat>=75?'異常':this.threat>=45?'危険':this.threat>=18?'不穏':'安定'; }
  get recommendedAction() { return this.enemy?.rank==='aberrant'?'escape':null; }

  dispatch(action) {
    if (action === 'restart' && this.status === 'gameover') { this.startRun(); return; }
    if (this.status === 'preparation') return this.preparationAction(action);
    if (this.status === 'shop') return this.shopAction(action);
    if (this.status === 'event') return action==='eventContinue'?this.finishEvent():undefined;
    if (this.status !== 'combat') return;
    if(!['attack','guard','observe','powerStrike','firstAid','focus','escape'].includes(action))return;
    const skillCost={powerStrike:CONFIG.skills.powerStrike.cost,firstAid:CONFIG.skills.firstAid.cost,focus:CONFIG.skills.focus.cost}[action];
    if(skillCost!==undefined&&this.player.sp<skillCost){this.spendSp(skillCost);return;}
    for(const event of beginStatusTurn(this.player))if(event.id==='BLEED')this.addLog(`出血により${event.amount}ダメージ。`);
    for(const event of beginStatusTurn(this.enemy))if(event.id==='BLEED')this.addLog(`${this.enemy.name}は出血により${event.amount}ダメージ。`);
    if(this.player.hp<=0){this.finishDefeat('出血');return;}
    if(this.enemy.hp<=0){this.win();return;}
    const beforeHp = this.player.hp;
    this.feedback = null;
    let guard = false;
    let enemyActs = true;

    if (action === 'attack') {
      this.hitEnemy(1, '攻撃',weaponDamageType(this.player,itemById));
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
      this.hitEnemy(CONFIG.skills.powerStrike.multiplier, CONFIG.skills.powerStrike.name,'BLUNT',{id:'ARMOR_BREAK',chance:1});
    } else if (action === 'firstAid') {
      if (!this.spendSp(CONFIG.skills.firstAid.cost)) return;
      const healed = this.healPlayer(Math.round(this.player.maxHp * 0.24 + this.player.obs * 0.4));
      this.addLog(`応急手当でHPを${healed}回復した。`);
    } else if (action === 'focus') {
      if (!this.spendSp(CONFIG.skills.focus.cost)) return;
      this.observation = Math.min(CONFIG.maxObservation, this.observation + 2);
      this.addLog('集中解析により、二段階深く見抜いた。');
    } else if (action === 'escape') {
      const chance = escapeChance({...this.player,spd:effectiveStat(this.player,'spd')}, {...this.enemy,spd:effectiveStat(this.enemy,'spd')}, this.observation);
      if (this.rng.next() < chance) {
        this.addLog(`退路を見切り、逃走に成功した（成功率 ${Math.round(chance * 100)}%）。`);
        enemyActs = false;
        this.spawnEnemy();
      } else this.addLog(`逃走に失敗した（成功率 ${Math.round(chance * 100)}%）。`);
      if(enemyActs)this.battleMetrics.failedEscapes += 1;
    } else return;

    if (this.enemy.hp <= 0) {
      this.totalTurns += 1;
      this.totalHpLost += Math.max(0, beforeHp - this.player.hp);
      this.win();
      return;
    }
    if (enemyActs) this.enemyTurn(guard);
    endStatusTurn(this.player);endStatusTurn(this.enemy);
    this.totalTurns += 1;
    this.battleMetrics.turns += 1;
    this.totalHpLost += Math.max(0, beforeHp - this.player.hp);
    if (this.player.hp <= 0) {
      this.finishDefeat(this.lastEnemyAction);
      return;
    }
    this.turn += 1;
    this.addLog(`予兆：${telegraphText(this.enemy)}`);
  }

  spendSp(cost) {
    if (this.player.sp < cost) { this.addLog(`SPが足りない（必要 ${cost}）。別の行動を選ぼう。`); return false; }
    this.player.sp -= cost;
    return true;
  }

  hitEnemy(multiplier, label, type='BLUNT', inflictedStatus=null) {
    const reduction = this.enemy.guarded ? 0.48 : 1;
    const relation=affinity(this.enemy,type);
    const dealt = damage(this.player.atk, effectiveStat(this.enemy,'def'), multiplier, this.rng, reduction*outgoingDamageMultiplier(this.player,this.enemy)*buildDamageMultiplier(this.player,this.specializations)*outgoingStatusMultiplier(this.player)*affinityMultiplier(this.enemy,type));
    this.enemy.hp = Math.max(0, this.enemy.hp - dealt);
    this.runStats.maxDamage = Math.max(this.runStats.maxDamage,dealt);
    this.addLog(`${label}（${damageTypeById(type).name}）で${dealt}ダメージ。${relation==='weakness'?'弱点を突いた！':relation==='resistance'?'耐性に阻まれた。':''}${this.enemy.guarded ? '敵の防御に阻まれた。' : ''}`);
    if(inflictedStatus&&this.enemy.hp>0&&this.rng.next()<inflictedStatus.chance){applyStatus(this.enemy,inflictedStatus.id);this.addLog(`${this.enemy.name}へ${statusById(inflictedStatus.id).name}を付与した。`)}
    this.feedback = { target: 'enemy', type: this.enemy.guarded ? 'block' : 'damage', amount: dealt, nonce: ++this.feedbackId };
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
    } else if (intent.id === 'charge') {
      this.addLog(`${this.enemy.name}は${intent.text} 次の行動に備えよう。`);
    } else {
      const baseRaw = intent.ultimate
        ? Math.max(1, Math.round(this.player.maxHp * (0.76 + this.rng.next() * 0.08) + this.enemy.atk * 0.28))
        : damage(this.enemy.atk, effectiveStat(this.player,'def'), intent.multiplier, this.rng, 1);
      const raw=Math.max(1,Math.round(baseRaw*mutationMultiplier(this.floorMutation,'BERSERK',1.15)*outgoingStatusMultiplier(this.enemy)));
      const defendedRaw=Math.max(1,Math.round(raw*buildIncomingMultiplier(this.specializations)));
      const dealt = guard ? Math.max(1, Math.round(defendedRaw * (1 - CONFIG.guardReduction))) : defendedRaw;
      const hpBefore = this.player.hp;
      this.player.hp = Math.max(0, this.player.hp - dealt);
      this.addLog(`${this.enemy.name}は${intent.text}`);
      if (guard) this.addLog(`防御成功：本来ダメージ ${raw} → 防御後 ${dealt}。HP ${hpBefore} → ${this.player.hp}`);
      else this.addLog(defendedRaw!==raw?`堅守：本来ダメージ ${raw} → ${dealt}。HP ${hpBefore} → ${this.player.hp}${intent.ultimate ? '（予兆された危険攻撃）' : ''}`:`本来ダメージ：${raw}。HP ${hpBefore} → ${this.player.hp}${intent.ultimate ? '（予兆された危険攻撃）' : ''}`);
      if(intent.ultimate&&!guard)this.battleMetrics.unguardedUltimateHits += 1;
      this.feedback = { target: 'player', type: guard ? 'block' : 'damage', amount: dealt, raw, nonce: ++this.feedbackId };
      if(intent.status&&this.player.hp>0&&this.rng.next()<intent.status.chance){applyStatus(this.player,intent.status.id);this.addLog(`${statusById(intent.status.id).name}を受けた（${statusById(intent.status.id).duration}ターン）。`)}
    }
    advanceIntent(this.enemy, this.rng);
  }

  finishDefeat(cause){this.player.hp=0;this.status='gameover';this.addLog(`HPが尽きた。地下${this.floor}階で探索を終えた。敗因は直前の「${cause}」。`);this.lastRunResult=finishRun(this.meta,this.runStats,{floor:this.floor,totalTurns:this.totalTurns,finalLevel:this.player.level,finalGold:this.player.gold,endedAt:this.now()});}

  win() {
    const rankMultiplier=this.enemy.rank==='aberrant'?18:this.enemy.rank==='elite'?10:1;
    const reward = Math.max(1, Math.round(expReward(18 + this.enemy.level * 8, this.enemy.level, this.player.level, this.enemy.archetype.danger) * this.rewardRate * rankMultiplier * mutationMultiplier(this.floorMutation,'TRAINING',1.2)));
    const gold = Math.max(1,Math.round(goldReward(this.enemy.archetype.baseGold, this.enemy.level, this.player.level, this.enemy.archetype.danger, this.rng, this.rewardRate) * rankMultiplier * goldRewardMultiplier(this.player) * buildGoldMultiplier(this.specializations) * mutationMultiplier(this.floorMutation,'ABUNDANCE',1.25)));
    this.player.exp += reward;
    this.player.gold += gold;
    this.runExp += reward;
    this.runStats.kills += 1;
    if(this.enemy.elite)this.runStats.strongKills += 1;
    this.runStats.goldEarned += gold;
    recordDefeat(this.meta, this.enemy.id);
    this.meta.knowledge[this.enemy.id] = this.knowledge + 1;
    const drop=rollDrop(this.enemy,this.floor,this.rng,++this.itemCounter,mutationBonus(this.floorMutation,'TREASURE',.10)+buildDropBonus(this.specializations));
    if(drop){const def=itemById(drop.definitionId);if(def.type==='consumable')this.player.consumables[def.id]=(this.player.consumables[def.id]||0)+1;else{this.player.ownedItems.push(drop);this.player.inventory.push(def.id);this.runStats.equipmentAcquired+=1}this.addLog(`DROP：${displayItemName(def,drop)}（${def.rarity.toUpperCase()}）`)}
    this.updateThreat();
    this.addLog(`${this.enemy.elite?'強敵撃破！ ':'勝利！'}EXP +${reward} / Gold +${gold}（報酬率 ${Math.round(this.rewardRate*100)}%）`);
    this.lastReward = { exp:reward, gold, rate:this.rewardRate, drop, rank:this.enemy.rank };
    this.player.statuses=createStatuses();this.enemy.statuses=createStatuses();
    while (this.player.exp >= expToNext(this.player.level)) {
      this.player.exp -= expToNext(this.player.level);
      this.levelUp();
    }
    if(this.specializationQueue.length)this.offerNextSpecialization();else this.status = 'preparation';
  }

  levelUp() {
    const growth = growPlayer(this.player, this.rng);
    this.player.level += 1;
    for (const stat of ['atk', 'def', 'spd', 'obs']) this.player.baseStats[stat] += growth[stat];
    this.player.maxSp += growth.maxSp;
    this.player.baseStats.maxHp += growth.hp;
    this.recalculateEquipment();
    this.player.hp = this.player.maxHp;
    this.player.sp = this.player.maxSp;
    this.addLog(`レベル${this.player.level}へ！ HP+${growth.hp} ATK+${growth.atk} DEF+${growth.def} SPD+${growth.spd} OBS+${growth.obs}`);
    if(SPECIALIZATION_MILESTONES.includes(this.player.level)&&!this.specializationMilestones.includes(this.player.level)&&!this.specializationQueue.includes(this.player.level)&&specializationCount(this.specializations)+this.specializationQueue.length<MAX_SPECIALIZATIONS)this.specializationQueue.push(this.player.level);
  }

  offerNextSpecialization(){const level=this.specializationQueue.shift();if(!level)return false;this.pendingSpecialization={level,candidates:rollSpecializationCandidates(this.rng)};this.status='preparation';this.addLog(`レベル${level}到達。専門強化を選択できる。`);return true;}

  chooseSpecialization(id){
    if(!this.pendingSpecialization?.candidates.includes(id)||specializationCount(this.specializations)>=MAX_SPECIALIZATIONS)return false;
    this.specializations[id]+=1;this.specializationMilestones.push(this.pendingSpecialization.level);this.addLog(`専門強化「${specializationById(id).name} Lv${this.specializations[id]}」を取得した。`);this.pendingSpecialization=null;
    if(this.specializationQueue.length)this.offerNextSpecialization();else this.status='preparation';return true;
  }

  preparationAction(action) {
    this.feedback = null;
    if (action === 'advance') {
      this.floor += 1; this.sameFloorBattles = 0;this.updateFloorMutation();
      const eventId=rollFloorEvent(this.rng);
      if(eventId)this.beginEvent(eventId);else{this.status = 'combat';this.spawnEnemy();}
    } else if (action === 'train') {
      this.sameFloorBattles += 1; this.threat=Math.max(0,this.threat-3); this.status = 'combat'; this.spawnEnemy();
    } else if (action === 'openShop') this.status = 'shop';
    else if (action === 'usePotion') this.useConsumable();
    else if (action.startsWith('use:')) this.useConsumable(action.slice(4));
    else if (action.startsWith('equip:')) this.equip(action.slice(6));
    else if (action.startsWith('unequip:')) this.unequip(action.slice(8));
  }

  shopAction(action) {
    if (action === 'closeShop') { this.status = 'preparation'; return; }
    const [verb, id] = action.split(':');
    if (verb === 'buy') this.buy(id);
    else if (verb === 'equip') this.equip(id);
    else if (verb === 'unequip') this.unequip(id);
  }

  buy(id) {
    const item = itemById(id);
    if (!item || !shopItems(this.floor,this.player.shopProgress).some(entry => entry.id === id)) return false;
    if(item.type!=='consumable'&&this.player.inventory.includes(id))return false;
    if (this.player.gold < item.price) { this.addLog('Goldが足りない。'); return false; }
    this.player.gold -= item.price;
    if (item.type === 'consumable') this.player.consumables[id] = (this.player.consumables[id] || 0) + 1;
    else { const owned=createOwnedItem(item,this.rng,{instanceId:id,source:'shop',rolled:false}); this.player.ownedItems.push(owned); this.player.inventory.push(id); this.runStats.equipmentAcquired+=1; }
    const previous=this.player.shopProgress[item.seriesId]||0;
    this.player.shopProgress[item.seriesId]=Math.max(previous,item.tier);
    this.player.newShopItems=shopItems(this.floor,this.player.shopProgress).filter(x=>x.seriesId===item.seriesId&&x.tier===item.tier+1).map(x=>x.id);
    this.addLog(`${item.name}を${item.price} Gで購入した。`);
    return true;
  }

  equip(id) {
    if (this.status !== 'shop' && this.status !== 'preparation') return false;
    let owned=this.player.ownedItems.find(x=>x.instanceId===id)||this.player.ownedItems.find(x=>x.definitionId===id);
    if(!owned&&this.player.inventory.includes(id)){const definition=itemById(id);owned=createOwnedItem(definition,this.rng,{instanceId:id,source:'shop',rolled:false});this.player.ownedItems.push(owned)}
    const item = itemById(owned?.definitionId);
    if (!item || !['weapon','armor'].includes(item.type)) return false;
    this.player.equipment[item.type] = owned.instanceId;
    this.recalculateEquipment();
    this.addLog(`${item.name}を装備した。`);
    return true;
  }

  updateFloorMutation(){
    if(this.floor<10){this.floorMutation=null;return null;}
    const startFloor=Math.floor(this.floor/10)*10;
    if(this.floorMutation?.startFloor===startFloor)return this.floorMutation;
    const previousId=this.floorMutation?.id||null,selected=rollFloorMutation(this.rng,previousId);
    this.floorMutation={id:selected.id,startFloor,endFloor:startFloor+9};
    this.mutationNotice=`地下${startFloor}〜${startFloor+9}階：階層変異「${selected.name}」が発生した。${selected.description}`;
    this.addLog(this.mutationNotice);return this.floorMutation;
  }

  beginEvent(id) {
    const event=createFloorEvent(id,this.floor,this.rng);
    if(!event)return false;
    this.currentEvent=event;this.status='event';this.meta.bestFloor=Math.max(this.meta.bestFloor,this.floor);
    this.addLog(`イベント「${eventById(id).name}」が発生した。`);return true;
  }

  chooseEvent(choice) {
    if(this.status!=='event'||this.currentEvent?.phase!=='choice')return false;
    const event=this.currentEvent;let result='';
    const heal=rate=>this.healPlayer(Math.round(this.player.maxHp*rate));
    const damagePlayer=rate=>{const amount=Math.min(Math.max(0,this.player.hp-1),Math.max(1,Math.round(this.player.maxHp*rate)));this.player.hp-=amount;return amount;};
    const grantGold=amount=>{this.player.gold+=amount;this.runStats.goldEarned+=amount;return amount;};
    const grantEquipment=source=>{const owned=eventEquipment(this.floor,this.rng,`item-${++this.itemCounter}`,source);this.player.ownedItems.push(owned);this.player.inventory.push(owned.definitionId);this.runStats.equipmentAcquired+=1;return owned;};
    if(event.id==='fountain'){
      if(choice==='drink')result=`泉の水でHPを${heal(.25)}回復した。`;
      else if(choice==='leave')result='泉には触れず、先へ進んだ。';else return false;
    }else if(event.id==='altar'){
      if(choice==='offerHp'){
        const cost=Math.max(1,Math.round(this.player.maxHp*.15));if(this.player.hp<=cost)return false;
        this.player.hp-=cost;this.runModifiers.atk=Math.min(.5,this.runModifiers.atk+.05);this.recalculateEquipment();result=`HPを${cost}捧げ、このラン中のATKが5%上昇した。`;
      }else if(choice==='offerGold'){
        const cost=Math.max(30,this.floor*8);if(this.player.gold<cost)return false;
        this.player.gold-=cost;this.runModifiers.def=Math.min(.5,this.runModifiers.def+.05);this.recalculateEquipment();result=`${cost} Goldを捧げ、このラン中のDEFが5%上昇した。`;
      }else if(choice==='leave')result='祭壇には触れず、先へ進んだ。';else return false;
    }else if(event.id==='chest'){
      if(choice==='open'){
        const roll=this.rng.next();if(roll<.5){const gold=grantGold(18+this.floor*6+this.rng.int(0,18));result=`宝箱から${gold} Goldを得た。`;}else if(roll<.8){const owned=grantEquipment('drop');result=`宝箱から${itemById(owned.definitionId).name}を得た。`;}else result=`罠が作動し、HPに${damagePlayer(.14)}ダメージを受けた。`;
      }else if(choice==='inspect'){
        const roll=this.rng.next();if(roll<.65){const gold=grantGold(8+this.floor*3+this.rng.int(0,8));result=`安全な区画から${gold} Goldを得た。`;}else if(roll<.92){const owned=grantEquipment('drop');result=`罠を外し、${itemById(owned.definitionId).name}を得た。`;}else result=`小さな罠でHPに${damagePlayer(.05)}ダメージを受けた。`;
      }else if(choice==='leave')result='宝箱を無視して先へ進んだ。';else return false;
    }else if(event.id==='merchant'){
      if(choice==='buyPotion'){
        const item=itemById('herb');if(this.player.gold<item.price)return false;this.player.gold-=item.price;this.player.consumables[item.id]=(this.player.consumables[item.id]||0)+1;result=`${item.name}を${item.price} Goldで購入した。`;
      }else if(choice==='buyEquipment'){
        const item=itemById(event.merchantEquipmentId);if(!item||this.player.gold<item.price)return false;this.player.gold-=item.price;const owned=createOwnedItem(item,this.rng,{instanceId:`item-${++this.itemCounter}`,source:'shop',rolled:false});this.player.ownedItems.push(owned);this.player.inventory.push(item.id);this.runStats.equipmentAcquired+=1;result=`${item.name}を${item.price} Goldで購入した。`;
      }else if(choice==='leave')result='取引を断り、先へ進んだ。';else return false;
    }else if(event.id==='dangerousPath'){
      if(choice==='proceed'){
        const roll=this.rng.next();if(roll<.38){const gold=grantGold(25+this.floor*8+this.rng.int(0,24));result=`危険を越え、${gold} Goldを得た。`;}else if(roll<.62){const owned=grantEquipment('drop');result=`危険を越え、${itemById(owned.definitionId).name}を得た。`;}else result=`道が崩れ、HPに${damagePlayer(.18)}ダメージを受けた。`;
      }else if(choice==='safe'){if(this.rng.next()<.55){const gold=grantGold(4+this.floor*2);result=`安全な迂回路で${gold} Goldを拾った。`;}else result='安全に通過したが、何も見つからなかった。';}else return false;
    }else return false;
    event.phase='result';event.result=result;this.addLog(result);return true;
  }

  finishEvent(){if(this.status!=='event'||this.currentEvent?.phase!=='result')return false;this.currentEvent=null;this.status='combat';this.spawnEnemy();return true;}

  unequip(id) {
    if (this.status !== 'shop' && this.status !== 'preparation') return false;
    const slot=Object.keys(this.player.equipment).find(key=>this.player.equipment[key]===id);
    if(!slot)return false;
    this.player.equipment[slot]=null;
    this.recalculateEquipment();
    this.addLog('装備を外した。');
    return true;
  }

  recalculateEquipment() {
    const previousMax = this.player.maxHp;
    for (const stat of ['maxHp','atk','def','spd','obs']) this.player[stat] = this.player.baseStats[stat];
    for (const id of Object.values(this.player.equipment)) {
      const owned=this.player.ownedItems.find(x=>x.instanceId===id);
      if (!owned) continue;
      for (const [stat,value] of Object.entries(owned.rolledStats)) if (stat in this.player) this.player[stat] += value;
    }
    const traits=equippedTraits(this.player);
    if(traits.has('MIGHT'))this.player.atk=Math.round(this.player.atk*1.1);
    if(traits.has('GUARD'))this.player.def=Math.round(this.player.def*1.1);
    if(traits.has('VITAL'))this.player.maxHp=Math.round(this.player.maxHp*1.1);
    this.player.atk=Math.round(this.player.atk*(1+(this.runModifiers?.atk||0)));
    this.player.def=Math.round(this.player.def*(1+(this.runModifiers?.def||0)));
    this.player.hp = Math.min(this.player.maxHp, Math.max(0, this.player.hp + Math.max(0, this.player.maxHp - previousMax)));
  }

  useConsumable(requestedId) {
    const id = requestedId && (this.player.consumables[requestedId] || 0) > 0 ? requestedId : ['elixir','deep-potion','high-potion','mid-potion','herb'].find(key => (this.player.consumables[key] || 0) > 0);
    const item = itemById(id);
    if (!item) { this.addLog('使える回復アイテムがない。'); return false; }
    this.player.consumables[id] -= 1;
    this.battleMetrics && (this.battleMetrics.itemsUsed += 1);
    const before = this.player.hp;
    this.healPlayer(item.bonuses.heal);
    this.addLog(`${item.name}を使った。HP ${before} → ${this.player.hp}`);
    return true;
  }

  healPlayer(amount){const before=this.player.hp,adjusted=Math.max(0,Math.round(amount*mutationMultiplier(this.floorMutation,'DEPLETION',.7)));this.player.hp=Math.min(this.player.maxHp,this.player.hp+adjusted);return this.player.hp-before;}

  serialize() {
    return JSON.parse(JSON.stringify({ version:3, floor:this.floor, player:this.player, enemy:this.enemy, status:this.status,
      turn:this.turn, observation:this.observation, runExp:this.runExp, totalTurns:this.totalTurns, totalHpLost:this.totalHpLost,
      sameFloorBattles:this.sameFloorBattles, lastReward:this.lastReward, runStats:this.runStats, runModifiers:this.runModifiers, currentEvent:this.currentEvent, floorMutation:this.floorMutation, specializations:this.specializations, specializationMilestones:this.specializationMilestones, specializationQueue:this.specializationQueue, pendingSpecialization:this.pendingSpecialization, logs:this.logs, meta:this.meta, rngState:this.rng.state, threat:this.threat, itemCounter:this.itemCounter }));
  }

  restore(state) {
    if (![2,3].includes(state?.version) || !state.player || state.status !== 'preparation') throw new Error('Invalid save data');
    Object.assign(this, state);
    this.meta = normalizeMeta(state.meta);
    this.runStats = normalizeRunStats(state.runStats);
    this.runModifiers = normalizeRunModifiers(state.runModifiers);
    this.currentEvent = state.currentEvent || null;
    this.floorMutation = normalizeFloorMutation(state.floorMutation);
    this.mutationNotice = null;
    this.specializations=normalizeSpecializations(state.specializations);
    this.specializationMilestones=Array.isArray(state.specializationMilestones)?state.specializationMilestones.filter(level=>SPECIALIZATION_MILESTONES.includes(level)).slice(0,MAX_SPECIALIZATIONS):[];
    this.specializationQueue=Array.isArray(state.specializationQueue)?state.specializationQueue.filter(level=>SPECIALIZATION_MILESTONES.includes(level)&&!this.specializationMilestones.includes(level)).slice(0,MAX_SPECIALIZATIONS):[];
    const candidates=state.pendingSpecialization?.candidates?.filter(id=>specializationById(id));
    this.pendingSpecialization=Number.isFinite(state.pendingSpecialization?.level)&&candidates?.length?{level:state.pendingSpecialization.level,candidates:[...new Set(candidates)].slice(0,3)}:null;
    this.lastRunResult = null;
    this.rng = new Rng(1); this.rng.state = Number(state.rngState);
    this.feedback = null; this.feedbackId = 0;
    this.player.statuses=normalizeStatuses(this.player.statuses);
    this.player.baseStats ||= { maxHp:this.player.maxHp, atk:this.player.atk, def:this.player.def, spd:this.player.spd, obs:this.player.obs };
    this.player.ownedItems ||= (this.player.inventory||[]).map((id,index)=>createOwnedItem(itemById(id),this.rng,{instanceId:`legacy-${index+1}`,source:'shop',rolled:false}));
    for(const owned of this.player.ownedItems)owned.trait=normalizeTrait(owned.trait);
    this.player.shopProgress ||= initialShopProgress(); this.player.newShopItems ||= []; this.threat ||= 0; this.itemCounter ||= this.player.ownedItems.length;
    for(const slot of ['weapon','armor']){const old=this.player.equipment[slot];if(old&&!this.player.ownedItems.some(x=>x.instanceId===old)){this.player.equipment[slot]=this.player.ownedItems.find(x=>x.definitionId===old)?.instanceId||null}}
    this.recalculateEquipment();
  }

  updateThreat() {
    const before=this.threat;
    let change=0, hpRate=this.player.hp/this.player.maxHp;
    if(hpRate<=.2)change+=8;
    if(this.battleMetrics.turns>=Math.max(8,this.enemy.maxHp/Math.max(1,this.player.atk)*4))change+=7;
    change+=this.battleMetrics.unguardedUltimateHits*10+this.battleMetrics.failedEscapes*4+Math.max(0,this.battleMetrics.itemsUsed-1)*3;
    if(change===0&&hpRate>.55&&this.battleMetrics.turns<=12)change=-5;
    this.threat=Math.max(0,Math.min(100,Math.round(this.threat*.8+change)));
    if(this.threat>before)this.addLog('戦闘の乱れに呼応し、ダンジョンの気配が不穏になった。');
    else if(this.threat<before)this.addLog('戦いを終えると、ダンジョンの気配が少し静まった。');
  }

  addLog(message) {
    this.logs.unshift(message);
    this.logs = this.logs.slice(0, 40);
  }
}
