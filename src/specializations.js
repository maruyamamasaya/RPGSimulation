export const SPECIALIZATION_MILESTONES=Object.freeze([5,10,15]);
export const MAX_SPECIALIZATIONS=SPECIALIZATION_MILESTONES.length;
export const SPECIALIZATIONS=Object.freeze([
  Object.freeze({id:'OFFENSE',name:'猛攻',description:'与ダメージ +10% / Lv'}),
  Object.freeze({id:'DEFENSE',name:'堅守',description:'被ダメージ -10% / Lv'}),
  Object.freeze({id:'LAST_STAND',name:'背水',description:'HP30%以下の与ダメージ +20% / Lv'}),
  Object.freeze({id:'EXPLORER',name:'探索',description:'敵ドロップ率 +5ポイント / Lv'}),
  Object.freeze({id:'MERCHANT',name:'商才',description:'戦闘Gold +15% / Lv'})
]);

export const specializationById=id=>SPECIALIZATIONS.find(entry=>entry.id===id)||null;
export function createSpecializations(){return Object.fromEntries(SPECIALIZATIONS.map(entry=>[entry.id,0]));}
export function normalizeSpecializations(value={}){const result=createSpecializations();let remaining=MAX_SPECIALIZATIONS;for(const key of Object.keys(result)){result[key]=Math.max(0,Math.min(remaining,Math.floor(Number(value?.[key])||0)));remaining-=result[key];}return result;}
export function specializationCount(value={}){return Object.values(normalizeSpecializations(value)).reduce((sum,level)=>sum+level,0);}
export function rollSpecializationCandidates(rng,count=3){const pool=[...SPECIALIZATIONS],result=[];while(result.length<Math.min(count,pool.length)){const index=rng.int(0,pool.length-1);result.push(pool.splice(index,1)[0].id);}return result;}
export function buildDamageMultiplier(player,specializations){const levels=normalizeSpecializations(specializations);let bonus=levels.OFFENSE*.10;if(player.hp/player.maxHp<=.3)bonus+=levels.LAST_STAND*.20;return 1+bonus;}
export function buildIncomingMultiplier(specializations){return Math.max(.7,1-normalizeSpecializations(specializations).DEFENSE*.10);}
export function buildDropBonus(specializations){return normalizeSpecializations(specializations).EXPLORER*.05;}
export function buildGoldMultiplier(specializations){return 1+normalizeSpecializations(specializations).MERCHANT*.15;}
export function buildSummary(value){const levels=normalizeSpecializations(value);const entries=SPECIALIZATIONS.filter(entry=>levels[entry.id]>0).map(entry=>`${entry.name} Lv${levels[entry.id]}`);return entries.length?entries.join(' / '):'未取得';}
