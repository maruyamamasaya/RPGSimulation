export const ITEM_KEYS = Object.freeze(['q','w','e','r','t','y','a','s','d','f','g','h','z','c','v','b','n']);

export const KEY_MAPS = Object.freeze({
  combat: Object.freeze({ a:'attack', d:'guard', o:'observe', s:'skills', r:'escape' }),
  skills: Object.freeze({ q:'powerStrike', w:'firstAid', e:'focus', x:'closeSkills' }),
  preparation: Object.freeze({ n:'advance', t:'train', p:'openShop', i:'items', e:'equipment', v:'save' }),
  shop: Object.freeze({ x:'closeShop' }),
  inventory: Object.freeze({ x:'closeInventory' }),
  selection: Object.freeze({ b:'confirmBuy', u:'use', e:'equip', x:'cancelSelection' }),
});

export function isEditableTarget(target) {
  const tag=target?.tagName?.toLowerCase();
  return ['input','textarea','select'].includes(tag) || Boolean(target?.isContentEditable);
}

export function resolveShortcut(event, screen, locked=false) {
  if(locked || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return null;
  const key=String(event.key||'').toLowerCase();
  if(!/^[a-z]$/.test(key)) return null;
  return KEY_MAPS[screen]?.[key] || null;
}
