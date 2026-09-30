import XCTest
import DungeonCore
@testable import DungeonUI

final class PersistenceTests: XCTestCase {
    @MainActor func testEquipmentManualSaveAndReopenAutosave() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = DungeonStorage(directory: url)
        var run = RunEngine(random: SeededRandom(seed: 27), player: Combatant(attack: 10_000, defense: 10_000), eventChance: 0)
        _ = run.perform(BattleAction.attack)
        _ = run.perform(RunAction.buyGear(.rustySword)); _ = run.perform(RunAction.equipGear(.rustySword))
        try storage.write(run.saveData(), to: storage.manualURL)
        let store = BattleStore(storage: storage)
        XCTAssertEqual(store.run.equipment.weapon, .rustySword)
        XCTAssertEqual(store.run.player.attack, run.snapshot.player.attack)
        store.choose(.advance)
        store.send(.observe)
        let interrupted = store.snapshot
        let reopened = BattleStore(storage: storage)
        XCTAssertEqual(reopened.snapshot, interrupted)
        reopened.resume()
        XCTAssertEqual(reopened.run.phase, .preparation)
        XCTAssertEqual(reopened.run.equipment.weapon, .rustySword)
        XCTAssertEqual(reopened.run.gold, run.snapshot.gold)
    }
    @MainActor func testCorruptSavesAreReportedAndNotOverwritten() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = DungeonStorage(directory: url)
        let corrupt = Data("broken".utf8)
        try storage.write(corrupt, to: storage.autosaveURL)
        try storage.write(corrupt, to: storage.metaURL)
        let store = BattleStore(storage: storage)
        store.send(.observe)
        XCTAssertEqual(try Data(contentsOf: storage.autosaveURL), corrupt)
        XCTAssertEqual(try Data(contentsOf: storage.metaURL), corrupt)
        XCTAssertTrue(store.messages.contains { $0.contains("読み込めません") })
    }
    @MainActor func testPermanentRecordsSurviveReopenAndRetry() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = DungeonStorage(directory: url)
        let run = RunEngine(random: SeededRandom(seed: 42), player: Combatant(hp: 1), strongChance: 0)
        try storage.write(run.saveData(allowAnyPhase: true), to: storage.autosaveURL)
        let store = BattleStore(storage: storage)
        for _ in 0..<10 { store.send(.observe); if store.run.phase == .gameover { break } }
        XCTAssertEqual(store.run.phase, .gameover)
        let reopened = BattleStore(storage: storage)
        XCTAssertEqual(reopened.run.meta.records.count, 1)
        reopened.restart()
        let retried = BattleStore(storage: storage)
        XCTAssertEqual(retried.run.meta.records.count, 1)
        XCTAssertEqual(retried.run.meta.bestFloor, 1)
    }
}
