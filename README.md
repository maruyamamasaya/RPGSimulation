# 深層演算域 — Infinite Formula Dungeon

敵の予兆と不完全な情報を読み、行動を選びながら無限階層を進む1人用の数式戦略RPG。Web版の開発を終了し、今後はiOSアプリとして進めます。現在はゲーム仕様を整理しながら、iOSの最小戦闘を試作しています。

## 読む順序

1. [CURRENT.md](CURRENT.md): 現在の状態。
2. [DOMAIN.md](DOMAIN.md): ゲームの目的と基本ルール。
3. [GAME_RULES.md](GAME_RULES.md): 数式と処理順。
4. [GAME_CONTENT.md](GAME_CONTENT.md): 敵・行動・アイテムの基準データ。
5. [DEVELOPMENT.md](DEVELOPMENT.md): 決める事項、開発手順、依頼プロンプト。

## iOS試作

Xcodeで`ios/InfiniteFormulaDungeon.xcodeproj`を開いてiPhone Simulatorを選びます。設計・範囲・検証手順は[IOS_DESIGN.md](IOS_DESIGN.md)を参照してください。コアテストは`swift test --package-path ios`で実行できます。

## 旧実装の扱い

`src/`、`tests/`とWeb資産は移行時の参照として残しています。iOS版は階層進行と成長を含む試作で、保存は未実装です。旧ロジックの検証は`npm test`、構文確認は`npm run check`で行えます。旧Webのローカル確認が必要な場合は`npm run dev`を使えますが、Web UIの改修は現在の開発対象ではありません。
