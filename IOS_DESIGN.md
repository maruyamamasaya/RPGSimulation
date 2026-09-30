# iOS Design

## 現在の範囲

Swift・SwiftUIの試作として、戦闘→報酬・成長→準備→進行/鍛錬→次戦を実装する。ゲームロジックは[GAME_RULES.md](GAME_RULES.md)、旧定義データは[GAME_CONTENT.md](GAME_CONTENT.md)を基準にする。初回リリースの全範囲を確定するものではない。

現在の敵はスライム・ゴブリン・スケルトン・ネズミ・コウモリ・ゴーレム6種と強敵/異常個体。通常攻撃・防御・観察・演算強打・応急手当・集中解析・逃走、EXP/Gold、レベルアップ、鍛錬の報酬減衰、回復薬の購入・準備中の使用を実装する。装備と準備時保存/再開も実装。属性相性、出血等の一般状態異常、イベント、変異、専門強化、恒久記録は未実装。

## モジュール境界

| 構成 | 配置 | 責務 |
| --- | --- | --- |
| DungeonCore | `ios/Sources/DungeonCore/` | 戦闘・ラン進行・生成・成長・乱数・式・情報開示。UI/保存/端末APIから独立 |
| DungeonUI | `ios/Sources/DungeonUI/` | 公開snapshotとeventの描画、コマンドページ、透過画像リソース |
| App | `ios/App/` | SwiftUIの起動点とアプリアイコン |
| Tests | `ios/Tests/DungeonCoreTests/` | 固定乱数と入力列、境界条件の検証 |

Xcodeアプリは同じリポジトリ内のSwift Packageを参照する。外部パッケージは使わない。試作はiPhone / iOS 17以上、コアテストはmacOS 14以上。配布版の最低OS・iPad対応は未決定。

## 型とデータの流れ

`BattleAction`/`RunAction` → MainActor上の`BattleStore` → `RunEngine.perform` → `RunEvent`/`RunSnapshot` → SwiftUI。

- `Combatant`: 値型の能力とHP/SP。生成時に範囲を正規化する。
- `BattleEngine<Random>`: 1戦の状態・乱数・予約行動・破防・敵防御を所有する。
- `RunEngine<Random>`: 階層・成長・EXP/Gold・道具・撃破数・ラン内討伐知識を保持し、戦闘終了時に報酬を1度だけ確定する。
- `BattleSnapshot`/`RunSnapshot`: UIへ必要な公開情報を渡す。成長後のplayerはRunSnapshotを表示する。
- `DisclosedValue`: 未知・言語評価・範囲・実数。未知の敵能力を隠し数値として画面モデルへ持たせない。
- `BattleEvent`/`RunEvent`: ダメージ・回復・決着・報酬・成長・遭遇・購入を意味のある値で返す。
- `RandomSource`: 0以上1未満を返す注入境界。SeededRandomはMulberry32の32bit演算を使用する。

行動拒否時はゲーム状態・乱数・ターンを変更しない。非同期演出とその入力ロックは未導入。

## ラン制御

勝利で`preparation`へ進み、EXPとGold、撃破数、ラン内知識を増やす。必要EXPを引きながらレベルアップし、旧成長範囲で能力を増やしてHP/SPを全回復する。勝利後に攻撃を再送しても追加報酬を得ない。

進行は階層+1・鍛錬回数0で戦闘へ。鍛錬は階層を変えず鍛錬回数+1で再戦する。3/5/8回以上で報酬率90/75/50%。通常生成Lv、能力倍率、危険度とEXP/Gold式は旧定義を使う。敵種は採用した6種から一様抽選する。

逃走成功は`evaded`で一度結果を確認し、「探索を続ける」で同階層の新しい敵へ進む。報酬はなく、新戦闘はターン1・解析0から開始する。旧版の逃走直後の余分なターン処理を持ち込まない。敗北は`gameover`でランを終了し、再挑戦ではラン内の全値を初期化する。

回復薬は準備中に45 Goldで購入し、HP35回復として使用する。Gold不足、在庫なし、HP満タン、戦闘中の使用は状態を変更しない。Gold・在庫はラン内だけに保持する。

討伐知識も現在はラン内だけで情報精度に反映する。旧版の恒久知識と保存互換はまだ実装していない。

## 戦闘解決

状態/SP検証→プレイヤー行動→撃破/逃走成功判定→予約済み敵行動→破防の期間更新と敗北判定→次ターン・次行動の予約。

演算強打の破防は次の2ターンの命中にDEF0.85倍として適用する。敵防御は次のプレイヤー命中を0.48倍にして解除する。敵行動は定義の登場回数を重みにし、ゴブリンの攻撃重みを1.4倍する。予兆表示の後に再抽選しない。

出血・同時死亡・一般状態モデルは未実装。ターン番号は現在の選択ターンを指し、決着時にはそのターン番号を保持する。

基礎式とRNGの例は旧JavaScriptと照合する。ただし採用範囲と乱数消費順が異なるため、旧戦闘全体の完全一致を保証しない。

## 固定コマンドUI

上部の敵・探索者情報、固定高の直前メッセージ、下部2列×3行コマンド欄に分ける。基本行動からスキルへ、準備から道具・購入へ同じ枠内で切り替え、未使用枠は空けて高さを維持する。決着後も同じ枠で準備・逃走後の続行・再挑戦を表示する。

Game Boy風の淡い緑と濃い枠線を使う。ログは標準sheetへ移し、増加によるコマンド位置の移動を防ぐ。小画面・文字拡大時は上部情報とメッセージ枠内をスクロールできる。タップ領域は48pt以上。

敵画像と回復薬は透明PNGをSwift PackageのResourcesへ含め、元の画像をピクセル補間なしで縮小描画する。厳密な48×48・4色のデータ形式ではなく、モノクロのドット調画像である。画像は装飾としてVoiceOverから除外し、敵名・道具名はテキストで示す。

## 画像

- `ios/Sources/DungeonUI/Resources/slime.png`
- `ios/Sources/DungeonUI/Resources/goblin.png`
- `ios/Sources/DungeonUI/Resources/skeleton.png`
- `ios/Sources/DungeonUI/Resources/potion.png`

内蔵image_genで個別作成。透過alphaと描画を確認し、[生成プロンプト](assets/ios-pixel-sprites-prompts.json)を保持する。今後の追加も同じ画風・背景透過とする。

アプリアイコンは`ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-rainbow.png`。既存の無限記号と地下の輪を保持した虹色の1024px不透明画像。[アイコンの生成プロンプト](assets/ios-icon-rainbow-prompt.txt)を保持する。

## 開く・検証する

Xcodeで`ios/InfiniteFormulaDungeon.xcodeproj`を開き、InfiniteFormulaDungeon schemeとiPhone Simulatorを選ぶ。実機署名はローカルのTeamをビルド時に指定し、アカウント情報をリポジトリへ保存しない。

```sh
swift test --package-path ios
xcodebuild -project ios/InfiniteFormulaDungeon.xcodeproj \
  -scheme InfiniteFormulaDungeon -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

画面の実操作、文字拡大、VoiceOver、中断復帰はビルド・コアテストと分けて確認する。保存は準備中の明示操作に限定する。戦闘中や終了時の自動保存は行わない。

## 強敵・装備・保存の試作仕様

敵はスライム・ゴブリン・スケルトン・ネズミ・コウモリ・ゴーレムから一様抽選。強敵抽選の初期確率3%、うち20%が異常個体。勝利時の危険度は残HP20%以下で+8、12ターン以上で+7、逃走失敗1回で+4、余裕ある勝利で-5、前値を80%へ減衰し0〜100へ制限する。鍛錬で危険度-3。生成確率は危険度1につき0.0625ポイント加算、上限10%。これは旧版の戦闘長期化判定を簡略化した試作値。

強敵はLv1.38倍、HP/ATK/DEF/SPD/OBSを1.32/1.28/1.25/1.12/1.18倍。異常個体はLv1.9倍、能力1.85/1.8/1.65/1.3/1.55倍。整数丸めを適用する。EXP/Goldは10/18倍、逃走確率へ10/18ポイント加算。画面を薄赤色にし、上部へ赤い静的照明、文字で危険を示す。通常戦へ戻ると緑色へ戻る。

HPメーターは解析スコア0.48未満で不明、0.48以上で10%刻みの概算、0.82以上で実数由来の残量。勝利時は空になる。未知の実HPはUIへ渡さない。

剣・鎧は各3段階。価格と補正は`Equipment.swift`を正本とする。階層1〜10で段階1、11〜30で段階2、31以上で段階3が開放され、同系統の直前段階購入も必要。準備中のみ購入・装備・解除できる。成長能力と装備補正を分離し、重複適用を防ぐ。鎧の着脱時は最大HP差を現在HPへ反映し、繰り返し着脱で回復しない。

準備画面のメニューからバージョン1のJSONをApplication Support配下へatomic保存。基本能力・現在HP/SP・装備・階層・EXP/Gold・在庫・撃破/鍛錬/危険度・ラン内知識・RNG状態を保存する。復元時は値域・版・敵ID・装備整合性を検証し、不正なら既存ファイルを保持してエラーを表示する。次の敵生成は保存時の乱数状態から再現する。旧Web形式は読み込まない。新規ランはランダムseed、Debug時のみ`--seed`で再現用seedを指定可能。

追加の透明PNGは`rat.png`・`bat.png`・`golem.png`。[生成プロンプト](assets/ios-extra-sprites-prompts.json)を保持する。

異常個体だけに敵種別の二つ名候補を付ける。階層と敵Lvから候補を決め、追加の乱数を消費しない。二つ名は表示・遭遇ログへ反映し、保存済みの敵種/階層/Lvから再開時にも復元する。能力倍率は変えない。候補はRunEngineのencounterNameで管理する。
