# 0001: Static ES Modules architecture

- Status: Accepted
- Date: 2026-09-07

## Context

MVPはブラウザ単体で開始でき、数式とUIを分離し、seed再現テストが可能である必要がある。バックエンドやフレームワークは現段階では過剰である。

## Decision

native ES Modulesによる静的Webアプリとし、ドメイン層はDOMへ依存させない。外部依存を置かず、Node.js標準test runnerで同じモジュールを検証する。

## Consequences

配布と監査が単純になり、式の変更にUI変更が不要になる。一方、複雑な画面遷移やオンラインランキングが必要になった時点で、UI基盤とサーバー境界を再評価する。
