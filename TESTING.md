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

seed再現性、深層スケール、格差/OBS/観察による開示、防御、EXP・Gold格差、強敵率と上限、Threat増減、強敵能力・報酬、死亡、予兆一致、レベルアップ、購入、系列アンロック、ドロップ個体差、装備再計算、鍛錬減衰、進行、v2/v3保存復元を自動検証します。

キーボード層は状態別割当、大文字小文字、予約キー非使用、`event.repeat`、入力ロック、編集要素、Cmd/Ctrl/Alt除外を自動検証します。

## Manual Verification

375pxとデスクトップ幅で、全行動、スキルメニュー、ログ、勝利後の準備、ショップ、装備、保存・続行、ゲームオーバーと再挑戦を確認します。PCではA/D/O/S/R、Q/W/E/X、N/T/P/I/E/V、商品選択と購入確認を実操作します。
