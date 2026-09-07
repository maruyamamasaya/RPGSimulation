# Architecture Decision Records

ADRは、将来理由が分からなくなると困る重要な設計判断、その背景、結果を残します。アーキテクチャ境界、長期的制約、重大なtrade-off、変更困難な技術選択で作成します。

軽微・容易に戻せる変更、実装詳細、作業ログ、既存方針に従うだけの変更では作成しません。すべての変更にADRを要求しません。

## Naming

`NNNN-short-kebab-case-title.md`とし、番号は既存の最大値の次を使います。作成時は[`0000-template.md`](0000-template.md)を複製し、元のtemplateは変更しません。

## Status

`Proposed`で提案し、合意後に`Accepted`、置換後に`Superseded by NNNN`、撤回時に`Rejected`とします。Accepted ADRの過去を書き換えず、判断を変える場合は新しいADRから旧ADRを参照します。
