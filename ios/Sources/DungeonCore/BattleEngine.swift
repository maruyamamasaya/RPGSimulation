/// A single-encounter prototype. Run progression and persistence belong outside this engine.
public struct BattleEngine<Random: RandomSource>: Sendable {
    private var random: Random
    private var player: Combatant
    private var enemy: Combatant
    private var intent: EnemyIntent
    private var observation = 0
    private var turn = 1
    private var phase: BattlePhase = .fighting
    private var armorBreakTurns = 0
    private let enemyName: String
    private let enemyRank: EnemyRank
    private let enemyID: String
    private let pattern: [EnemyIntent]
    private let kills: Int
    private var enemyGuarded = false

    var randomState: Random { random }
    var resolvedPlayer: Combatant { player }

    public init(random: Random, player: Combatant = Combatant(),
                enemy: Combatant, enemyName: String = "訓練個体", intent: EnemyIntent = .strike,
                enemyID: String = "slime", pattern: [EnemyIntent] = [.strike, .strike, .heavy, .rest],
                kills: Int = 0, rank: EnemyRank = .normal) {
        self.random = random
        self.player = player
        self.enemy = enemy
        self.enemyName = enemyName
        self.enemyID = enemyID
        self.enemyRank = rank
        self.pattern = pattern.isEmpty ? [.strike] : pattern
        self.kills = kills
        self.intent = intent
        if player.hp == 0 { phase = .lost }
        else if enemy.hp == 0 { phase = .won }
    }

    public var snapshot: BattleSnapshot {
        let score = Formulas.disclosure(player: player, enemy: enemy, observation: observation, kills: kills)
        let hp: DisclosedValue = score >= 0.82 ? .exact(enemy.hp)
            : score >= 0.48 ? .range(Formulas.rounded(Double(enemy.hp) * 0.9),
                                    Formulas.rounded(Double(enemy.hp) * 1.1)) : .unknown
        return BattleSnapshot(player: player, enemyRank: enemyRank, enemyID: enemyID, enemyName: enemyName, enemyHP: hp,
            enemyHPFraction: phase == .won ? 0 : score >= 0.82 ? Double(enemy.hp) / Double(enemy.maxHP) : score >= 0.48 ? Double(Formulas.rounded(Double(enemy.hp) / Double(enemy.maxHP) * 10)) / 10 : nil,
            enemyAttack: disclosed(enemy.attack, relativeTo: player.attack, score: score),
            enemyDefense: disclosed(enemy.defense, relativeTo: player.defense, score: score),
            intent: intent, observation: observation, turn: turn, phase: phase,
            availableActions: phase == .fighting ? BattleAction.allCases.filter { $0.cost <= player.sp } : [])
    }

    public mutating func perform(_ action: BattleAction) -> ActionResult {
        guard phase == .fighting else {
            return ActionResult(events: [], rejection: .battleEnded)
        }
        guard player.sp >= action.cost else {
            return ActionResult(events: [], rejection: .insufficientSP(required: action.cost))
        }
        var events: [BattleEvent] = []
        player.sp -= action.cost
        switch action {
        case .attack, .powerStrike:
            let defense = armorBreakTurns > 0
                ? max(1, Formulas.rounded(Double(enemy.defense) * 0.85)) : enemy.defense
            let dealt = Formulas.damage(attack: player.attack, defense: defense,
                multiplier: action == .powerStrike ? 1.65 : 1, situation: enemyGuarded ? 0.48 : 1, roll: random.next())
            enemy.hp = max(0, enemy.hp - dealt)
            enemyGuarded = false
            events.append(.playerHit(dealt))
            if action == .attack { player.sp = min(player.maxSP, player.sp + 3) }
            else if enemy.hp > 0 { armorBreakTurns = 3 }
        case .defend:
            player.sp = min(player.maxSP, player.sp + 5)
        case .observe, .focus:
            observation = min(3, observation + (action == .focus ? 2 : 1))
            if action == .observe { player.sp = min(player.maxSP, player.sp + 2) }
            events.append(.observed(observation))
        case .firstAid:
            let amount = Formulas.rounded(Double(player.maxHP) * 0.24 + Double(player.observation) * 0.4)
            let before = player.hp
            player.hp = min(player.maxHP, player.hp + amount)
            events.append(.healed(player.hp - before))
        case .escape:
            if random.next() < Formulas.escape(player: player, enemy: enemy, observation: observation, rank: enemyRank) {
                phase = .escaped
                events.append(.finished(phase))
                return ActionResult(events: events, rejection: nil)
            }
            events.append(.escapeFailed)
        }
        if enemy.hp == 0 {
            phase = .won
            events.append(.finished(phase))
            return ActionResult(events: events, rejection: nil)
        }
        // Execute the already exposed intent; never reroll before executing it.
        events.append(.enemyActed(intent))
        if intent == .guardEnemy { enemyGuarded = true }
        else if intent != .rest {
            let raw = Formulas.damage(attack: enemy.attack, defense: player.defense,
                                      multiplier: intent.multiplier, roll: random.next())
            let applied = action == .defend ? max(1, Formulas.rounded(Double(raw) * 0.35)) : raw
            player.hp = max(0, player.hp - applied)
            events.append(.playerDamaged(raw: raw, applied: applied))
        }
        armorBreakTurns = max(0, armorBreakTurns - 1)
        if player.hp == 0 {
            phase = .lost
            events.append(.finished(phase))
        } else {
            turn += 1
            let weights = pattern.map { enemyID == "goblin" && $0 == .strike ? 1.4 : 1.0 }
            var roll = random.next() * weights.reduce(0, +)
            intent = pattern.last!
            for (candidate, weight) in zip(pattern, weights) {
                roll -= weight
                if roll < 0 { intent = candidate; break }
            }
        }
        return ActionResult(events: events, rejection: nil)
    }

    private func disclosed(_ value: Int, relativeTo own: Int, score: Double) -> DisclosedValue {
        if score >= 0.82 { return .exact(value) }
        if score >= 0.5 {
            return .range(Formulas.rounded(Double(value) * 0.9), Formulas.rounded(Double(value) * 1.1))
        }
        if score >= 0.28 {
            return .qualitative(Double(value) > Double(own) * 1.25 ? .high
                : Double(value) > Double(own) * 0.92 ? .similar : .low)
        }
        return .unknown
    }
}

extension BattleEngine where Random == SeededRandom {
    public static func prototype(seed: UInt32) -> Self {
        var random = SeededRandom(seed: seed)
        // Neutral training encounter; not a port of any production enemy archetype.
        let hp = Formulas.rounded(82 * (0.9 + random.next() * 0.2))
        let attack = Formulas.rounded(12 * (0.9 + random.next() * 0.2))
        let defense = Formulas.rounded(10 * (0.9 + random.next() * 0.2))
        return Self(random: random, enemy: Combatant(hp: hp, sp: 0, maxHP: hp, maxSP: 0,
                                                     attack: attack, defense: defense))
    }
}
