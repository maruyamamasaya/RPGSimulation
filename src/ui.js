import { Game } from './game.js';
import { currentIntent } from './enemies.js';
import { escapeChance, expToNext } from './formulas.js';

const STORAGE_KEY = 'formula-dungeon:meta:v1';

function loadMeta() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value?.version === 1 && Number.isFinite(value.bestFloor) && value.knowledge && typeof value.knowledge === 'object') return value;
  } catch { /* Invalid local-only data safely falls back to defaults. */ }
  return { version: 1, bestFloor: 1, knowledge: {} };
}

const game = new Game({ meta: loadMeta() });
const $ = (selector) => document.querySelector(selector);

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
    <div class="stat-row"><span>ATK <b>${p.atk}</b></span><span>DEF <b>${p.def}</b></span><span>SPD <b>${p.spd}</b></span><span>OBS <b>${p.obs}</b></span></div>
    <div class="xp"><span>次のLV</span><b>${p.exp} / ${expToNext(p.level)} EXP</b>${meter(p.exp,expToNext(p.level),'xp')}</div>`;
  $('#enemy-name').textContent = e.name;
  $('#enemy-level').textContent = score >= .7 ? `LV.${e.level}` : score >= .35 ? `LV.${Math.max(1,e.level-2)}〜${e.level+2}` : 'LV.???';
  $('#enemy-hp').innerHTML = score >= .82 ? `<span>HP ${e.hp} / ${e.maxHp}</span>${meter(e.hp,e.maxHp,'enemy')}` : score >= .48 ? `<span>HP 推定 ${Math.round(e.hp*.9)}〜${Math.round(e.hp*1.1)}</span>${meter(e.hp,e.maxHp,'enemy')}` : '<span>HP ???</span>';
  $('#enemy-stats').innerHTML = estimate('ATK',e.atk,score) + estimate('DEF',e.def,score-.08) + estimate('SPD',e.spd,score+.05);
  $('#telegraph').textContent = currentIntent(e).telegraph;
  $('#trait').textContent = score >= .55 ? `${e.archetype.trait}。弱点：${score >= .78 ? e.archetype.weakness : 'さらに観察が必要'}` : '動きの意図はまだ読み切れない。観察すれば判明する。';
  $('#elite-alert').hidden = !e.elite;
  $('#escape-rate').textContent = `成功率 ${Math.round(escapeChance(p,e,game.observation)*100)}%`;
  $('#run-stats').innerHTML = `<p><span>戦闘ターン</span><b>${game.totalTurns}</b></p><p><span>獲得EXP</span><b>${game.runExp}</b></p><p><span>成長効率</span><b>${game.efficiency}</b></p><p><span>討伐知識</span><b>${game.knowledge}回</b></p><p><span>解析深度</span><b>${game.observation} / 3</b></p>`;
  const log = $('#log'); log.replaceChildren(...game.logs.map((entry, i) => { const li=document.createElement('li'); li.textContent=entry; if(i===0) li.className='latest'; return li; }));
  $('#gameover').hidden = game.status !== 'gameover';
  $('#gameover-copy').textContent = `地下${game.floor}階まで到達。ラン獲得EXP ${game.runExp}、成長効率 ${game.efficiency}。ログを読み返し、次の判断へつなげよう。`;
  saveMeta();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'skill-toggle') { $('#skills').hidden = !$('#skills').hidden; return; }
  if (button.dataset.action) { game.dispatch(button.dataset.action); $('#skills').hidden = true; render(); }
});

render();

