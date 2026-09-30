import Foundation

public enum DamageAttribute: String, CaseIterable, Codable, Sendable {
    case slash, blunt, arcane, pierce
    public var name: String {
        switch self { case .slash: "斬撃"; case .blunt: "打撃"; case .arcane: "魔力"; case .pierce: "貫通" }
    }
}
public enum StatusKind: String, CaseIterable, Codable, Sendable {
    case bleeding, weakened, brokenArmor, slowed
    public var name: String {
        switch self { case .bleeding: "出血"; case .weakened: "弱体"; case .brokenArmor: "破防"; case .slowed: "鈍足" }
    }
    var duration: Int { self == .bleeding ? 3 : 2 }
}
public struct ActiveStatus: Codable, Equatable, Sendable {
    public internal(set) var turns: Int
    var fresh: Bool
}
public enum CombatSide: String, Codable, Sendable { case player, enemy }
public enum Specialization: String, CaseIterable, Codable, Sendable {
    case offense, defense, lastStand, explorer, merchant
    public var name: String {
        switch self { case .offense: "猛攻"; case .defense: "堅守"; case .lastStand: "背水"; case .explorer: "探索"; case .merchant: "商才" }
    }
    public var detail: String {
        switch self { case .offense: "与ダメージ+10%"; case .defense: "被ダメージ−10%"; case .lastStand: "HP30%以下で攻撃+20%"; case .explorer: "回復薬ドロップ率+5%"; case .merchant: "戦闘Gold+15%" }
    }
}
public enum FloorMutation: String, CaseIterable, Codable, Sendable {
    case rage, bounty, fortune, drought, eliteTerritory, training
    public var name: String {
        switch self { case .rage: "狂暴化"; case .bounty: "豊穣"; case .fortune: "宝運"; case .drought: "枯渇"; case .eliteTerritory: "強敵領域"; case .training: "修練領域" }
    }
    public var detail: String {
        switch self { case .rage: "敵攻撃+15%"; case .bounty: "戦闘Gold+25%"; case .fortune: "回復薬ドロップ率+10%"; case .drought: "回復量−30%"; case .eliteTerritory: "強敵率+3%"; case .training: "戦闘EXP+20%" }
    }
    var healing: Double { self == .drought ? 0.7 : 1 }
}
public enum EventChoice: String, Codable, Sendable {
    case drink, leave, offerHP, offerGold, open, inspect, buyPotion, buyEquipment, proceed, safe
    public var name: String {
        switch self {
        case .drink: "水を飲む"; case .leave: "立ち去る"; case .offerHP: "HPを捧げる"; case .offerGold: "Goldを捧げる"
        case .open: "開ける"; case .inspect: "慎重に調べる"; case .buyPotion: "回復薬 45G"; case .buyEquipment: "装備を買う"
        case .proceed: "進む"; case .safe: "安全策"
        }
    }
}
public enum FloorEventKind: String, CaseIterable, Codable, Sendable {
    case fountain, altar, chest, merchant, dangerousPath
    public var name: String {
        switch self { case .fountain: "回復の泉"; case .altar: "古びた祭壇"; case .chest: "宝箱"; case .merchant: "旅商人"; case .dangerousPath: "危険な道" }
    }
    public var description: String {
        switch self {
        case .fountain: "澄んだ水が静かに湧いている。最大HPの25%を回復できる。"
        case .altar: "HP15%でATK+5%、GoldでDEF+5%。補正はこのラン中だけ。"
        case .chest: "罠の気配がある。慎重に調べれば危険を減らせる。"
        case .merchant: "回復薬か装備を、ここで一度だけ購入できる。"
        case .dangerousPath: "危険な近道と、安全な迂回路に分かれている。"
        }
    }
    public var choices: [EventChoice] {
        switch self {
        case .fountain: [.drink, .leave]; case .altar: [.offerHP, .offerGold, .leave]
        case .chest: [.open, .inspect, .leave]; case .merchant: [.buyPotion, .buyEquipment, .leave]
        case .dangerousPath: [.proceed, .safe]
        }
    }
}
public struct FloorEventState: Codable, Equatable, Sendable {
    public let kind: FloorEventKind
    public let equipment: GearID?
    public internal(set) var result: String?
}

public struct EnemyKnowledge: Codable, Equatable, Sendable {
    public internal(set) var seen = 0
    public internal(set) var killed = 0
    public init() {}
}
public struct RunRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let floor: Int
    public let level: Int
    public let kills: Int
    public let gold: Int
    public let turns: Int
}
public struct DungeonMeta: Codable, Equatable, Sendable {
    public internal(set) var enemies: [String: EnemyKnowledge] = [:]
    public internal(set) var records: [RunRecord] = []
    public internal(set) var bestFloor = 0
    public internal(set) var bestKills = 0
    // Stable encounter identities prevent checkpoint replay from duplicating discoveries.
    private var encounters: Set<String> = []
    private var victories: Set<String> = []
    private var completedRuns: Set<String> = []
    public init() {}
    mutating func encounter(_ id: String, key: String) {
        if encounters.insert(key).inserted { enemies[id, default: EnemyKnowledge()].seen += 1 }
    }
    mutating func victory(_ id: String, key: String) {
        if victories.insert(key).inserted { enemies[id, default: EnemyKnowledge()].killed += 1 }
    }
    mutating func finish(_ record: RunRecord) {
        bestFloor = max(bestFloor, record.floor); bestKills = max(bestKills, record.kills)
        if completedRuns.insert(record.id).inserted {
            records.insert(record, at: 0); records = Array(records.prefix(50))
        } else if let index = records.firstIndex(where: { $0.id == record.id }),
                  record.floor > records[index].floor || (record.floor == records[index].floor && record.kills > records[index].kills) {
            records[index] = record
        }
    }
    public func validated() throws -> Self {
        let ids = Set(EnemyDefinition.roster.map(\.id))
        guard bestFloor >= 0, bestKills >= 0, records.count <= 50,
              enemies.allSatisfy({ ids.contains($0.key) && (0...1_000_000).contains($0.value.seen) && (0...$0.value.seen).contains($0.value.killed) }),
              records.allSatisfy({ !$0.id.isEmpty && $0.floor > 0 && $0.level > 0 && $0.kills >= 0 && $0.gold >= 0 && $0.turns >= 0 })
        else { throw RunSaveError.invalidData }
        return self
    }
    public func merged(with other: Self) -> Self {
        var result = self
        result.encounters.formUnion(other.encounters); result.victories.formUnion(other.victories)
        result.completedRuns.formUnion(other.completedRuns)
        for (id, knowledge) in other.enemies {
            let existing = result.enemies[id, default: EnemyKnowledge()]
            result.enemies[id] = EnemyKnowledge(seen: max(existing.seen, knowledge.seen), killed: max(existing.killed, knowledge.killed))
        }
        let all = records + other.records
        var included = Set<String>()
        result.records = Array(all.filter { included.insert($0.id).inserted }.prefix(50))
        result.bestFloor = max(bestFloor, other.bestFloor); result.bestKills = max(bestKills, other.bestKills)
        return result
    }
}
private extension EnemyKnowledge {
    init(seen: Int, killed: Int) { self.seen = seen; self.killed = killed }
}
