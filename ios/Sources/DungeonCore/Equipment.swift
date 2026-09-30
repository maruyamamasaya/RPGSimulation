public enum GearID: String, CaseIterable, Codable, Sendable {
    case rustySword, ironSword, steelSword, leatherArmor, ironArmor, steelArmor

    public var name: String {
        switch self {
        case .rustySword: "錆びた剣"
        case .ironSword: "鉄の剣"
        case .steelSword: "鋼の剣"
        case .leatherArmor: "革の鎧"
        case .ironArmor: "鉄の鎧"
        case .steelArmor: "鋼の鎧"
        }
    }
    public var isWeapon: Bool { [.rustySword, .ironSword, .steelSword].contains(self) }
    public var tier: Int {
        switch self {
        case .rustySword, .leatherArmor: 1
        case .ironSword, .ironArmor: 2
        case .steelSword, .steelArmor: 3
        }
    }
    public var price: Int {
        switch self {
        case .rustySword: 80
        case .ironSword: 220
        case .steelSword: 520
        case .leatherArmor: 100
        case .ironArmor: 280
        case .steelArmor: 560
        }
    }
    public var attackBonus: Int { isWeapon ? [4, 9, 16][tier - 1] : 0 }
    public var defenseBonus: Int { isWeapon ? 0 : [5, 12, 19][tier - 1] }
    public var hpBonus: Int { isWeapon ? 0 : [10, 25, 42][tier - 1] }
    public var speedBonus: Int { isWeapon ? 0 : [0, -3, -5][tier - 1] }
    public var detail: String {
        isWeapon ? "ATK +\(attackBonus)" : "DEF +\(defenseBonus) / HP +\(hpBonus) / SPD \(speedBonus)"
    }
}

public struct EquipmentState: Codable, Equatable, Sendable {
    public internal(set) var owned: Set<GearID> = []
    public internal(set) var weapon: GearID?
    public internal(set) var armor: GearID?
    public init() {}
    public func isEquipped(_ gear: GearID) -> Bool { weapon == gear || armor == gear }
    public func isUnlocked(_ gear: GearID, floor: Int) -> Bool {
        let cap = floor <= 10 ? 1 : floor <= 30 ? 2 : 3
        let purchasedTier = owned.filter { $0.isWeapon == gear.isWeapon }.map(\.tier).max() ?? 0
        return gear.tier <= cap && gear.tier <= purchasedTier + 1
    }
}

public enum EnemyRank: String, Codable, Sendable {
    case normal, elite, aberrant
    public var rewardMultiplier: Double {
        switch self { case .normal: 1; case .elite: 10; case .aberrant: 18 }
    }
    public var label: String {
        switch self { case .normal: "通常"; case .elite: "強敵"; case .aberrant: "異常個体" }
    }
    public var escapeBonus: Double {
        switch self { case .normal: 0; case .elite: 0.1; case .aberrant: 0.18 }
    }
}
