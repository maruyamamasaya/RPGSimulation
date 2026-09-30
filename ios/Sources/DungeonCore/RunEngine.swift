import Foundation

public enum RunPhase: Codable, Sendable { case combat, preparation, evaded, gameover, event }
public enum RunAction: Sendable { case advance, train, continueAfterEscape, buyPotion, usePotion
    case buyGear(GearID), equipGear(GearID), unequipWeapon, unequipArmor
    case chooseEvent(EventChoice), continueEvent, chooseSpecialization(Specialization)
}
public enum RunEvent: Equatable, Sendable {
    case combat(BattleEvent)
    case reward(exp: Int, gold: Int)
    case levelUp(Int)
    case encountered(name: String, floor: Int)
    case potionPurchased
    case healed(Int)
    case gearPurchased(GearID)
    case gearEquipped(GearID?)
    case adventure(String)
    case specializationChosen(Specialization)
    case potionDropped
}

public struct RunSnapshot: Sendable {
    public let battle: BattleSnapshot
    public let player: Combatant
    public let phase: RunPhase
    public let floor: Int
    public let exp: Int
    public let requiredEXP: Int
    public let gold: Int
    public let potions: Int
    public let kills: Int
    public let rewardRate: Double
    public let equipment: EquipmentState
    public let threat: Int
    public let strongChance: Double
    public let event: FloorEventState?
    public let mutation: FloorMutation?
    public let specializations: [Specialization: Int]
    public let specializationChoices: [Specialization]
    public let meta: DungeonMeta
    public let turns: Int
}

public struct EnemyDefinition: Codable, Sendable {
    public let id: String
    public let name: String
    let factors: [Double] // HP, ATK, DEF, SPD, OBS
    let danger: Double
    let pattern: [EnemyIntent]

    public var weakness: DamageAttribute {
        switch id { case "rat": .slash; case "bat": .pierce; case "golem": .arcane; default: .blunt }
    }
    public var resistance: DamageAttribute? {
        switch id { case "slime", "golem": .slash; case "skeleton": .pierce; default: nil }
    }
    public static let roster = [
        Self(id: "slime", name: "蒼雫スライム", factors: [1.05, 0.82, 1.12, 0.72, 0.65],
             danger: 0.8, pattern: [.strike, .guardEnemy]),
        Self(id: "goblin", name: "灰耳ゴブリン", factors: [0.95, 1, 0.85, 1.05, 0.9],
             danger: 1, pattern: [.strike, .strike, .heavy]),
        Self(id: "skeleton", name: "巡回スケルトン", factors: [1, 1.04, 1, 1, 0.82],
             danger: 1, pattern: [.strike, .guardEnemy, .heavy]),
        Self(id: "rat", name: "迷宮ネズミ", factors: [0.72, 0.88, 0.62, 1.35, 0.8],
             danger: 0.75, pattern: [.strike, .feint, .rest]),
        Self(id: "bat", name: "反響コウモリ", factors: [0.68, 0.82, 0.55, 1.48, 1.2],
             danger: 0.85, pattern: [.feint, .strike, .rest]),
        Self(id: "golem", name: "刻印ゴーレム", factors: [1.55, 1.18, 1.55, 0.48, 0.9],
             danger: 1.5, pattern: [.guardEnemy, .heavy, .rest]),
    ]
}

/// Run decisions sit outside the single-battle resolver. No UI or persistence dependencies.
public struct RunEngine<Random: RandomSource>: Sendable {
    private var random: Random
    private var battle: BattleEngine<Random>
    private var player: Combatant
    private var definition: EnemyDefinition
    private var enemyLevel: Int
    private var floor = 1
    private var phase: RunPhase = .combat
    private var exp = 0
    private var gold = 0
    private var potions = 0
    private var kills = 0
    private var trainingCount = 0
    private var basePlayer: Combatant
    private var equipment = EquipmentState()
    private var threat = 0
    private var rank: EnemyRank = .normal
    private var failedEscapes = 0
    private let baseStrongChance: Double
    private var knowledge: [String: Int] = [:]
    private var meta: DungeonMeta
    private var runID = UUID().uuidString
    private var encounterNumber = 1
    private var totalTurns = 0
    private let eventChance: Double
    private var floorEvent: FloorEventState?
    private var mutation: FloorMutation?
    private var specializations: [Specialization: Int] = [:]
    private var specializationChoices: [Specialization] = []
    private var altarAttack = 0
    private var altarDefense = 0
    private var hpEquipmentReserve = 0

    public init(random: Random, player: Combatant = Combatant(), strongChance: Double = 0.03, eventChance: Double = 0.15, meta: DungeonMeta = DungeonMeta()) {
        self.meta = meta
        self.eventChance = min(1, max(0, eventChance))
        self.baseStrongChance = min(1, max(0, strongChance))
        self.basePlayer = player
        self.random = random
        self.player = player
        let encounter = Self.encounter(floor: 1, random: &self.random, strongChance: self.baseStrongChance)
        definition = encounter.definition
        rank = encounter.rank
        enemyLevel = encounter.enemy.level
        battle = BattleEngine(random: self.random, player: player, enemy: encounter.enemy,
            enemyName: Self.encounterName(definition: definition, floor: 1, enemyLevel: enemyLevel, rank: rank), intent: encounter.intent,
            enemyID: definition.id, pattern: Self.pattern(definition: definition, floor: floor), kills: max(knowledge[definition.id, default: 0], meta.enemies[definition.id]?.killed ?? 0), rank: rank,
            weakness: definition.weakness, resistance: definition.resistance)
        self.meta.encounter(definition.id, key: encounterKey)
        if player.hp == 0 { phase = .gameover }
    }

    public var snapshot: RunSnapshot {
        RunSnapshot(battle: battle.snapshot, player: player, phase: phase, floor: floor,
            exp: exp, requiredEXP: Self.requiredEXP(player.level), gold: gold,
            potions: potions, kills: kills, rewardRate: rewardRate, equipment: equipment, threat: threat, strongChance: strongChance, event: floorEvent, mutation: mutation,
            specializations: specializations, specializationChoices: specializationChoices, meta: meta, turns: totalTurns)
    }

    public mutating func perform(_ action: BattleAction) -> [RunEvent] {
        guard phase == .combat else { return [] }
        let result = battle.perform(action)
        guard result.rejection == nil else { return [] }
        totalTurns += 1
        random = battle.randomState
        player = battle.resolvedPlayer
        if result.events.contains(.escapeFailed) { failedEscapes += 1 }
        var events = result.events.map(RunEvent.combat)
        switch battle.snapshot.phase {
        case .won:
            phase = .preparation
            updateThreat()
            kills += 1
            knowledge[definition.id, default: 0] += 1
            meta.victory(definition.id, key: encounterKey)
            let levelFactor = min(2.5, max(0.15, 1 + Double(enemyLevel - player.level) * 0.12))
            let baseEXP = max(1, Formulas.rounded(Double(18 + enemyLevel * 8) * levelFactor * definition.danger))
            let earnedEXP = max(1, Formulas.rounded(Double(baseEXP) * rewardRate * rank.rewardMultiplier * (mutation == .training ? 1.2 : 1)))
            let goldFactor = min(2.25, max(0.2, 1 + Double(enemyLevel - player.level) * 0.1))
            let earnedGold = max(1, Formulas.rounded(Double(Formulas.rounded(12 + definition.danger * 10))
                * goldFactor * definition.danger * (0.9 + random.next() * 0.2) * rewardRate))
            let rankedGold = max(1, Formulas.rounded(Double(earnedGold) * rank.rewardMultiplier * (mutation == .bounty ? 1.25 : 1) * (1 + Double(specializations[.merchant, default: 0]) * 0.15)))
            exp += earnedEXP
            gold += rankedGold
            events.append(.reward(exp: earnedEXP, gold: rankedGold))
            while exp >= Self.requiredEXP(player.level) {
                exp -= Self.requiredEXP(player.level)
                grow()
                events.append(.levelUp(player.level))
            }
            prepareSpecializations()
            let dropChance = 0.1 + Double(specializations[.explorer, default: 0]) * 0.05 + (mutation == .fortune ? 0.1 : 0)
            if random.next() < dropChance { potions += 1; events.append(.potionDropped) }
        case .lost:
            phase = .gameover
            meta.finish(RunRecord(id: runID, floor: floor, level: player.level, kills: kills, gold: gold, turns: totalTurns))
        case .escaped: phase = .evaded
        case .fighting: break
        }
        return events
    }

    public mutating func perform(_ action: RunAction) -> [RunEvent] {
        switch action {
        case .advance:
            guard phase == .preparation, specializationChoices.isEmpty else { return [] }
            floor += 1
            trainingCount = 0
            updateMutation()
            if random.next() < eventChance {
                let kind = FloorEventKind.allCases[Int(random.next() * Double(FloorEventKind.allCases.count))]
                let cap = floor <= 10 ? 1 : floor <= 30 ? 2 : 3
                let pool = GearID.allCases.filter { $0.tier <= cap }
                let gear = kind == .merchant ? pool[Int(random.next() * Double(pool.count))] : nil
                floorEvent = FloorEventState(kind: kind, equipment: gear, result: nil)
                phase = .event
                return [.adventure("\(kind.name)を見つけた。")]
            }
            return spawn()
        case .train:
            guard phase == .preparation, specializationChoices.isEmpty else { return [] }
            threat = max(0, threat - 3)
            trainingCount += 1
            return spawn()
        case .continueAfterEscape:
            guard phase == .evaded else { return [] }
            return spawn()
        case .buyPotion:
            guard phase == .preparation, gold >= 45 else { return [] }
            gold -= 45
            potions += 1
            return [.potionPurchased]
        case .usePotion:
            guard phase == .preparation, potions > 0, player.hp < player.maxHP else { return [] }
            let amount = min(Formulas.rounded(35 * (mutation?.healing ?? 1)), player.maxHP - player.hp)
            player.hp += amount
            potions -= 1
            return [.healed(amount)]
        case .buyGear(let gear):
            guard phase == .preparation, !equipment.owned.contains(gear),
                  equipment.isUnlocked(gear, floor: floor), gold >= gear.price else { return [] }
            gold -= gear.price
            equipment.owned.insert(gear)
            return [.gearPurchased(gear)]
        case .equipGear(let gear):
            guard phase == .preparation, equipment.owned.contains(gear) else { return [] }
            if gear.isWeapon { equipment.weapon = gear } else { equipment.armor = gear }
            recalculateEquipment()
            return [.gearEquipped(gear)]
        case .chooseSpecialization(let choice):
            guard phase == .preparation, specializationChoices.contains(choice) else { return [] }
            specializations[choice, default: 0] += 1
            specializationChoices = []
            prepareSpecializations()
            return [.specializationChosen(choice)]
        case .chooseEvent(let choice):
            return resolveEvent(choice)
        case .continueEvent:
            guard phase == .event, floorEvent?.result != nil else { return [] }
            floorEvent = nil
            return spawn()
        case .unequipWeapon, .unequipArmor:
            guard phase == .preparation else { return [] }
            if case .unequipWeapon = action { equipment.weapon = nil } else { equipment.armor = nil }
            recalculateEquipment()
            return [.gearEquipped(nil)]
        }
    }

    private var encounterKey: String { "\(runID):\(encounterNumber)" }
    public mutating func mergeMeta(_ value: DungeonMeta) { meta = value.merged(with: meta) }

    private mutating func prepareSpecializations() {
        let available = [5, 10, 15].filter { $0 <= player.level }.count
        guard specializations.values.reduce(0, +) < available, specializationChoices.isEmpty else { return }
        var pool = Specialization.allCases
        for _ in 0..<3 { specializationChoices.append(pool.remove(at: Int(random.next() * Double(pool.count)))) }
    }
    private mutating func updateMutation() {
        guard floor >= 10, floor % 10 == 0 else { return }
        let pool = FloorMutation.allCases.filter { $0 != mutation }
        mutation = pool[Int(random.next() * Double(pool.count))]
    }
    public func canChooseEvent(_ choice: EventChoice) -> Bool {
        guard phase == .event, let event = floorEvent, event.result == nil, event.kind.choices.contains(choice) else { return false }
        switch choice {
        case .offerHP: return player.hp > max(1, Formulas.rounded(Double(player.maxHP) * 0.15)) && altarAttack < 10
        case .offerGold: return gold >= max(30, floor * 8) && altarDefense < 10
        case .buyPotion: return gold >= 45
        case .buyEquipment: return event.equipment.map { gold >= $0.price && !equipment.owned.contains($0) } ?? false
        default: return true
        }
    }
    private mutating func resolveEvent(_ choice: EventChoice) -> [RunEvent] {
        guard canChooseEvent(choice), let event = floorEvent else { return [] }
        var text = "立ち去った。"
        func healing(_ amount: Int) -> Int { min(player.maxHP - player.hp, Formulas.rounded(Double(amount) * (mutation?.healing ?? 1))) }
        switch choice {
        case .leave: break
        case .drink:
            let amount = healing(Formulas.rounded(Double(player.maxHP) * 0.25)); player.hp += amount
            text = "泉でHPを\(amount)回復。"
        case .offerHP:
            let cost = max(1, Formulas.rounded(Double(player.maxHP) * 0.15)); player.hp -= cost; altarAttack += 1
            recalculateEquipment(); text = "HP\(cost)を捧げた。ラン中のATK+5%。"
        case .offerGold:
            let cost = max(30, floor * 8); gold -= cost; altarDefense += 1
            recalculateEquipment(); text = "\(cost)Gを捧げた。ラン中のDEF+5%。"
        case .buyPotion:
            gold -= 45; potions += 1; text = "回復薬を購入（45G）。"
        case .buyEquipment:
            let gear = event.equipment!; gold -= gear.price; equipment.owned.insert(gear)
            text = "\(gear.name)を購入（\(gear.price)G）。準備時に装備できる。"
        case .safe:
            if random.next() < 0.55 { let amount = 4 + floor * 2; gold += amount; text = "安全な道で\(amount)Gを発見。" }
            else { text = "何事もなく安全な道を抜けた。" }
        case .open, .inspect, .proceed:
            let roll = random.next()
            let goldLimit = choice == .inspect ? 0.65 : choice == .open ? 0.5 : 0.38
            let gearLimit = choice == .inspect ? 0.92 : choice == .open ? 0.8 : 0.62
            if roll < goldLimit {
                let amount = choice == .inspect ? 8 + floor * 3 + integer(0, 8) : choice == .open ? 18 + floor * 6 + integer(0, 18) : 25 + floor * 8 + integer(0, 24)
                gold += amount; text = "\(amount)Gを発見。"
            } else if roll < gearLimit {
                let cap = floor <= 10 ? 1 : floor <= 30 ? 2 : 3
                let pool = GearID.allCases.filter { $0.tier <= cap && !equipment.owned.contains($0) }
                if pool.isEmpty { gold += 25; text = "装備の代わりに25Gを発見。" }
                else { let gear = pool[Int(random.next() * Double(pool.count))]; equipment.owned.insert(gear); text = "\(gear.name)を発見。準備時に装備できる。" }
            } else {
                let rate = choice == .inspect ? 0.05 : choice == .open ? 0.14 : 0.18
                let amount = min(player.hp - 1, max(1, Formulas.rounded(Double(player.maxHP) * rate)))
                player.hp -= amount; text = "罠でHP−\(amount)。生き延びた。"
            }
        }
        floorEvent?.result = text
        return [.adventure(text)]
    }

    // Derived from persisted encounter identity; naming never consumes combat RNG.
    private var encounterName: String {
        Self.encounterName(definition: definition, floor: floor, enemyLevel: enemyLevel, rank: rank)
    }

    private static func encounterName(definition: EnemyDefinition, floor: Int, enemyLevel: Int, rank: EnemyRank) -> String {
        guard rank == .aberrant else { return definition.name }
        let titles: [String]
        switch definition.id {
        case "slime": titles = ["零を溶かす", "底なしの雫", "数式を呑む"]
        case "goblin": titles = ["因果を盗む", "赤い解を嗤う", "定理破りの"]
        case "skeleton": titles = ["終わらぬ証明の", "死を数える", "忘却の巡礼者"]
        case "rat": titles = ["因果を喰う", "隙間を齧る", "無限を巣食う"]
        case "bat": titles = ["虚空を渡る", "反響なき", "暗闇の逆演算"]
        default: titles = ["崩れぬ公理の", "深層の門番", "世界を砕く"]
        }
        let index = (floor % titles.count + enemyLevel % titles.count) % titles.count
        return "〈\(titles[index])〉\(definition.name)"
    }

    private var strongChance: Double { min(1, max(baseStrongChance, min(0.1, baseStrongChance + Double(threat) * 0.000625 + (mutation == .eliteTerritory ? 0.03 : 0)))) }

    private mutating func updateThreat() {
        let hpRate = Double(player.hp) / Double(player.maxHP)
        var change = hpRate <= 0.2 ? 8 : 0
        if battle.snapshot.turn >= 12 { change += 7 }
        change += failedEscapes * 4
        if change == 0 && hpRate > 0.55 && battle.snapshot.turn <= 12 { change = -5 }
        threat = min(100, max(0, Formulas.rounded(Double(threat) * 0.8 + Double(change))))
    }

    private mutating func recalculateEquipment() {
        let oldHP = player.maxHP
        let weapon = equipment.weapon
        let armor = equipment.armor
        let hp = basePlayer.maxHP + (armor?.hpBonus ?? 0)
        let adjustedHP = player.hp - hpEquipmentReserve + hp - oldHP
        hpEquipmentReserve = min(42, max(0, 1 - adjustedHP))
        player = Combatant(hp: min(hp, max(1, adjustedHP)), sp: player.sp,
            maxHP: hp, maxSP: basePlayer.maxSP, attack: Formulas.rounded(Double(basePlayer.attack + (weapon?.attackBonus ?? 0)) * (1 + Double(altarAttack) * 0.05)),
            defense: Formulas.rounded(Double(basePlayer.defense + (armor?.defenseBonus ?? 0)) * (1 + Double(altarDefense) * 0.05)),
            speed: basePlayer.speed + (armor?.speedBonus ?? 0), observation: basePlayer.observation,
            level: basePlayer.level)
    }

    private var rewardRate: Double {
        trainingCount >= 8 ? 0.5 : trainingCount >= 5 ? 0.75 : trainingCount >= 3 ? 0.9 : 1
    }

    private mutating func spawn() -> [RunEvent] {
        encounterNumber += 1
        hpEquipmentReserve = 0
        let encounter = Self.encounter(floor: floor, random: &random, strongChance: strongChance)
        definition = encounter.definition
        rank = encounter.rank
        enemyLevel = encounter.enemy.level
        battle = BattleEngine(random: random, player: player, enemy: encounter.enemy,
            enemyName: encounterName, intent: encounter.intent, enemyID: definition.id,
            pattern: Self.pattern(definition: definition, floor: floor), kills: max(knowledge[definition.id, default: 0], meta.enemies[definition.id]?.killed ?? 0), rank: rank,
            attackAttribute: equipment.weapon == nil ? .blunt : .slash,
            weakness: definition.weakness, resistance: definition.resistance, specializations: specializations, mutation: mutation)
        failedEscapes = 0
        phase = .combat
        meta.encounter(definition.id, key: encounterKey)
        return [.encountered(name: encounterName, floor: floor)]
    }

    private static func requiredEXP(_ level: Int) -> Int {
        Formulas.rounded(30 + 18 * pow(Double(level), 1.35))
    }

    private mutating func grow() {
        let hp = basePlayer.maxHP + integer(8, 14)
        let attack = basePlayer.attack + integer(1, 3)
        let defense = basePlayer.defense + integer(1, 3)
        let speed = basePlayer.speed + integer(0, 2)
        let observation = basePlayer.observation + integer(0, 2)
        let sp = basePlayer.maxSP + integer(1, 3)
        basePlayer = Combatant(hp: hp, sp: sp, maxHP: hp, maxSP: sp,
            attack: attack, defense: defense, speed: speed, observation: observation, level: basePlayer.level + 1)
        recalculateEquipment()
        player.hp = player.maxHP
        hpEquipmentReserve = 0
        player.sp = player.maxSP
    }

    private mutating func integer(_ min: Int, _ max: Int) -> Int {
        min + Int(random.next() * Double(max - min + 1))
    }

    private static func pattern(definition: EnemyDefinition, floor: Int) -> [EnemyIntent] {
        guard floor >= 5 else { return definition.pattern }
        switch definition.id {
        case "rat": return [.bleedingStrike, .feint, .rest]
        case "bat": return [.weakeningFeint, .strike, .rest]
        case "golem": return [.guardEnemy, .breakingHeavy, .rest]
        case "skeleton": return [.strike, .slowingLunge, .guardEnemy]
        default: return definition.pattern
        }
    }

    private static func encounter(floor: Int, random: inout Random, strongChance: Double)
        -> (definition: EnemyDefinition, enemy: Combatant, intent: EnemyIntent, rank: EnemyRank) {
        let definition = EnemyDefinition.roster[Int(random.next() * Double(EnemyDefinition.roster.count))]
        let low = max(1, Int(Double(floor) * 0.9))
        let high = max(2, Int(ceil(Double(floor) * 1.1)))
        let rank: EnemyRank = random.next() < strongChance ? (random.next() < 0.2 ? .aberrant : .elite) : .normal
        let rolledLevel = low + Int(random.next() * Double(high - low + 1))
        let level = rank == .normal ? rolledLevel : max(low + 1, Formulas.rounded(Double(rolledLevel) * (rank == .elite ? 1.38 : 1.9)))
        let scale = 1 + Double(level - 1) * 0.115
        let bases = [82.0, 12, 10, 10, 10]
        let stats = zip(bases, definition.factors).map { base, factor in
            max(1, Formulas.rounded(base * factor * scale * (0.9 + random.next() * 0.2)))
        }
        let rankFactors = rank == .normal ? [1.0, 1, 1, 1, 1]
            : rank == .elite ? [1.32, 1.28, 1.25, 1.12, 1.18] : [1.85, 1.8, 1.65, 1.3, 1.55]
        let adjusted = zip(stats, rankFactors).map { max(1, Formulas.rounded(Double($0) * $1)) }
        let enemy = Combatant(hp: adjusted[0], sp: 0, maxHP: adjusted[0], maxSP: 0,
            attack: adjusted[1], defense: adjusted[2], speed: adjusted[3], observation: adjusted[4], level: level)
        // Goblin's extra strike preference is folded into its weighted pattern selection.
        let intents = Self.pattern(definition: definition, floor: floor)
        let weights = intents.map { definition.id == "goblin" && $0 == .strike ? 1.4 : 1.0 }
        var roll = random.next() * weights.reduce(0, +)
        var intent = intents.last!
        for (candidate, weight) in zip(intents, weights) {
            roll -= weight
            if roll < 0 { intent = candidate; break }
        }
        return (definition, enemy, intent, rank)
    }
}

public enum RunSaveError: Error { case notInPreparation, invalidData }

private struct RunCheckpoint: Codable {
    var version = 1
    let randomState: UInt32
    let basePlayer: Combatant
    let player: Combatant
    let equipment: EquipmentState
    let floor: Int
    let exp: Int
    let gold: Int
    let potions: Int
    let kills: Int
    let trainingCount: Int
    let threat: Int
    let knowledge: [String: Int]
    let enemyID: String
    let enemyLevel: Int
    let rank: EnemyRank
    let strongChance: Double
}

extension RunEngine where Random == SeededRandom {
    private func validateArchive() throws {
        let bounded = [floor, enemyLevel, gold, potions, kills, trainingCount, totalTurns, encounterNumber]
        guard bounded.allSatisfy({ (0...1_000_000).contains($0) }), floor > 0, enemyLevel > 0, encounterNumber > 0,
              !runID.isEmpty, baseStrongChance.isFinite, (0...1).contains(baseStrongChance), eventChance.isFinite, (0...1).contains(eventChance),
              (0...100).contains(threat), (0...10).contains(altarAttack), (0...10).contains(altarDefense), (0...42).contains(hpEquipmentReserve),
              specializations.values.allSatisfy({ (1...3).contains($0) }), specializations.values.reduce(0, +) <= 3,
              Set(specializationChoices).count == specializationChoices.count, specializationChoices.isEmpty || specializationChoices.count == 3,
              EnemyDefinition.roster.contains(where: { $0.id == definition.id }),
              knowledge.allSatisfy({ entry in EnemyDefinition.roster.contains(where: { $0.id == entry.key }) && (0...1_000_000).contains(entry.value) })
        else { throw RunSaveError.invalidData }
        try Self.validateCombatant(basePlayer); try Self.validateCombatant(player)
        try battle.validateArchive()
        guard exp >= 0, exp < Self.requiredEXP(player.level),
              equipment.weapon.map({ $0.isWeapon && equipment.owned.contains($0) }) ?? true,
              equipment.armor.map({ !$0.isWeapon && equipment.owned.contains($0) }) ?? true,
              phase == .event ? floorEvent != nil : floorEvent == nil,
              phase == .preparation ? battle.snapshot.phase == .won : true,
              phase == .combat ? battle.snapshot.phase == .fighting && battle.snapshot.player == player && battle.snapshot.enemyID == definition.id && battle.snapshot.enemyRank == rank : true,
              phase == .evaded ? battle.snapshot.phase == .escaped : true,
              phase == .gameover ? battle.snapshot.phase == .lost : true
        else { throw RunSaveError.invalidData }
        _ = try meta.validated()
        var copy = self; copy.recalculateEquipment()
        guard copy.player.attack == player.attack, copy.player.defense == player.defense,
              copy.player.maxHP == player.maxHP, copy.player.maxSP == player.maxSP,
              copy.player.level == player.level, copy.player.speed == player.speed,
              copy.player.observation == player.observation else { throw RunSaveError.invalidData }
    }
    static func validateCombatant(_ value: Combatant) throws {
        guard [value.maxHP, value.attack, value.defense, value.speed, value.observation, value.level].allSatisfy({ (1...1_000_000).contains($0) }),
              (0...1_000_000).contains(value.maxSP), (0...value.maxHP).contains(value.hp), (0...value.maxSP).contains(value.sp)
        else { throw RunSaveError.invalidData }
    }
    public func saveData(allowAnyPhase: Bool = false) throws -> Data {
        guard allowAnyPhase || phase == .preparation else { throw RunSaveError.notInPreparation }
        return try JSONEncoder().encode(RunArchive(version: 2, run: self))
    }
    public init(savedData: Data) throws {
        let version = try JSONDecoder().decode(ArchiveVersion.self, from: savedData).version
        if version == 2 {
            let archive = try JSONDecoder().decode(RunArchive.self, from: savedData)
            var restored = archive.run
            try restored.validateArchive()
            restored.definition = EnemyDefinition.roster.first { $0.id == restored.definition.id }!
            self = restored
            return
        }
        let c = try JSONDecoder().decode(RunCheckpoint.self, from: savedData)
        let ids = Set(EnemyDefinition.roster.map(\.id))
        let b = c.basePlayer
        let bounded = [b.maxHP, b.maxSP, b.attack, b.defense, b.speed, b.observation, b.level,
                       c.floor, c.gold, c.potions, c.kills, c.trainingCount, c.enemyLevel]
        guard c.version == 1, bounded.allSatisfy({ $0 >= 0 && $0 <= 1_000_000 }),
              b.maxHP > 0, b.level > 0, b.attack > 0, b.defense > 0, b.speed > 0, b.observation > 0,
              c.floor > 0, c.enemyLevel > 0, c.exp >= 0, c.exp < Self.requiredEXP(b.level),
              (0...100).contains(c.threat), c.strongChance.isFinite, (0...1).contains(c.strongChance),
              ids.contains(c.enemyID), c.knowledge.allSatisfy({ ids.contains($0.key) && (0...1_000_000).contains($0.value) }),
              c.equipment.weapon.map({ $0.isWeapon && c.equipment.owned.contains($0) }) ?? true,
              c.equipment.armor.map({ !$0.isWeapon && c.equipment.owned.contains($0) }) ?? true
        else { throw RunSaveError.invalidData }
        try Self.validateCombatant(b)
        try Self.validateCombatant(c.player)
        self.init(random: SeededRandom(restoringState: c.randomState), player: b, strongChance: c.strongChance)
        random = SeededRandom(restoringState: c.randomState)
        basePlayer = b
        equipment = c.equipment
        player = b
        recalculateEquipment()
        guard player.maxHP == c.player.maxHP, player.maxSP == c.player.maxSP,
              player.attack == c.player.attack, player.defense == c.player.defense,
              player.speed == c.player.speed, player.observation == c.player.observation,
              player.level == c.player.level, (1...player.maxHP).contains(c.player.hp),
              (0...player.maxSP).contains(c.player.sp) else { throw RunSaveError.invalidData }
        player = c.player
        floor = c.floor; exp = c.exp; gold = c.gold; potions = c.potions; kills = c.kills
        trainingCount = c.trainingCount; threat = c.threat; knowledge = c.knowledge
        meta = DungeonMeta()
        definition = EnemyDefinition.roster.first { $0.id == c.enemyID }!
        meta.encounter(definition.id, key: encounterKey)
        enemyLevel = c.enemyLevel; rank = c.rank; phase = .preparation
        battle = BattleEngine(random: random, player: player, enemy: Combatant(hp: 0, level: enemyLevel),
            enemyName: encounterName, enemyID: definition.id, pattern: definition.pattern, rank: rank)
    }
}


extension RunEngine: Codable where Random: Codable {}
private struct ArchiveVersion: Codable { let version: Int }
private struct RunArchive: Codable { let version: Int; let run: RunEngine<SeededRandom> }
