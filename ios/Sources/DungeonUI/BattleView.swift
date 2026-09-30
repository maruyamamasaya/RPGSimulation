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
    private let storage: DungeonStorage
    private var canWriteMeta = true
    private var canWriteAutosave = true
    private var engine: RunEngine<SeededRandom>
    var snapshot: BattleSnapshot { run.battle }

    init(seed: UInt32 = 42, storage: DungeonStorage = .applicationSupport) {
        self.storage = storage
        var meta = DungeonMeta()
        var notes: [String] = []
        do { meta = try storage.loadMeta() }
        catch { notes.append("図鑑・記録を読み込めません。既存ファイルは保持します。"); canWriteMeta = false }
        let resumeURL = storage.hasAutosave ? storage.autosaveURL : storage.manualURL
        var resumed: RunEngine<SeededRandom>?
        if FileManager.default.fileExists(atPath: resumeURL.path) {
            do { resumed = try RunEngine(savedData: Data(contentsOf: resumeURL)); notes.append("中断した探索を再開しました。") }
            catch { notes.append("中断データを読み込めません。既存の保存は保持します。"); canWriteAutosave = false }
        }
        var initial = resumed ?? RunEngine(random: SeededRandom(seed: seed), meta: meta)
        initial.mergeMeta(meta)
        engine = initial; run = initial.snapshot; messages = notes
        hasSave = storage.hasManualSave
        if canWriteAutosave { persist() }
    }
    func send(_ action: BattleAction) { update(engine.perform(action)) }
    func choose(_ action: RunAction) { update(engine.perform(action)) }
    func canChooseEvent(_ choice: EventChoice) -> Bool { engine.canChooseEvent(choice) }
    private func update(_ events: [RunEvent]) {
        guard !events.isEmpty else { return }
        run = engine.snapshot
        messages = Array((messages + events.map(Self.text)).suffix(30))
        persist()
        #if os(iOS)
        if UIAccessibility.isVoiceOverRunning {
            let result = events.suffix(3).map(Self.text).joined(separator: "。")
            UIAccessibility.post(notification: .announcement, argument: result)
        }
        #endif
    }
    func restart() {
        engine = RunEngine(random: SeededRandom(seed: UInt32.random(in: 1...UInt32.max)), meta: run.meta)
        run = engine.snapshot; messages = []
        canWriteAutosave = true
        persist()
    }
    func save() {
        do {
            try storage.write(engine.saveData(), to: storage.manualURL)
            hasSave = true
            messages.append("準備状態を保存しました。途中の探索は自動で中断保存されます。")
        } catch { messages.append("保存できませんでした。準備中に再試行してください。") }
    }
    private func persist() {
        do {
            if canWriteAutosave { try storage.write(engine.saveData(allowAnyPhase: true), to: storage.autosaveURL) }
            if canWriteMeta { try storage.saveMeta(run.meta) }
        } catch { messages = Array((messages + ["中断保存に失敗しました。空き容量などを確認してください。"]).suffix(30)) }
    }
    func resume() {
        do {
            var restored = try RunEngine<SeededRandom>(savedData: Data(contentsOf: storage.manualURL))
            restored.mergeMeta(run.meta)
            engine = restored; run = engine.snapshot
            messages = ["保存した地下\(run.floor)階の準備から再開しました。"]
            canWriteAutosave = true; persist()
        } catch { messages.append("保存データを読み込めませんでした。既存の保存は保持しています。") }
    }

    private static func text(_ event: RunEvent) -> String {
        switch event {
        case .reward(let exp, let gold): "EXP +\(exp) / Gold +\(gold)"
        case .levelUp(let level): "レベル\(level)へ！ HP・SP全回復"
        case .encountered(let name, let floor): "地下\(floor)階：\(name)が現れた！"
        case .potionPurchased: "回復薬を購入した（45 Gold）"
        case .healed(let amount): "回復薬でHPを\(amount)回復"
        case .adventure(let message): message
        case .specializationChosen(let choice): "\(choice.name)を取得：\(choice.detail)"
        case .potionDropped: "敵が回復薬を落とした。"
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
            case .statusApplied(let side, let kind): "\(side == .player ? "探索者" : "敵")に\(kind.name)を付与"
            case .statusDamage(let side, let amount): "\(side == .player ? "探索者" : "敵")が出血で\(amount)ダメージ"
            case .affinity(let attribute, let multiplier): "\(attribute.name)：\(multiplier > 1 ? "弱点を突いた" : "耐性で軽減")"
            case .finished(let phase): phase.label
            }
        }
    }
}

private enum CommandPage { case main, skills, items, shop, weapons, armors, equipment, equipWeapons, equipArmors, system }

public struct BattleView: View {
    @StateObject private var store: BattleStore
    @State private var commandPage: CommandPage = .main
    @State private var showingJournal = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var commandHeight: CGFloat = 48
    private let ink = Color(red: 0.13, green: 0.20, blue: 0.16)
    private var danger: Bool { store.run.phase == .combat && store.snapshot.enemyRank != .normal }
    private var paper: Color { danger ? Color(red: 1, green: 0.80, blue: 0.76) : Color(red: 0.88, green: 0.91, blue: 0.80) }

    public init(seed: UInt32 = UInt32.random(in: 1...UInt32.max), storage: DungeonStorage = .applicationSupport) {
        _store = StateObject(wrappedValue: BattleStore(seed: seed, storage: storage))
    }

    public var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text("深層演算域").font(.headline)
                Spacer()
                Text("B\(store.run.floor)  TURN \(store.snapshot.turn)").monospacedDigit()
            }
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView {
                    VStack(spacing: 10) {
                        if store.run.phase == .event { eventPanel } else { enemyPanel }
                        playerPanel
                    }
                }.frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    if store.run.phase == .event { eventPanel } else { enemyPanel }
                }.frame(maxHeight: .infinity)
                playerPanel
            }
            messagePanel
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView { commandPanel }.frame(height: 350).layoutPriority(1)
            } else { commandPanel }
        }
        .padding(12)
        .foregroundStyle(ink)
        .background {
            paper.ignoresSafeArea()
            if danger { RadialGradient(colors: [.red.opacity(0.32), .clear], center: .top, startRadius: 15, endRadius: 420).ignoresSafeArea().allowsHitTesting(false) }
        }
        .tint(ink)
        .sheet(isPresented: $showingJournal) { journalView }
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
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(store.snapshot.enemyName).font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("解析 \(store.snapshot.observation)/3").font(.caption)
            }
            Text("\(store.snapshot.enemyRank.label)  HP \(store.snapshot.enemyHP.label)").font(.callout)
            VStack(alignment: .leading, spacing: 2) {
                if let fraction = store.snapshot.enemyHPFraction {
                    ProgressView(value: fraction, total: 1).tint(danger ? .red : ink)
                        .accessibilityLabel("敵のHP残量")
                        .accessibilityValue("約\(Int(fraction * 100))パーセント")
                } else { Rectangle().fill(ink.opacity(0.12)).frame(height: 4) }
                Text(store.snapshot.enemyHPFraction == nil ? "残量不明 — 観察で解析" : "敵HP残量（概算または解析値）").font(.caption)
            }
            HStack(alignment: .center, spacing: 10) {
                sprite(store.snapshot.enemyID).resizable().interpolation(.none).scaledToFit()
                    .frame(width: 70, height: 70).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(store.snapshot.enemyRank == .normal ? "通常個体" : danger ? "\(store.snapshot.enemyRank.label)：危険。逃走も選べる。" : "\(store.snapshot.enemyRank.label)（戦闘終了）").font(.caption.weight(.semibold))
                    Text("弱点：\(store.snapshot.weakness?.name ?? "未解析") / 耐性：\(store.snapshot.resistance?.name ?? (store.snapshot.resistanceKnown ? "なし" : "未解析"))").font(.caption)
                    Text("ATK \(store.snapshot.enemyAttack.label) / DEF \(store.snapshot.enemyDefense.label)").font(.caption)
                    statusSummary(store.snapshot.enemyStatuses, title: "敵")
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            Text(store.snapshot.phase == .fighting ? "予兆：\(store.snapshot.intent.telegraph)" : "戦闘は終了した。")
                .font(.callout.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
        }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
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
            if !store.snapshot.playerStatuses.isEmpty { statusSummary(store.snapshot.playerStatuses, title: "探索者") }
            ProgressView(value: Double(store.run.player.hp),
                         total: Double(store.run.player.maxHP))
                .accessibilityLabel("探索者のHP")
            Text("EXP \(store.run.exp)/\(store.run.requiredEXP) / ATK \(store.run.player.attack) / DEF \(store.run.player.defense)").font(.caption)
            if let mutation = store.run.mutation { Text("\(mutation.name)：\(mutation.detail)").font(.caption.weight(.semibold)) }
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
        case .event: store.run.event?.kind.name ?? "イベント"
        case .preparation:
            !store.run.specializationChoices.isEmpty ? "専門強化を選ぶ" : commandPage == .items ? "道具" : commandPage == .shop ? "購入" : "準備"
        case .evaded: "逃走成功"
        case .gameover: "探索終了"
        case .combat: commandPage == .skills ? "スキル" : "コマンド"
        }
    }

    private var commandPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(commandTitle)
                    .font(dynamicTypeSize.isAccessibilitySize ? .caption2.bold() : .headline)
                Spacer()
                Text("SP \(store.run.player.sp)/\(store.run.player.maxSP)")
                    .font(dynamicTypeSize.isAccessibilitySize ? .caption2 : .body)
                    .monospacedDigit()
            }
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                if store.run.phase == .event {
                    eventCommands
                } else if store.run.phase == .preparation {
                    if !store.run.specializationChoices.isEmpty {
                        specializationCommands
                    } else if commandPage == .items {
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
                        GridRow { command("記録 ›") { showingJournal = true }; command("‹ 戻る") { commandPage = .main } }
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
                        command("記録 ›") { showingJournal = true }
                    }
                    GridRow { emptySlot; emptySlot }
                    GridRow { emptySlot; emptySlot }
                } else if store.run.phase == .gameover {
                    GridRow {
                        command("再挑戦") { store.restart(); commandPage = .main }
                        command("記録 ›") { showingJournal = true }
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
                        command("記録 ›") { showingJournal = true }
                    }
                } else {
                    GridRow { action(.powerStrike); action(.firstAid) }
                    GridRow {
                        action(.focus)
                        action(.arcaneBolt)
                    }
                    GridRow { action(.piercingShot); command("‹ 戻る") { commandPage = .main } }
                }
            }
        }
        .padding(12)
        .overlay(Rectangle().stroke(ink, lineWidth: 2))
    }

    private func statusSummary(_ statuses: [StatusKind: ActiveStatus], title: String) -> some View {
        let text = StatusKind.allCases.compactMap { kind in statuses[kind].map { "\(kind.name)\($0.turns)T" } }.joined(separator: " / ")
        return Text(text.isEmpty ? "\(title)：状態異常なし" : "\(title)：\(text)").font(.caption)
    }
    private var eventPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let event = store.run.event {
                Text(event.kind.name).font(.title2.bold())
                Text(event.kind.description)
                if event.kind == .altar { Text("HP代償：\(max(1, Formulas.rounded(Double(store.run.player.maxHP) * 0.15))) / Gold代償：\(max(30, store.run.floor * 8))G") }
                if let gear = event.equipment { Text("\(gear.name) \(gear.price)G\n\(gear.detail)") }
                if let result = event.result { Text(result).font(.headline) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12).overlay(Rectangle().stroke(ink, lineWidth: 2))
    }
    @ViewBuilder private var eventCommands: some View {
        if let event = store.run.event {
            if event.result != nil {
                GridRow { command("探索を続ける") { store.choose(.continueEvent); commandPage = .main }; command("記録 ›") { showingJournal = true } }
                GridRow { emptySlot; emptySlot }; GridRow { emptySlot; emptySlot }
            } else {
                let choices = event.kind.choices
                GridRow { eventChoice(choices[0]); eventChoice(choices[1]) }
                GridRow { if choices.count > 2 { eventChoice(choices[2]) } else { emptySlot }; emptySlot }
                GridRow { emptySlot; emptySlot }
            }
        }
    }
    private func eventChoice(_ choice: EventChoice) -> some View {
        command(choice.name, enabled: store.canChooseEvent(choice)) { store.choose(.chooseEvent(choice)) }
    }
    private var specializationCommands: some View {
        let choices = store.run.specializationChoices
        return Group {
            GridRow { specializationChoice(choices[0]); specializationChoice(choices[1]) }
            GridRow { specializationChoice(choices[2]); command("記録 ›") { showingJournal = true } }
            GridRow { emptySlot; emptySlot }
        }
    }
    private func specializationChoice(_ choice: Specialization) -> some View {
        command("\(choice.name)\n\(choice.detail)", compact: true) { store.choose(.chooseSpecialization(choice)) }
    }
    private var journalView: some View {
        NavigationStack {
            List {
                Section("現在の探索") {
                    Text("地下\(store.run.floor)階 / LV\(store.run.player.level) / \(store.run.turns)行動")
                    Text("武器：\(store.run.equipment.weapon?.name ?? "素手") / 防具：\(store.run.equipment.armor?.name ?? "なし")")
                    ForEach(Specialization.allCases, id: \.self) { choice in
                        if let level = store.run.specializations[choice] { Text("\(choice.name) Lv\(level)：\(choice.detail)") }
                    }
                    NavigationLink("戦闘ログを開く") {
                        List(Array(store.messages.enumerated()), id: \.offset) { _, message in Text(message) }
                            .navigationTitle("戦闘ログ")
                    }
                }
                Section("敵図鑑 — ランをまたいで保持") {
                    ForEach(EnemyDefinition.roster, id: \.id) { enemy in
                        let knowledge = store.run.meta.enemies[enemy.id]
                        VStack(alignment: .leading) {
                            Text(knowledge == nil ? "未発見" : enemy.name).font(.headline)
                            if let knowledge {
                                Text("遭遇\(knowledge.seen) / 撃破\(knowledge.killed)")
                                Text("弱点：\(knowledge.killed >= 1 ? enemy.weakness.name : "未解析") / 耐性：\(knowledge.killed >= 3 ? enemy.resistance?.name ?? "なし" : "未解析")")
                            }
                        }
                    }
                }
                Section("自己ベスト・終了した探索") {
                    Text("最高到達：地下\(store.run.meta.bestFloor)階 / 最大撃破：\(store.run.meta.bestKills)")
                    if store.run.meta.records.isEmpty { Text("探索終了後に記録されます") }
                    ForEach(store.run.meta.records) { record in
                        Text("B\(record.floor) / LV\(record.level) / \(record.kills)撃破 / \(record.turns)行動 / \(record.gold)G")
                    }
                }
            }
            .navigationTitle("探索記録")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("閉じる") { showingJournal = false } } }
        }
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
        }.accessibilityHint(action.hint)
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
                .font(compact || dynamicTypeSize.isAccessibilitySize ? .caption2.weight(.semibold) : .body.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 48)
                .frame(height: dynamicTypeSize.isAccessibilitySize ? nil : min(72, max(48, commandHeight)))
                .background(ink.opacity(enabled ? 0.08 : 0.02))
                .overlay(Rectangle().stroke(ink.opacity(enabled ? 0.8 : 0.2), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title.replacingOccurrences(of: "\n", with: "、"))
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }

    private var emptySlot: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: min(72, max(48, commandHeight)))
            .accessibilityHidden(true)
    }


}

private extension BattleAction {
    var hint: String {
        switch self {
        case .attack: "通常攻撃。SPを3回復します。"
        case .defend: "次の被ダメージを65%軽減。SPを5回復します。"
        case .observe: "敵の能力と弱点を解析。SPを2回復します。"
        case .powerStrike: "打撃属性の強打。敵を2ターン破防にします。"
        case .firstAid: "HPを回復します。"
        case .focus: "解析を2段階進めます。"
        case .arcaneBolt: "魔力属性で攻撃し、敵を2ターン弱体にします。"
        case .piercingShot: "貫通属性で攻撃し、敵を2ターン鈍足にします。"
        case .escape: "戦闘から逃げます。失敗すると敵が行動します。"
        }
    }
    var label: String {
        switch self {
        case .attack: "攻撃"
        case .defend: "防御"
        case .observe: "観察"
        case .powerStrike: "演算強打"
        case .firstAid: "応急手当"
        case .focus: "集中解析"
        case .escape: "逃走"
        case .arcaneBolt: "魔力弾"
        case .piercingShot: "貫通撃"
        }
    }
}

private extension EnemyIntent {
    var label: String {
        switch self {
        case .bleedingStrike: "裂傷撃"
        case .weakeningFeint: "弱体フェイント"
        case .breakingHeavy: "破防強打"
        case .slowingLunge: "鈍足突進"
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
        case .bleedingStrike: "牙が赤く光る。次の一撃で出血する可能性がある。"
        case .weakeningFeint: "不穏な粉を散らす。次の一撃で弱体化する可能性がある。"
        case .breakingHeavy: "装甲を狙って振りかぶる。破防に注意。"
        case .slowingLunge: "足元を狙って身構える。鈍足に注意。"
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
