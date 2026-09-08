import { ITEMS, createOwnedItem, shopTier } from './items.js';

export const EVENT_CHANCE = 0.15;

export const FLOOR_EVENTS = Object.freeze([
  Object.freeze({id:'fountain',name:'回復の泉',description:'澄んだ水が静かに湧いている。',choices:[['drink','水を飲む'],['leave','立ち去る']]}),
  Object.freeze({id:'altar',name:'古びた祭壇',description:'代償と引き換えに、力を授ける祭壇だ。',choices:[['offerHp','HPを捧げる'],['offerGold','Goldを捧げる'],['leave','立ち去る']]}),
  Object.freeze({id:'chest',name:'宝箱',description:'罠の気配がある古い宝箱を見つけた。',choices:[['open','開ける'],['inspect','慎重に調べる'],['leave','無視する']]}),
  Object.freeze({id:'merchant',name:'旅商人',description:'旅商人が手短な取引を持ちかけてきた。',choices:[['buyPotion','回復アイテムを買う'],['buyEquipment','装備を買う'],['leave','立ち去る']]}),
  Object.freeze({id:'dangerousPath',name:'危険な道',description:'危険な近道と、静かな迂回路に分かれている。',choices:[['proceed','進む'],['safe','安全策を取る']]})
]);

export const eventById=id=>FLOOR_EVENTS.find(event=>event.id===id);
export function rollFloorEvent(rng,chance=EVENT_CHANCE){return rng.next()<chance?rng.pick(FLOOR_EVENTS).id:null;}

export function eventEquipment(floor,rng,instanceId,source='drop'){
  const tier=shopTier(floor),pool=ITEMS.filter(item=>['weapon','armor'].includes(item.type)&&item.tier<=tier);
  return createOwnedItem(rng.pick(pool),rng,{instanceId,source,rolled:source==='drop'});
}

export function createFloorEvent(id,floor,rng){
  const definition=eventById(id);
  if(!definition)return null;
  const merchantPool=ITEMS.filter(item=>['weapon','armor'].includes(item.type)&&item.shop&&item.tier<=shopTier(floor));
  return {id,phase:'choice',result:'',merchantEquipmentId:id==='merchant'?rng.pick(merchantPool).id:null};
}

export function normalizeRunModifiers(value={}){
  const rate=key=>Math.max(0,Math.min(.5,Number(value?.[key])||0));
  return {atk:rate('atk'),def:rate('def')};
}
