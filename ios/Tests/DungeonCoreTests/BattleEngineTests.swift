import XCTest
@testable import DungeonCore

private struct FixedRandom: RandomSource {
    var value: Double
    mutating func next() -> Double { value }
}

final class BattleEngineTests: XCTestCase {
    func testDamageMatchesLegacyExampleAndMinimum() {
        XCTAssertEqual(Formulas.damage(attack: 12, defense: 10, roll: 0.5), 7)
        XCTAssertEqual(Formulas.damage(attack: 1, defense: 10000, roll: 0), 1)
    }

    func testSeededRandomMatchesJavaScriptReference() {
        var random = SeededRandom(seed: 42)
        let expected = [0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
                        0.6697340414393693, 0.17481389874592423]
        for value in expected { XCTAssertEqual(random.next(), value, accuracy: 1e-15) }
    }

    func testInsufficientSPDoesNotConsumeStateOrRandomness() {
        var engine = BattleEngine(random: SeededRandom(seed: 42), player: Combatant(sp: 7), enemy: Combatant())
        var control = engine
        let before = engine.snapshot
        XCTAssertEqual(engine.perform(.powerStrike).rejection, .insufficientSP(required: 8))
        XCTAssertEqual(engine.snapshot, before)
        XCTAssertEqual(engine.perform(.attack), control.perform(.attack))
        XCTAssertEqual(engine.snapshot, control.snapshot)
    }

    func testGuardReducesDamageAndCapsSP() {
        var engine = BattleEngine(random: FixedRandom(value: 0.5), enemy: Combatant())
        let result = engine.perform(.defend)
        XCTAssertTrue(result.events.contains(.playerDamaged(raw: 7, applied: 2)))
        XCTAssertEqual(engine.snapshot.player.hp, 98)
        XCTAssertEqual(engine.snapshot.player.sp, 30)
    }

    func testLethalAttackPreventsRetaliationAndTerminalActionsAreRejected() {
        var engine = BattleEngine(random: FixedRandom(value: 0.5), enemy: Combatant(hp: 1))
        let result = engine.perform(.attack)
        XCTAssertEqual(engine.snapshot.phase, .won)
        XCTAssertEqual(engine.snapshot.player.hp, 100)
        XCTAssertFalse(result.events.contains(.enemyActed(.strike)))
        let before = engine.snapshot
        XCTAssertEqual(engine.perform(.attack).rejection, .battleEnded)
        XCTAssertEqual(engine.snapshot, before)
    }

    func testPreviouslyExposedIntentIsExecuted() {
        var engine = BattleEngine(random: FixedRandom(value: 0.9), enemy: Combatant(), intent: .heavy)
        let expected = engine.snapshot.intent
        XCTAssertTrue(engine.perform(.defend).events.contains(.enemyActed(expected)))
        XCTAssertEqual(engine.snapshot.intent, .rest)
    }

    func testObservationRevealsWithoutExposingExactValuesEarly() {
        var engine = BattleEngine(random: FixedRandom(value: 0.9), enemy: Combatant(), intent: .rest)
        XCTAssertEqual(engine.snapshot.enemyHP, .unknown)
        _ = engine.perform(.observe)
        XCTAssertEqual(engine.snapshot.enemyHP, .range(90, 110))
        _ = engine.perform(.focus)
        XCTAssertEqual(engine.snapshot.enemyHP, .exact(100))
        XCTAssertEqual(engine.snapshot.observation, 3)
    }

    func testEscapeSuccessHasNoRetaliationAndFailureDoes() {
        var success = BattleEngine(random: FixedRandom(value: 0), enemy: Combatant())
        XCTAssertEqual(success.perform(.escape).events, [.finished(.escaped)])
        XCTAssertEqual(success.snapshot.player.hp, 100)
        var failure = BattleEngine(random: FixedRandom(value: 0.99), enemy: Combatant())
        XCTAssertTrue(failure.perform(.escape).events.contains(.escapeFailed))
        XCTAssertLessThan(failure.snapshot.player.hp, 100)
    }

    func testHealingCapsHPAndConsumesSP() {
        var engine = BattleEngine(random: FixedRandom(value: 0.9), player: Combatant(hp: 95),
                                  enemy: Combatant(), intent: .rest)
        XCTAssertTrue(engine.perform(.firstAid).events.contains(.healed(5)))
        XCTAssertEqual(engine.snapshot.player.hp, 100)
        XCTAssertEqual(engine.snapshot.player.sp, 18)
    }

    func testDeathStopsBattle() {
        var engine = BattleEngine(random: FixedRandom(value: 0.5), player: Combatant(hp: 1), enemy: Combatant())
        _ = engine.perform(.observe)
        XCTAssertEqual(engine.snapshot.phase, .lost)
        XCTAssertEqual(engine.snapshot.player.hp, 0)
    }

    func testPowerStrikeArmorBreakLastsTwoSubsequentTurns() {
        var engine = BattleEngine(random: FixedRandom(value: 0.5), enemy: Combatant(defense: 30), intent: .rest)
        _ = engine.perform(.powerStrike)
        let boosted = Formulas.damage(attack: 12, defense: 26, roll: 0.5)
        XCTAssertTrue(engine.perform(.attack).events.contains(.playerHit(boosted)))
        XCTAssertTrue(engine.perform(.attack).events.contains(.playerHit(boosted)))
        let normal = Formulas.damage(attack: 12, defense: 30, roll: 0.5)
        XCTAssertTrue(engine.perform(.attack).events.contains(.playerHit(normal)))
    }

    func testFixedSeedAndInputSequenceAreReproducible() {
        var first = BattleEngine<SeededRandom>.prototype(seed: 123)
        var second = BattleEngine<SeededRandom>.prototype(seed: 123)
        for action in [BattleAction.observe, .defend, .powerStrike, .firstAid, .attack, .escape] {
            XCTAssertEqual(first.perform(action), second.perform(action))
            XCTAssertEqual(first.snapshot, second.snapshot)
        }
    }
}
