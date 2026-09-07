import { Game } from './game.js';
import { telegraphText } from './enemies.js';
import { escapeChance, expToNext } from './formulas.js';
import { describeBonuses, itemById, RARITY_LABEL, shopItems } from './items.js';
import { ITEM_KEYS, resolveShortcut } from './keyboard.js';

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

let game = new Game({ meta: loadMeta() });
const $ = (selector) => document.querySelector(selector);
let lastSaveTime = null;
let inputLocked = false;
let selectedItem = null;
let visibleSelections = [];

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
function equippedName(slot) { return itemById(ownedByInstance(game.player.equipment[slot])?.definitionId)?.name || 'なし'; }

function render() {
  const p = game.player;
  const e = game.enemy;
  const score = game.disclosure;
  $('#floor').textContent = `地下 ${game.floor}階`;
  $('#best').textContent = `最高 ${game.meta.bestFloor}階`;
  $('#player-level').textContent = `LV.${p.level}`;
  $('#player-stats').innerHTML = `
    <div class="vital"><span>HP</span><strong>${p.hp} / ${p.maxHp}</strong></div>${meter(p.hp,p.maxHp,'hp')}
    <div class="vital"><span>SP</span><strong>${p.sp} / ${p.maxSp}</strong></div>${meter(p.sp,p.maxSp,'sp')}
    <div class="gold-line">Gold <strong>${p.gold} G</strong></div>
    <div class="stat-row"><span>ATK <b>${p.atk}${statDetail('atk')}</b></span><span>DEF <b>${p.def}${statDetail('def')}</b></span><span>SPD <b>${p.spd}${statDetail('spd')}</b></span><span>OBS <b>${p.obs}${statDetail('obs')}</b></span></div>
    <div class="equipment-line">武器：${equippedName('weapon')}<br>防具：${equippedName('armor')}</div>
    <div class="xp"><span>次のLV</span><b>${p.exp} / ${expToNext(p.level)} EXP</b>${meter(p.exp,expToNext(p.level),'xp')}</div>`;
  $('#enemy-name').textContent = e.rank==='aberrant'&&score<.25 ? '？？？' : e.name;
  $('#enemy-level').textContent = score >= .7 ? `LV.${e.level}` : score >= .35 ? `LV.${Math.max(1,e.level-2)}〜${e.level+2}` : 'LV.???';
  $('#enemy-hp').innerHTML = score >= .82 ? `<span>HP ${e.hp} / ${e.maxHp}</span>${meter(e.hp,e.maxHp,'enemy')}` : score >= .48 ? `<span>HP 推定 ${Math.round(e.hp*.9)}〜${Math.round(e.hp*1.1)}</span>${meter(e.hp,e.maxHp,'enemy')}` : '<span>HP ???</span>';
  $('#enemy-stats').innerHTML = estimate('ATK',e.atk,score) + estimate('DEF',e.def,score-.08) + estimate('SPD',e.spd,score+.05);
  $('#telegraph').textContent = telegraphText(e);
  $('#trait').textContent = score >= .55 ? `${e.archetype.trait}。弱点：${score >= .78 ? e.archetype.weakness : 'さらに観察が必要'}` : '動きの意図はまだ読み切れない。観察すれば判明する。';
  $('#elite-alert').hidden = !e.elite;
  $('#elite-alert').className = `elite-alert ${e.rank || 'normal'}`;
  $('#elite-alert').textContent = e.rank === 'aberrant' ? '【危険】現在の戦力では勝率が低い可能性があります。逃走を推奨します。' : '【強敵】高リスク・高報酬。撤退も戦略です。';
  $('#enemy-name').className = e.rank || 'normal';
  document.querySelector('[data-action="escape"]').classList.toggle('primary-escape',game.recommendedAction==='escape');
  $('#escape-rate').textContent = `成功率 ${Math.round(escapeChance(p,e,game.observation)*100)}%`;
  const threatHint=p.obs>=18?` / 強敵率 約${Math.round(game.strongEnemyChance*100)}%`:'';
  $('#run-stats').innerHTML = `<p><span>戦闘ターン</span><b>${game.totalTurns}</b></p><p><span>獲得EXP</span><b>${game.runExp}</b></p><p><span>成長効率</span><b>${game.efficiency}</b></p><p><span>討伐知識</span><b>${game.knowledge}回</b></p><p><span>解析深度</span><b>${game.observation} / 3</b></p><p><span>ダンジョンの気配</span><b>${game.threatLabel}${threatHint}</b></p>`;
  const log = $('#log'); log.replaceChildren(...game.logs.map((entry, i) => { const li=document.createElement('li'); li.textContent=entry; if(i===0) li.className='latest'; return li; }));
  $('#gameover').hidden = game.status !== 'gameover';
  $('#gameover-copy').textContent = `地下${game.floor}階まで到達。ラン獲得EXP ${game.runExp}、成長効率 ${game.efficiency}。ログを読み返し、次の判断へつなげよう。`;
  $('#actions').hidden = game.status !== 'combat';
  $('#skills').hidden = game.status !== 'combat' || $('#skills').hidden;
  $('#preparation').hidden = game.status !== 'preparation';
  $('#shop').hidden = game.status !== 'shop';
  if (game.status === 'preparation') renderPreparation();
  if (game.status === 'shop') renderShop();
  renderKeyboardHelp();
  showFeedback(game.feedback);
  saveMeta();
}

function renderPreparation() {
  const reward=game.lastReward;
  const drop=reward?.drop?itemById(reward.drop.definitionId):null;
  $('#reward-summary').innerHTML = reward ? `${reward.rank&&reward.rank!=='normal'?'強敵撃破！<br>':''}EXP +${reward.exp} / Gold +${reward.gold}${drop?`<br><span class="rarity-${drop.rarity}">DROP：${drop.name}［${RARITY_LABEL[drop.rarity]} / ${drop.rarity.toUpperCase()}］ ${describeBonuses(reward.drop.rolledStats)}</span>`:''}` : '探索を再開しました。';
  $('#prep-status').textContent = `地下${game.floor}階　HP ${game.player.hp} / ${game.player.maxHp}　Gold ${game.player.gold} G　気配：${game.threatLabel}`;
  const nextBattles=game.sameFloorBattles+1;
  const nextRate=nextBattles>=8?.5:nextBattles>=5?.75:nextBattles>=3?.9:1;
  $('#training-rate').textContent = `次戦の報酬率 ${Math.round(nextRate*100)}%`;
  $('#potion-count').textContent = `所持 ${Object.values(game.player.consumables).reduce((a,b)=>a+b,0)}`;
  $('#save-time').textContent = lastSaveTime ? `最終保存 ${lastSaveTime}` : '進行を保存';
}

function itemCard(item, owned=null, shortcut=null, selectionIndex=null) {
  const equipped=owned&&Object.values(game.player.equipment).includes(owned.instanceId);
  const action=owned?`equip:${owned.instanceId}`:`buy:${item.id}`;
  const isNew=game.player.newShopItems.includes(item.id);
  const selector=!owned&&selectionIndex!==null?`data-select-index="${selectionIndex}"`:`data-action="${action}"`;
  return `<article class="rarity-card rarity-${item.rarity}"><div><b>${shortcut?`<kbd>${shortcut.toUpperCase()}</kbd> `:''}${item.name}</b>${isNew?'<em>NEW</em>':''}<small>${item.type} / ${RARITY_LABEL[item.rarity]} / ${item.rarity.toUpperCase()} / Lv.${item.recommendedLevel}目安</small><p>${describeBonuses(owned?.rolledStats||item.baseStats)}</p><small>所持 ${owned?1:game.player.inventory.filter(id=>id===item.id).length}</small></div><button ${selector} ${equipped?'disabled':''}>${equipped?'装備中':owned?'装備する':'選択'}</button></article>`;
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

function currentScreen() {
  if(!$('#selection-dialog').hidden)return 'selection';
  if(!$('#title-screen').hidden||!$('#gameover').hidden)return 'none';
  if(!$('#items-modal').hidden)return 'inventory';
  if(game.status==='shop')return 'shop';
  if(game.status==='combat'&&!$('#skills').hidden)return 'skills';
  return game.status;
}

function renderKeyboardHelp() {
  const text={combat:'A 攻撃　D 防御　O 観察　S スキル　R 逃走',skills:'Q 演算強打　W 応急手当　E 集中解析　X 戻る',preparation:'N 次階層　T 鍛錬　P ショップ　E 装備　I アイテム　V セーブ',shop:'Q〜N 商品選択　X 戻る',inventory:'Q〜N 対象選択　X 戻る',selection:'B 購入 / E 装備 / U 使用　X 戻る'};
  $('#keyboard-help-copy').textContent=text[currentScreen()]||'ボタンを選択してください';
}

function showSelection(entry) {
  if(!entry)return;
  selectedItem=entry; const item=entry.item;
  $('#selection-name').textContent=item.name;
  $('#selection-detail').textContent=`${describeBonuses(entry.owned?.rolledStats||item.baseStats)}${entry.kind==='shop'?` / 価格 ${item.price} G`:''}`;
  $('#selection-actions').innerHTML=entry.kind==='shop'?'<button data-select-action="buy"><kbd>B</kbd> 購入する</button>':entry.kind==='consumable'?'<button data-select-action="use"><kbd>U</kbd> 使用する</button>':'<button data-select-action="equip"><kbd>E</kbd> 装備する</button>';
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
  const action=command==='confirmBuy'?`buy:${selectedItem.item.id}`:command==='use'?`use:${selectedItem.item.id}`:`equip:${selectedItem.owned.instanceId}`;
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
  if(button.dataset.keyAction){handleCommand(button.dataset.keyAction);return;}
  if (button.dataset.view) { if(button.dataset.view==='close'){$('#items-modal').hidden=true;renderKeyboardHelp();} else renderItems(button.dataset.view); return; }
  if (button.dataset.system === 'new') { game=new Game({meta:loadMeta()}); $('#title-screen').hidden=true; render(); return; }
  if (button.dataset.system === 'continue') { const save=readSave(); if(save){ game=new Game({savedState:save}); lastSaveTime=save.savedAt ? new Date(save.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : null; $('#title-screen').hidden=true; render(); } return; }
  if (button.dataset.system === 'save') { saveGame(); return; }
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
