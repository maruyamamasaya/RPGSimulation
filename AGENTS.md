# AI Agent Guide

## このStarterの目的

このRepositoryは、AIと人間が新規プロジェクトを一貫した方法で進めるための再利用可能な土台です。Starter状態にアプリケーションコードや確定済み技術スタックはありません。コピー後、実装前にプロジェクト固有情報を各正本へ初期化してください。

## 基本行動

`ユーザー要求 → AGENTS.md → CURRENT.md → 必要な設計文書 → 検索 → 対象コード → 影響範囲 → 関連テスト → 変更 → 検証 → 必要な文書更新`

コードが生成された後は、無差別にファイルを読まず、検索して対象を特定してから必要部分だけを読みます。

- 概念しか分からない: semantic/repository search
- symbol名が分かる: symbol/exact search
- 特定文字列: `rg`、`git grep`等
- 呼び出し元: references search
- 影響範囲: referencesと関連テスト

特定ツールを前提にせず、利用可能な手段から適切なものを選びます。

## 作業原則

- 既存仕様と正本を尊重し、推測を事実として固定しない。
- 最小変更を優先し、無関係なリファクタリングを避ける。
- 後から理由が必要になる重要な設計判断だけをADRへ残す。
- ドキュメントと実装の不整合を放置しない。
- 秘密情報、credential、token、個人情報の実値を記録しない。
- 現時点では実装、技術固有設定、CODEMAP、階層型AGENTS、verify script、sessionsを作らない。

## Source of Truth

| 正本 | 管理対象 |
| --- | --- |
| `CURRENT.md` | 現在の状態（履歴ではない） |
| `ARCHITECTURE.md` | 現在のシステム構造 |
| `DOMAIN.md` | 業務概念・ルール |
| `DATA_MODEL.md` | 永続化モデル |
| `ROADMAP.md` | 今後の優先順位 |
| `TESTING.md` | 検証方針 |
| `SECURITY.md` | セキュリティ方針 |
| `decisions/` | 重要な設計判断と理由 |
| Git history | 変更履歴 |

詳細は該当する正本へ集約し、他文書からリンクします。

## Context Budget

必要になった段階だけ次へ進み、毎回すべてを読みません。

1. Level 1: `AGENTS.md` + `CURRENT.md`
2. Level 2: 関連する設計文書
3. Level 3: 検索結果
4. Level 4: 対象コード
5. Level 5: 依存先・参照元・テスト

## Progressive Documentation

次の条件を満たした時だけ追加します。

- **`CODEMAP.md`**: 複数のFeature領域が存在する、構造だけでは位置を予測しづらい、または検索開始の安定した入口が必要な場合。全ファイル一覧にはしない。
- **階層型`AGENTS.md`**: 独立した技術スタック、検証方法、変更ルール、または強い責務境界がある場合。小さなディレクトリ単位では作らない。
- **Verify Script**: lint/typecheck/test/build等の確立済みコマンドを単一の検証入口へまとめる価値がある場合。技術スタック決定前は作らない。
- **`docs/architecture/`**: `ARCHITECTURE.md`だけでは詳細設計を簡潔に説明できない場合。`ARCHITECTURE.md`は全体要約・索引として維持する。
- **`docs/operations/`**: デプロイ、監視、バックアップ、障害対応、環境管理など実際の運用情報が必要な場合。
- **`sessions/`**: Git履歴、`CURRENT.md`、`ROADMAP.md`、ADRで不足する重要な引き継ぎ情報が実際に発生した場合のみ。AIの全作業ログにはしない。

## Documentation Hygiene

巨大な`AGENTS.md`/`CURRENT.md`、全ファイル一覧型CODEMAP、READMEへの全情報集約、無制限のAI作業ログ、説明の複製、コードの大量貼り付け、Git履歴で分かる情報の再記録を避けます。古い調査文書を正本として扱わず、習慣的な追記で文書を肥大化させません。詳細は正本へ集約し、他文書はリンクします。
