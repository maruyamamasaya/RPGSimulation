/// A single-encounter prototype. Run progression and persistence belong outside this engine.
public struct BattleEngine<Random: RandomSource>: Sendable {
    private var random: Random
    private var player: Combatant
    private var enemy: Combatant
    private var intent: EnemyIntent
    private var observation = 0
    private var turn = 1
    private var phase: BattlePhase = .fighting
    private var playerStatuses: [StatusKind: ActiveStatus] = [:]
    private var enemyStatuses: [StatusKind: ActiveStatus] = [:]
    private let attackAttribute: DamageAttribute
    private let weakness: DamageAttribute?
    private let resistance: DamageAttribute?
    private let specializations: [Specialization: Int]
    private let mutation: FloorMutation?
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
                kills: Int = 0, rank: EnemyRank = .normal, attackAttribute: DamageAttribute = .blunt,
                weakness: DamageAttribute? = nil, resistance: DamageAttribute? = nil,
                specializations: [Specialization: Int] = [:], mutation: FloorMutation? = nil) {
        self.attackAttribute = attackAttribute
        self.weakness = weakness; self.resistance = resistance
        self.specializations = specializations; self.mutation = mutation
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
        let hp: DisclosedValue = phase == .won ? .exact(0) : score >= 0.82 ? .exact(enemy.hp)
            : score >= 0.48 ? .range(Formulas.rounded(Double(enemy.hp) * 0.9),
                                    Formulas.rounded(Double(enemy.hp) * 1.1)) : .unknown
        return BattleSnapshot(player: player, playerStatuses: playerStatuses, enemyStatuses: enemyStatuses,
            weakness: observation >= 1 || kills >= 1 ? weakness : nil,
            resistance: observation >= 2 || kills >= 3 ? resistance : nil, resistanceKnown: observation >= 2 || kills >= 3, attackAttribute: attackAttribute, enemyRank: enemyRank, enemyID: enemyID, enemyName: enemyName, enemyHP: hp,
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
        tickBleeding(side: .player, events: &events)
        tickBleeding(side: .enemy, events: &events)
        if player.hp == 0 || enemy.hp == 0 {
            phase = player.hp == 0 ? .lost : .won
            clearStatuses(); events.append(.finished(phase))
            return ActionResult(events: events, rejection: nil)
        }
        player.sp -= action.cost
        switch action {
        case .attack, .powerStrike, .arcaneBolt, .piercingShot:
            let defense = enemyStatuses[.brokenArmor] != nil
                ? max(1, Formulas.rounded(Double(enemy.defense) * 0.85)) : enemy.defense
            let attribute: DamageAttribute = action == .arcaneBolt ? .arcane : action == .piercingShot ? .pierce : action == .powerStrike ? .blunt : attackAttribute
            let affinity = attribute == weakness ? 1.15 : attribute == resistance ? 0.85 : 1
            let build = 1 + Double(specializations[.offense, default: 0]) * 0.1 + (Double(player.hp) / Double(player.maxHP) <= 0.3 ? Double(specializations[.lastStand, default: 0]) * 0.2 : 0)
            let situation = (enemyGuarded ? 0.48 : 1) * (playerStatuses[.weakened] != nil ? 0.85 : 1) * affinity * build
            let dealt = Formulas.damage(attack: player.attack, defense: defense,
                multiplier: action == .powerStrike ? 1.65 : action == .arcaneBolt ? 1.2 : action == .piercingShot ? 1.1 : 1, situation: situation, roll: random.next())
            if affinity != 1 { events.append(.affinity(attribute, multiplier: affinity)) }
            enemy.hp = max(0, enemy.hp - dealt)
            enemyGuarded = false
            events.append(.playerHit(dealt))
            if action == .attack { player.sp = min(player.maxSP, player.sp + 3) }
            else if enemy.hp > 0 {
                if action == .powerStrike { apply(.brokenArmor, side: .enemy, events: &events) }
                if action == .arcaneBolt { apply(.weakened, side: .enemy, events: &events) }
                if action == .piercingShot { apply(.slowed, side: .enemy, events: &events) }
            }
        case .defend:
            player.sp = min(player.maxSP, player.sp + 5)
        case .observe, .focus:
            observation = min(3, observation + (action == .focus ? 2 : 1))
            if action == .observe { player.sp = min(player.maxSP, player.sp + 2) }
            events.append(.observed(observation))
        case .firstAid:
            let amount = Formulas.rounded((Double(player.maxHP) * 0.24 + Double(player.observation) * 0.4) * (mutation?.healing ?? 1))
            let before = player.hp
            player.hp = min(player.maxHP, player.hp + amount)
            events.append(.healed(player.hp - before))
        case .escape:
            if random.next() < Formulas.escape(player: player, enemy: enemy, observation: observation, rank: enemyRank, playerSlow: playerStatuses[.slowed] != nil, enemySlow: enemyStatuses[.slowed] != nil) {
                phase = .escaped
                clearStatuses()
                events.append(.finished(phase))
                return ActionResult(events: events, rejection: nil)
            }
            events.append(.escapeFailed)
        }
        if enemy.hp == 0 {
            phase = .won
            clearStatuses()
            events.append(.finished(phase))
            return ActionResult(events: events, rejection: nil)
        }
        // Execute the already exposed intent; never reroll before executing it.
        events.append(.enemyActed(intent))
        if intent == .guardEnemy { enemyGuarded = true }
        else if intent != .rest {
            let defense = playerStatuses[.brokenArmor] != nil ? max(1, Formulas.rounded(Double(player.defense) * 0.85)) : player.defense
            let situation = (enemyStatuses[.weakened] != nil ? 0.85 : 1) * (mutation == .rage ? 1.15 : 1) * max(0.7, 1 - Double(specializations[.defense, default: 0]) * 0.1)
            let raw = Formulas.damage(attack: enemy.attack, defense: defense,
                                      multiplier: intent.multiplier, situation: situation, roll: random.next())
            let applied = action == .defend ? max(1, Formulas.rounded(Double(raw) * 0.35)) : raw
            player.hp = max(0, player.hp - applied)
            events.append(.playerDamaged(raw: raw, applied: applied))
            let status: StatusKind? = intent == .bleedingStrike ? .bleeding : intent == .weakeningFeint ? .weakened : intent == .breakingHeavy ? .brokenArmor : intent == .slowingLunge ? .slowed : nil
            if player.hp > 0, let status, random.next() < 0.35 { apply(status, side: .player, events: &events) }
        }
        ageStatuses()
        if player.hp == 0 {
            phase = .lost
            clearStatuses()
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

    private mutating func apply(_ kind: StatusKind, side: CombatSide, events: inout [BattleEvent]) {
        if side == .player { playerStatuses[kind] = ActiveStatus(turns: max(kind.duration, playerStatuses[kind]?.turns ?? 0), fresh: true) }
        else { enemyStatuses[kind] = ActiveStatus(turns: max(kind.duration, enemyStatuses[kind]?.turns ?? 0), fresh: true) }
        events.append(.statusApplied(side: side, kind: kind))
    }
    private mutating func tickBleeding(side: CombatSide, events: inout [BattleEvent]) {
        if side == .player, playerStatuses[.bleeding] != nil {
            let amount = min(player.hp, max(1, Formulas.rounded(Double(player.maxHP) * 0.03)))
            player.hp -= amount; events.append(.statusDamage(side: side, amount: amount))
        } else if side == .enemy, enemyStatuses[.bleeding] != nil {
            let amount = min(enemy.hp, max(1, Formulas.rounded(Double(enemy.maxHP) * 0.03)))
            enemy.hp -= amount; events.append(.statusDamage(side: side, amount: amount))
        }
    }
    private mutating func ageStatuses() {
        func age(_ statuses: inout [StatusKind: ActiveStatus]) {
            for kind in Array(statuses.keys) {
                if statuses[kind]!.fresh { statuses[kind]!.fresh = false }
                else { statuses[kind]!.turns -= 1 }
                if statuses[kind]!.turns <= 0 { statuses[kind] = nil }
            }
        }
        age(&playerStatuses); age(&enemyStatuses)
    }
    private mutating func clearStatuses() { playerStatuses = [:]; enemyStatuses = [:] }

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

extension BattleEngine: Codable where Random: Codable {}

extension BattleEngine where Random == SeededRandom {
    func validateArchive() throws {
        try RunEngine<SeededRandom>.validateCombatant(player)
        try RunEngine<SeededRandom>.validateCombatant(enemy)
        guard (1...1_000_000).contains(turn), (0...3).contains(observation), (0...1_000_000).contains(kills),
              !pattern.isEmpty, pattern.count <= 20,
              playerStatuses.values.allSatisfy({ (1...3).contains($0.turns) }),
              enemyStatuses.values.allSatisfy({ (1...3).contains($0.turns) }),
              specializations.values.allSatisfy({ (1...3).contains($0) }), specializations.values.reduce(0, +) <= 3,
              phase == .fighting ? player.hp > 0 && enemy.hp > 0 : true,
              phase == .won ? player.hp > 0 && enemy.hp == 0 : true,
              phase == .lost ? player.hp == 0 : true
        else { throw RunSaveError.invalidData }
    }
}
