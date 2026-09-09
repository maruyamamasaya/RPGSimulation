# Security

## Boundaries and data

本MVPは認証・認可・秘密情報を持ちません。Sentry Error Monitoringのため、ブラウザで発生したJavaScriptエラーと診断に必要な技術情報をSentryへ送信します。ゲームの保存データは端末内に保持し、意図的に個人情報を収集しません。

## Input and output

ゲーム値は内部生成し、保存値は型・範囲を検証します。UIはログを含め`textContent`で描画し、HTML文字列として挿入しません。

## Dependencies

アプリ本体はブラウザとNode.js標準機能だけを使い、Error Monitoring用のSentry Browser JavaScript LoaderをCDNから読み込みます。Tracing、Session Replay、Loggingは組み込みません。Sentry以外の依存を追加する際はlockfile、脆弱性確認、最小権限を導入します。

## Retention

端末内データはブラウザのサイトデータ削除で消去できます。将来オンライン機能を設ける場合は認証、改ざん防止、保持期間を別途設計します。
