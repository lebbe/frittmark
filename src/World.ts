// ================================================================
//   3. WORLD
// ================================================================

import { CFG } from './config'
import { Agent } from './Agent'
import {
  applyTrailWearOnStep,
  decayTrailWear,
  findPath,
  getRouteType,
  traversalCost,
  type RouteType,
} from './paths'
import { mdist, rand } from './utils'

type MoveOptions = {
  trailWearMult?: number
}

type ResourceType = 'sugar' | 'wood' | 'metal' | 'rock'

type ResourceMemoryEntry = {
  x: number
  y: number
  sugar?: number
  wood?: number
  metal?: number
  rock?: number
}

type BuildingInventory = {
  sugar: number
  wood: number
  metal: number
  cooked: number
}

type Building = {
  type: 'shelter' | 'house'
  ownerId: number
  residents: number[]
  progress: number
  progressMax: number
  complete: boolean
  capacity: number
  inv: BuildingInventory
}

type Cell = {
  sugar: number
  sugarCap: number
  wood: number
  woodCap: number
  metal: number
  metalCap: number
  rock: number
  rockCap: number
  path: boolean
  routeType: RouteType
  trailWear: number
  ticksSinceTraversal: number
  roadTraversals: number
  building: Building | null
}

function carryCapFor(type: ResourceType): number {
  if (type === 'sugar') return CFG.SUGAR_CARRY_CAP
  if (type === 'wood') return CFG.WOOD_CARRY_CAP
  if (type === 'metal') return CFG.METAL_CARRY_CAP
  if (type === 'rock') return CFG.ROCK_CARRY_CAP
  return Number.POSITIVE_INFINITY
}

function edgeDensity(
  world: World,
  x: number,
  y: number,
  type: ResourceType,
): number {
  let total = 0
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (!world.inBounds(nx, ny)) continue
      const c = world.cell(nx, ny)
      total += c[type]
      n++
    }
  }
  if (n === 0) return 0
  const maxByType =
    type === 'sugar'
      ? CFG.SUGAR_MAX
      : type === 'wood'
        ? CFG.WOOD_MAX
        : type === 'metal'
          ? CFG.METAL_MAX
          : CFG.ROCK_MAX
  return Math.min(1, total / (n * maxByType))
}

export class World {
  W: number
  H: number
  cells: Cell[]
  agents: Agent[]
  nextId: number

  constructor() {
    this.W = CFG.GRID_W
    this.H = CFG.GRID_H
    this.cells = new Array(this.W * this.H)
    this.agents = []
    this.nextId = 1
    this._initCells()
    this._placeResources()
  }

  cell(x: number, y: number): Cell {
    return this.cells[y * this.W + x]
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.W && y >= 0 && y < this.H
  }

  _initCells(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = {
        sugar: 0,
        sugarCap: 0,
        wood: 0,
        woodCap: 0,
        metal: 0,
        metalCap: 0,
        rock: 0,
        rockCap: 0,
        path: false,
        routeType: 'none',
        trailWear: 0,
        ticksSinceTraversal: 0,
        roadTraversals: 0,
        building: null,
      }
    }
  }

  _placeResources(): void {
    const W = this.W,
      H = this.H
    const smts = [
      { cx: Math.floor(W * 0.28), cy: Math.floor(H * 0.28), r: 24 },
      { cx: Math.floor(W * 0.72), cy: Math.floor(H * 0.72), r: 24 },
    ]
    const wpts = Array.from({ length: 6 }, () => ({
      cx: rand(8, W - 8),
      cy: rand(8, H - 8),
      r: rand(10, 18),
    }))
    const mdps = Array.from({ length: 4 }, () => ({
      cx: rand(12, W - 12),
      cy: rand(12, H - 12),
      r: rand(4, 9),
    }))
    const rks = Array.from({ length: 7 }, () => ({
      cx: rand(10, W - 10),
      cy: rand(10, H - 10),
      r: rand(5, 11),
    }))

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.cell(x, y)
        let sc = 0
        for (const m of smts) {
          const d = mdist(x, y, m.cx, m.cy)
          if (d < m.r)
            sc = Math.max(sc, Math.round(CFG.SUGAR_MAX * (1 - d / m.r)))
        }
        c.sugarCap = sc
        c.sugar = sc
        let wc = 0
        for (const p of wpts) {
          const d = mdist(x, y, p.cx, p.cy)
          if (d < p.r)
            wc = Math.max(wc, Math.round(CFG.WOOD_MAX * (1 - d / p.r)))
        }
        if (Math.random() < 0.2) wc = Math.max(wc, rand(1, 2))
        c.woodCap = wc
        c.wood = wc
        let mc = 0
        for (const d of mdps) {
          const dist = mdist(x, y, d.cx, d.cy)
          if (dist < d.r)
            mc = Math.max(mc, Math.round(CFG.METAL_MAX * (1 - dist / d.r)))
        }
        c.metalCap = mc
        c.metal = mc
        let rc = 0
        for (const r of rks) {
          const d = mdist(x, y, r.cx, r.cy)
          if (d < r.r)
            rc = Math.max(rc, Math.round(CFG.ROCK_MAX * (1 - d / r.r)))
        }
        if (Math.random() < 0.12) rc = Math.max(rc, rand(1, 3))
        c.rockCap = rc
        c.rock = rc
      }
    }
  }

  regenerate(): void {
    for (const c of this.cells) {
      decayTrailWear(c)
      if (c.building) continue
      c.sugar = Math.min(c.sugarCap, c.sugar + CFG.SUGAR_REGEN)
      c.wood = Math.min(c.woodCap, c.wood + CFG.WOOD_REGEN)
      c.metal = Math.min(c.metalCap, c.metal + CFG.METAL_REGEN)
      c.rock = Math.min(c.rockCap, c.rock + CFG.ROCK_REGEN)
    }
  }

  findPath(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): { x: number; y: number }[] | null {
    return findPath(this, fromX, fromY, toX, toY)
  }

  // Find best cell of 'type' resource within vision.
  // Falls back to agentMemory if nothing in sight.
  findResource(
    ax: number,
    ay: number,
    type: ResourceType,
    vision: number,
    agentMemory: Map<string, ResourceMemoryEntry> | null = null,
    carriedAmount = 0,
  ): { x: number; y: number } | null {
    const remainingCarry = Math.max(0, carryCapFor(type) - carriedAmount)
    if (remainingCarry <= 0) return null

    // 1. Scan vision (real-time perception)
    let best: { x: number; y: number } | null = null
    let bestScore = 0.1
    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const x = ax + dx,
          y = ay + dy
        if (!this.inBounds(x, y)) continue
        const c = this.cell(x, y)
        if (c.building) continue
        const amt = c[type]
        const effectiveYield = Math.min(amt, remainingCarry)
        if (effectiveYield <= 0.5) continue

        const d = mdist(ax, ay, x, y)
        const entryCost = traversalCost(c)
        const density = edgeDensity(this, x, y, type)
        const edgePenalty =
          1 + density * Math.max(0, CFG.RESOURCE_TARGET_EDGE_BIAS_WEIGHT)
        const score =
          effectiveYield /
          ((d + 1) *
            (1 + entryCost * CFG.RESOURCE_TARGET_ENTRY_COST_WEIGHT) *
            edgePenalty)

        if (score > bestScore) {
          bestScore = score
          best = { x, y }
        }
      }
    }
    if (best) return best

    // 2. Memory fallback — navigate toward best remembered location
    if (!agentMemory || agentMemory.size === 0) return null
    let memBest = null,
      memBestScore = -1
    for (const entry of agentMemory.values()) {
      const est = Math.min(entry[type] || 0, remainingCarry)
      if (est <= 0.5) continue
      const d = mdist(ax, ay, entry.x, entry.y)
      const score = est / (d + 1) // edge/entry unknown in memory, keep simple
      if (score > memBestScore) {
        memBestScore = score
        memBest = entry
      }
    }
    return memBest ? { x: memBest.x, y: memBest.y } : null
  }

  agentsNear(ax: number, ay: number, range: number): Agent[] {
    return this.agents.filter(
      (a) => a.alive && mdist(a.x, a.y, ax, ay) <= range,
    )
  }
  agentsAt(x: number, y: number): Agent[] {
    return this.agents.filter((a) => a.alive && a.x === x && a.y === y)
  }

  move(agent: Agent, x: number, y: number, opts: MoveOptions = {}): void {
    if (!this.inBounds(x, y)) return
    const targetCell = this.cell(x, y)

    const dx = Math.sign(x - agent.x)
    const dy = Math.sign(y - agent.y)

    const ticksPerStep = agent.getTravelTicksPerStep(this)
    const effectiveTicks = Math.max(
      1,
      Math.round(ticksPerStep * traversalCost(targetCell)),
    )
    if (effectiveTicks > 1) {
      if (agent.travelTicksUntilMove > 0) {
        agent.travelTicksUntilMove--
        return
      }
      agent.travelTicksUntilMove = effectiveTicks - 1
    } else {
      agent.travelTicksUntilMove = 0
    }

    agent.x = x
    agent.y = y
    const wearDelta = CFG.TRAIL_WEAR_PER_STEP * (opts.trailWearMult ?? 1)
    applyTrailWearOnStep(targetCell, wearDelta)

    // Stone roads allow one additional chained step when continuing along a path.
    if (getRouteType(targetCell) !== 'stone_road' || (dx === 0 && dy === 0)) {
      return
    }
    const nx = agent.x + dx
    const ny = agent.y + dy
    if (!this.inBounds(nx, ny)) return
    const nextCell = this.cell(nx, ny)
    if (getRouteType(nextCell) !== 'stone_road') return
    agent.x = nx
    agent.y = ny
    applyTrailWearOnStep(nextCell, wearDelta)
  }

  spawn(p1: Agent | null = null, p2: Agent | null = null): Agent {
    const x = p1 ? p1.x : rand(0, this.W - 1)
    const y = p1 ? p1.y : rand(0, this.H - 1)
    const a = new Agent(this.nextId++, x, y, p1, p2)
    this.agents.push(a)
    return a
  }

  remove(agent: Agent): void {
    const i = this.agents.indexOf(agent)
    if (i !== -1) this.agents.splice(i, 1)
  }
}
