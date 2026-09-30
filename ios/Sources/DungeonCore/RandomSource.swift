/// All randomness enters through this boundary; UI and clocks do not seed the engine.
public protocol RandomSource: Sendable {
    mutating func next() -> Double
}

/// Mulberry32, matching the legacy generator's unsigned 32-bit operations.
public struct SeededRandom: RandomSource, Equatable, Codable {
    public private(set) var state: UInt32

    public init(seed: UInt32) {
        state = seed == 0 ? 0x6d2b79f5 : seed
    }

    public init(restoringState state: UInt32) { self.state = state }

    public mutating func next() -> Double {
        state &+= 0x6d2b79f5
        var value = state
        value = (value ^ (value >> 15)) &* (value | 1)
        value ^= value &+ ((value ^ (value >> 7)) &* (value | 61))
        return Double(value ^ (value >> 14)) / 4_294_967_296
    }
}
