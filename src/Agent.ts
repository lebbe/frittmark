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

type NavTarget = {
  x: number
  y: number
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
  navTarget: NavTarget | null
  navIdea: IdeaId | null
  currentAction: string
  ideas: Set<IdeaId>

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

    // Physical traits (heritable with mutation)
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

    this.inventory = {
      sugar: rand(2, 6),
      wood: 0,
      metal: 0,
      cooked: 0,
      axe: 0,
      spade: 0,
      pick: 0,
    }

    // ---- Memory: known resource cells ----
    // key: "x,y"  value: {x, y, sugar, wood, metal}
    this.memory = new Map<string, MemoryEntry>()

    // ---- Navigation commitment ----
    // When scoring produces a goal whose resource is outside vision,
    // the agent commits to navigating there over multiple ticks.
    this.navTarget = null // {x, y}
    this.navIdea = null // ideaId to execute on arrival

    // For display: what the agent is currently doing
    this.currentAction = 'idle'

    // Ideas: all tier-0 + inherited from parents
    this.ideas = new Set<IdeaId>(TIER0)
    for (const parent of [p1, p2]) {
      if (!parent) continue
      for (const id of parent.ideas) {
        if (Math.random() < 0.65 && hasPrereqs(this, id)) grantIdea(this, id)
      }
    }

    // Inherit a random subset of parents' memory (knowledge passed down)
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

  // ----------------------------------------------------------------
  //  Main tick
  // ----------------------------------------------------------------

  tick(world: WorldLike): void {
    this.age++
    this.reproCooldown = Math.max(0, this.reproCooldown - 1)
    this._updatePhase()
    this.needs.hunger = clamp(
      this.needs.hunger + CFG.HUNGER_PER_TICK * (this.metabolism / 2.5),
      0,
      1,
    )

    if (this.phase === 'toddler') {
      if (this.needs.hunger > 0.5 && this.inventory.sugar > 0) {
        this.inventory.sugar--
        this.needs.hunger = clamp(
          this.needs.hunger - CFG.SUGAR_EAT_RESTORE,
          0,
          1,
        )
      }
    } else {
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
    if (this.phase === 'youth' && this.age >= CFG.AGE_YOUTH)
      this.phase = 'adult'
  }

  // ----------------------------------------------------------------
  //  Memory: scan vision range and record resource locations
  // ----------------------------------------------------------------

  _updateMemory(world: WorldLike): void {
    for (let dy = -this.vision; dy <= this.vision; dy++) {
      for (let dx = -this.vision; dx <= this.vision; dx++) {
        const x = this.x + dx,
          y = this.y + dy
        if (!world.inBounds(x, y)) continue
        const c = world.cell(x, y)
        if (c.building) continue
        // Record all cells that have (or had) resource potential
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
    // Cap memory size: evict the first (oldest) entry if over limit
    if (this.memory.size > CFG.MEM_CAP) {
      const oldestKey = this.memory.keys().next().value
      if (oldestKey) this.memory.delete(oldestKey)
    }
  }

  // Passively share memory with nearby social agents
  _shareMemorySocially(world: WorldLike): void {
    if (this.values.social < 0.3) return
    if (Math.random() > CFG.MEM_SHARE_CHANCE * this.values.social) return
    const near = world
      .agentsNear(this.x, this.y, 3)
      .filter((b) => b.id !== this.id)
    if (near.length > 0) shareMemory(this, pick(near))
  }

  // ----------------------------------------------------------------
  //  Decision loop with navigation commitment
  //
  //  Priority order:
  //    1. Continue committed navigation (unless critically hungry)
  //    2. Score all known ideas; pick highest
  //    3. If best idea can't execute: seek its resource via memory
  //    4. Idle + try to discover new ideas
  // ----------------------------------------------------------------

  _decideAndAct(world: WorldLike): void {
    // --- Phase 1: Continue navigation commitment ---
    if (this.navTarget) {
      // Abandon if critically hungry AND have something to eat
      if (
        this.needs.hunger >= CFG.HUNGER_ABANDON_NAV &&
        (this.inventory.sugar > 0 || (this.inventory.cooked || 0) > 0)
      ) {
        this.navTarget = null
        this.navIdea = null
        // Fall through to normal scoring (will eat)
      } else if (this.x === this.navTarget.x && this.y === this.navTarget.y) {
        // Arrived — execute the intended idea then clear commitment
        const navIdea = this.navIdea
        const idea = navIdea ? IDEAS[navIdea] : null
        if (navIdea && idea && idea.canDo(this, world)) {
          idea.exec(this, world)
          this.currentAction = navIdea
          this.idleTicks = 0
        }
        this.navTarget = null
        this.navIdea = null
        return
      } else {
        // Keep navigating
        const s = stepToward(this.x, this.y, this.navTarget.x, this.navTarget.y)
        world.move(this, s.x, s.y)
        this.currentAction = `→ ${this.navIdea}`
        this.idleTicks = 0
        return
      }
    }

    // --- Phase 2: Score ideas and pick the best ---
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
        // Execute directly
        idea.exec(this, world)
        this.currentAction = bestKey
        if (bestKey !== 'IDLE') this.idleTicks = 0
        else this._tryDiscover(world)
      } else {
        // Can't execute right now — find resource in memory and commit to navigating there
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
            // Commit to navigation
            this.navTarget = { x: target.x, y: target.y }
            this.navIdea = bestKey
            const s = stepToward(this.x, this.y, target.x, target.y)
            world.move(this, s.x, s.y)
            this.currentAction = `→ ${bestKey}`
            this.idleTicks = 0
            return
          } else if (target && target.x === this.x && target.y === this.y) {
            // Resource is right here but idea still can't execute? Just try again
            idea.exec(this, world)
            this.currentAction = bestKey
            this.idleTicks = 0
            return
          }
        }
        // No path to resource: idle and discover
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

  // ----------------------------------------------------------------
  //  Idea discovery and spreading
  // ----------------------------------------------------------------

  _tryDiscover(world: WorldLike): void {
    if (this.idleTicks < CFG.IDLE_THRESHOLD) return
    const curiBonus = 1 + this.morals.curiosity * 2.5

    const inHouse = !!(
      this.homeCell &&
      (() => {
        const c = world.cell(this.homeCell.x, this.homeCell.y)
        return c.building && c.building.type === 'house' && c.building.complete
      })()
    )

    const pool = inHouse ? [...TIER1, ...TIER2] : TIER1

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

  // ----------------------------------------------------------------
  //  Building advancement, altruism
  // ----------------------------------------------------------------

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
      .find((b) => b.id !== this.id && b.needs.hunger > 0.75)
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
