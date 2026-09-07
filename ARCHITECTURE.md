# Architecture

## System Overview

依存ライブラリやバックエンドを持たない、ES Modules製の静的Webアプリです。純粋なドメインロジックを表示層から分離します。

## Technology Stack

- HTML5 / CSS3 / JavaScript (ES2022 modules)
- Node.js標準test runner（ロジックテストのみ）
- `localStorage`（端末内のメタ進行保存）

## Major Components

| 配置 | 責務 |
| --- | --- |
| `src/config.js` | 調整可能な全体定数 |
| `src/rng.js` | seed再現可能な乱数生成 |
| `src/formulas.js` | ダメージ、EXP、Gold、成長、階層、開示、逃走の純粋関数 |
| `src/enemies.js` | 敵アーキタイプと、文章に対応する行動パターン |
| `src/items.js` | ItemDefinition、OwnedItem生成、系列アンロック、階層Tier、レアリティ、ドロップ抽選 |
| `src/keyboard.js` | 画面状態別KeyMap、予約キー・修飾キー・入力欄・長押しの除外判定 |
| `src/game.js` | 戦闘ステートマシンとラン進行 |
| `src/ui.js` | DOM描画、入力、端末内保存 |

将来のパーティー化では、`player`を同じcombatant形状の配列へ移し、行動の対象選択を追加します。式と敵行動はUIに依存しません。

## Data Flow

UI入力 → `Game.dispatch(action)` → 状態遷移とログ生成 → snapshot → UI描画、という一方向です。戦闘は勝利後に`preparation`へ移り、進行・鍛錬・買物・保存を選んでから次戦へ入ります。敵は「予告済みの行動」を実行してから次の行動を予約するため、文章と実行が一致します。

キーボード入力は表示中の画面から一意なKeyMapを選び、クリックと同じUIアクションへ合流します。戦闘演出中は短時間ロックし、キーリピートや入力欄、OS修飾キーを入口で除外します。

## External Services / Deployment

外部サービスはありません。任意の静的ホスティング、またはローカルHTTP serverで配信できます。

## Key Constraints

- 乱数は必ず注入された`Rng`を経由する。
- 調整値と式はUIへ埋め込まない。
- 保存データはバージョン付き、壊れた値は既定値へ戻す。
