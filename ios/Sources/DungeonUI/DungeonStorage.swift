import Foundation
import DungeonCore

/// File locations are injectable so persistence can be verified without touching user saves.
public struct DungeonStorage: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }
    public static var applicationSupport: Self {
        Self(directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("InfiniteFormulaDungeon"))
    }
    public var manualURL: URL { directory.appendingPathComponent("run-v1.json") }
    public var autosaveURL: URL { directory.appendingPathComponent("resume-v2.json") }
    public var metaURL: URL { directory.appendingPathComponent("meta-v1.json") }
    public var hasManualSave: Bool { FileManager.default.fileExists(atPath: manualURL.path) }
    public var hasAutosave: Bool { FileManager.default.fileExists(atPath: autosaveURL.path) }
    public func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
    public func saveMeta(_ meta: DungeonMeta) throws { try write(JSONEncoder().encode(MetaArchive(version: 1, meta: meta)), to: metaURL) }
    public func loadMeta() throws -> DungeonMeta {
        guard FileManager.default.fileExists(atPath: metaURL.path) else { return DungeonMeta() }
        let archive = try JSONDecoder().decode(MetaArchive.self, from: Data(contentsOf: metaURL))
        guard archive.version == 1 else { throw RunSaveError.invalidData }
        return try archive.meta.validated()
    }
}
private struct MetaArchive: Codable { let version: Int; let meta: DungeonMeta }
