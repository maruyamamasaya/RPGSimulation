# Data Model

## Persistence Strategy

サーバー永続化は行わず、ブラウザの`localStorage`にメタ進行だけを保存します。進行中ランは更新で失われます。

## Stored document

キー `formula-dungeon:meta:v1`:

```text
{ version: 1, bestFloor: number, knowledge: { [enemyId]: defeatedCount } }
```

`bestFloor`は到達した最大階、`knowledge`は敵IDごとの勝利数です。不正・旧形式データは読み捨てて初期値へ戻します。

## Ownership / Lifecycle / Retention

データは利用者のブラウザだけが所有し、ゲーム終了後も明示的にブラウザデータを消すまで保持されます。外部送信、アカウント、バックアップはありません。

## Future migration

形式変更時はキー末尾と`version`を更新し、必要なら起動時に旧版を一方向変換します。ランキング導入時はクライアント値を信頼せず、別のサーバーモデルを設計します。
