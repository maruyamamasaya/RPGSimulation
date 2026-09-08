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
| `src/bestiary.js` | 敵図鑑メタの正規化、遭遇・撃破記録、後方互換な統合 |
| `src/run-records.js` | Run Stats、自己ベスト、最大10件の履歴の正規化と確定 |
| `src/items.js` | ItemDefinition、OwnedItem生成、系列アンロック、階層Tier、レアリティ、ドロップ抽選 |
| `src/equipment-traits.js` | 装備特性定義、seed再現可能な付与抽選、装備中の条件付き倍率 |
| `src/specializations.js` | ラン限定専門強化の定義、seed再現可能な候補抽選、各補正値 |
| `src/keyboard.js` | 画面状態別KeyMap、予約キー・修飾キー・入力欄・長押しの除外判定 |
| `src/game.js` | 戦闘ステートマシンとラン進行 |
| `src/ui.js` | DOM描画、入力、端末内保存 |

将来のパーティー化では、`player`を同じcombatant形状の配列へ移し、行動の対象選択を追加します。式と敵行動はUIに依存しません。

## Data Flow

UI入力 → `Game.dispatch(action)` → 状態遷移とログ生成 → snapshot → UI描画、という一方向です。戦闘は勝利後に`preparation`へ移り、進行・鍛錬・買物・保存を選んでから次戦へ入ります。敵との戦闘開始・勝利は敵定義IDを使って図鑑メタへ記録され、ラン中の成果はRun Statsへ集計します。ゲームオーバー時だけ結果を確定し、自己ベストと履歴をmetaへ保存します。UIは図鑑・結果の表示用データを描画します。敵は「予告済みの行動」を実行してから次の行動を予約するため、文章と実行が一致します。

通常進行は`events.js`のseed付き抽選を通り、イベントなら`Game`が一度の選択結果を解決してから戦闘生成へ進みます。イベント定義・装備報酬生成はUIから独立し、ラン限定補正は装備再計算の最後に一度だけ適用します。

`mutations.js`は10階層区間の抽選・定義・補正値を管理します。`Game`は敵ダメージ、戦闘EXP/Gold、敵ドロップ、共通回復、Threat由来の強敵率という各最終計算点でだけ現在変異を参照し、基礎定義を書き換えません。

`specializations.js`はLevel 5・10・15の3候補抽選と取得レベルを管理します。与ダメージは装備・状況倍率へビルド倍率を1回乗算し、被ダメージは敵側補正後、GoldはFORTUNE・商才・豊穣を各1回、ドロップ率は探索・宝運を各1回だけ合成します。イベント報酬には戦闘専用補正を適用しません。

キーボード入力は表示中の画面から一意なKeyMapを選び、クリックと同じUIアクションへ合流します。戦闘演出中は短時間ロックし、キーリピートや入力欄、OS修飾キーを入口で除外します。

表示は同じDOMをCSS Gridで再配置し、PCでは探索者・敵・ラン情報の3領域、タブレットでは敵を上段にします。600px以下の戦闘中は100dvhの固定HUDとし、敵HP・可変の戦闘中央領域・予兆・探索者HP・行動・最新2ログへ高さを配分します。補助情報は右上メニューからスクロール可能なモーダルへ移し、大技準備と発動時だけ予兆パネルを危険表示へ切り替えます。

## External Services / Deployment

外部サービスはありません。任意の静的ホスティング、またはローカルHTTP serverで配信できます。

## Key Constraints

- 乱数は必ず注入された`Rng`を経由する。
- 調整値と式はUIへ埋め込まない。
- 保存データはバージョン付き、壊れた値は既定値へ戻す。
