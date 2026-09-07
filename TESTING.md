# Testing

## Testing Strategy

seed固定可能な純粋ロジックをNode.js標準test runnerで検証します。UIはブラウザで主要ブレークポイントと操作を手動確認します。

## Validation Matrix

| 変更タイプ | 必要な検証 |
| --- | --- |
| 式・敵・状態遷移 | `npm test`、`npm run check` |
| UI/CSS | 上記に加えブラウザ操作とレスポンシブ表示 |
| 文書のみ | 文書リンクと実装との整合 |

## Fast / Full Validation

- Fast: `npm run check`
- Full: `npm test && npm run check`
- Unit: `node --test`
- Build: 不要（native ES Modules）

## Covered rules

seed再現性、深層スケール、格差/OBS/観察による開示、防御、EXP格差、異常個体率、死亡、予兆一致、レベルアップを自動検証します。

## Manual Verification

375pxとデスクトップ幅で、全行動、スキルメニュー、ログ、勝利後の階層遷移、ゲームオーバーと再挑戦を確認します。
