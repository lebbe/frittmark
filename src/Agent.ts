import { CFG } from './config'
import { IDEAS, hasPrereqs } from './ideas'
import { clamp, grantIdea, lerp, pick, rand, randf, stepToward } from './utils'

type Phase = 'toddler' | 'child' | 'youth' | 'adult'
type ResourceType = 'sugar' | 'wood' | 'metal'
type IdeaId = keyof typeof IDEAS

type AgentValues = {
  survival: number
  building: number
  metal: number
  social: number
}

type AgentMorals = {
  altruism: number
  patience: number
  curiosity: number
  respectProperty: number
  integrity: number
}

type AgentInventory = {
  sugar: number
  wood: number
  metal: number
  cooked: number
  axe: number
  spade: number
  pick: number
}

type MemoryEntry = {
  x: number
  y: number
  sugar: number
  wood: number
  metal: number
}

type HomeCell = {
  x: number
  y: number
}

type PlanStep =
  | { kind: 'MOVE_TO'; label: string; x: number; y: number }
  | { kind: 'EXEC_IDEA'; label: string; ideaId: IdeaId }
  | {
      kind: 'GATHER_UNTIL'
      label: string
      ideaId: IdeaId
      resource: ResourceType
      targetTotal: number
      includeHomeInventory: boolean
    }
  | { kind: 'DEPOSIT_HOME'; label: string }

type AgentPlan = {
  name: 'NAVIGATE_IDEA' | 'SHELTER_STOCKPILE'
  steps: PlanStep[]
}

type CellLike = {
  sugar: number
  sugarCap: number
  wood: number
  woodCap: number
  metal: number
  metalCap: number
  building: {
    type: 'shelter' | 'house'
    ownerId: number
    residents: number[]
    progress: number
    progressMax: number
    complete: boolean
    capacity: number
    inv?: { sugar: number; wood: number; metal: number; cooked: number }
  } | null
}

interface WorldLike {
  inBounds(x: number, y: number): boolean
  cell(x: number, y: number): CellLike
  agentsNear(x: number, y: number, range: number): Agent[]
  move(agent: Agent, x: number, y: number): void
  findResource(
    x: number,
    y: number,
    type: ResourceType,
    vision: number,
    memory: Map<string, MemoryEntry>,
  ): { x: number; y: number } | null
}

const IDEA_KEYS = Object.keys(IDEAS) as IdeaId[]
const TIER0 = IDEA_KEYS.filter((key) => IDEAS[key].tier === 0)
const TIER1 = IDEA_KEYS.filter((key) => IDEAS[key].tier === 1)
const TIER2 = IDEA_KEYS.filter((key) => IDEAS[key].tier === 2)

export class Agent {
  id: number
  x: number
  y: number
  age: number
  alive: boolean
  idleTicks: number
  reproCooldown: number
  homeCell: HomeCell | null
  phase: Phase
  vision: number
  metabolism: number
  needs: { hunger: number }
  values: AgentValues
  morals: AgentMorals
  inventory: AgentInventory
  memory: Map<string, MemoryEntry>
  plan: AgentPlan | null
  currentAction: string
  ideas: Set<IdeaId>
  becameAdultThisTick: boolean
  parentIds: number[]
  travelTicksUntilMove: number

  constructor(
    id: number,
    x: number,
    y: number,
    p1: Agent | null = null,
    p2: Agent | null = null,
  ) {
    this.id = id
    this.x = x
    this.y = y
    this.age = 0
    this.alive = true
    this.idleTicks = 0
    this.reproCooldown = 0
    this.homeCell = null
    this.phase = p1 || p2 ? 'toddler' : 'adult'
    this.parentIds = [p1?.id, p2?.id].filter(
      (id): id is number => id !== undefined,
    )
    this.travelTicksUntilMove = 0

    this.vision = p1
      ? clamp(
          Math.round(
            lerp(p1.vision, p2 ? p2.vision : p1.vision, 0.5) +
              (Math.random() < 0.25 ? (Math.random() < 0.5 ? 1 : -1) : 0),
          ),
          CFG.VISION_MIN,
          CFG.VISION_MAX,
        )
      : rand(CFG.VISION_MIN, CFG.VISION_MAX)
    this.metabolism = p1
      ? clamp(
          Math.round(
            lerp(p1.metabolism, p2 ? p2.metabolism : p1.metabolism, 0.5) +
              (Math.random() < 0.25 ? (Math.random() < 0.5 ? 1 : -1) : 0),
          ),
          CFG.METABOLISM_MIN,
          CFG.METABOLISM_MAX,
        )
      : rand(CFG.METABOLISM_MIN, CFG.METABOLISM_MAX)

    this.needs = { hunger: randf(0, 0.2) }
    this.values = this._initValues(p1, p2)
    this.morals = this._initMorals(p1, p2)

    if (this.phase === 'toddler') {
      this.inventory = {
        sugar: 0,
        wood: 0,
        metal: 0,
        cooked: 0,
        axe: 0,
        spade: 0,
        pick: 0,
      }
    } else {
      this.inventory = {
        sugar: rand(2, 6),
        wood: 0,
        metal: 0,
        cooked: 0,
        axe: 0,
        spade: 0,
        pick: 0,
      }
    }

    this.memory = new Map<string, MemoryEntry>()
    this.plan = null
    this.currentAction = 'idle'
    this.becameAdultThisTick = false

    this.ideas = new Set<IdeaId>(TIER0)
    for (const parent of [p1, p2]) {
      if (!parent) continue
      for (const id of parent.ideas) {
        if (Math.random() < 0.65 && hasPrereqs(this, id)) grantIdea(this, id)
      }
    }

    for (const parent of [p1, p2]) {
      if (!parent) continue
      for (const [key, entry] of parent.memory) {
        if (Math.random() < 0.5) this.memory.set(key, { ...entry })
      }
    }
  }

  _initValues(p1: Agent | null, p2: Agent | null): AgentValues {
    const R: Record<keyof AgentValues, [number, number]> = {
      survival: [0.5, 1.0],
      building: [0.1, 0.8],
      metal: [0.1, 0.7],
      social: [0.1, 0.7],
    }
    const out = {} as AgentValues
    for (const k of Object.keys(R) as (keyof AgentValues)[]) {
      out[k] = p1
        ? clamp(
            lerp(p1.values[k], p2 ? p2.values[k] : p1.values[k], 0.5) +
              randf(-0.12, 0.12),
            0,
            1,
          )
        : randf(R[k][0], R[k][1])
    }
    return out
  }

  _initMorals(p1: Agent | null, p2: Agent | null): AgentMorals {
    const R: Record<keyof AgentMorals, [number, number]> = {
      altruism: [0, 1],
      patience: [0, 1],
      curiosity: [0, 1],
      respectProperty: [0.4, 1],
      integrity: [0.4, 1],
    }
    const out = {} as AgentMorals
    for (const k of Object.keys(R) as (keyof AgentMorals)[]) {
      out[k] = p1
        ? clamp(
            lerp(p1.morals[k], p2 ? p2.morals[k] : p1.morals[k], 0.5) +
              randf(-0.12, 0.12),
            0,
            1,
          )
        : randf(R[k][0], R[k][1])
    }
    return out
  }

  getTravelTicksPerStep(world: WorldLike): number {
    return this._hasDependentToddler(world) ? 2 : 1
  }

  _hasDependentToddler(world: WorldLike): boolean {
    if (this.phase !== 'adult') return false
    const allAgents = world.agentsNear(this.x, this.y, CFG.GRID_W + CFG.GRID_H)
    return allAgents.some(
      (a) =>
        a.alive &&
        a.phase === 'toddler' &&
        a.parentIds.length > 0 &&
        a.parentIds.includes(this.id),
    )
  }

  _resolveParents(world: WorldLike): Agent[] {
    if (this.parentIds.length === 0) return []
    const allAgents = world.agentsNear(this.x, this.y, CFG.GRID_W + CFG.GRID_H)
    return allAgents.filter((a) => a.alive && this.parentIds.includes(a.id))
  }

  _enforceToddlerNoInventory(): void {
    if (this.phase !== 'toddler') return
    this.inventory.sugar = 0
    this.inventory.wood = 0
    this.inventory.metal = 0
    this.inventory.cooked = 0
    this.inventory.axe = 0
    this.inventory.spade = 0
    this.inventory.pick = 0
  }

  _feedToddlerFromParents(world: WorldLike): boolean {
    if (this.phase !== 'toddler') return false
    const parents = this._resolveParents(world)

    for (const p of parents) {
      if (p.inventory.cooked > 0) {
        p.inventory.cooked--
        this.needs.hunger = clamp(
          this.needs.hunger - CFG.COOKED_EAT_RESTORE,
          0,
          1,
        )
        return true
      }
    }

    for (const p of parents) {
      if (p.inventory.sugar > 0) {
        p.inventory.sugar--
        this.needs.hunger = clamp(
          this.needs.hunger - CFG.SUGAR_EAT_RESTORE,
          0,
          1,
        )
        return true
      }
    }

    return false
  }

  tick(world: WorldLike): void {
    this.age++
    this.reproCooldown = Math.max(0, this.reproCooldown - 1)
    this.becameAdultThisTick = false
    this._updatePhase()
    this._syncHousing(world)
    this.needs.hunger = clamp(
      this.needs.hunger + CFG.HUNGER_PER_TICK * (this.metabolism / 2.5),
      0,
      1,
    )
    this._spoilCarriedFood(world)

    if (this.phase === 'toddler') {
      this._enforceToddlerNoInventory()
      if (this.needs.hunger > 0.5) {
        this._feedToddlerFromParents(world)
      }
      this._enforceToddlerNoInventory()
    } else {
      this._shelterEconomy(world)
      this._updateMemory(world)
      this._decideAndAct(world)
      this._advanceBuilding(world)
      this._doAltruism(world)
      this._shareMemorySocially(world)
    }

    if (this.needs.hunger >= CFG.HUNGER_DEATH || this.age >= CFG.MAX_AGE)
      this.alive = false
  }

  _updatePhase(): void {
    if (this.phase === 'toddler' && this.age >= CFG.AGE_TODDLER)
      this.phase = 'child'
    if (this.phase === 'child' && this.age >= CFG.AGE_CHILD)
      this.phase = 'youth'
    if (this.phase === 'youth' && this.age >= CFG.AGE_YOUTH) {
      this.phase = 'adult'
      this.becameAdultThisTick = true
    }
  }

  _spoilCarriedFood(world: WorldLike): void {
    const hasCompletedHome = !!(
      this.homeCell &&
      (() => {
        const c = world.cell(this.homeCell!.x, this.homeCell!.y)
        return c.building && c.building.complete
      })()
    )
    const spoilMult = hasCompletedHome ? CFG.SHELTER_CARRIED_SPOIL_MULT : 1
    if (
      this.inventory.sugar > 0 &&
      Math.random() < CFG.CARRIED_SUGAR_SPOIL_CHANCE * spoilMult
    ) {
      this.inventory.sugar--
    }
    if (
      this.inventory.cooked > 0 &&
      Math.random() < CFG.CARRIED_COOKED_SPOIL_CHANCE * spoilMult
    ) {
      this.inventory.cooked--
    }
  }

  _syncHousing(world: WorldLike): void {
    if (this.homeCell) {
      const c = world.cell(this.homeCell.x, this.homeCell.y)
      if (!c.building || !c.building.residents.includes(this.id)) {
        this.homeCell = null
      }
    }

    if (this.homeCell && this.becameAdultThisTick) {
      const c = world.cell(this.homeCell.x, this.homeCell.y)
      const nearbyAll = world.agentsNear(
        this.homeCell.x,
        this.homeCell.y,
        CFG.GRID_W + CFG.GRID_H,
      )
      const hasOtherLivingAdult = !!(
        c.building &&
        nearbyAll.some(
          (a) =>
            a.id !== this.id &&
            a.phase === 'adult' &&
            c.building!.residents.includes(a.id),
        )
      )
      if (hasOtherLivingAdult && c.building) {
        c.building.residents = c.building.residents.filter(
          (id) => id !== this.id,
        )
        this.homeCell = null
      }
    }

    if (this.homeCell) return

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = this.x + dx
        const y = this.y + dy
        if (!world.inBounds(x, y)) continue
        const c = world.cell(x, y)
        if (!c.building || !c.building.complete) continue
        if (c.building.residents.length >= c.building.capacity) continue
        c.building.residents.push(this.id)
        this.homeCell = { x, y }
        return
      }
    }
  }

  _shelterEconomy(world: WorldLike): void {
    if (!this.homeCell) return
    const home = world.cell(this.homeCell.x, this.homeCell.y)
    if (!home.building || !home.building.complete || !home.building.inv) return
    if (
      Math.abs(this.x - this.homeCell.x) > 1 ||
      Math.abs(this.y - this.homeCell.y) > 1
    )
      return

    const keepSugar = this.needs.hunger > 0.7 ? 4 : 3
    const keepCooked = this.needs.hunger > 0.7 ? 2 : 1
    const keepWood = 2
    const keepMetal = 0.5

    if (this.inventory.sugar > keepSugar) {
      const give = Math.min(this.inventory.sugar - keepSugar, 2)
      this.inventory.sugar -= give
      home.building.inv.sugar += give
    }
    if (this.inventory.cooked > keepCooked) {
      const give = Math.min(this.inventory.cooked - keepCooked, 1)
      this.inventory.cooked -= give
      home.building.inv.cooked += give
    }
    if (this.inventory.wood > keepWood) {
      const give = Math.min(this.inventory.wood - keepWood, 2)
      this.inventory.wood -= give
      home.building.inv.wood += give
    }
    if (this.inventory.metal > keepMetal) {
      const give = Math.min(this.inventory.metal - keepMetal, 1)
      this.inventory.metal -= give
      home.building.inv.metal += give
    }

    if (this.needs.hunger > 0.45) {
      if (this.inventory.cooked < 1 && home.building.inv.cooked >= 1) {
        this.inventory.cooked++
        home.building.inv.cooked--
      } else if (this.inventory.sugar < 2 && home.building.inv.sugar >= 1) {
        this.inventory.sugar++
        home.building.inv.sugar--
      }
    }
  }

  _hasFoodToEat(): boolean {
    return this.inventory.sugar > 0 || this.inventory.cooked > 0
  }

  _eatFromInventory(world: WorldLike): boolean {
    if (
      this.inventory.cooked > 0 &&
      this.ideas.has('EAT_COOKED' as IdeaId) &&
      IDEAS.EAT_COOKED.canDo(this, world)
    ) {
      IDEAS.EAT_COOKED.exec(this, world)
      this.currentAction = 'PAUSE_PLAN:EAT_COOKED'
      this.idleTicks = 0
      return true
    }
    if (this.inventory.sugar > 0 && IDEAS.EAT_SUGAR.canDo(this, world)) {
      IDEAS.EAT_SUGAR.exec(this, world)
      this.currentAction = 'PAUSE_PLAN:EAT_SUGAR'
      this.idleTicks = 0
      return true
    }
    return false
  }

  _abortPlan(reason: string): void {
    this.plan = null
    this.currentAction = `ABORT_PLAN:${reason}`
  }

  _isNearHome(): boolean {
    if (!this.homeCell) return false
    return (
      Math.abs(this.x - this.homeCell.x) <= 1 &&
      Math.abs(this.y - this.homeCell.y) <= 1
    )
  }

  _resourceTotal(
    world: WorldLike,
    resource: ResourceType,
    includeHomeInventory: boolean,
  ): number {
    let total = this.inventory[resource]
    if (!includeHomeInventory || !this.homeCell) return total
    const home = world.cell(this.homeCell.x, this.homeCell.y)
    if (!home.building || !home.building.complete || !home.building.inv)
      return total
    total += home.building.inv[resource]
    return total
  }

  _depositToHome(world: WorldLike): boolean {
    if (!this.homeCell || !this._isNearHome()) return false
    const home = world.cell(this.homeCell.x, this.homeCell.y)
    if (!home.building || !home.building.complete || !home.building.inv)
      return false

    const keepSugar = this.needs.hunger > 0.7 ? 4 : 3
    const keepCooked = this.needs.hunger > 0.7 ? 2 : 1
    const keepWood = 2
    const keepMetal = 0.5

    if (this.inventory.sugar > keepSugar) {
      const give = Math.min(this.inventory.sugar - keepSugar, 2)
      this.inventory.sugar -= give
      home.building.inv.sugar += give
    }
    if (this.inventory.cooked > keepCooked) {
      const give = Math.min(this.inventory.cooked - keepCooked, 1)
      this.inventory.cooked -= give
      home.building.inv.cooked += give
    }
    if (this.inventory.wood > keepWood) {
      const give = Math.min(this.inventory.wood - keepWood, 2)
      this.inventory.wood -= give
      home.building.inv.wood += give
    }
    if (this.inventory.metal > keepMetal) {
      const give = Math.min(this.inventory.metal - keepMetal, 1)
      this.inventory.metal -= give
      home.building.inv.metal += give
    }
    return true
  }

  _createNavigateIdeaPlan(
    ideaId: IdeaId,
    target: { x: number; y: number },
  ): void {
    this.plan = {
      name: 'NAVIGATE_IDEA',
      steps: [
        {
          kind: 'MOVE_TO',
          label: `move to ${target.x},${target.y} for ${ideaId}`,
          x: target.x,
          y: target.y,
        },
        { kind: 'EXEC_IDEA', label: `execute ${ideaId}`, ideaId },
      ],
    }
  }

  _createShelterStockpilePlan(world: WorldLike): boolean {
    if (!this.homeCell) return false
    const home = world.cell(this.homeCell.x, this.homeCell.y)
    if (!home.building || !home.building.complete || !home.building.inv)
      return false

    const nearHome = this._isNearHome()
    if (
      !nearHome &&
      (this.inventory.sugar > 4 ||
        this.inventory.cooked > 1 ||
        this.inventory.wood > 2 ||
        this.inventory.metal > 0.5)
    ) {
      this.plan = {
        name: 'SHELTER_STOCKPILE',
        steps: [
          {
            kind: 'MOVE_TO',
            label: `return home ${this.homeCell.x},${this.homeCell.y}`,
            x: this.homeCell.x,
            y: this.homeCell.y,
          },
          { kind: 'DEPOSIT_HOME', label: 'deposit surplus at home' },
        ],
      }
      return true
    }

    const totalSugar = this._resourceTotal(world, 'sugar', true)
    const totalWood = this._resourceTotal(world, 'wood', true)
    const totalMetal = this._resourceTotal(world, 'metal', true)
    const totalCooked = this.inventory.cooked + home.building.inv.cooked

    if (totalSugar < 10) {
      this.plan = {
        name: 'SHELTER_STOCKPILE',
        steps: [
          {
            kind: 'GATHER_UNTIL',
            label: 'collect sugar stockpile',
            ideaId: 'HARVEST_SUGAR',
            resource: 'sugar',
            targetTotal: 10,
            includeHomeInventory: true,
          },
        ],
      }
      return true
    }

    if (totalWood < 8) {
      this.plan = {
        name: 'SHELTER_STOCKPILE',
        steps: [
          {
            kind: 'GATHER_UNTIL',
            label: 'collect wood stockpile',
            ideaId: 'CHOP_WOOD',
            resource: 'wood',
            targetTotal: 8,
            includeHomeInventory: true,
          },
        ],
      }
      return true
    }

    if (totalMetal < 2) {
      this.plan = {
        name: 'SHELTER_STOCKPILE',
        steps: [
          {
            kind: 'GATHER_UNTIL',
            label: 'collect metal stockpile',
            ideaId: 'DIG_METAL',
            resource: 'metal',
            targetTotal: 2,
            includeHomeInventory: true,
          },
        ],
      }
      return true
    }

    if (
      totalCooked < 4 &&
      this.inventory.sugar >= CFG.COOK_SUGAR &&
      this.inventory.wood >= CFG.COOK_WOOD
    ) {
      this.plan = {
        name: 'SHELTER_STOCKPILE',
        steps: [
          {
            kind: 'EXEC_IDEA',
            label: 'cook food for stockpile',
            ideaId: 'COOK_FOOD',
          },
        ],
      }
      return true
    }

    return false
  }

  _executePlan(world: WorldLike): boolean {
    if (!this.plan) return false

    if (
      this.needs.hunger >= CFG.HUNGER_ABORT_PLAN_NOFOOD &&
      !this._hasFoodToEat()
    ) {
      this._abortPlan('SEVERE_HUNGER_NO_FOOD')
      return false
    }

    if (this.needs.hunger >= CFG.HUNGER_PAUSE_PLAN && this._hasFoodToEat()) {
      if (this._eatFromInventory(world)) return true
    }

    const reconsiderChance =
      (1 - this.morals.integrity) * CFG.PLAN_RECONSIDER_MAX_CHANCE
    if (Math.random() < reconsiderChance) {
      this._abortPlan('LOW_INTEGRITY_REPLAN')
      return false
    }

    for (let guard = 0; guard < 4; guard++) {
      if (!this.plan || this.plan.steps.length === 0) {
        this.plan = null
        return false
      }

      const step = this.plan.steps[0]
      if (step.kind === 'MOVE_TO') {
        if (this.x === step.x && this.y === step.y) {
          this.plan.steps.shift()
          continue
        }
        const s = stepToward(this.x, this.y, step.x, step.y)
        world.move(this, s.x, s.y)
        this.currentAction = `PLAN:${this.plan.name} -> ${step.label}`
        this.idleTicks = 0
        return true
      }

      if (step.kind === 'EXEC_IDEA') {
        const idea = IDEAS[step.ideaId]
        if (!idea || !idea.canDo(this, world)) {
          this._abortPlan(`CANNOT_${step.ideaId}`)
          return false
        }
        idea.exec(this, world)
        this.currentAction = `PLAN:${this.plan.name} -> ${step.ideaId}`
        this.idleTicks = 0
        this.plan.steps.shift()
        if (this.plan.steps.length === 0) this.plan = null
        return true
      }

      if (step.kind === 'GATHER_UNTIL') {
        const total = this._resourceTotal(
          world,
          step.resource,
          step.includeHomeInventory,
        )
        if (total >= step.targetTotal) {
          this.plan.steps.shift()
          continue
        }

        const idea = IDEAS[step.ideaId]
        if (!idea || !idea.canDo(this, world)) {
          this._abortPlan(`NO_${step.resource.toUpperCase()}`)
          return false
        }
        idea.exec(this, world)
        this.currentAction = `PLAN:${this.plan.name} -> ${step.label}`
        this.idleTicks = 0
        return true
      }

      if (step.kind === 'DEPOSIT_HOME') {
        if (!this._depositToHome(world)) {
          this._abortPlan('DEPOSIT_FAILED')
          return false
        }
        this.currentAction = `PLAN:${this.plan.name} -> ${step.label}`
        this.idleTicks = 0
        this.plan.steps.shift()
        if (this.plan.steps.length === 0) this.plan = null
        return true
      }
    }

    return false
  }

  _updateMemory(world: WorldLike): void {
    for (let dy = -this.vision; dy <= this.vision; dy++) {
      for (let dx = -this.vision; dx <= this.vision; dx++) {
        const x = this.x + dx,
          y = this.y + dy
        if (!world.inBounds(x, y)) continue
        const c = world.cell(x, y)
        if (c.building) continue
        if (c.sugarCap > 0 || c.woodCap > 0 || c.metalCap > 0) {
          this.memory.set(`${x},${y}`, {
            x,
            y,
            sugar: c.sugar,
            wood: c.wood,
            metal: c.metal,
          })
        }
      }
    }
    if (this.memory.size > CFG.MEM_CAP) {
      const oldestKey = this.memory.keys().next().value
      if (oldestKey) this.memory.delete(oldestKey)
    }
  }

  _shareMemorySocially(world: WorldLike): void {
    if (this.values.social < 0.3) return
    if (Math.random() > CFG.MEM_SHARE_CHANCE * this.values.social) return
    const near = world
      .agentsNear(this.x, this.y, 3)
      .filter((b) => b.id !== this.id)
    if (near.length > 0) shareMemory(this, pick(near))
  }

  _decideAndAct(world: WorldLike): void {
    if (this.plan && this._executePlan(world)) return

    if (
      this.needs.hunger >= CFG.HUNGER_NOFOOD_FORAGE &&
      this.inventory.sugar <= 0 &&
      (this.inventory.cooked || 0) <= 0
    ) {
      const target = world.findResource(
        this.x,
        this.y,
        'sugar',
        this.vision,
        this.memory,
      )
      if (target) {
        if (target.x === this.x && target.y === this.y) {
          IDEAS.HARVEST_SUGAR.exec(this, world)
          this.currentAction = 'HARVEST_SUGAR'
        } else {
          const s = stepToward(this.x, this.y, target.x, target.y)
          world.move(this, s.x, s.y)
          this.currentAction = '-> HARVEST_SUGAR'
        }
        this.idleTicks = 0
        return
      }
    }

    if (
      !this.plan &&
      this._createShelterStockpilePlan(world) &&
      this._executePlan(world)
    ) {
      return
    }

    let bestKey: IdeaId | null = null,
      bestScore = -Infinity
    for (const key of this.ideas) {
      const idea = IDEAS[key]
      if (!idea || idea.tier > 1) continue
      let s = idea.score(this, world)
      if (idea.tier === 1) s *= 1 + this.morals.patience * 0.35
      if (s > bestScore) {
        bestScore = s
        bestKey = key
      }
    }

    if (bestKey && bestScore > 0) {
      const idea = IDEAS[bestKey]

      if (idea.canDo(this, world)) {
        idea.exec(this, world)
        this.currentAction = bestKey
        if (bestKey !== 'IDLE') this.idleTicks = 0
        else this._tryDiscover(world)
      } else {
        const res = idea.needsRes as ResourceType | null
        if (res) {
          const target = world.findResource(
            this.x,
            this.y,
            res,
            this.vision,
            this.memory,
          )
          if (target && (target.x !== this.x || target.y !== this.y)) {
            this._createNavigateIdeaPlan(bestKey, target)
            if (this._executePlan(world)) return
          } else if (target && target.x === this.x && target.y === this.y) {
            idea.exec(this, world)
            this.currentAction = bestKey
            this.idleTicks = 0
            return
          }
        }
        this.idleTicks++
        this.currentAction = 'idle'
        this._tryDiscover(world)
      }
    } else {
      this.idleTicks++
      this.currentAction = 'idle'
      this._tryDiscover(world)
    }
  }

  _tryDiscover(world: WorldLike): void {
    if (this.idleTicks < CFG.IDLE_THRESHOLD) return
    const curiBonus = 1 + this.morals.curiosity * 2.5

    const inShelter = !!(
      this.homeCell &&
      (() => {
        const c = world.cell(this.homeCell.x, this.homeCell.y)
        return (
          c.building &&
          c.building.complete &&
          (c.building.type === 'shelter' || c.building.type === 'house')
        )
      })()
    )

    const pool = inShelter ? [...TIER1, ...TIER2] : TIER1

    if (Math.random() < CFG.DISCOVER_CHANCE * curiBonus) {
      const candidates = pool.filter(
        (id) => !this.ideas.has(id) && hasPrereqs(this, id),
      )
      if (candidates.length > 0) {
        grantIdea(this, pick(candidates))
        this.idleTicks = 0
        return
      }
    }

    if (Math.random() < CFG.SPREAD_CHANCE * curiBonus) {
      const near = world
        .agentsNear(this.x, this.y, 2)
        .filter((b) => b.id !== this.id)
      if (near.length > 0) {
        const teacher = pick(near)
        const learnable = [...teacher.ideas].filter(
          (id) => !this.ideas.has(id) && hasPrereqs(this, id),
        )
        if (learnable.length > 0) {
          grantIdea(this, pick(learnable))
          this.idleTicks = 0
        }
      }
    }
  }

  _advanceBuilding(world: WorldLike): void {
    if (!this.homeCell) return
    const c = world.cell(this.homeCell.x, this.homeCell.y)
    if (!c.building || c.building.complete || c.building.ownerId !== this.id)
      return
    c.building.progress++
    if (c.building.progress >= c.building.progressMax)
      c.building.complete = true
  }

  _doAltruism(world: WorldLike): void {
    if (this.morals.altruism < 0.65 || this.inventory.sugar < 7) return
    const starving = world
      .agentsNear(this.x, this.y, 2)
      .find(
        (b) =>
          b.id !== this.id && b.phase !== 'toddler' && b.needs.hunger > 0.75,
      )
    if (starving) {
      this.inventory.sugar--
      starving.inventory.sugar++
    }
  }
}

function shareMemory(a: Agent, b: Agent): void {
  for (const [key, entry] of b.memory) {
    if (!a.memory.has(key)) a.memory.set(key, { ...entry })
  }
  for (const [key, entry] of a.memory) {
    if (!b.memory.has(key)) b.memory.set(key, { ...entry })
  }
}
