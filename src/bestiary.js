import { ENEMIES } from './enemies.js';
import { mergeRecords, mergeRunHistory, normalizeRecords, normalizeRunHistory } from './run-records.js';

const enemyIds = new Set(ENEMIES.map(enemy => enemy.id));
const count = value => Math.max(0, Math.floor(Number(value) || 0));
const floor = value => Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.floor(Number(value)) : null;

function normalizeRecord(value = {}, legacyDefeats = 0) {
  const defeats = Math.max(count(value.defeats), count(legacyDefeats));
  const encounters = Math.max(count(value.encounters), defeats);
  const firstFloor = encounters ? floor(value.firstFloor) : null;
  const deepestFloor = encounters ? floor(value.deepestFloor) : null;
  return { encounters, defeats, firstFloor, deepestFloor };
}

export function normalizeMeta(value = {}) {
  const knowledge = {};
  for (const [id, defeats] of Object.entries(value.knowledge || {})) {
    if (enemyIds.has(id)) knowledge[id] = count(defeats);
  }
  const bestiary = {};
  for (const enemy of ENEMIES) {
    const record = normalizeRecord(value.bestiary?.[enemy.id], knowledge[enemy.id]);
    if (record.encounters) bestiary[enemy.id] = record;
  }
  const bestFloor = Math.max(1, floor(value.bestFloor) || 1);
  return { bestFloor, knowledge, bestiary, records:normalizeRecords(value.records,bestFloor), runHistory:normalizeRunHistory(value.runHistory) };
}

export function mergeMeta(left, right) {
  const a = normalizeMeta(left);
  const b = normalizeMeta(right);
  const knowledge = {};
  const bestiary = {};
  for (const enemy of ENEMIES) {
    const id = enemy.id;
    knowledge[id] = Math.max(a.knowledge[id] || 0, b.knowledge[id] || 0);
    const x = normalizeRecord(a.bestiary[id], knowledge[id]);
    const y = normalizeRecord(b.bestiary[id], knowledge[id]);
    const encounters = Math.max(x.encounters, y.encounters);
    if (encounters) {
      const firstFloors = [x.firstFloor, y.firstFloor].filter(Boolean);
      const deepestFloors = [x.deepestFloor, y.deepestFloor].filter(Boolean);
      bestiary[id] = {
        encounters,
        defeats: Math.max(x.defeats, y.defeats),
        firstFloor: firstFloors.length ? Math.min(...firstFloors) : null,
        deepestFloor: deepestFloors.length ? Math.max(...deepestFloors) : null,
      };
    }
  }
  const bestFloor=Math.max(a.bestFloor,b.bestFloor);
  return { bestFloor, knowledge, bestiary, records:mergeRecords(a.records,b.records,bestFloor), runHistory:mergeRunHistory(a.runHistory,b.runHistory) };
}

export function recordEncounter(meta, enemyId, encounterFloor) {
  if (!enemyIds.has(enemyId)) return;
  meta.bestiary ||= {};
  const record = normalizeRecord(meta.bestiary[enemyId], meta.knowledge?.[enemyId]);
  const currentFloor = floor(encounterFloor);
  const previouslyEncountered = record.encounters > 0;
  record.encounters += 1;
  if (currentFloor) {
    if (!previouslyEncountered) record.firstFloor = currentFloor;
    record.deepestFloor = Math.max(record.deepestFloor || currentFloor, currentFloor);
  }
  meta.bestiary[enemyId] = record;
}

export function recordDefeat(meta, enemyId) {
  if (!enemyIds.has(enemyId)) return;
  meta.bestiary ||= {};
  const record = normalizeRecord(meta.bestiary[enemyId], meta.knowledge?.[enemyId]);
  record.defeats += 1;
  record.encounters = Math.max(record.encounters, record.defeats);
  meta.bestiary[enemyId] = record;
}

export function bestiaryEntries(meta) {
  const normalized = normalizeMeta(meta);
  return ENEMIES.map(enemy => {
    const record = normalized.bestiary[enemy.id];
    return record ? { id:enemy.id, name:enemy.name, encountered:true, ...record } : {
      id:enemy.id, name:'？？？', encountered:false, encounters:0, defeats:0, firstFloor:null, deepestFloor:null,
    };
  });
}
