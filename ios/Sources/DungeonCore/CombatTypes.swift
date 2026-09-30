public struct Combatant: Codable, Equatable, Sendable {
    public internal(set) var hp: Int
    public internal(set) var sp: Int
    public let maxHP: Int
    public let maxSP: Int
    public let attack: Int
    public let defense: Int
    public let speed: Int
    public let observation: Int
    public let level: Int

    public init(hp: Int = 100, sp: Int = 30, maxHP: Int = 100, maxSP: Int = 30,
                attack: Int = 12, defense: Int = 10, speed: Int = 10,
                observation: Int = 10, level: Int = 1) {
        self.maxHP = max(1, maxHP)
        self.maxSP = max(0, maxSP)
        self.hp = min(self.maxHP, max(0, hp))
        self.sp = min(self.maxSP, max(0, sp))
        self.attack = max(1, attack)
        self.defense = max(1, defense)
        self.speed = max(1, speed)
        self.observation = max(1, observation)
        self.level = max(1, level)
    }
}

public enum BattleAction: String, CaseIterable, Sendable {
    case attack, defend, observe, powerStrike, firstAid, focus, escape

    public var cost: Int {
        switch self {
        case .powerStrike: 8
        case .firstAid: 12
        case .focus: 7
        default: 0
        }
    }
}

public enum EnemyIntent: String, CaseIterable, Sendable {
    case strike, heavy, rest, guardEnemy, feint, lunge

    public var multiplier: Double {
        switch self {
        case .strike: 1
        case .heavy: 1.75
        case .feint: 1.25
        case .lunge: 1.5
        case .rest, .guardEnemy: 0
        }
    }
}

public enum BattlePhase: Equatable, Sendable {
    case fighting, won, lost, escaped
}

public enum BattleEvent: Equatable, Sendable {
    case playerHit(Int)
    case enemyActed(EnemyIntent)
    case playerDamaged(raw: Int, applied: Int)
    case healed(Int)
    case observed(Int)
    case escapeFailed
    case finished(BattlePhase)
}

public enum ActionRejection: Equatable, Sendable {
    case battleEnded, insufficientSP(required: Int)
}

public struct ActionResult: Equatable, Sendable {
    public let events: [BattleEvent]
    public let rejection: ActionRejection?
}

/// Only disclosed information crosses the presentation boundary.
public enum DisclosedValue: Equatable, Sendable {
    case unknown
    case qualitative(AbilityEstimate)
    case range(Int, Int)
    case exact(Int)
}

public enum AbilityEstimate: Sendable {
    case low, similar, high
}

public struct BattleSnapshot: Equatable, Sendable {
    public let player: Combatant
    public let enemyRank: EnemyRank
    public let enemyID: String
    public let enemyName: String
    public let enemyHP: DisclosedValue
    public let enemyHPFraction: Double?
    public let enemyAttack: DisclosedValue
    public let enemyDefense: DisclosedValue
    public let intent: EnemyIntent
    public let observation: Int
    public let turn: Int
    public let phase: BattlePhase
    public let availableActions: [BattleAction]
}
