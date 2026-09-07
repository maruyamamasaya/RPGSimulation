# Security

技術スタック非依存のセキュリティ方針の正本です。脅威、信頼境界、採用方針が決まった時に更新します。秘密情報、credential、token、鍵、個人情報の実値は、この文書を含むRepositoryへ記録しません。

## Authentication

必要性、主体、認証強度、失効方針を定義する。

## Authorization

権限モデル、拒否時の既定動作、境界での強制方法を定義する。

## Secrets

保存・配布・rotation・失効方法を定義し、値そのものは記録しない。

## Sensitive Data

分類、最小収集、暗号化、アクセス制御、削除要件を定義する。

## Input Validation

信頼境界、検証、正規化、出力時の安全化を定義する。

## External Services

送信データ、権限、障害時動作、契約上の制約を確認する。

## Logging

監査要件と、秘密・個人情報を記録しないための方針を定義する。

## Dependencies

選定、更新、脆弱性確認、供給網リスクへの対応を定義する。

## Data Retention

保持期間、削除、backup上の扱いを`DATA_MODEL.md`と整合させる。

## Security Review

リスクの高い変更とrelease前に`.ai/checklists/security-review.md`を用い、未解決リスクと承認者を明示する。
