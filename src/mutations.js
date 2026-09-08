export const FLOOR_MUTATIONS = Object.freeze([
  Object.freeze({id:'BERSERK',name:'狂暴化',description:'敵の与ダメージが15%上昇します。'}),
  Object.freeze({id:'ABUNDANCE',name:'豊穣',description:'戦闘勝利時のGoldが25%上昇します。'}),
  Object.freeze({id:'TREASURE',name:'宝運',description:'敵の装備ドロップ率が10ポイント上昇します。'}),
  Object.freeze({id:'DEPLETION',name:'枯渇',description:'戦闘と泉・アイテムの回復量が30%低下します。'}),
  Object.freeze({id:'ELITE_ZONE',name:'強敵領域',description:'既存のThreat判定に強敵率3ポイントを加えます。'}),
  Object.freeze({id:'TRAINING',name:'修練領域',description:'戦闘勝利時のEXPが20%上昇します。'})
]);

export const mutationById=id=>FLOOR_MUTATIONS.find(mutation=>mutation.id===id)||null;
export function rollFloorMutation(rng,previousId=null){const pool=FLOOR_MUTATIONS.filter(mutation=>mutation.id!==previousId);return rng.pick(pool);}
export function normalizeFloorMutation(value){
  const definition=mutationById(value?.id);if(!definition)return null;
  const startFloor=Math.max(10,Math.floor(Number(value.startFloor)||10));
  return {id:definition.id,startFloor,endFloor:startFloor+9};
}
export const mutationMultiplier=(mutation,id,amount)=>mutation?.id===id?amount:1;
export const mutationBonus=(mutation,id,amount)=>mutation?.id===id?amount:0;
