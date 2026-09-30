# Game Content

旧Web実装から抽出した基準データ。iOS版の初回収録範囲・数値は未確定。処理と倍率は[GAME_RULES.md](GAME_RULES.md)を参照。今後は合意した変更をこの文書へ反映し、旧コードが自動的に最新仕様になるとは扱わない。

## 敵種（20種）

能力列は基本値への種別倍率。行動列は周期実行順ではなく、抽選の重みとなる登場列。属性IDはSLASH=斬撃、BLUNT=打撃、ARCANE=魔力、PIERCE=貫通。参照: `src/enemies.js`。

| ID | 名前 | HP | ATK | DEF | SPD | OBS | 危険度 | 基礎Gold | 弱点 | 耐性 | 基本行動列 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| slime | 蒼雫スライム | 1.05 | 0.82 | 1.12 | 0.72 | 0.65 | 0.8 | 20 | BLUNT | SLASH | strike,guard |
| rat | 迷宮ネズミ | 0.72 | 0.88 | 0.62 | 1.35 | 0.8 | 0.75 | 20 | SLASH | なし | strike,feint,rest |
| goblin | 灰耳ゴブリン | 0.95 | 1 | 0.85 | 1.05 | 0.9 | 1 | 22 | BLUNT | なし | strike,strike,heavy |
| bat | 反響コウモリ | 0.68 | 0.82 | 0.55 | 1.48 | 1.2 | 0.85 | 21 | PIERCE | なし | feint,strike,rest |
| beetle | 鉄殻ビートル | 1.18 | 0.85 | 1.45 | 0.62 | 0.7 | 1.05 | 23 | BLUNT | SLASH | guard,strike,lunge |
| wolf | 黒牙ウルフ | 0.9 | 1.12 | 0.72 | 1.34 | 1.05 | 1.15 | 24 | PIERCE | なし | bleed-strike,lunge,strike |
| skeleton | 巡回スケルトン | 1 | 1.04 | 1 | 1 | 0.82 | 1 | 22 | BLUNT | PIERCE | strike,guard,heavy |
| moth | 幻粉モス | 0.78 | 0.9 | 0.7 | 1.18 | 1.5 | 1.1 | 23 | SLASH | ARCANE | weaken-feint,rest,heavy |
| orc | 赤斧オーク | 1.25 | 1.28 | 1.04 | 0.72 | 0.78 | 1.3 | 25 | PIERCE | なし | strike,heavy,rest |
| snake | 晶洞サーペント | 0.86 | 1.1 | 0.7 | 1.3 | 1.15 | 1.15 | 24 | SLASH | PIERCE | strike,lunge,rest |
| mimic | 飢えたミミック | 1.25 | 1.18 | 1.2 | 0.7 | 1.35 | 1.35 | 26 | ARCANE | SLASH | guard,feint,heavy |
| golem | 刻印ゴーレム | 1.55 | 1.18 | 1.55 | 0.48 | 0.9 | 1.5 | 27 | ARCANE | SLASH | guard,heavy,rest |
| harpy | 風切ハーピー | 0.82 | 1.08 | 0.66 | 1.5 | 1.1 | 1.25 | 25 | PIERCE | なし | feint,lunge,rest |
| ogre | 大槌オーガ | 1.5 | 1.4 | 1.08 | 0.58 | 0.72 | 1.55 | 28 | SLASH | BLUNT | strike,strike,break-heavy,rest |
| wisp | 数霊ウィスプ | 0.75 | 1.2 | 0.58 | 1.2 | 1.62 | 1.3 | 25 | ARCANE | BLUNT | rest,feint,heavy |
| lizard | 石鱗リザード | 1.15 | 1.05 | 1.28 | 0.92 | 1 | 1.2 | 24 | BLUNT | SLASH | guard,heavy,strike |
| knight | 亡国の騎士 | 1.35 | 1.22 | 1.35 | 0.9 | 1.25 | 1.5 | 27 | ARCANE | SLASH | strike,guard,heavy,feint |
| spider | 算糸スパイダー | 0.88 | 1.02 | 0.76 | 1.42 | 1.45 | 1.25 | 25 | SLASH | PIERCE | feint,guard,slow-lunge |
| drake | 幼晶ドレイク | 1.45 | 1.38 | 1.18 | 1.08 | 1.18 | 1.65 | 29 | PIERCE | ARCANE | rest,lunge,heavy |
| sentinel | 深層センチネル | 1.62 | 1.3 | 1.5 | 0.75 | 1.4 | 1.75 | 30 | BLUNT | PIERCE | guard,strike,feint,heavy |

### 敵の特性文章

| ID | 特性 | 従来の弱点文章 |
| --- | --- | --- |
| slime | 打撃を柔らかく受ける | 演算強打 |
| rat | 素早いが打たれ弱い | 高いDEF |
| goblin | 規則正しく強打を準備する | 強打前の防御 |
| bat | 音でこちらを探る | 観察 |
| beetle | 殻を閉じると非常に硬い | 休息の隙 |
| wolf | 弱った相手への突進を好む | 突進前の防御 |
| skeleton | 同じ手順を何度も繰り返す | 行動周期の把握 |
| moth | 紛らわしい動きで惑わせる | 集中解析 |
| orc | 重い一撃の後に息が切れる | 強打後の隙 |
| snake | 距離を取って突進する | 予兆への防御 |
| mimic | 守りと奇襲を交互に行う | 観察 |
| golem | 遅いが極めて頑丈 | 休息の隙 |
| harpy | 速度を生かすが疲れやすい | 休息の隙 |
| ogre | 二撃の後に大技を放つ | 強打への防御 |
| wisp | 実体が読みづらい | OBS |
| lizard | 守りから反撃を狙う | 防御中は観察 |
| knight | 隙の少ない型を守る | 行動周期の把握 |
| spider | こちらの反応を見て仕掛ける | 集中解析 |
| drake | 息を整えてから猛攻する | 休息中の攻撃 |
| sentinel | 解析しながら確実に攻める | 高いOBS |

## 基本行動定義

| ID | 名前 | 倍率 | 予兆 | 実行文章 | 状態付与 |
| --- | --- | --- | --- | --- | --- |
| strike | 攻撃 | 1 | こちらとの間合いを測っている。 | 素早く踏み込み、攻撃した。 | なし |
| guard | 防御 | 0 | 身体を丸め、守りを固めようとしている。 | 身体を固め、攻撃に備えた。 | なし |
| feint | フェイント | 1.25 | 視線を逸らし、足先だけがこちらを向いている。 | 視線は囮だった。鋭い一撃が飛んできた！ | なし |
| rest | 休息 | 0 | 荒い息を整えようとしている。攻撃は来なさそうだ。 | 息を整え、隙を見せた。 | なし |
| heavy | 強打 | 1.75 | 大きく武器を振りかぶった。次は危険だ。 | 予告どおり渾身の一撃を振り下ろした！ | なし |
| lunge | 突進 | 1.5 | 後ろへ大きく下がり、一直線に狙いを定めた。 | 溜めた距離を使って突進した！ | なし |
| bleed-strike | 裂傷撃 | 1 | 牙が赤く光る。次の一撃で出血する可能性がある。 | 赤い牙で切り裂いた！ | BLEED 35% |
| weaken-feint | 幻惑粉 | 1.25 | 鈍い粉が漂う。次の攻撃で弱体する可能性がある。 | 幻惑の粉を叩きつけた！ | WEAKEN 40% |
| break-heavy | 鎧砕き | 1.75 | 防具へ狙いを定めた。次の強打で破防する可能性がある。 | 防具を狙う強打を振り下ろした！ | ARMOR_BREAK 40% |
| slow-lunge | 絡め糸 | 1.5 | 粘つく糸を張った。次の突進で鈍足になる可能性がある。 | 糸を絡めながら突進した！ | SLOW 45% |

ogre/drakeの特別行動は基本抽選列とは別に予約される。準備（charge）は無攻撃、破砕撃（ultimate）は最大HP由来の専用式を使う。準備予兆は「空気が震えている。次の攻撃は極めて危険だ。」、発動予兆は「大槌が赤く輝く。今すぐ防御しなければ致命傷になる！」。大技ターンの2ターン前から追加の準備表示がある。

## アイテム定義

性能は購入品の固定値で、ドロップ時は個体差を付ける。価格はGold。推奨Lvは目安で、ショップ解放判定は階層Tierと系列購入進行。参照: `src/items.js`。

| ID | 名前 | 種別 | 価格 | 性能 | レアリティ | Tier | 推奨Lv | 系列 | ショップ | 属性 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rusty-sword | 錆びた剣 | weapon | 80 | atk:4 | common | 1 | 1 | standard-sword | 可 | SLASH |
| iron-sword | 鉄の剣 | weapon | 220 | atk:9 | uncommon | 2 | 11 | standard-sword | 可 | SLASH |
| steel-sword | 鋼の剣 | weapon | 520 | atk:16 | rare | 3 | 31 | standard-sword | 可 | SLASH |
| mithril-sword | ミスリル剣 | weapon | 1080 | atk:23, spd:3 | epic | 4 | 61 | standard-sword | 可 | SLASH |
| small-knife | 小刀 | weapon | 90 | atk:3, spd:3 | common | 1 | 1 | speed-blade | 可 | PIERCE |
| dagger | 疾風の短剣 | weapon | 350 | atk:8, spd:6 | rare | 2 | 16 | speed-blade | 可 | PIERCE |
| gale-knife | 風走りの刃 | weapon | 620 | atk:12, spd:10, def:-2 | rare | 3 | 34 | speed-blade | 可 | PIERCE |
| old-staff | 古い観察杖 | weapon | 95 | atk:2, obs:4 | common | 1 | 1 | seer-staff | 可 | ARCANE |
| seer-blade | 観測者の細杖 | weapon | 420 | atk:8, obs:7 | rare | 2 | 18 | seer-staff | 可 | ARCANE |
| sage-staff | 賢者の杖 | weapon | 720 | atk:11, obs:13 | epic | 3 | 38 | seer-staff | 可 | ARCANE |
| steel-greatsword | 鋼の大剣 | weapon | 480 | atk:17, spd:-3 | rare | 3 | 31 | greatsword | 可 | BLUNT |
| abyss-edge | 深淵の曲刀 | weapon | 980 | atk:25, spd:7, def:-3 | epic | 4 | 61 | abyss | 不可 | SLASH |
| leather-armor | 革の鎧 | armor | 100 | def:5, maxHp:10 | common | 1 | 1 | heavy-armor | 可 | — |
| iron-armor | 鉄の鎧 | armor | 280 | def:12, maxHp:25, spd:-3 | uncommon | 2 | 11 | heavy-armor | 可 | — |
| steel-armor | 鋼の鎧 | armor | 560 | def:19, maxHp:42, spd:-5 | rare | 3 | 31 | heavy-armor | 可 | — |
| sentinel-mail | 番人の装甲 | armor | 1050 | def:28, maxHp:70, spd:-7 | epic | 4 | 61 | heavy-armor | 可 | — |
| light-clothes | 探索者の軽装 | armor | 120 | def:3, spd:4 | common | 1 | 1 | light-armor | 可 | — |
| scout-gear | 斥候の軽装 | armor | 330 | def:6, spd:6, obs:7 | rare | 2 | 16 | light-armor | 可 | — |
| shadow-cloak | 影渡りの外套 | armor | 650 | def:9, spd:11, obs:8, maxHp:-10 | epic | 3 | 36 | light-armor | 可 | — |
| battle-garb | 戦闘衣 | armor | 300 | atk:3, def:9 | uncommon | 2 | 14 | battle-garb | 可 | — |
| ward-coat | 演算障壁衣 | armor | 590 | def:13, maxHp:20, obs:7 | rare | 3 | 38 | battle-garb | 可 | — |
| dragon-scale | 竜鱗の戦衣 | armor | 1180 | atk:7, def:23, maxHp:38 | legendary | 4 | 65 | dragon | 不可 | — |
| herb | 回復薬 | consumable | 45 | heal:35 | common | 1 | 1 | potion | 可 | — |
| mid-potion | 中級回復薬 | consumable | 80 | heal:60 | common | 1 | 6 | potion | 可 | — |
| high-potion | 上級回復薬 | consumable | 110 | heal:90 | uncommon | 2 | 11 | potion | 可 | — |
| deep-potion | 深層回復薬 | consumable | 220 | heal:180 | rare | 3 | 31 | potion | 可 | — |
| elixir | 生命の霊薬 | consumable | 420 | heal:360 | epic | 4 | 61 | potion | 可 | — |

## 追加・変更時の確認

安定したID、能力倍率、危険度、予兆と実行の対応、弱点/耐性、入手条件を定義する。新しい敵や装備を追加したら、確定済みルールによる戦闘例と保存時の未知IDの扱いも確認する。状態異常・特性・専門強化・階層変異・イベントの数値はGAME_RULESを正本として参照する。
