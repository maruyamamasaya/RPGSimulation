export const EQUIPMENT_TRAITS = Object.freeze({
  MIGHT:Object.freeze({id:'MIGHT',name:'豪腕',description:'攻撃力 +10%'}),
  GUARD:Object.freeze({id:'GUARD',name:'堅守',description:'防御力 +10%'}),
  VITAL:Object.freeze({id:'VITAL',name:'生命',description:'最大HP +10%'}),
  HUNTER:Object.freeze({id:'HUNTER',name:'強敵狩り',description:'強敵への与ダメージ +15%'}),
  FORTUNE:Object.freeze({id:'FORTUNE',name:'幸運',description:'戦闘勝利時のGold獲得 +10%'}),
  LAST_STAND:Object.freeze({id:'LAST_STAND',name:'背水',description:'HP30%以下のとき与ダメージ +15%'}),
});

export const TRAIT_CHANCE = .3;
const traitIds=Object.keys(EQUIPMENT_TRAITS);

export function normalizeTrait(value) { return typeof value === 'string' && EQUIPMENT_TRAITS[value] ? value : null; }
export function rollEquipmentTrait(rng, chance = TRAIT_CHANCE) { return rng.next() < chance ? rng.pick(traitIds) : null; }
export function traitDefinition(id) { return EQUIPMENT_TRAITS[normalizeTrait(id)] || null; }
export function displayItemName(item, owned) { const trait=traitDefinition(owned?.trait); return trait ? `${item.name} [${trait.name}]` : item.name; }
export function traitDescription(id) { return traitDefinition(id)?.description || ''; }

export function equippedTraits(player) {
  const equippedIds=new Set(Object.values(player.equipment || {}).filter(Boolean));
  return new Set((player.ownedItems || []).filter(item=>equippedIds.has(item.instanceId)).map(item=>normalizeTrait(item.trait)).filter(Boolean));
}

export function outgoingDamageMultiplier(player, enemy) {
  const traits=equippedTraits(player);
  let multiplier=1;
  if(traits.has('HUNTER') && enemy?.elite)multiplier*=1.15;
  if(traits.has('LAST_STAND') && player.hp/player.maxHp<=.3)multiplier*=1.15;
  return multiplier;
}

export function goldRewardMultiplier(player) { return equippedTraits(player).has('FORTUNE') ? 1.1 : 1; }
