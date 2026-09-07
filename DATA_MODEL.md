# Data Model

## Persistence Strategy

サーバー永続化は行わず、ブラウザの`localStorage`にメタ進行と明示的な1スロットのラン保存を保持します。ラン保存は安全な`preparation`状態でのみ作成します。

## Stored document

キー `formula-dungeon:meta:v1`:

```text
{ version: 1, bestFloor: number, knowledge: { [enemyId]: defeatedCount } }
```

`bestFloor`は到達した最大階、`knowledge`は敵IDごとの勝利数です。不正・旧形式データは読み捨てて初期値へ戻します。

キー `formula-dungeon:save:v3` は、階層、player（基礎・実効能力、HP/SP、EXP、Gold、OwnedItem、消耗品、装備、系列別ショップ進行）、討伐知識、連戦数、Threat、強敵状態、アイテム連番、ラン集計、ログ、RNG状態を保持します。読み込み時は`preparation`状態を検証し、装備実効値を再計算します。旧`v2`は固定装備IDをOwnedItemへ補完して読み込めます。

装備は`ItemDefinition`（定義、系列、Tier、レアリティ、基礎性能）と`OwnedItem`（instanceId、definitionId、rolledStats、取得元、取得順）に分けます。ショップ品とドロップ品は同じ定義を使い、ドロップ時だけ小さな性能差を生成します。

## Ownership / Lifecycle / Retention

データは利用者のブラウザだけが所有し、ゲーム終了後も明示的にブラウザデータを消すまで保持されます。外部送信、アカウント、バックアップはありません。

## Future migration

形式変更時はキー末尾と`version`を更新し、必要なら起動時に旧版を一方向変換します。ランキング導入時はクライアント値を信頼せず、別のサーバーモデルを設計します。
