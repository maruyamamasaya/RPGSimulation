import SwiftUI
import DungeonUI

@main
struct InfiniteFormulaDungeonApp: App {
    var body: some Scene {
        WindowGroup { BattleView(seed: launchSeed) }
    }
    private var launchSeed: UInt32 {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "--seed"), args.indices.contains(index + 1), let seed = UInt32(args[index + 1]) { return seed }
        #endif
        return UInt32.random(in: 1...UInt32.max)
    }
}
