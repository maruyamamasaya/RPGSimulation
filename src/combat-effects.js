export const DAMAGE_TYPES = Object.freeze({
  SLASH:Object.freeze({id:'SLASH',name:'斬撃'}),
  BLUNT:Object.freeze({id:'BLUNT',name:'打撃'}),
  ARCANE:Object.freeze({id:'ARCANE',name:'魔力'}),
  PIERCE:Object.freeze({id:'PIERCE',name:'貫通'}),
});

export const AFFINITY_MULTIPLIERS = Object.freeze({ weakness:1.15, resistance:.85, neutral:1 });

export const STATUS_EFFECTS = Object.freeze({
  BLEED:Object.freeze({id:'BLEED',name:'出血',duration:3,description:'行動開始時に最大HPの3%ダメージ'}),
  WEAKEN:Object.freeze({id:'WEAKEN',name:'弱体',duration:2,description:'与ダメージ -15%'}),
  ARMOR_BREAK:Object.freeze({id:'ARMOR_BREAK',name:'破防',duration:2,description:'DEF -15%'}),
  SLOW:Object.freeze({id:'SLOW',name:'鈍足',duration:2,description:'SPD -15%'}),
});

export function damageTypeById(id){return DAMAGE_TYPES[id]||DAMAGE_TYPES.BLUNT;}
export function statusById(id){return STATUS_EFFECTS[id]||null;}
export function createStatuses(){return {};}
export function normalizeStatuses(value){
  const result={};
  if(!value||typeof value!=='object')return result;
  for(const [id,entry] of Object.entries(value)){
    const definition=statusById(id),turns=Math.floor(Number(entry?.turns));
    if(definition&&turns>0)result[id]={turns:Math.min(turns,definition.duration),...(entry?.fresh?{fresh:true}:{})};
  }
  return result;
}
export function applyStatus(target,id,duration=statusById(id)?.duration){
  const definition=statusById(id);if(!definition||!target||!Number.isFinite(duration)||duration<=0)return false;
  target.statuses=normalizeStatuses(target.statuses);
  const turns=Math.min(definition.duration,Math.floor(duration)),previous=target.statuses[id]?.turns||0;
  target.statuses[id]={turns:Math.max(previous,turns),fresh:true};
  return turns>previous;
}
export function hasStatus(target,id){return Boolean(target?.statuses?.[id]?.turns>0);}
export function statusMultiplier(target,id){return hasStatus(target,id) ? .85 : 1;}
export function effectiveStat(target,stat){
  const statusId=stat==='def'?'ARMOR_BREAK':stat==='spd'?'SLOW':null;
  return Math.max(1,Math.round((target?.[stat]||0)*(statusId?statusMultiplier(target,statusId):1)));
}
export function outgoingStatusMultiplier(target){return statusMultiplier(target,'WEAKEN');}
export function affinity(enemy,type){
  const id=damageTypeById(type).id;
  if(enemy?.archetype?.weaknesses?.includes(id))return 'weakness';
  if(enemy?.archetype?.resistances?.includes(id))return 'resistance';
  return 'neutral';
}
export function affinityMultiplier(enemy,type){return AFFINITY_MULTIPLIERS[affinity(enemy,type)];}
export function weaponDamageType(player,itemLookup){
  const owned=player?.ownedItems?.find(entry=>entry.instanceId===player.equipment?.weapon);
  return itemLookup(owned?.definitionId)?.damageType||'BLUNT';
}
export function beginStatusTurn(target){
  target.statuses=normalizeStatuses(target.statuses);
  const events=[];
  if(hasStatus(target,'BLEED')){
    const amount=Math.max(1,Math.round(target.maxHp*.03));target.hp=Math.max(0,target.hp-amount);events.push({id:'BLEED',amount});
  }
  return events;
}
export function endStatusTurn(target){
  target.statuses=normalizeStatuses(target.statuses);const expired=[];
  for(const [id,entry] of Object.entries(target.statuses)){if(entry.fresh){delete entry.fresh;continue}entry.turns-=1;if(entry.turns<=0){delete target.statuses[id];expired.push(id)}}
  return expired;
}
export function statusList(target){return Object.entries(normalizeStatuses(target?.statuses)).map(([id,entry])=>({...statusById(id),turns:entry.turns}));}
export function affinityKnowledge(archetype,{observation=0,knowledge=0}={}){
  const level=Math.max(observation,knowledge>=3?2:knowledge>=1?1:0);
  return {level,weaknesses:level>=1?(archetype?.weaknesses||[]):null,resistances:level>=2?(archetype?.resistances||[]):null};
}
