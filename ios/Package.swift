// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "InfiniteFormulaDungeon",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "DungeonCore", targets: ["DungeonCore"]),
        .library(name: "DungeonUI", targets: ["DungeonUI"]),
    ],
    targets: [
        .target(name: "DungeonCore"),
        .target(name: "DungeonUI", dependencies: ["DungeonCore"], resources: [.process("Resources")]),
        .testTarget(name: "DungeonCoreTests", dependencies: ["DungeonCore"]),
        .testTarget(name: "DungeonUITests", dependencies: ["DungeonUI", "DungeonCore"]),
    ]
)
