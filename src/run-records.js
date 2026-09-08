const count = value => Math.max(0, Math.floor(Number(value) || 0));

export function createRunStats() {
  return { kills:0, strongKills:0, goldEarned:0, equipmentAcquired:0, maxDamage:0 };
}

export function normalizeRunStats(value = {}) {
  return {
    kills:count(value.kills), strongKills:count(value.strongKills), goldEarned:count(value.goldEarned),
    equipmentAcquired:count(value.equipmentAcquired), maxDamage:count(value.maxDamage),
  };
}

export function normalizeRecords(value = {}, legacyBestFloor = 1) {
  return {
    highestFloor:Math.max(1,count(value.highestFloor),count(legacyBestFloor)),
    maxKills:count(value.maxKills), maxStrongKills:count(value.maxStrongKills),
    maxGoldEarned:count(value.maxGoldEarned), maxDamage:count(value.maxDamage),
  };
}

function normalizeHistoryEntry(value) {
  if (!value || !Number.isFinite(Date.parse(value.endedAt))) return null;
  return {
    id:String(value.id || value.endedAt), endedAt:new Date(value.endedAt).toISOString(), floor:Math.max(1,count(value.floor)),
    kills:count(value.kills), strongKills:count(value.strongKills), goldEarned:count(value.goldEarned), finalLevel:Math.max(1,count(value.finalLevel)),
  };
}

export function normalizeRunHistory(value) {
  return (Array.isArray(value) ? value : []).map(normalizeHistoryEntry).filter(Boolean)
    .sort((a,b) => b.endedAt.localeCompare(a.endedAt)).filter((entry,index,array) => array.findIndex(item => item.id === entry.id) === index).slice(0,10);
}

export function mergeRecords(left, right, legacyBestFloor = 1) {
  const a=normalizeRecords(left,legacyBestFloor), b=normalizeRecords(right,legacyBestFloor);
  return Object.fromEntries(Object.keys(a).map(key => [key,Math.max(a[key],b[key])]));
}

export function mergeRunHistory(left, right) {
  return normalizeRunHistory([...(left || []),...(right || [])]);
}

export function finishRun(meta, runStats, { floor, totalTurns, finalLevel, finalGold, endedAt }) {
  const stats=normalizeRunStats(runStats);
  const previous=normalizeRecords(meta.records,1);
  const candidates={highestFloor:Math.max(1,count(floor)),maxKills:stats.kills,maxStrongKills:stats.strongKills,maxGoldEarned:stats.goldEarned,maxDamage:stats.maxDamage};
  const newRecords=Object.keys(candidates).filter(key => candidates[key] > previous[key]);
  meta.records=Object.fromEntries(Object.keys(previous).map(key => [key,Math.max(previous[key],candidates[key])]));
  meta.bestFloor=Math.max(meta.bestFloor || 1,candidates.highestFloor);
  const timestamp=new Date(endedAt).toISOString();
  const historyEntry={id:`${timestamp}-${candidates.highestFloor}-${stats.kills}`,endedAt:timestamp,floor:candidates.highestFloor,kills:stats.kills,strongKills:stats.strongKills,goldEarned:stats.goldEarned,finalLevel:Math.max(1,count(finalLevel))};
  meta.runHistory=normalizeRunHistory([historyEntry,...(meta.runHistory || [])]);
  return { ...stats, floor:candidates.highestFloor, totalTurns:count(totalTurns), finalLevel:historyEntry.finalLevel, finalGold:count(finalGold), endedAt:timestamp, newRecords };
}
