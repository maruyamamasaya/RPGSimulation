# Data Model

## 移行中の位置づけ

以下は旧Web版の保存モデルです。iOS版でもラン内状態と恒久記録、定義IDと装備個体IDを分ける方針ですが、iOSの保存はApplication Support内の手動チェックポイント・自動中断アーカイブ・恒久メタを採用し、旧Webデータ移行の要否は未決定です。localStorageのキーをiOSの保存要件として扱いません。

## Persistence Strategy

サーバー永続化は行わず、ブラウザの`localStorage`にメタ進行と明示的な1スロットのラン保存を保持します。ラン保存は安全な`preparation`状態でのみ作成します。

## iOSの現在のラン状態

RunEngineは階層、player、現在戦闘、EXP、Gold、回復薬在庫、撃破数、鍛錬回数、ラン内の敵ID別討伐知識とRNGをメモリで保持します。手動保存のほか各行動後に戦闘/イベント/選択を自動保存し、起動時に再開できます。旧Webの恒久知識・図鑑・ラン記録と混同しません。

## Stored document

キー `formula-dungeon:meta:v1`:

```text
{
  version: 1,
  bestFloor: number,
  knowledge: { [enemyId]: defeatedCount },
  bestiary: { [enemyId]: { encounters, defeats, firstFloor, deepestFloor } },
  records: { highestFloor, maxKills, maxStrongKills, maxGoldEarned, maxDamage },
  runHistory: Array<{ id, endedAt, floor, kills, strongKills, goldEarned, finalLevel }>
}
```

`bestFloor`は到達した最大階、`knowledge`は敵IDごとの勝利数です。`bestiary`は安定した敵定義IDをキーに、遭遇・撃破回数と初回・最深遭遇階層を保持します。`records`は完了ランの自己ベスト、`runHistory`は終了日時付きの直近10件です。既存のv1メタに追加フィールドがない場合は安全な初期値へ補完し、`bestiary`は`knowledge`を最低限の遭遇・撃破数として引き継ぎます。

キー `formula-dungeon:save:v3` は、階層、player、meta、Run Stats、ラン限定の`runModifiers`、現在の`floorMutation: { id, startFloor, endFloor }`、専門強化レベルの`specializations`、取得済み節目、保留中の候補、連戦数、Threat、強敵状態、アイテム連番、ログ、RNG状態を保持します。読み込み時は`preparation`状態を検証し、装備実効値を再計算します。旧保存にラン補正・階層変異・専門強化がなければ補正なしとし、旧`v2`は固定装備IDをOwnedItemへ補完して安全に読み込めます。端末内メタとラン保存の恒久記録は、累計値を失わないよう読み込み時に統合します。

状態異常は戦闘中だけ存在し、保存可能な`preparation`へ入る際に解除します。旧v3のplayerに`statuses`がない場合は空状態へ補完します。武器属性はItemDefinition側の定義でありOwnedItemの保存形式は変更しません。

装備は`ItemDefinition`（定義、系列、Tier、レアリティ、基礎性能）と`OwnedItem`（instanceId、definitionId、rolledStats、trait、取得元、取得順）に分けます。ショップ品とドロップ品は同じ定義を使い、ドロップ時だけ小さな性能差と、30%で最大1個の特性IDを生成します。ショップ品と旧保存の装備は`trait: null`として扱います。

## Ownership / Lifecycle / Retention

データは利用者のブラウザだけが所有し、ゲーム終了後も明示的にブラウザデータを消すまで保持されます。外部送信、アカウント、バックアップはありません。

## Future migration

形式変更時はキー末尾と`version`を更新し、必要なら起動時に旧版を一方向変換します。ランキング導入時はクライアント値を信頼せず、別のサーバーモデルを設計します。

iOSの保存形式はバージョン2の完全状態アーカイブとバージョン1の恒久メタ。旧iOS v1準備保存を移行読み込みする。保存項目・検証・復元境界は[IOS_DESIGN.md](IOS_DESIGN.md#記録保存)を参照。旧Web保存互換は未実装。
