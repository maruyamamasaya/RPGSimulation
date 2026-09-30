import XCTest
@testable import DungeonCore

private struct ConstantRandom: RandomSource { let value: Double; mutating func next() -> Double { value } }
final class AdventureTests: XCTestCase {
    private var champion: Combatant { Combatant(attack: 10_000, defense: 10_000) }
    private func finish(_ run: inout RunEngine<ConstantRandom>) {
        _ = run.perform(BattleAction.attack)
        while let choice = run.snapshot.specializationChoices.first { _ = run.perform(RunAction.chooseSpecialization(choice)) }
    }
    func testAttributesAndKnowledgeDisclosure() {
        let enemy = Combatant(hp: 1000, maxHP: 1000)
        var weak = BattleEngine(random: ConstantRandom(value: 0.5), enemy: enemy, intent: .rest, pattern: [.rest], weakness: .blunt)
        var resistant = BattleEngine(random: ConstantRandom(value: 0.5), enemy: enemy, intent: .rest, pattern: [.rest], resistance: .blunt)
        XCTAssertNil(weak.snapshot.weakness)
        let a = weak.perform(.attack), b = resistant.perform(.attack)
        XCTAssertTrue(a.events.contains(.affinity(.blunt, multiplier: 1.15)))
        XCTAssertTrue(b.events.contains(.affinity(.blunt, multiplier: 0.85)))
        _ = weak.perform(.observe)
        XCTAssertEqual(weak.snapshot.weakness, .blunt)
        let known = BattleEngine(random: ConstantRandom(value: 0), enemy: enemy, kills: 3, weakness: .blunt, resistance: .slash)
        XCTAssertEqual(known.snapshot.resistance, .slash)
    }
    func testBleedingTicksForThreeActionsAndEscapeClearsIt() {
        var battle = BattleEngine(random: ConstantRandom(value: 0), enemy: Combatant(hp: 1000, maxHP: 1000, attack: 1), intent: .bleedingStrike, pattern: [.rest])
        _ = battle.perform(.observe)
        XCTAssertEqual(battle.snapshot.playerStatuses[.bleeding]?.turns, 3)
        for _ in 0..<3 { XCTAssertTrue(battle.perform(.observe).events.contains(.statusDamage(side: .player, amount: 3))) }
        XCTAssertNil(battle.snapshot.playerStatuses[.bleeding])
        var escape = BattleEngine(random: ConstantRandom(value: 0), enemy: Combatant(hp: 1000, maxHP: 1000), intent: .bleedingStrike, pattern: [.rest])
        _ = escape.perform(.observe); _ = escape.perform(.escape)
        XCTAssertTrue(escape.snapshot.playerStatuses.isEmpty)
    }
    func testBleedingDeathPrecedesActionAndDoesNotSpendSP() {
        var battle = BattleEngine(random: ConstantRandom(value: 0), player: Combatant(hp: 4), enemy: Combatant(attack: 1), intent: .bleedingStrike, pattern: [.rest])
        _ = battle.perform(.observe)
        let sp = battle.snapshot.player.sp
        let result = battle.perform(.powerStrike)
        XCTAssertEqual(battle.snapshot.phase, .lost)
        XCTAssertEqual(battle.snapshot.player.sp, sp)
        XCTAssertFalse(result.events.contains { if case .playerHit = $0 { true } else { false } })
        XCTAssertTrue(battle.snapshot.playerStatuses.isEmpty)
    }
    func testWeakeningAndSlowSkillsHaveDurationAndCost() {
        var battle = BattleEngine(random: ConstantRandom(value: 0), enemy: Combatant(hp: 1000, maxHP: 1000), intent: .rest, pattern: [.rest])
        _ = battle.perform(.arcaneBolt)
        XCTAssertEqual(battle.snapshot.player.sp, 23)
        XCTAssertEqual(battle.snapshot.enemyStatuses[.weakened]?.turns, 2)
        _ = battle.perform(.piercingShot)
        XCTAssertEqual(battle.snapshot.enemyStatuses[.slowed]?.turns, 2)
        _ = battle.perform(.observe)
        XCTAssertNil(battle.snapshot.enemyStatuses[.weakened])
        _ = battle.perform(.observe)
        XCTAssertNil(battle.snapshot.enemyStatuses[.slowed])
    }
    func testEventsResolveOnceAndNeverAppearDuringTraining() {
        var run = RunEngine(random: ConstantRandom(value: 0), player: champion, strongChance: 0, eventChance: 1)
        finish(&run); _ = run.perform(RunAction.advance)
        XCTAssertEqual(run.snapshot.phase, .event)
        XCTAssertEqual(run.snapshot.event?.kind, .fountain)
        XCTAssertTrue(run.perform(RunAction.continueEvent).isEmpty)
        _ = run.perform(RunAction.chooseEvent(.drink))
        XCTAssertTrue(run.perform(RunAction.chooseEvent(.drink)).isEmpty)
        _ = run.perform(RunAction.continueEvent)
        XCTAssertEqual(run.snapshot.phase, .combat)
        XCTAssertTrue(run.perform(RunAction.continueEvent).isEmpty)
        finish(&run); _ = run.perform(RunAction.train)
        XCTAssertEqual(run.snapshot.phase, .combat)
    }
    func testChestAndDangerousPathDamageCannotKill() {
        var run = RunEngine(random: ConstantRandom(value: 0.99), player: Combatant(hp: 2, attack: 10_000, defense: 10_000, level: 10), strongChance: 0, eventChance: 1)
        finish(&run); _ = run.perform(RunAction.advance)
        XCTAssertEqual(run.snapshot.event?.kind, .dangerousPath)
        _ = run.perform(RunAction.chooseEvent(.proceed))
        XCTAssertEqual(run.snapshot.player.hp, 1)
        XCTAssertNotNil(run.snapshot.event?.result)
    }
    func testAltarAndMerchantRejectUnaffordableChoices() {
        var altar = RunEngine(random: ConstantRandom(value: 0.25), player: champion, strongChance: 0, eventChance: 1)
        finish(&altar); _ = altar.perform(RunAction.advance)
        XCTAssertEqual(altar.snapshot.event?.kind, .altar)
        XCTAssertFalse(altar.canChooseEvent(.offerGold))
        let attack = altar.snapshot.player.attack
        _ = altar.perform(RunAction.chooseEvent(.offerHP))
        XCTAssertEqual(altar.snapshot.player.attack, Formulas.rounded(Double(attack) * 1.05))
        var merchant = RunEngine(random: ConstantRandom(value: 0.65), player: champion, strongChance: 0, eventChance: 1)
        finish(&merchant); _ = merchant.perform(RunAction.advance)
        XCTAssertEqual(merchant.snapshot.event?.kind, .merchant)
        XCTAssertTrue(merchant.perform(RunAction.chooseEvent(.buyPotion)).isEmpty)
    }
    func testMutationChangesEveryTenFloorsAndSpecializationsLimitToThree() {
        var run = RunEngine(random: ConstantRandom(value: 0), player: champion, strongChance: 0, eventChance: 0)
        while run.snapshot.floor < 10 { finish(&run); _ = run.perform(RunAction.advance) }
        let first = run.snapshot.mutation
        XCTAssertNotNil(first)
        while run.snapshot.floor < 20 { finish(&run); _ = run.perform(RunAction.advance) }
        XCTAssertNotEqual(run.snapshot.mutation, first)
        for _ in 0..<160 {
            finish(&run)
            if run.snapshot.player.level >= 15 { break }
            _ = run.perform(RunAction.train)
        }
        XCTAssertEqual(run.snapshot.specializations.values.reduce(0, +), 3)
        XCTAssertTrue(run.perform(RunAction.chooseSpecialization(.offense)).isEmpty)
    }
    func testCombatInterruptionRestoresAllActionsAndRNG() throws {
        var original = RunEngine(random: SeededRandom(seed: 88), strongChance: 0, eventChance: 0)
        _ = original.perform(BattleAction.arcaneBolt)
        var restored = try RunEngine<SeededRandom>(savedData: original.saveData(allowAnyPhase: true))
        XCTAssertEqual(original.snapshot.battle, restored.snapshot.battle)
        for action: BattleAction in [.observe, .powerStrike, .firstAid, .escape] {
            XCTAssertEqual(original.perform(action), restored.perform(action))
            XCTAssertEqual(original.snapshot.battle, restored.snapshot.battle)
        }
    }
    func testEventAndSpecializationInterruptionKeepsPendingChoices() throws {
        var run = RunEngine(random: SeededRandom(seed: 9), player: champion, strongChance: 0, eventChance: 1)
        _ = run.perform(BattleAction.attack); _ = run.perform(RunAction.advance)
        var restored = try RunEngine<SeededRandom>(savedData: run.saveData(allowAnyPhase: true))
        XCTAssertEqual(run.snapshot.event, restored.snapshot.event)
        let choice = try XCTUnwrap(run.snapshot.event?.kind.choices.last)
        XCTAssertEqual(run.perform(RunAction.chooseEvent(choice)), restored.perform(RunAction.chooseEvent(choice)))
        XCTAssertEqual(run.perform(RunAction.continueEvent), restored.perform(RunAction.continueEvent))
        for _ in 0..<25 {
            _ = run.perform(BattleAction.attack)
            if !run.snapshot.specializationChoices.isEmpty { break }
            _ = run.perform(RunAction.train)
        }
        let copy = try RunEngine<SeededRandom>(savedData: run.saveData(allowAnyPhase: true))
        XCTAssertEqual(run.snapshot.specializationChoices.count, 3)
        XCTAssertEqual(copy.snapshot.specializationChoices, run.snapshot.specializationChoices)
    }
    func testMetaRecordsArePermanentAndReplayDoesNotDuplicateThem() throws {
        let player = Combatant(hp: 1)
        var run = RunEngine(random: SeededRandom(seed: 42), player: player, strongChance: 0)
        let initial = try run.saveData(allowAnyPhase: true)
        for _ in 0..<10 { _ = run.perform(BattleAction.observe); if run.snapshot.phase == .gameover { break } }
        XCTAssertEqual(run.snapshot.phase, .gameover)
        XCTAssertEqual(run.snapshot.meta.records.count, 1)
        var replay = try RunEngine<SeededRandom>(savedData: initial)
        replay.mergeMeta(run.snapshot.meta)
        for _ in 0..<10 { _ = replay.perform(BattleAction.observe); if replay.snapshot.phase == .gameover { break } }
        XCTAssertEqual(replay.snapshot.meta.records.count, 1)
        let fresh = RunEngine(random: SeededRandom(seed: 7), meta: replay.snapshot.meta)
        XCTAssertEqual(fresh.snapshot.meta.bestFloor, 1)
        XCTAssertEqual(fresh.snapshot.meta.records.count, 1)
    }
    func testArmorSwapAtLowHPDoesNotCreateHealing() {
        var run = RunEngine(random: ConstantRandom(value: 0), player: Combatant(hp: 1, attack: 10_000, defense: 10_000), strongChance: 1, eventChance: 0)
        finish(&run)
        _ = run.perform(RunAction.buyGear(.leatherArmor)); _ = run.perform(RunAction.equipGear(.leatherArmor))
        let hp = run.snapshot.player.hp
        for _ in 0..<5 { _ = run.perform(RunAction.unequipArmor); _ = run.perform(RunAction.equipGear(.leatherArmor)) }
        XCTAssertEqual(run.snapshot.player.hp, hp)
    }
}

extension AdventureTests {
    func testMalformedCombatArchiveThrowsBeforeSnapshotMath() throws {
        let run = RunEngine(random: SeededRandom(seed: 88))
        let data = try run.saveData(allowAnyPhase: true)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var state = json["run"] as! [String: Any]
        var battle = state["battle"] as! [String: Any]
        var enemy = battle["enemy"] as! [String: Any]
        enemy["observation"] = Int.max; enemy["maxHP"] = 0
        battle["enemy"] = enemy; state["battle"] = battle; json["run"] = state
        XCTAssertThrowsError(try RunEngine<SeededRandom>(savedData: JSONSerialization.data(withJSONObject: json)))
    }
    func testLegacyPreparationSaveMigratesToFullArchive() throws {
        var run = RunEngine(random: SeededRandom(seed: 42), player: champion, strongChance: 0, eventChance: 0)
        _ = run.perform(BattleAction.attack)
        let archive = try JSONSerialization.jsonObject(with: run.saveData()) as! [String: Any]
        let state = archive["run"] as! [String: Any]
        var legacy: [String: Any] = ["version": 1, "randomState": (state["random"] as! [String: Any])["state"]!, "enemyID": (state["definition"] as! [String: Any])["id"]!, "strongChance": 0]
        for key in ["basePlayer", "player", "equipment", "floor", "exp", "gold", "potions", "kills", "trainingCount", "threat", "knowledge", "enemyLevel", "rank"] { legacy[key] = state[key] }
        let migrated = try RunEngine<SeededRandom>(savedData: JSONSerialization.data(withJSONObject: legacy))
        XCTAssertEqual(migrated.snapshot.phase, .preparation)
        XCTAssertEqual(migrated.snapshot.player, run.snapshot.player)
        let reopened = try RunEngine<SeededRandom>(savedData: migrated.saveData())
        XCTAssertEqual(reopened.snapshot.gold, migrated.snapshot.gold)
    }
}

extension AdventureTests {
    func testSpecializationsAndMutationsActuallyModifyCombat() {
        let enemy = Combatant(hp: 1000, maxHP: 1000, attack: 40)
        var plain = BattleEngine(random: ConstantRandom(value: 0.5), player: Combatant(attack: 30), enemy: enemy, pattern: [.strike])
        var build = BattleEngine(random: ConstantRandom(value: 0.5), player: Combatant(attack: 30), enemy: enemy, pattern: [.strike], specializations: [.offense: 1, .defense: 1])
        func hit(_ result: ActionResult) -> Int { result.events.compactMap { if case .playerHit(let value) = $0 { value } else { nil } }.first! }
        func incoming(_ result: ActionResult) -> Int { result.events.compactMap { if case .playerDamaged(_, let value) = $0 { value } else { nil } }.first! }
        let normal = plain.perform(.attack), modified = build.perform(.attack)
        XCTAssertGreaterThan(hit(modified), hit(normal)); XCTAssertLessThan(incoming(modified), incoming(normal))
        var rage = BattleEngine(random: ConstantRandom(value: 0.5), player: Combatant(attack: 30), enemy: enemy, mutation: .rage)
        XCTAssertGreaterThan(incoming(rage.perform(.attack)), incoming(normal))
        var drought = BattleEngine(random: ConstantRandom(value: 0.5), player: Combatant(hp: 40), enemy: enemy, intent: .rest, pattern: [.rest], mutation: .drought)
        XCTAssertTrue(drought.perform(.firstAid).events.contains(.healed(20)))
    }
    func testPersistentKnowledgeAvoidsDuplicatedVictoryAfterCheckpointReplay() throws {
        var run = RunEngine(random: SeededRandom(seed: 88), player: champion, strongChance: 0, eventChance: 0)
        let id = run.snapshot.battle.enemyID
        let before = try run.saveData(allowAnyPhase: true)
        _ = run.perform(BattleAction.attack)
        var replay = try RunEngine<SeededRandom>(savedData: before)
        replay.mergeMeta(run.snapshot.meta)
        _ = replay.perform(BattleAction.attack)
        XCTAssertEqual(replay.snapshot.meta.enemies[id]?.killed, 1)
    }
}
