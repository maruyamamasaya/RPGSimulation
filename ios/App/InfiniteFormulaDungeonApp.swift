import SwiftUI
import DungeonUI

@main
struct InfiniteFormulaDungeonApp: App {
    var body: some Scene {
        WindowGroup {
            if debugLargeText { BattleView(seed: launchSeed, storage: launchStorage).environment(\.dynamicTypeSize, .accessibility5) }
            else { BattleView(seed: launchSeed, storage: launchStorage) }
        }
    }
    private var debugLargeText: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--large-text")
        #else
        false
        #endif
    }
    private var launchStorage: DungeonStorage {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--test-profile"), args.indices.contains(index + 1) {
            let name = args[index + 1]
            if !name.isEmpty && name.count <= 64 && name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) {
                return DungeonStorage(directory: FileManager.default.temporaryDirectory.appendingPathComponent("test-profiles").appendingPathComponent(name))
            }
        }
        #endif
        return .applicationSupport
    }
    private var launchSeed: UInt32 {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--seed"), args.indices.contains(index + 1), let seed = UInt32(args[index + 1]) { return seed }
        #endif
        return UInt32.random(in: 1...UInt32.max)
    }
}
