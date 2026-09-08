# AI Agent Guide

## このRepositoryの目的

このRepositoryは、AIと人間が「深層演算域 — Infinite Formula Dungeon」を一貫した方法で開発するためのプロジェクトです。プロジェクト固有情報は下記のProject Contextと各正本を参照してください。

## Project Context

- **Project Name**: 深層演算域 — Infinite Formula Dungeon（package名: `infinite-formula-dungeon`）
- **Purpose**: 敵の予兆と段階的に開示される情報を読み、攻撃・防御・観察・スキル・逃走を選びながら無限階層を進む、1人用の数式戦略RPGをブラウザ向けに提供する。
- **Primary Stack**: HTML5、CSS3、JavaScript（ES2022 native modules）の静的Webアプリ。バックエンドと外部ランタイム依存は持たず、Node.js標準test runnerでロジックを検証し、`localStorage`へ端末内データを保存する。
- **Main Domains**: ターン制戦闘、敵と予兆、観察・情報開示、階層進行、成長と専門強化、装備・特性・ショップ、イベント階層、階層変異、敵図鑑、ラン記録、ローカル保存。
- **Expected Work**: ゲームバランスと数式の調整、戦闘・敵・報酬・成長要素の拡張、アクセシビリティとレスポンシブUIの改善、保存互換性、seed再現可能なロジックとテスト、関連する正本の更新。新領域や新技術も、プロジェクト目的との関係を確認できれば対象になり得る。
- **Clearly Unrelated Examples**: 別製品固有のSwiftUI画面やXcode targetの修正、別サービス固有のNext.jsページ・API routeの変更、このRepositoryに存在しない別製品名・固有DB・固有ディレクトリ・固有クラスを複数前提とする作業。

## Project Context Guard

すべてのユーザー要求について、実装や副作用のあるコマンドを始める前に、要求と上記Project Contextの整合性を次の3段階で判定します。判定のための読み取り専用調査（`pwd`、Git root/status、文書・manifest・ディレクトリ・検索結果の確認）は実行できます。

### MATCH

現在のプロジェクトと明確に関連する要求です。通常の開発フローで作業します。

### UNCERTAIN

現在のプロジェクトで実現可能だが、新技術、新領域、大きな構成変更、または情報不足を含み、Project Contextだけでは判断しづらい要求です。自動的に拒否せず、`CURRENT.md`と関連する正本、manifest、検索結果、対象コードを読み取り専用で追加確認してから判断します。正当な新機能追加は妨げません。確認後に関連性を説明できればMATCHとして作業し、なお高い確信で別プロジェクト向けと分かった場合だけMISMATCHとします。

### MISMATCH

高い確信で明らかに別プロジェクト向けの要求です。別プロジェクト名・固有機能・固有ファイル名・固有クラス名・明確に異なるプラットフォーム・複数の矛盾するシグナルを総合して判定します。`SQLite`、`React`、`API`、`Docker`、`Python`、`Swift`、`database`など、一般的な技術名が1つ含まれるだけではMISMATCHにしません。迷う場合はUNCERTAINとします。

MISMATCHでは直ちに作業を停止し、ファイル変更、新規ファイル作成、パッケージ追加、DB変更、destructive command、commit、pushを行いません。応答には次だけを簡潔に示します。

- Current Project
- Mismatchと判断した理由
- Prompt内の不一致要素
- `No files were modified`

## Repository Boundaries

- 作業開始時に`git rev-parse --show-toplevel`等で現在のGit rootを確認し、このRepositoryを対象としていることを確かめる。
- 原則としてGit root外のファイルを書き換えず、隣接または別のRepositoryを勝手に変更しない。
- ユーザーが別Repositoryの操作を明示的に依頼した場合だけ、その対象と境界を確認してから例外として扱う。
- MISMATCH判定時は、Git root内外を問わず副作用のある操作を行わない。

## Context Guard Validation

変更前に「要求内の対象名・パス・技術・機能」とProject ContextおよびRepository内の実在情報を照合します。変更後は通常の関連テストに加え、差分が要求対象とGit root内に限定されていることを`git diff`と`git status`で確認します。Context Guard v1は文書による実行前ルールとし、外部API、分類サービス、追加パッケージ、専用ラッパーは導入しません。

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
- 必要性を確認せず、CODEMAP、階層型AGENTS、verify script、sessionsを追加しない。

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
