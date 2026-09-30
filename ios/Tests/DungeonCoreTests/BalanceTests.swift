import XCTest
import DungeonCore

/// A fixed policy is a regression sample, not a claim about human win rates.
final class BalanceTests: XCTestCase {
    func testEarlyGameSampleWithTelegraphAwarePolicy() {
        var firstWins = 0, reachedFive = 0, sumKills = 0
        for seed: UInt32 in 1...100 {
            var run = RunEngine(random: SeededRandom(seed: seed))
            for _ in 0..<600 {
                let s = run.snapshot
                if s.phase == .gameover { break }
                if s.floor >= 5 { reachedFive += 1; break }
                switch s.phase {
                case .combat:
                    let b = s.battle
                    let action: BattleAction
                    if b.enemyRank != .normal { action = .escape }
                    else if s.player.hp <= s.player.maxHP / 2 && s.player.sp >= 12 { action = .firstAid }
                    else if b.intent == .heavy || b.intent == .breakingHeavy { action = .defend }
                    else if s.player.sp >= 8 { action = .powerStrike }
                    else { action = .attack }
                    _ = run.perform(action)
                case .preparation:
                    if let choice = s.specializationChoices.first { _ = run.perform(RunAction.chooseSpecialization(choice)) }
                    else if s.player.hp < s.player.maxHP * 3 / 4 && s.potions > 0 { _ = run.perform(RunAction.usePotion) }
                    else if !s.equipment.owned.contains(.rustySword) && s.gold >= 80 { _ = run.perform(RunAction.buyGear(.rustySword)) }
                    else if s.equipment.owned.contains(.rustySword) && s.equipment.weapon == nil { _ = run.perform(RunAction.equipGear(.rustySword)) }
                    else if !s.equipment.owned.contains(.leatherArmor) && s.gold >= 100 { _ = run.perform(RunAction.buyGear(.leatherArmor)) }
                    else if s.equipment.owned.contains(.leatherArmor) && s.equipment.armor == nil { _ = run.perform(RunAction.equipGear(.leatherArmor)) }
                    else { _ = run.perform(RunAction.advance) }
                case .evaded: _ = run.perform(RunAction.continueAfterEscape)
                case .event:
                    if let event = s.event, event.result == nil {
                        _ = run.perform(RunAction.chooseEvent(event.kind == .dangerousPath ? .safe : event.kind == .fountain ? .drink : .leave))
                    } else { _ = run.perform(RunAction.continueEvent) }
                case .gameover: break
                }
            }
            if run.snapshot.kills > 0 { firstWins += 1 }
            sumKills += run.snapshot.kills
        }
        print("BALANCE_SAMPLE seeds=100 firstWins=\(firstWins) reachedB5=\(reachedFive) kills=\(sumKills)")
        XCTAssertGreaterThanOrEqual(firstWins, 80)
        XCTAssertGreaterThanOrEqual(reachedFive, 60)
    }
}
