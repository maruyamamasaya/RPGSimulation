# AI-driven Development Starter

AIエージェントと人間が、要件整理・設計・実装・レビュー・検証を一貫した方法で始めるための、技術スタック非依存のStarter Repositoryです。現時点ではプロジェクト固有の仕様やアプリケーションコードはありません。

## 含まれるもの

- 現在地、設計、ドメイン、データ、優先順位、テスト、セキュリティの正本テンプレート
- 重要な設計判断を残すADR領域
- AI向けの短いworkflow、完了checklist、必要時に使うtemplate
- Progressive Documentation（必要になった時だけ文書を増やす）のルール

## 含まれないもの

実装、技術スタック、依存関係、DB migration、CI/CD、コンテナ、デプロイ設定、実装用のfrontend/backend構成は意図的に含めていません。CODEMAP、階層型AGENTS、統合verify script、sessionsも必要になるまで作りません。

## コピー直後に行うこと

1. プロジェクトの目的と対象範囲を定義する。
2. [DOMAIN.md](DOMAIN.md)を初期化する。
3. [ARCHITECTURE.md](ARCHITECTURE.md)を初期化する。
4. 永続化が必要なら[DATA_MODEL.md](DATA_MODEL.md)を初期化し、不要なら`Not applicable`と記録する。
5. [SECURITY.md](SECURITY.md)を初期化する。
6. [ROADMAP.md](ROADMAP.md)に最初のPhaseを作る。
7. [CURRENT.md](CURRENT.md)に現在地を記録する。
8. 人間が内容と未決事項をレビューする。
9. 合意後に初めて実装を始める。

## 推奨開発フロー

要求を明確化し、正本を確認・更新して合意を得た後、検索で変更対象を絞り、最小変更を実装します。関連する検証とレビューを行い、実装と正本を同期してください。AI向けの詳細ルールは[AGENTS.md](AGENTS.md)を参照してください。

## 主要ドキュメント

| 文書 | 役割 |
| --- | --- |
| [CURRENT.md](CURRENT.md) | 現在地 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 現在のシステム構造 |
| [DOMAIN.md](DOMAIN.md) | 業務概念とルール |
| [DATA_MODEL.md](DATA_MODEL.md) | 永続化モデル |
| [ROADMAP.md](ROADMAP.md) | 開発優先順位 |
| [TESTING.md](TESTING.md) | 検証方針 |
| [SECURITY.md](SECURITY.md) | セキュリティ方針 |
| [decisions/](decisions/) | 重要な設計判断 |
