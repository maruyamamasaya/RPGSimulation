import Foundation

public enum Formulas {
    /// Legacy Math.round behavior for the nonnegative values used by these rules.
    public static func rounded(_ value: Double) -> Int {
        Int(floor(value + 0.5))
    }

    public static func damage(attack: Int, defense: Int, multiplier: Double = 1,
                              situation: Double = 1, roll: Double) -> Int {
        let attack = Double(max(1, attack))
        let base = attack * attack / (attack + Double(max(1, defense)))
        return max(1, rounded(base * multiplier * situation * (0.9 + roll * 0.2)))
    }

    public static func disclosure(player: Combatant, enemy: Combatant,
                                   observation: Int, kills: Int = 0) -> Double {
        min(1, max(0, 0.38 + Double(player.observation - enemy.observation) / 70
            + Double(player.level - enemy.level) / 18
            + log2(Double(max(0, kills)) + 1) * 0.09 + Double(observation) * 0.23))
    }

    public static func escape(player: Combatant, enemy: Combatant, observation: Int, rank: EnemyRank = .normal) -> Double {
        min(0.95, max(0.2, 0.5 + Double(player.speed - enemy.speed) / 100
            + Double(observation) * 0.08 + rank.escapeBonus))
    }
}
