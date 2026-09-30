import XCTest
@testable import DungeonCore

private struct RunFixedRandom: RandomSource {
    var value: Double = 0
    mutating func next() -> Double { value }
}

final class RunEngineTests: XCTestCase {
    private func strongPlayer(hp: Int = 100) -> Combatant {
        Combatant(hp: hp, attack: 1000, defense: 1000)
    }

    func testVictoryPaysOnlyOnceAndAdvanceKeepsPlayer() {
        var run = RunEngine(random: RunFixedRandom(), player: strongPlayer(hp: 50), strongChance: 0, eventChance: 0)
        let events = run.perform(BattleAction.attack)
        XCTAssertTrue(events.contains { if case .reward = $0 { return true }; return false })
        XCTAssertEqual(run.snapshot.phase, .preparation)
        XCTAssertEqual(run.snapshot.kills, 1)
        let gold = run.snapshot.gold
        let exp = run.snapshot.exp
        XCTAssertTrue(run.perform(BattleAction.attack).isEmpty)
        XCTAssertEqual(run.snapshot.gold, gold)
        XCTAssertEqual(run.snapshot.exp, exp)
        _ = run.perform(RunAction.advance)
        XCTAssertEqual(run.snapshot.floor, 2)
        XCTAssertEqual(run.snapshot.phase, .combat)
        XCTAssertEqual(run.snapshot.player.hp, 50)
        XCTAssertTrue(run.perform(RunAction.advance).isEmpty)
        XCTAssertEqual(run.snapshot.floor, 2)
    }

    func testTrainingReducesRewardAndAdvanceResetsRate() {
        var run = RunEngine(random: RunFixedRandom(), player: strongPlayer(), strongChance: 0, eventChance: 0)
        _ = run.perform(BattleAction.attack)
        for _ in 0..<3 {
            _ = run.perform(RunAction.train)
            _ = run.perform(BattleAction.attack)
        }
        XCTAssertEqual(run.snapshot.floor, 1)
        XCTAssertEqual(run.snapshot.rewardRate, 0.9)
        _ = run.perform(RunAction.advance)
        XCTAssertEqual(run.snapshot.rewardRate, 1)
    }

    func testLevelUpCarriesEXPAndFullyRecovers() {
        var run = RunEngine(random: RunFixedRandom(), player: strongPlayer(hp: 50), strongChance: 0, eventChance: 0)
        var events: [RunEvent] = []
        for _ in 0..<3 {
            events += run.perform(BattleAction.attack)
            if run.snapshot.player.level == 1 { _ = run.perform(RunAction.train) }
        }
        XCTAssertTrue(events.contains(.levelUp(2)))
        XCTAssertEqual(run.snapshot.player.level, 2)
        XCTAssertGreaterThan(run.snapshot.exp, 0)
        XCTAssertEqual(run.snapshot.player.hp, run.snapshot.player.maxHP)
        XCTAssertEqual(run.snapshot.player.sp, run.snapshot.player.maxSP)
    }

    func testPotionPurchaseUseAndRejectionBoundaries() {
        var run = RunEngine(random: RunFixedRandom(), player: strongPlayer(), strongChance: 0, eventChance: 0)
        XCTAssertTrue(run.perform(RunAction.buyPotion).isEmpty)
        for index in 0..<4 {
            _ = run.perform(BattleAction.attack)
            if index < 3 { _ = run.perform(RunAction.train) }
        }
        let gold = run.snapshot.gold
        XCTAssertGreaterThanOrEqual(gold, 45)
        XCTAssertEqual(run.perform(RunAction.buyPotion), [.potionPurchased])
        XCTAssertEqual(run.snapshot.gold, gold - 45)
        XCTAssertEqual(run.snapshot.potions, 5)
        XCTAssertTrue(run.perform(RunAction.usePotion).isEmpty)
        XCTAssertEqual(run.snapshot.potions, 5)
        _ = run.perform(RunAction.train)
        _ = run.perform(BattleAction.observe)
        _ = run.perform(BattleAction.attack)
        XCTAssertLessThan(run.snapshot.player.hp, run.snapshot.player.maxHP)
        XCTAssertFalse(run.perform(RunAction.usePotion).isEmpty)
        XCTAssertEqual(run.snapshot.potions, 5)
        XCTAssertEqual(run.snapshot.player.hp, run.snapshot.player.maxHP)
        XCTAssertTrue(run.perform(RunAction.usePotion).isEmpty)
    }

    func testEscapeReturnsToSameFloorWithoutRewardOrExtraTurn() {
        var run = RunEngine(random: RunFixedRandom(), strongChance: 0, eventChance: 0)
        _ = run.perform(BattleAction.escape)
        XCTAssertEqual(run.snapshot.phase, .evaded)
        XCTAssertEqual(run.snapshot.gold, 0)
        XCTAssertEqual(run.snapshot.kills, 0)
        _ = run.perform(RunAction.continueAfterEscape)
        XCTAssertEqual(run.snapshot.floor, 1)
        XCTAssertEqual(run.snapshot.battle.turn, 1)
        XCTAssertEqual(run.snapshot.phase, .combat)
    }

    func testEnemyGuardProtectsNextHitAndThenClears() {
        var battle = BattleEngine(random: RunFixedRandom(value: 0.99), enemy: Combatant(),
                                  intent: .guardEnemy, pattern: [.rest])
        _ = battle.perform(.observe)
        XCTAssertTrue(battle.perform(.attack).events.contains(.playerHit(3)))
        XCTAssertTrue(battle.perform(.attack).events.contains(.playerHit(7)))
    }

    func testFixedRunSeedAndActionsReproduceRewardsAndEncounters() {
        var a = RunEngine(random: SeededRandom(seed: 99), player: strongPlayer(), strongChance: 0, eventChance: 0)
        var b = RunEngine(random: SeededRandom(seed: 99), player: strongPlayer(), strongChance: 0, eventChance: 0)
        for _ in 0..<5 {
            XCTAssertEqual(a.perform(BattleAction.attack), b.perform(BattleAction.attack))
            XCTAssertEqual(a.snapshot.gold, b.snapshot.gold)
            XCTAssertEqual(a.snapshot.player, b.snapshot.player)
            XCTAssertEqual(a.perform(RunAction.advance), b.perform(RunAction.advance))
            XCTAssertEqual(a.snapshot.battle, b.snapshot.battle)
        }
    }
}

extension RunEngineTests {
    func testStrongRanksAndEquipmentDoNotStackOrHealRepeatedly() {
        var run = RunEngine(random: RunFixedRandom(), player: strongPlayer(), strongChance: 1, eventChance: 0)
        XCTAssertEqual(run.snapshot.battle.enemyRank, .aberrant)
        _ = run.perform(BattleAction.attack)
        XCTAssertGreaterThanOrEqual(run.snapshot.gold, 100)
        XCTAssertFalse(run.perform(RunAction.buyGear(.leatherArmor)).isEmpty)
        XCTAssertFalse(run.perform(RunAction.buyGear(.rustySword)).isEmpty)
        XCTAssertTrue(run.perform(RunAction.buyGear(.rustySword)).isEmpty)
        _ = run.perform(RunAction.equipGear(.rustySword))
        let attack = run.snapshot.player.attack
        _ = run.perform(RunAction.equipGear(.rustySword))
        XCTAssertEqual(run.snapshot.player.attack, attack)
        _ = run.perform(RunAction.equipGear(.leatherArmor))
        let hp = run.snapshot.player.hp
        _ = run.perform(RunAction.unequipArmor)
        _ = run.perform(RunAction.equipGear(.leatherArmor))
        XCTAssertEqual(run.snapshot.player.hp, hp)
        XCTAssertTrue(run.perform(RunAction.buyGear(.ironSword)).isEmpty)
    }

    func testCheckpointRestoresNextEncounterAndRejectsInvalidData() throws {
        var run = RunEngine(random: SeededRandom(seed: 42), player: strongPlayer(), strongChance: 0, eventChance: 0)
        XCTAssertThrowsError(try run.saveData())
        _ = run.perform(BattleAction.attack)
        let data = try run.saveData()
        var restored = try RunEngine<SeededRandom>(savedData: data)
        XCTAssertEqual(restored.snapshot.phase, .preparation)
        XCTAssertEqual(restored.snapshot.player, run.snapshot.player)
        XCTAssertEqual(restored.snapshot.gold, run.snapshot.gold)
        _ = run.perform(RunAction.advance)
        _ = restored.perform(RunAction.advance)
        XCTAssertEqual(run.snapshot.battle, restored.snapshot.battle)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json["version"] = 99
        XCTAssertThrowsError(try RunEngine<SeededRandom>(savedData: JSONSerialization.data(withJSONObject: json)))
        json["version"] = 2
        var state = json["run"] as! [String: Any]
        state["floor"] = -1; json["run"] = state
        XCTAssertThrowsError(try RunEngine<SeededRandom>(savedData: JSONSerialization.data(withJSONObject: json)))
    }

    func testAllSixEnemiesAppearAndMeterKeepsUnknownInformationHidden() {
        var ids = Set<String>()
        for seed: UInt32 in 1...100 {
            let run = RunEngine(random: SeededRandom(seed: seed), strongChance: 0, eventChance: 0)
            ids.insert(run.snapshot.battle.enemyID)
            XCTAssertNil(run.snapshot.battle.enemyHPFraction)
        }
        XCTAssertEqual(ids, ["slime", "goblin", "skeleton", "rat", "bat", "golem"])
    }
}


extension RunEngineTests {
    func testAberrantEpithetSurvivesSavingAndDoesNotRenameDuringBattle() throws {
        var run = RunEngine(random: SeededRandom(seed: 27), player: strongPlayer())
        XCTAssertEqual(run.snapshot.battle.enemyRank, .aberrant)
        let name = run.snapshot.battle.enemyName
        XCTAssertTrue(name.hasPrefix("〈"))
        _ = run.perform(BattleAction.observe)
        XCTAssertEqual(run.snapshot.battle.enemyName, name)
        _ = run.perform(BattleAction.attack)
        let restored = try RunEngine<SeededRandom>(savedData: run.saveData())
        XCTAssertEqual(restored.snapshot.battle.enemyName, name)
        let normal = RunEngine(random: SeededRandom(seed: 27), strongChance: 0, eventChance: 0)
        XCTAssertFalse(normal.snapshot.battle.enemyName.hasPrefix("〈"))
    }
}
