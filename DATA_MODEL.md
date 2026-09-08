# Data Model

## Persistence Strategy

サーバー永続化は行わず、ブラウザの`localStorage`にメタ進行と明示的な1スロットのラン保存を保持します。ラン保存は安全な`preparation`状態でのみ作成します。

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

キー `formula-dungeon:save:v3` は、階層、player（基礎・実効能力、HP/SP、EXP、Gold、OwnedItem、消耗品、装備、系列別ショップ進行）、図鑑・ベスト・履歴を含むmeta、Run Stats、連戦数、Threat、強敵状態、アイテム連番、既存ラン集計、ログ、RNG状態を保持します。読み込み時は`preparation`状態を検証し、装備実効値を再計算します。旧`v2`は固定装備IDをOwnedItemへ補完し、図鑑・Run Stats・記録がなければ安全な初期値へ補完して読み込めます。端末内メタとラン保存の恒久記録は、累計値を失わないよう読み込み時に統合します。

装備は`ItemDefinition`（定義、系列、Tier、レアリティ、基礎性能）と`OwnedItem`（instanceId、definitionId、rolledStats、trait、取得元、取得順）に分けます。ショップ品とドロップ品は同じ定義を使い、ドロップ時だけ小さな性能差と、30%で最大1個の特性IDを生成します。ショップ品と旧保存の装備は`trait: null`として扱います。

## Ownership / Lifecycle / Retention

データは利用者のブラウザだけが所有し、ゲーム終了後も明示的にブラウザデータを消すまで保持されます。外部送信、アカウント、バックアップはありません。

## Future migration

形式変更時はキー末尾と`version`を更新し、必要なら起動時に旧版を一方向変換します。ランキング導入時はクライアント値を信頼せず、別のサーバーモデルを設計します。
