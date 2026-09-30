import SwiftUI
import DungeonCore
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

@MainActor
final class BattleStore: ObservableObject {
    @Published private(set) var run: RunSnapshot
    @Published private(set) var messages: [String] = []
    @Published private(set) var hasSave = false
    private var saveURL: URL { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("InfiniteFormulaDungeon/run-v1.json") }
    private var engine: RunEngine<SeededRandom>
    var snapshot: BattleSnapshot { run.battle }

    init(seed: UInt32 = 42) {
        let engine = RunEngine(random: SeededRandom(seed: seed))
        self.engine = engine
        run = engine.snapshot
        hasSave = FileManager.default.fileExists(atPath: saveURL.path)
        if hasSave { resume() }
    }

    func send(_ action: BattleAction) { update(engine.perform(action)) }
    func choose(_ action: RunAction) { update(engine.perform(action)) }

    private func update(_ events: [RunEvent]) {
        run = engine.snapshot
        messages = Array((messages + events.map(Self.text)).suffix(30))
    }

    func restart() {
        engine = RunEngine(random: SeededRandom(seed: UInt32.random(in: 1...UInt32.max)))
        run = engine.snapshot
        messages = []
    }

    func save() {
        do {
            let data = try engine.saveData()
            try FileManager.default.createDirectory(at: saveURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: saveURL, options: .atomic)
            hasSave = true
            messages.append("準備状態を保存した。次回ここから再開できる。")
        } catch { messages.append("保存できませんでした。準備中に再試行してください。") }
    }

    func resume() {
        do {
            engine = try RunEngine(savedData: Data(contentsOf: saveURL))
            run = engine.snapshot
            messages = ["保存した地下\(run.floor)階の準備から再開した。"]
        } catch { messages.append("保存データを読み込めませんでした。既存の保存は保持しています。") }
    }

    private static func text(_ event: RunEvent) -> String {
        switch event {
        case .reward(let exp, let gold): "EXP +\(exp) / Gold +\(gold)"
        case .levelUp(let level): "レベル\(level)へ！ HP・SP全回復"
        case .encountered(let name, let floor): "地下\(floor)階：\(name)が現れた！"
        case .potionPurchased: "回復薬を購入した（45 Gold）"
        case .healed(let amount): "回復薬でHPを\(amount)回復"
        case .gearPurchased(let gear): "\(gear.name)を購入：\(gear.detail)"
        case .gearEquipped(let gear): gear.map { "\($0.name)を装備：\($0.detail)" } ?? "装備を外した"
        case .combat(let event):
            switch event {
            case .playerHit(let amount): "敵へ\(amount)ダメージ"
            case .enemyActed(let intent): "敵の行動：\(intent.label)"
            case .playerDamaged(let raw, let applied): "被ダメージ \(raw) → \(applied)"
            case .healed(let amount): "HPを\(amount)回復"
            case .observed(let level): "解析段階 \(level)/3"
            case .escapeFailed: "逃走失敗"
            case .finished(let phase): phase.label
            }
        }
    }
}

private enum CommandPage { case main, skills, items, shop, weapons, armors, equipment, equipWeapons, equipArmors, system }

public struct BattleView: View {
    @StateObject private var store: BattleStore
    @State private var commandPage: CommandPage = .main
    @State private var showingLog = false
    @ScaledMetric(relativeTo: .body) private var commandHeight: CGFloat = 48
    private let ink = Color(red: 0.13, green: 0.20, blue: 0.16)
    private var danger: Bool { store.run.phase == .combat && store.snapshot.enemyRank != .normal }
    private var paper: Color { danger ? Color(red: 1, green: 0.80, blue: 0.76) : Color(red: 0.88, green: 0.91, blue: 0.80) }

    public init(seed: UInt32 = UInt32.random(in: 1...UInt32.max)) {
        _store = StateObject(wrappedValue: BattleStore(seed: seed))
    }

    public var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text("深層演算域").font(.headline)
                Spacer()
                Text("B\(store.run.floor)  TURN \(store.snapshot.turn)").monospacedDigit()
            }
            // Only this upper area scrolls on short screens or with enlarged text.
            ScrollView {
                VStack(spacing: 12) {
                    enemyPanel
                    playerPanel
                }
                .frame(maxWidth: .infinity)
            }
            .frame(maxHeight: .infinity)
            messagePanel
            commandPanel
        }
        .padding(12)
        .foregroundStyle(ink)
        .background {
            paper.ignoresSafeArea()
            if danger { RadialGradient(colors: [.red.opacity(0.32), .clear], center: .top, startRadius: 15, endRadius: 420).ignoresSafeArea().allowsHitTesting(false) }
        }
        .tint(ink)
        .sheet(isPresented: $showingLog) { logView }
    }

    private func sprite(_ name: String) -> Image {
        let path = Bundle.module.url(forResource: name, withExtension: "png")?.path
        #if os(iOS)
        if let path, let image = UIImage(contentsOfFile: path) { return Image(uiImage: image) }
        #elseif os(macOS)
        if let path, let image = NSImage(contentsOfFile: path) { return Image(nsImage: image) }
        #endif
        return Image(systemName: "questionmark.square")
    }

    private var enemyPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(store.snapshot.enemyName).font(.headline)
                Spacer()
                Text("解析 \(store.snapshot.observation)/3")
            }
            HStack {
                Text("\(store.snapshot.enemyRank.label)  HP \(store.snapshot.enemyHP.label)")
                Spacer()
            }
            VStack(alignment: .leading, spacing: 3) {
                if let fraction = store.snapshot.enemyHPFraction {
                    ProgressView(value: fraction, total: 1).tint(danger ? .red : ink)
                        .accessibilityLabel("敵のHP残量")
                        .accessibilityValue("約\(Int(fraction * 100))パーセント")
                } else {
                    Rectangle().fill(ink.opacity(0.12)).frame(height: 4)
                }
                Text(store.snapshot.enemyHPFraction == nil ? "残量不明 — 観察で解析" : "敵HP残量（概算または解析値）")
                    .font(.caption)
            }
            Text(danger ? "\(store.snapshot.enemyRank.label)：危険。逃走も選べる。" : "通常個体：予兆を確認しよう。")
                .font(.caption.weight(.semibold))
            HStack(alignment: .top) {
                Text("ATK \(store.snapshot.enemyAttack.label)")
                Spacer()
                Text("DEF \(store.snapshot.enemyDefense.label)")
            }
            sprite(store.snapshot.enemyID)
                .resizable()
                .interpolation(.none)
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .frame(height: 76)
                .accessibilityHidden(true)
            Text(store.snapshot.phase == .fighting
                 ? "予兆：\(store.snapshot.intent.telegraph)" : "戦闘は終了した。")
                .font(.callout.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 54, alignment: .topLeading)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(ink, lineWidth: 2))
    }

    private var playerPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("探索者  LV.\(store.run.player.level)").font(.headline)
                Spacer()
                Text("\(store.run.gold) G")
            }
            HStack {
                Text("HP \(store.run.player.hp)/\(store.run.player.maxHP)")
                Spacer()
                Text("SP \(store.run.player.sp)/\(store.run.player.maxSP)")
            }.monospacedDigit()
            ProgressView(value: Double(store.run.player.hp),
                         total: Double(store.run.player.maxHP))
                .accessibilityLabel("探索者のHP")
            Text("EXP \(store.run.exp)/\(store.run.requiredEXP)  撃破 \(store.run.kills)").font(.caption).monospacedDigit()
        }
        .padding(12)
        .overlay(Rectangle().stroke(ink, lineWidth: 2))
    }

    private var messagePanel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                if store.messages.isEmpty {
                    Text("\(store.snapshot.enemyName)が現れた！")
                    Text("予兆を読み、行動を選ぼう。")
                } else {
                    ForEach(Array(store.messages.suffix(3).enumerated()), id: \.offset) { _, message in
                        Text(message)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
        }
        .frame(height: 96)
        .overlay(Rectangle().stroke(ink, lineWidth: 2))
        .accessibilityLabel("直前の行動結果")
    }

    private var commandTitle: String {
        switch store.run.phase {
        case .preparation:
            commandPage == .items ? "道具" : commandPage == .shop ? "購入" : "準備"
        case .evaded: "逃走成功"
        case .gameover: "探索終了"
        case .combat: commandPage == .skills ? "スキル" : "コマンド"
        }
    }

    private var commandPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(commandTitle)
                    .font(.headline)
                Spacer()
                Text("SP \(store.run.player.sp)/\(store.run.player.maxSP)")
                    .monospacedDigit()
            }
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                if store.run.phase == .preparation {
                    if commandPage == .items {
                        GridRow {
                            command("回復薬 ×\(store.run.potions)",
                                    enabled: store.run.potions > 0 && store.run.player.hp < store.run.player.maxHP,
                                    icon: "potion") { store.choose(.usePotion) }
                            command("‹ 戻る") { commandPage = .main }
                        }
                        GridRow { emptySlot; emptySlot }
                        GridRow { emptySlot; emptySlot }
                    } else if commandPage == .shop {
                        GridRow {
                            command("回復薬 45G", enabled: store.run.gold >= 45, icon: "potion") {
                                store.choose(.buyPotion)
                            }
                            command("‹ 戻る") { commandPage = .main }
                        }
                        GridRow {
                            command("武器 ›") { commandPage = .weapons }
                            command("防具 ›") { commandPage = .armors }
                        }
                        GridRow { emptySlot; emptySlot }
                    } else if [.weapons, .armors, .equipWeapons, .equipArmors].contains(commandPage) {
                        let weapon = commandPage == .weapons || commandPage == .equipWeapons
                        let buying = commandPage == .weapons || commandPage == .armors
                        let gears = GearID.allCases.filter { $0.isWeapon == weapon }
                        GridRow { gearCommand(gears[0], buying: buying); gearCommand(gears[1], buying: buying) }
                        GridRow {
                            gearCommand(gears[2], buying: buying)
                            command("‹ 戻る") { commandPage = buying ? .shop : .equipment }
                        }
                        GridRow {
                            if buying { emptySlot } else { command("外す") { store.choose(weapon ? .unequipWeapon : .unequipArmor) } }
                            emptySlot
                        }
                    } else if commandPage == .equipment {
                        GridRow {
                            command("武器 ›") { commandPage = .equipWeapons }
                            command("防具 ›") { commandPage = .equipArmors }
                        }
                        GridRow { command("‹ 戻る") { commandPage = .main }; emptySlot }
                        GridRow { emptySlot; emptySlot }
                    } else if commandPage == .system {
                        GridRow { command("保存") { store.save() }; command("続きから", enabled: store.hasSave) { store.resume(); commandPage = .main } }
                        GridRow { command("ログ") { showingLog = true }; command("‹ 戻る") { commandPage = .main } }
                        GridRow { emptySlot; emptySlot }
                    } else {
                        GridRow {
                            command("次の階へ") { store.choose(.advance); commandPage = .main }
                            command("鍛錬") { store.choose(.train); commandPage = .main }
                        }
                        GridRow {
                            command("道具 ›") { commandPage = .items }
                            command("購入 ›") { commandPage = .shop }
                        }
                        GridRow {
                            command("装備 ›") { commandPage = .equipment }
                            command("メニュー ›") { commandPage = .system }
                        }
                    }
                } else if store.run.phase == .evaded {
                    GridRow {
                        command("探索を続ける") { store.choose(.continueAfterEscape); commandPage = .main }
                        command("ログ") { showingLog = true }
                    }
                    GridRow { emptySlot; emptySlot }
                    GridRow { emptySlot; emptySlot }
                } else if store.run.phase == .gameover {
                    GridRow {
                        command("再挑戦") { store.restart(); commandPage = .main }
                        command("ログ") { showingLog = true }
                    }
                    GridRow { command("続きから", enabled: store.hasSave) { store.resume(); commandPage = .main }; emptySlot }
                    GridRow { emptySlot; emptySlot }
                } else if commandPage == .main {
                    GridRow { action(.attack); action(.defend) }
                    GridRow {
                        action(.observe)
                        command("スキル ›") { commandPage = .skills }
                    }
                    GridRow {
                        action(.escape)
                        command("ログ") { showingLog = true }
                    }
                } else {
                    GridRow { action(.powerStrike); action(.firstAid) }
                    GridRow {
                        action(.focus)
                        command("‹ 戻る") { commandPage = .main }
                    }
                    GridRow { emptySlot; emptySlot }
                }
            }
        }
        .padding(12)
        .overlay(Rectangle().stroke(ink, lineWidth: 2))
    }

    private func gearCommand(_ gear: GearID, buying: Bool) -> some View {
        let owned = store.run.equipment.owned.contains(gear)
        let equipped = store.run.equipment.isEquipped(gear)
        let enabled = buying ? !owned && store.run.equipment.isUnlocked(gear, floor: store.run.floor) && store.run.gold >= gear.price : owned && !equipped
        return command(gear.name + "\n" + (buying ? "\(gear.price)G " : equipped ? "装備中 " : "") + gear.detail, enabled: enabled, compact: true) {
            store.choose(buying ? .buyGear(gear) : .equipGear(gear))
        }
    }

    private func action(_ action: BattleAction) -> some View {
        command(action.label + (action.cost > 0 ? "  \(action.cost)SP" : ""),
                enabled: store.snapshot.availableActions.contains(action)) {
            store.send(action)
            commandPage = .main
        }
    }

    private func command(_ title: String, enabled: Bool = true, icon: String? = nil, compact: Bool = false,
                         perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            HStack(spacing: 4) {
                if let icon {
                    sprite(icon).resizable().interpolation(.none).scaledToFit()
                        .frame(width: 24, height: 24).accessibilityHidden(true)
                }
                Text(title)
            }
                .font(compact ? .caption2.weight(.semibold) : .body.weight(.semibold))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .frame(height: min(72, max(48, commandHeight)))
                .background(ink.opacity(enabled ? 0.08 : 0.02))
                .overlay(Rectangle().stroke(ink.opacity(enabled ? 0.8 : 0.2), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }

    private var emptySlot: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: min(72, max(48, commandHeight)))
            .accessibilityHidden(true)
    }

    private var logView: some View {
        NavigationStack {
            List {
                if store.messages.isEmpty { Text("まだ記録はありません") }
                ForEach(Array(store.messages.enumerated()), id: \.offset) { _, message in
                    Text(message)
                }
            }
            .navigationTitle("戦闘ログ")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("閉じる") { showingLog = false }
                }
            }
        }
    }
}

private extension BattleAction {
    var label: String {
        switch self {
        case .attack: "攻撃"
        case .defend: "防御"
        case .observe: "観察"
        case .powerStrike: "演算強打"
        case .firstAid: "応急手当"
        case .focus: "集中解析"
        case .escape: "逃走"
        }
    }
}

private extension EnemyIntent {
    var label: String {
        switch self {
        case .strike: "攻撃"
        case .feint: "フェイント"
        case .lunge: "突進"
        case .heavy: "強打"
        case .rest: "休息"
        case .guardEnemy: "防御"
        }
    }
    var telegraph: String {
        switch self {
        case .strike: "こちらとの間合いを測っている。"
        case .feint: "素早く左右へ動いている。次はフェイント攻撃だ。"
        case .lunge: "低く身構えた。突進に備えよう。"
        case .heavy: "大きく武器を振りかぶった。次は危険だ。"
        case .rest: "荒い息を整えようとしている。攻撃は来なさそうだ。"
        case .guardEnemy: "身体を丸め、守りを固めようとしている。"
        }
    }
}

private extension BattlePhase {
    var label: String {
        switch self {
        case .fighting: "戦闘中"
        case .won: "勝利"
        case .lost: "敗北"
        case .escaped: "逃走成功"
        }
    }
}

private extension DisclosedValue {
    var label: String {
        switch self {
        case .unknown: "不明"
        case .exact(let value): "\(value)"
        case .range(let low, let high): "\(low)〜\(high)"
        case .qualitative(let estimate):
            switch estimate {
            case .low: "低そう"
            case .similar: "同程度"
            case .high: "非常に高い"
            }
        }
    }
}
