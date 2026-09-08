import { Game } from './game.js';
import { currentIntent, telegraphText } from './enemies.js';
import { bestiaryEntries } from './bestiary.js';
import { escapeChance, expToNext } from './formulas.js';
import { describeBonuses, itemById, RARITY_LABEL, shopItems } from './items.js';
import { ITEM_KEYS, resolveShortcut } from './keyboard.js';
import { displayItemName, traitDescription } from './equipment-traits.js';
import { eventById } from './events.js';
import { mutationById } from './mutations.js';
import { buildSummary, specializationById } from './specializations.js';
import { affinityKnowledge, damageTypeById, effectiveStat, statusById, statusList } from './combat-effects.js';

const STORAGE_KEY = 'formula-dungeon:meta:v1';
const SAVE_KEY = 'formula-dungeon:save:v3';
const OLD_SAVE_KEY = 'formula-dungeon:save:v2';

function loadMeta() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value?.version === 1 && Number.isFinite(value.bestFloor) && value.knowledge && typeof value.knowledge === 'object') return value;
  } catch { /* Invalid local-only data safely falls back to defaults. */ }
  return { version: 1, bestFloor: 1, knowledge: {} };
}

let game = new Game({ meta: loadMeta(), recordInitialEncounter:false });
const $ = (selector) => document.querySelector(selector);
let lastSaveTime = null;
let inputLocked = false;
let selectedItem = null;
let visibleSelections = [];
let shownMutationNotice = null;

function saveMeta() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...game.meta }));
}

function meter(current, max, kind) {
  const percent = Math.max(0, Math.min(100, current / max * 100));
  return `<div class="meter ${kind}"><i style="width:${percent}%"></i></div>`;
}

function estimate(label, value, score) {
  if (score >= 0.82) return `<dt>${label}</dt><dd>${Math.round(value)}</dd>`;
  if (score >= 0.5) return `<dt>${label}</dt><dd>${Math.round(value * .9)}〜${Math.round(value * 1.1)}</dd>`;
  if (score >= 0.28) {
    const word = value > game.player[label.toLowerCase()] * 1.25 ? '非常に高い' : value > game.player[label.toLowerCase()] * .92 ? '同程度' : '低そう';
    return `<dt>${label}</dt><dd>${word}</dd>`;
  }
  return `<dt>${label}</dt><dd>???</dd>`;
}

function bonus(stat) { return game.player[stat] - game.player.baseStats[stat]; }
function statDetail(stat) { const value=bonus(stat); return value ? ` <small>（基礎${game.player.baseStats[stat]} ${value>0?'+':''}${value}）</small>` : ''; }
function ownedByInstance(id) { return game.player.ownedItems.find(item=>item.instanceId===id); }
function equippedName(slot) { const owned=ownedByInstance(game.player.equipment[slot]);const item=itemById(owned?.definitionId);return item?displayItemName(item,owned):'なし'; }
const names=ids=>ids?.length?ids.map(id=>damageTypeById(id).name).join('・'):'なし';
const statusText=target=>{const entries=statusList(target);return entries.length?entries.map(entry=>`${entry.name} ${entry.turns}T`).join(' / '):'なし'};

function render() {
  const p = game.player;
  const e = game.enemy;
  const score = game.disclosure;
  const isCombat = game.status === 'combat';
  document.body.classList.toggle('mobile-combat', isCombat);
  $('#floor').textContent = `地下 ${game.floor}階`;
  $('#best').textContent = `最高 ${game.meta.bestFloor}階`;
  $('#header-level').textContent = p.level;
  $('#header-gold').textContent = `${p.gold} G`;
  $('#header-threat').textContent = game.threatLabel;
  $('#player-level').textContent = `LV.${p.level}`;
  $('#player-stats').innerHTML = `
    <div class="vital player-hp"><span>HP</span><strong>${p.hp} / ${p.maxHp}</strong></div>${meter(p.hp,p.maxHp,'hp')}
    <div class="vital player-sp"><span>SP</span><strong>${p.sp} / ${p.maxSp}</strong></div>${meter(p.sp,p.maxSp,'sp')}
    <div class="stat-row"><span>ATK <b>${p.atk}${statDetail('atk')}</b></span><span>DEF <b>${p.def}${statDetail('def')}</b></span><span>SPD <b>${p.spd}${statDetail('spd')}</b></span><span>OBS <b>${p.obs}${statDetail('obs')}</b></span></div>
    <div class="equipment-line">武器：${equippedName('weapon')}<br>防具：${equippedName('armor')}</div>
    <div class="xp"><span>次のLV</span><b>${p.exp} / ${expToNext(p.level)} EXP</b>${meter(p.exp,expToNext(p.level),'xp')}</div>`;
  $('#enemy-name').textContent = e.rank==='aberrant'&&score<.25 ? '？？？' : e.name;
  $('#enemy-level').textContent = score >= .7 ? `LV.${e.level}` : score >= .35 ? `LV.${Math.max(1,e.level-2)}〜${e.level+2}` : 'LV.???';
  $('#enemy-hp').innerHTML = score >= .82 ? `<span>HP ${e.hp} / ${e.maxHp}</span>${meter(e.hp,e.maxHp,'enemy')}` : score >= .48 ? `<span>HP 推定 ${Math.round(e.hp*.9)}〜${Math.round(e.hp*1.1)}</span>${meter(e.hp,e.maxHp,'enemy')}` : '<span>HP ???</span>';
  $('#enemy-stats').innerHTML = estimate('ATK',e.atk,score) + estimate('DEF',e.def,score-.08) + estimate('SPD',e.spd,score+.05);
  const known=affinityKnowledge(e.archetype,{observation:game.observation,knowledge:game.knowledge});
  $('#affinity-readout').textContent=`弱点 ${known.weaknesses===null?'不明':names(known.weaknesses)} / 耐性 ${known.resistances===null?'不明':names(known.resistances)}`;
  $('#combat-statuses').textContent=`敵：${statusText(e)}　探索者：${statusText(p)}`;
  $('#telegraph').textContent = telegraphText(e);
  const intent=currentIntent(e),dangerousIntent=intent.ultimate||intent.id==='charge';
  $('#telegraph-panel').classList.toggle('danger',dangerousIntent);
  $('#telegraph-label').textContent=dangerousIntent?'危険：次の敵行動':'次の敵行動';
  $('#trait').textContent = score >= .55 ? `${e.archetype.trait}。弱点：${score >= .78 ? e.archetype.weakness : 'さらに観察が必要'}` : '動きの意図はまだ読み切れない。観察すれば判明する。';
  $('#elite-alert').hidden = !e.elite;
  $('#elite-alert').className = `elite-alert ${e.rank || 'normal'}`;
  $('#elite-alert').textContent = e.rank === 'aberrant' ? '【危険】現在の戦力では勝率が低い可能性があります。逃走を推奨します。' : '【強敵】高リスク・高報酬。撤退も戦略です。';
  $('#enemy-name').className = e.rank || 'normal';
  document.querySelector('[data-action="escape"]').classList.toggle('primary-escape',game.recommendedAction==='escape');
  $('#escape-rate').textContent = `成功率 ${Math.round(escapeChance({...p,spd:effectiveStat(p,'spd')},{...e,spd:effectiveStat(e,'spd')},game.observation)*100)}%`;
  const threatHint=p.obs>=18?` / 強敵率 約${Math.round(game.strongEnemyChance*100)}%`:'';
  const mutation=mutationById(game.floorMutation?.id);
  const build=buildSummary(game.specializations);
  $('#run-stats').innerHTML = `<p><span>戦闘ターン</span><b>${game.totalTurns}</b></p><p><span>獲得EXP</span><b>${game.runExp}</b></p><p><span>成長効率</span><b>${game.efficiency}</b></p><p><span>討伐知識</span><b>${game.knowledge}回</b></p><p><span>解析深度</span><b>${game.observation} / 3</b></p><p><span>ダンジョンの気配</span><b>${game.threatLabel}${threatHint}</b></p><p><span>階層変異</span><b>${mutation?.name||'なし'}</b></p><p><span>現在のビルド</span><b>${build}</b></p>`;
  $('#mutation-menu-info').textContent=mutation?`変異：${mutation.name} — ${mutation.description}`:'変異：なし（1〜9階）';
  $('#build-menu-info').textContent=`現在のビルド：${build}`;
  if(game.mutationNotice&&game.mutationNotice!==shownMutationNotice){shownMutationNotice=game.mutationNotice;const notice=$('#mutation-notice');notice.textContent=game.mutationNotice;notice.hidden=false;setTimeout(()=>{notice.hidden=true;},3600);}
  const log = $('#log'); log.replaceChildren(...game.logs.map((entry, i) => { const li=document.createElement('li'); li.textContent=entry; if(i===0) li.className='latest'; return li; }));
  $('#mobile-menu-button').setAttribute('aria-expanded', String(!$('#mobile-menu').hidden));
  $('#gameover').hidden = game.status !== 'gameover';
  if (game.status === 'gameover') renderGameover();
  $('#actions').hidden = !isCombat;
  $('#skills').hidden = !isCombat || $('#skills').hidden;
  $('#preparation').hidden = game.status !== 'preparation';
  $('#event-panel').hidden = game.status !== 'event';
  $('#specialization-modal').hidden = !game.pendingSpecialization;
  $('#shop').hidden = game.status !== 'shop';
  if (game.status === 'preparation') renderPreparation();
  if (game.status === 'shop') renderShop();
  if (game.status === 'event') renderEvent();
  if (game.pendingSpecialization) renderSpecialization();
  renderKeyboardHelp();
  showFeedback(game.feedback);
  saveMeta();
}

function renderPreparation() {
  const reward=game.lastReward;
  const drop=reward?.drop?itemById(reward.drop.definitionId):null;
  $('#reward-summary').innerHTML = reward ? `${reward.rank&&reward.rank!=='normal'?'強敵撃破！<br>':''}EXP +${reward.exp} / Gold +${reward.gold}${drop?`<br><span class="rarity-${drop.rarity}">DROP：${displayItemName(drop,reward.drop)}［${RARITY_LABEL[drop.rarity]} / ${drop.rarity.toUpperCase()}］ ${describeBonuses(reward.drop.rolledStats)}${reward.drop.trait?` / ${traitDescription(reward.drop.trait)}`:''}</span>`:''}` : '探索を再開しました。';
  $('#prep-status').textContent = `地下${game.floor}階　HP ${game.player.hp} / ${game.player.maxHp}　Gold ${game.player.gold} G　気配：${game.threatLabel}`;
  const nextBattles=game.sameFloorBattles+1;
  const nextRate=nextBattles>=8?.5:nextBattles>=5?.75:nextBattles>=3?.9:1;
  $('#training-rate').textContent = `次戦の報酬率 ${Math.round(nextRate*100)}%`;
  $('#potion-count').textContent = `所持 ${Object.values(game.player.consumables).reduce((a,b)=>a+b,0)}`;
  $('#save-time').textContent = lastSaveTime ? `最終保存 ${lastSaveTime}` : '進行を保存';
}

function itemCard(item, owned=null, shortcut=null, selectionIndex=null) {
  const equipped=owned&&Object.values(game.player.equipment).includes(owned.instanceId);
  const action=owned?`${equipped?'unequip':'equip'}:${owned.instanceId}`:`buy:${item.id}`;
  const isNew=game.player.newShopItems.includes(item.id);
  const selector=!owned&&selectionIndex!==null?`data-select-index="${selectionIndex}"`:`data-action="${action}"`;
  return `<article class="rarity-card rarity-${item.rarity}"><div><b>${shortcut?`<kbd>${shortcut.toUpperCase()}</kbd> `:''}${displayItemName(item,owned)}</b>${isNew?'<em>NEW</em>':''}<small>${item.type}${item.damageType?`・${damageTypeById(item.damageType).name}`:''} / ${RARITY_LABEL[item.rarity]} / ${item.rarity.toUpperCase()} / Lv.${item.recommendedLevel}目安</small><p>${describeBonuses(owned?.rolledStats||item.baseStats)}${owned?.trait?` / <span class="trait-effect">${traitDescription(owned.trait)}</span>`:''}</p><small>所持 ${owned?1:game.player.inventory.filter(id=>id===item.id).length}</small></div><button ${selector}>${equipped?'外す':owned?'装備する':'選択'}</button></article>`;
}

function renderShop() {
  $('#shop-gold').textContent = `所持金 ${game.player.gold} G`;
  visibleSelections=shopItems(game.floor,game.player.shopProgress).map(item=>({kind:'shop',item}));
  $('#shop-items').innerHTML = visibleSelections.map((entry,index) => itemCard(entry.item,null,ITEM_KEYS[index],index)).join('');
  $('#inventory').innerHTML = game.player.ownedItems.length ? game.player.ownedItems.map(owned => itemCard(itemById(owned.definitionId),owned)).join('') : '<p>装備はまだありません。</p>';
}

function renderItems(mode='items') {
  $('#items-title').textContent=mode==='equipment'?'装備変更':'所持アイテム';
  visibleSelections=game.player.ownedItems.map(owned=>({kind:'owned',item:itemById(owned.definitionId),owned}));
  if(mode==='items') for(const [id,count] of Object.entries(game.player.consumables)) if(count)visibleSelections.push({kind:'consumable',item:itemById(id),count});
  let html=visibleSelections.map((entry,index)=>entry.kind==='consumable'?`<article class="rarity-card rarity-${entry.item.rarity}"><div><b>${ITEM_KEYS[index]?`<kbd>${ITEM_KEYS[index].toUpperCase()}</kbd> `:''}${entry.item.name}</b><small>consumable / ${RARITY_LABEL[entry.item.rarity]} / ${entry.item.rarity.toUpperCase()}</small><p>${describeBonuses(entry.item.baseStats)}</p><small>所持 ${entry.count}</small></div><button data-select-index="${index}">選択</button></article>`:itemCard(entry.item,entry.owned,ITEM_KEYS[index],index)).join('');
  $('#items-list').innerHTML=html||'<p>該当するアイテムはありません。</p>';
  $('#items-modal').hidden=false;
}

function renderSpecialization(){
  const pending=game.pendingSpecialization;if(!pending)return;
  $('#specialization-copy').textContent=`Level ${pending.level} 到達。今回のランに追加する強化を1つ選んでください。`;
  $('#specialization-choices').innerHTML=pending.candidates.map(id=>{const entry=specializationById(id),next=(game.specializations[id]||0)+1;return `<button data-specialization="${id}"><b>${entry.name} Lv${next}</b><span>${entry.description}</span></button>`;}).join('');
}

function renderEvent(){
  const event=game.currentEvent,definition=eventById(event?.id);if(!event||!definition)return;
  $('#event-name').textContent=definition.name;$('#event-description').textContent=definition.description;
  const altarGold=Math.max(30,game.floor*8),merchant=itemById(event.merchantEquipmentId);
  $('#event-choices').innerHTML=definition.choices.map(([id,label])=>{
    const disabled=(id==='offerHp'&&game.player.hp<=Math.max(1,Math.round(game.player.maxHp*.15)))||(id==='offerGold'&&game.player.gold<altarGold)||(id==='buyPotion'&&game.player.gold<itemById('herb').price)||(id==='buyEquipment'&&(!merchant||game.player.gold<merchant.price));
    const detail=id==='offerGold'?`${altarGold} G`:id==='buyPotion'?`${itemById('herb').price} G`:id==='buyEquipment'&&merchant?`${merchant.name} / ${merchant.price} G`:'';
    return `<button data-event-choice="${id}" ${disabled?'disabled':''}><b>${label}</b>${detail?`<small>${detail}</small>`:''}</button>`;
  }).join('');
  const resolved=event.phase==='result';$('#event-choices').hidden=resolved;$('#event-result').hidden=!resolved;
  $('#event-result').innerHTML=resolved?`<p>${event.result}</p><button data-action="eventContinue"><b>次へ進む</b><small>戦闘へ</small></button>`:'';
}

function renderGameover() {
  const result=game.lastRunResult;
  if(!result)return;
  const labels={highestFloor:'最高到達階層',maxKills:'最多撃破数',maxStrongKills:'最多強敵撃破数',maxGoldEarned:'最多Gold獲得',maxDamage:'最大与ダメージ'};
  const record=key=>result.newRecords.includes(key)?`<small class="new-record">${labels[key]} NEW RECORD</small>`:'';
  $('#gameover-copy').textContent = `地下${result.floor}階で探索終了。今回の記録を次の挑戦へつなげよう。`;
  $('#run-result').innerHTML = `
    <div><span>到達階層</span><b>${result.floor}</b>${record('highestFloor')}</div>
    <div><span>撃破した敵</span><b>${result.kills}</b>${record('maxKills')}</div>
    <div><span>強敵撃破</span><b>${result.strongKills}</b>${record('maxStrongKills')}</div>
    <div><span>獲得Gold</span><b>${result.goldEarned}</b>${record('maxGoldEarned')}</div>
    <div><span>獲得装備</span><b>${result.equipmentAcquired}</b></div>
    <div><span>最大与ダメージ</span><b>${result.maxDamage}</b>${record('maxDamage')}</div>
    <div><span>総ターン数</span><b>${result.totalTurns}</b></div>
    <div><span>最終レベル</span><b>LV.${result.finalLevel}</b></div>
    <div><span>最終所持Gold</span><b>${result.finalGold} G</b></div>`;
  $('#run-history').innerHTML=game.meta.runHistory.map(entry=>`<li><time>${new Date(entry.endedAt).toLocaleString()}</time><span>地下${entry.floor}階 / 撃破${entry.kills} / 強敵${entry.strongKills} / ${entry.goldEarned} G / LV.${entry.finalLevel}</span></li>`).join('');
}

function renderBestiary() {
  const entries = bestiaryEntries(game.meta);
  const encountered = entries.filter(entry => entry.encountered).length;
  $('#bestiary-progress').textContent = `発見 ${encountered} / ${entries.length}`;
  $('#bestiary-list').innerHTML = entries.map(entry => entry.encountered ? `
    <article class="bestiary-card"><h3>${entry.name}</h3><p>遭遇済み</p><dl><div><dt>遭遇</dt><dd>${entry.encounters}回</dd></div><div><dt>撃破</dt><dd>${entry.defeats}回</dd></div><div><dt>初回</dt><dd>${entry.firstFloor ? `地下${entry.firstFloor}階` : '記録なし'}</dd></div><div><dt>最深</dt><dd>${entry.deepestFloor ? `地下${entry.deepestFloor}階` : '記録なし'}</dd></div></dl><p class="bestiary-intel">弱点：${entry.weaknesses===null?'未解析':names(entry.weaknesses)} / 耐性：${entry.resistances===null?'未解析':names(entry.resistances)}<br>状態異常：${entry.statuses===null?'未解析':entry.statuses.length?entry.statuses.map(id=>statusById(id).name).join('・'):'なし'}</p></article>` : `
    <article class="bestiary-card unknown"><h3>？？？</h3><p>未遭遇</p></article>`).join('');
  $('#bestiary-modal').hidden = false;
  renderKeyboardHelp();
}

function closeMobileMenu() { $('#mobile-menu').hidden=true; $('#mobile-menu-button').setAttribute('aria-expanded','false'); }
function openMobileMenu() { $('#mobile-menu').hidden=false; $('#mobile-menu-button').setAttribute('aria-expanded','true'); }
function renderRecords() {
  const best=game.meta.records||{};
  $('#best-records').innerHTML=`<div><span>最高到達階層</span><b>${best.highestFloor||game.meta.bestFloor||1}</b></div><div><span>最多撃破数</span><b>${best.maxKills||0}</b></div><div><span>最多強敵撃破</span><b>${best.maxStrongKills||0}</b></div><div><span>最多Gold獲得</span><b>${best.maxGoldEarned||0}</b></div><div><span>最大与ダメージ</span><b>${best.maxDamage||0}</b></div>`;
  $('#records-history').innerHTML=(game.meta.runHistory||[]).map(entry=>`<li><time>${new Date(entry.endedAt).toLocaleString()}</time><span>地下${entry.floor}階 / 撃破${entry.kills} / 強敵${entry.strongKills} / ${entry.goldEarned} G / LV.${entry.finalLevel}</span></li>`).join('')||'<li>記録はまだありません。</li>';
  $('#records-modal').hidden=false;
}
function renderFullLog() {
  $('#full-log').replaceChildren(...game.logs.map((entry,i)=>{const li=document.createElement('li');li.textContent=entry;if(i===0)li.className='latest';return li;}));
  $('#log-modal').hidden=false;
}

function currentScreen() {
  if(!$('#selection-dialog').hidden)return 'selection';
  if(!$('#mobile-menu').hidden||!$('#records-modal').hidden||!$('#log-modal').hidden||!$('#specialization-modal').hidden)return 'none';
  if(!$('#bestiary-modal').hidden)return 'bestiary';
  if(!$('#title-screen').hidden||!$('#gameover').hidden)return 'none';
  if(!$('#items-modal').hidden)return 'inventory';
  if(game.status==='shop')return 'shop';
  if(game.status==='combat'&&!$('#skills').hidden)return 'skills';
  return game.status;
}

function renderKeyboardHelp() {
  const text={combat:'A 攻撃　D 防御　O 観察　S スキル　R 逃走',skills:'Q 演算強打　W 応急手当　E 集中解析　X 戻る',preparation:'N 次階層　T 鍛錬　P ショップ　E 装備　I アイテム　V セーブ',shop:'Q〜N 商品選択　X 戻る',inventory:'Q〜N 対象選択　X 戻る',selection:'B 購入 / E 装備 / U 使用　X 戻る',bestiary:'図鑑を閉じるとゲームへ戻ります'};
  $('#keyboard-help-copy').textContent=text[currentScreen()]||'ボタンを選択してください';
}

function showSelection(entry) {
  if(!entry)return;
  selectedItem=entry; const item=entry.item;
  $('#selection-name').textContent=displayItemName(item,entry.owned);
  $('#selection-detail').textContent=`${describeBonuses(entry.owned?.rolledStats||item.baseStats)}${entry.owned?.trait?` / ${traitDescription(entry.owned.trait)}`:''}${entry.kind==='shop'?` / 価格 ${item.price} G`:''}`;
  const equipped=entry.owned&&Object.values(game.player.equipment).includes(entry.owned.instanceId);
  $('#selection-actions').innerHTML=entry.kind==='shop'?'<button data-select-action="buy"><kbd>B</kbd> 購入する</button>':entry.kind==='consumable'?'<button data-select-action="use"><kbd>U</kbd> 使用する</button>':`<button data-select-action="equip"><kbd>E</kbd> ${equipped?'外す':'装備する'}</button>`;
  $('#selection-dialog').hidden=false; renderKeyboardHelp();
}

function closeSelection(){selectedItem=null;$('#selection-dialog').hidden=true;renderKeyboardHelp();}

function performGameAction(action) {
  if(inputLocked)return false;
  const combat=game.status==='combat'&&['attack','guard','observe','powerStrike','firstAid','focus','escape'].includes(action);
  inputLocked=true; game.dispatch(action); $('#skills').hidden=true; render();
  setTimeout(()=>{inputLocked=false;},combat?600:120); return true;
}

function handleCommand(command) {
  if(command==='skills'){if(game.status==='combat'){$('#skills').hidden=false;renderKeyboardHelp();}return true;}
  if(command==='closeSkills'){$('#skills').hidden=true;renderKeyboardHelp();return true;}
  if(command==='items'||command==='equipment'){renderItems(command);renderKeyboardHelp();return true;}
  if(command==='closeInventory'){$('#items-modal').hidden=true;renderKeyboardHelp();return true;}
  if(command==='save'){saveGame();return true;}
  if(command==='closeShop')return performGameAction('closeShop');
  if(['confirmBuy','use','equip','cancelSelection'].includes(command)){if(command==='cancelSelection'){closeSelection();return true;}return confirmSelection(command);}
  return performGameAction(command);
}

function confirmSelection(command) {
  if(!selectedItem)return false;
  const allowed=(command==='confirmBuy'&&selectedItem.kind==='shop')||(command==='use'&&selectedItem.kind==='consumable')||(command==='equip'&&selectedItem.kind==='owned');
  if(!allowed)return false;
  const equipped=selectedItem.owned&&Object.values(game.player.equipment).includes(selectedItem.owned.instanceId);
  const action=command==='confirmBuy'?`buy:${selectedItem.item.id}`:command==='use'?`use:${selectedItem.item.id}`:`${equipped?'unequip':'equip'}:${selectedItem.owned.instanceId}`;
  closeSelection(); return performGameAction(action);
}

function readSave() { try { const value=JSON.parse(localStorage.getItem(SAVE_KEY)||localStorage.getItem(OLD_SAVE_KEY)); return [2,3].includes(value?.version) ? value : null; } catch { return null; } }
function saveGame() {
  const snapshot=game.serialize(); snapshot.savedAt=Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  lastSaveTime = new Date(snapshot.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  game.addLog('✓ セーブしました'); render();
}

function showFeedback(feedback) {
  document.querySelectorAll('.combat-feedback').forEach(node => node.remove());
  if (!feedback) return;
  const target = feedback.target === 'player' ? $('.player-card') : $('.encounter');
  target.classList.remove('hit-flash', 'block-flash');
  void target.offsetWidth;
  target.classList.add(feedback.type === 'block' ? 'block-flash' : 'hit-flash');
  const badge = document.createElement('div');
  badge.className = `combat-feedback ${feedback.type}`;
  badge.textContent = feedback.type === 'block' ? `防御成功  ${feedback.raw} → ${feedback.amount}` : `-${feedback.amount}`;
  target.append(badge);
  setTimeout(() => { target.classList.remove('hit-flash', 'block-flash'); badge.remove(); }, 600);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if(button.dataset.selectIndex!==undefined){showSelection(visibleSelections[Number(button.dataset.selectIndex)]);return;}
  if(button.dataset.selectAction){const map={buy:'confirmBuy',use:'use',equip:'equip',cancel:'cancelSelection'};handleCommand(map[button.dataset.selectAction]);return;}
  if(button.dataset.eventChoice){game.chooseEvent(button.dataset.eventChoice);render();return;}
  if(button.dataset.specialization){game.chooseSpecialization(button.dataset.specialization);render();return;}
  if(button.dataset.keyAction){handleCommand(button.dataset.keyAction);return;}
  if (button.dataset.view) {
    if(button.dataset.view==='menu') openMobileMenu();
    else if(button.dataset.view==='close-menu') closeMobileMenu();
    else if(button.dataset.view==='close') $('#items-modal').hidden=true;
    else if(button.dataset.view==='bestiary'){closeMobileMenu();renderBestiary();}
    else if(button.dataset.view==='close-bestiary') $('#bestiary-modal').hidden=true;
    else if(button.dataset.view==='records'){closeMobileMenu();renderRecords();}
    else if(button.dataset.view==='close-records') $('#records-modal').hidden=true;
    else if(button.dataset.view==='log'){closeMobileMenu();renderFullLog();}
    else if(button.dataset.view==='close-log') $('#log-modal').hidden=true;
    else {closeMobileMenu();renderItems(button.dataset.view);}
    renderKeyboardHelp(); return;
  }
  if (button.dataset.system === 'new') { game=new Game({meta:loadMeta()}); $('#title-screen').hidden=true; render(); return; }
  if (button.dataset.system === 'continue') { const save=readSave(); if(save){ game=new Game({savedState:save,meta:loadMeta()}); lastSaveTime=save.savedAt ? new Date(save.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null; $('#title-screen').hidden=true; render(); } return; }
  if (button.dataset.system === 'save') { closeMobileMenu(); saveGame(); return; }
  if (button.dataset.system === 'reload') { location.reload(); return; }
  if (button.id === 'skill-toggle') { $('#skills').hidden = !$('#skills').hidden; renderKeyboardHelp(); return; }
  if (button.dataset.action) { const inventoryOpen=!$('#items-modal').hidden; performGameAction(button.dataset.action); if(inventoryOpen&&button.dataset.action==='usePotion')renderItems('items'); }
});

document.addEventListener('keydown',event=>{
  const screen=currentScreen();
  let command=resolveShortcut(event,screen,inputLocked);
  if(inputLocked)return;
  if(!command&&['shop','inventory'].includes(screen)&&!event.repeat&&!event.metaKey&&!event.ctrlKey&&!event.altKey){const index=ITEM_KEYS.indexOf(String(event.key||'').toLowerCase());if(index>=0&&visibleSelections[index]){event.preventDefault();showSelection(visibleSelections[index]);return;}}
  if(!command)return;
  event.preventDefault(); handleCommand(command);
});

$('#continue-button').disabled = !readSave();
render();
