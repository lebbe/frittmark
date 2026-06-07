// ================================================================
//   4. IDEAS
//
//   Each idea = self-contained strategy object:
//     tier        0=instinct | 1=craft | 2=abstract
//     requires    prerequisite idea IDs
//     needsRes    resource type needed to execute (for nav planning)
//     score(a,w)  desirability (higher = preferred)
//     canDo(a,w)  can it execute RIGHT NOW?
//     exec(a,w)   perform action; return true on success
//
//   Adding a new idea = one new object here. Nothing else changes.
// ================================================================

import { CFG } from './config'
import { clamp, pick, stepToward } from './utils'

type ResourceKey = 'sugar' | 'wood' | 'metal' | 'cooked'
type ToolKey = 'axe' | 'spade' | 'pick'
type InventoryKey = ResourceKey | ToolKey

type IdeaAgent = {
  id: number
  x: number
  y: number
  age: number
  vision: number
  idleTicks: number
  phase: 'toddler' | 'child' | 'youth' | 'adult'
  alive: boolean
  homeCell: { x: number; y: number } | null
  values: {
    survival: number
    building: number
    metal: number
    social: number
  }
  morals: {
    altruism: number
    patience: number
    curiosity: number
    respectProperty: number
  }
  needs: { hunger: number }
  ideas: Set<string>
  memory: Map<
    string,
    { x: number; y: number; sugar?: number; wood?: number; metal?: number }
  >
  inventory: Record<InventoryKey, number>
}

type IdeaCell = {
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

type IdeaWorld = {
  inBounds(x: number, y: number): boolean
  findResource(
    x: number,
    y: number,
    type: 'sugar' | 'wood' | 'metal',
    vision: number,
    memory: IdeaAgent['memory'],
  ): { x: number; y: number } | null
  move(agent: IdeaAgent, x: number, y: number): void
  cell(x: number, y: number): IdeaCell
  agentsNear(x: number, y: number, range: number): IdeaAgent[]
}

type IdeaDef = {
  tier: 0 | 1 | 2
  requires: string[]
  needsRes: 'sugar' | 'wood' | 'metal' | null
  score(a: IdeaAgent, w: IdeaWorld): number
  canDo(a: IdeaAgent, w: IdeaWorld): boolean
  exec(a: IdeaAgent, w: IdeaWorld): boolean
}

function isHousePlotAllowed(c: IdeaCell): boolean {
  // Houses are forbidden on any sugar/metal terrain, even if currently depleted.
  // Valid plots are wood-bearing or fully empty cells without sugar/metal traces.
  return c.sugarCap === 0 && c.metalCap === 0 && c.sugar <= 0 && c.metal <= 0
}

function isSheltered(a: IdeaAgent, w: IdeaWorld): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = a.x + dx
      const y = a.y + dy
      if (!w.inBounds(x, y)) continue
      const c = w.cell(x, y)
      if (c.building && c.building.complete && c.building.type === 'shelter') {
        return true
      }
    }
  }
  return false
}

export const IDEAS: Record<string, IdeaDef> = {
  // ---- TIER 0: Instinct — all agents start with these ----

  EAT_SUGAR: {
    tier: 0,
    requires: [],
    needsRes: null,
    score(a, _w) {
      return a.inventory.sugar >= 1
        ? a.needs.hunger * a.values.survival * 10
        : 0
    },
    canDo(a, _w) {
      return a.inventory.sugar >= 1
    },
    exec(a, _w) {
      a.inventory.sugar--
      const restore = isSheltered(a, _w)
        ? CFG.SUGAR_EAT_RESTORE * CFG.SHELTER_EAT_BONUS
        : CFG.SUGAR_EAT_RESTORE
      a.needs.hunger = clamp(a.needs.hunger - restore, 0, 1)
      return true
    },
  },

  HARVEST_SUGAR: {
    tier: 0,
    requires: [],
    needsRes: 'sugar',
    score(a, w) {
      const satiety = clamp(1.2 - a.inventory.sugar / 10, 0.25, 1.2)
      return w.findResource(a.x, a.y, 'sugar', a.vision, a.memory)
        ? a.values.survival * (1 + a.needs.hunger) * 4 * satiety
        : 0
    },
    canDo(a, w) {
      return !!w.findResource(a.x, a.y, 'sugar', a.vision, a.memory)
    },
    exec(a, w) {
      const t = w.findResource(a.x, a.y, 'sugar', a.vision, a.memory)
      if (!t) return false
      const s = stepToward(a.x, a.y, t.x, t.y)
      w.move(a, s.x, s.y)
      if (a.x === t.x && a.y === t.y) {
        const c = w.cell(a.x, a.y)
        const bonus = a.inventory.spade > 0 ? CFG.SPADE_BONUS : 1
        const got = Math.min(Math.floor(c.sugar), Math.ceil(1.5 * bonus))
        c.sugar = Math.max(0, c.sugar - got)
        a.inventory.sugar += got
        if (a.inventory.spade > 0) a.inventory.spade--
      }
      return true
    },
  },

  CHOP_WOOD: {
    tier: 0,
    requires: [],
    needsRes: 'wood',
    score(a, w) {
      const hungerPenalty = clamp(1 - a.needs.hunger * 0.75, 0.2, 1)
      return w.findResource(a.x, a.y, 'wood', a.vision, a.memory)
        ? a.values.building * 2.5 * hungerPenalty
        : 0
    },
    canDo(a, w) {
      return !!w.findResource(a.x, a.y, 'wood', a.vision, a.memory)
    },
    exec(a, w) {
      const t = w.findResource(a.x, a.y, 'wood', a.vision, a.memory)
      if (!t) return false
      const s = stepToward(a.x, a.y, t.x, t.y)
      w.move(a, s.x, s.y)
      if (a.x === t.x && a.y === t.y) {
        const c = w.cell(a.x, a.y)
        const bonus = a.inventory.axe > 0 ? CFG.AXE_BONUS : 1
        const got = Math.min(Math.floor(c.wood), Math.ceil(1.5 * bonus))
        c.wood = Math.max(0, c.wood - got)
        a.inventory.wood += got
        if (a.inventory.axe > 0) a.inventory.axe--
      }
      return true
    },
  },

  DIG_METAL: {
    tier: 0,
    requires: [],
    needsRes: 'metal',
    score(a, w) {
      if (a.inventory.metal >= CFG.METAL_CARRY_CAP) return 0
      const hungerPenalty = clamp(1 - a.needs.hunger * 0.75, 0.2, 1)
      return w.findResource(a.x, a.y, 'metal', a.vision, a.memory)
        ? a.values.metal * 3.5 * hungerPenalty
        : 0
    },
    canDo(a, w) {
      if (a.inventory.metal >= CFG.METAL_CARRY_CAP) return false
      return !!w.findResource(a.x, a.y, 'metal', a.vision, a.memory)
    },
    exec(a, w) {
      const t = w.findResource(a.x, a.y, 'metal', a.vision, a.memory)
      if (!t) return false
      const s = stepToward(a.x, a.y, t.x, t.y)
      w.move(a, s.x, s.y)
      if (a.x === t.x && a.y === t.y) {
        const c = w.cell(a.x, a.y)
        const bonus = a.inventory.pick > 0 ? CFG.PICK_BONUS : 1
        const remainCap = Math.max(0, CFG.METAL_CARRY_CAP - a.inventory.metal)
        if (remainCap <= 0) return false
        const got = Math.min(
          Math.floor(c.metal),
          Math.ceil(0.8 * bonus),
          remainCap,
        )
        c.metal = Math.max(0, c.metal - got)
        a.inventory.metal += got
        if (a.inventory.pick > 0) a.inventory.pick--
      }
      return true
    },
  },

  // BUILD_SHELTER is now T0: throwing wood together is instinctive
  BUILD_SHELTER: {
    tier: 0,
    requires: ['CHOP_WOOD'],
    needsRes: 'wood',
    score(a, w) {
      if (a.homeCell) return 0
      const exploreBonus =
        a.inventory.sugar >= CFG.REPRO_MIN_SUGAR && a.needs.hunger < 0.65
          ? 1.15
          : 1
      if (a.inventory.wood < CFG.SHELTER_WOOD) {
        // Not enough wood yet — score based on how badly we want a home,
        // filtered by: do we know where wood is?
        const woodTarget = w.findResource(a.x, a.y, 'wood', a.vision, a.memory)
        return woodTarget
          ? a.values.building *
              4 *
              (0.5 + a.morals.patience * 0.5) *
              exploreBonus
          : 0
      }
      return (
        a.values.building * 6 * (0.5 + a.morals.patience * 0.5) * exploreBonus
      )
    },
    canDo(a, w) {
      return (
        !a.homeCell &&
        a.inventory.wood >= CFG.SHELTER_WOOD &&
        !w.cell(a.x, a.y).building
      )
    },
    exec(a, w) {
      // If we CAN build, build
      if (a.inventory.wood >= CFG.SHELTER_WOOD && !w.cell(a.x, a.y).building) {
        a.inventory.wood -= CFG.SHELTER_WOOD
        w.cell(a.x, a.y).building = {
          type: 'shelter',
          ownerId: a.id,
          residents: [a.id],
          progress: 0,
          progressMax: CFG.SHELTER_BUILD,
          complete: false,
          capacity: CFG.SHELTER_CAP,
          inv: { sugar: 0, wood: 0, metal: 0, cooked: 0 },
        }
        a.homeCell = { x: a.x, y: a.y }
        return true
      }
      // Otherwise navigate to wood to gather more
      const t = w.findResource(a.x, a.y, 'wood', a.vision, a.memory)
      if (!t) return false
      const s = stepToward(a.x, a.y, t.x, t.y)
      w.move(a, s.x, s.y)
      if (a.x === t.x && a.y === t.y) {
        const c = w.cell(a.x, a.y)
        const got = Math.min(Math.floor(c.wood), Math.ceil(1.5))
        c.wood = Math.max(0, c.wood - got)
        a.inventory.wood += got
      }
      return true
    },
  },

  IDLE: {
    tier: 0,
    requires: [],
    needsRes: null,
    score() {
      return 0.1
    },
    canDo() {
      return true
    },
    exec(a) {
      a.idleTicks++
      return true
    },
  },

  // ---- TIER 1: Craft ----

  COOK_FOOD: {
    tier: 1,
    requires: ['CHOP_WOOD'],
    needsRes: null,
    score(a, _w) {
      if (a.inventory.sugar < CFG.COOK_SUGAR) return 0
      if (a.inventory.wood < CFG.COOK_WOOD) return 0
      return a.values.survival * (2 + a.needs.hunger)
    },
    canDo(a, _w) {
      return (
        a.inventory.sugar >= CFG.COOK_SUGAR && a.inventory.wood >= CFG.COOK_WOOD
      )
    },
    exec(a, _w) {
      a.inventory.sugar -= CFG.COOK_SUGAR
      a.inventory.wood -= CFG.COOK_WOOD
      a.inventory.cooked = (a.inventory.cooked || 0) + 2
      return true
    },
  },

  // EAT_COOKED: auto-granted when COOK_FOOD is granted (via grantIdea).
  // Kept here for completeness; tier keeps it out of T0 discovery pool.
  EAT_COOKED: {
    tier: 1,
    requires: ['COOK_FOOD'],
    needsRes: null,
    score(a, _w) {
      return (a.inventory.cooked || 0) >= 1
        ? a.needs.hunger * a.values.survival * 14
        : 0
    },
    canDo(a, _w) {
      return (a.inventory.cooked || 0) >= 1
    },
    exec(a, _w) {
      a.inventory.cooked--
      const restore = isSheltered(a, _w)
        ? CFG.COOKED_EAT_RESTORE * CFG.SHELTER_EAT_BONUS
        : CFG.COOKED_EAT_RESTORE
      a.needs.hunger = clamp(a.needs.hunger - restore, 0, 1)
      return true
    },
  },

  MAKE_AXE: {
    tier: 1,
    requires: ['CHOP_WOOD', 'DIG_METAL'],
    needsRes: null,
    score(a, _w) {
      if (a.inventory.axe > 0) return 0
      if (
        a.inventory.wood < CFG.TOOL_WOOD ||
        a.inventory.metal < CFG.TOOL_METAL
      )
        return 0
      const exploreBonus =
        a.inventory.sugar >= CFG.REPRO_MIN_SUGAR && a.needs.hunger < 0.65
          ? 1.15
          : 1
      return a.values.building * 4 * exploreBonus
    },
    canDo(a, _w) {
      return (
        a.inventory.axe === 0 &&
        a.inventory.wood >= CFG.TOOL_WOOD &&
        a.inventory.metal >= CFG.TOOL_METAL
      )
    },
    exec(a, _w) {
      a.inventory.wood -= CFG.TOOL_WOOD
      a.inventory.metal -= CFG.TOOL_METAL
      a.inventory.axe = CFG.AXE_DUR
      return true
    },
  },

  MAKE_SPADE: {
    tier: 1,
    requires: ['CHOP_WOOD', 'DIG_METAL'],
    needsRes: null,
    score(a, _w) {
      if (a.inventory.spade > 0) return 0
      if (
        a.inventory.wood < CFG.TOOL_WOOD ||
        a.inventory.metal < CFG.TOOL_METAL
      )
        return 0
      const exploreBonus =
        a.inventory.sugar >= CFG.REPRO_MIN_SUGAR && a.needs.hunger < 0.65
          ? 1.15
          : 1
      return a.values.survival * 3 * exploreBonus
    },
    canDo(a, _w) {
      return (
        a.inventory.spade === 0 &&
        a.inventory.wood >= CFG.TOOL_WOOD &&
        a.inventory.metal >= CFG.TOOL_METAL
      )
    },
    exec(a, _w) {
      a.inventory.wood -= CFG.TOOL_WOOD
      a.inventory.metal -= CFG.TOOL_METAL
      a.inventory.spade = CFG.SPADE_DUR
      return true
    },
  },

  MAKE_PICKAXE: {
    tier: 1,
    requires: ['CHOP_WOOD', 'DIG_METAL'],
    needsRes: null,
    score(a, _w) {
      if (a.inventory.pick > 0) return 0
      if (
        a.inventory.wood < CFG.TOOL_WOOD ||
        a.inventory.metal < CFG.TOOL_METAL
      )
        return 0
      const exploreBonus =
        a.inventory.sugar >= CFG.REPRO_MIN_SUGAR && a.needs.hunger < 0.65
          ? 1.15
          : 1
      return a.values.metal * 4 * exploreBonus
    },
    canDo(a, _w) {
      return (
        a.inventory.pick === 0 &&
        a.inventory.wood >= CFG.TOOL_WOOD &&
        a.inventory.metal >= CFG.TOOL_METAL
      )
    },
    exec(a, _w) {
      a.inventory.wood -= CFG.TOOL_WOOD
      a.inventory.metal -= CFG.TOOL_METAL
      a.inventory.pick = CFG.PICK_DUR
      return true
    },
  },

  TRADE: {
    tier: 1,
    requires: ['COOK_FOOD'],
    needsRes: null,
    score(a, w) {
      const nb = w
        .agentsNear(a.x, a.y, CFG.TRADE_RANGE)
        .filter((b) => b.id !== a.id && b.ideas.has('TRADE'))
      return nb.length > 0 ? a.values.social * 3 : 0
    },
    canDo(a, w) {
      return w
        .agentsNear(a.x, a.y, CFG.TRADE_RANGE)
        .some((b) => b.id !== a.id && b.ideas.has('TRADE'))
    },
    exec(a, w) {
      const partners = w
        .agentsNear(a.x, a.y, CFG.TRADE_RANGE)
        .filter((b) => b.id !== a.id && b.ideas.has('TRADE'))
      if (!partners.length) return false
      const partner = pick(partners)
      const traded = doTrade(a, partner)
      // Trade also shares location knowledge (info has zero marginal cost to share)
      shareMemory(a, partner)
      return traded || true // meeting itself is worthwhile
    },
  },

  // ---- TIER 2: Abstract (discovered only inside a finished house) ----

  BUILD_HOUSE: {
    tier: 2,
    requires: ['BUILD_SHELTER'],
    needsRes: 'wood',
    score(a, w) {
      if (a.homeCell || a.inventory.wood < CFG.HOUSE_WOOD) return 0
      if (!isHousePlotAllowed(w.cell(a.x, a.y))) return 0
      const partner = w
        .agentsNear(a.x, a.y, 1)
        .find((b) => b.id !== a.id && b.ideas.has('BUILD_HOUSE') && !b.homeCell)
      return partner ? a.values.building * 7 : 0
    },
    canDo(a, w) {
      if (a.homeCell || a.inventory.wood < CFG.HOUSE_WOOD) return false
      if (w.cell(a.x, a.y).building) return false
      if (!isHousePlotAllowed(w.cell(a.x, a.y))) return false
      return w
        .agentsNear(a.x, a.y, 1)
        .some((b) => b.id !== a.id && b.ideas.has('BUILD_HOUSE') && !b.homeCell)
    },
    exec(a, w) {
      const p = w
        .agentsNear(a.x, a.y, 1)
        .find((b) => b.id !== a.id && b.ideas.has('BUILD_HOUSE') && !b.homeCell)
      if (!p || w.cell(a.x, a.y).building) return false
      if (!isHousePlotAllowed(w.cell(a.x, a.y))) return false
      const half = Math.floor(CFG.HOUSE_WOOD / 2),
        rest = CFG.HOUSE_WOOD - half
      if (a.inventory.wood < half || p.inventory.wood < rest) return false
      a.inventory.wood -= half
      p.inventory.wood -= rest
      const c = w.cell(a.x, a.y)
      c.building = {
        type: 'house',
        ownerId: a.id,
        residents: [a.id, p.id],
        progress: 0,
        progressMax: CFG.HOUSE_BUILD,
        complete: false,
        capacity: CFG.HOUSE_CAP,
        inv: { sugar: 0, wood: 0, metal: 0, cooked: 0 },
      }
      a.homeCell = { x: a.x, y: a.y }
      p.homeCell = { x: a.x, y: a.y }
      return true
    },
  },
}

export const ALL_IDEA_KEYS = Object.keys(IDEAS)

export type IdeaId = keyof typeof IDEAS

export function hasPrereqs(agent: IdeaAgent, ideaId: string): boolean {
  return IDEAS[ideaId].requires.every((r) => agent.ideas.has(r))
}

// ---- Trade helpers ----

function subjVal(a: IdeaAgent, res: ResourceKey): number {
  const i = a.inventory,
    h = a.needs.hunger
  switch (res) {
    case 'sugar':
      return (
        (a.values.survival * (1 + h * 3)) /
        Math.max(0.5, (i.sugar || 0) * 0.3 + 0.2)
      )
    case 'wood':
      return (a.values.building * 2) / Math.max(0.5, (i.wood || 0) * 0.25 + 0.2)
    case 'metal':
      return (a.values.metal * 5) / Math.max(0.5, (i.metal || 0) * 0.4 + 0.2)
    case 'cooked':
      return (
        (a.values.survival * (1 + h * 4)) /
        Math.max(0.5, (i.cooked || 0) * 0.3 + 0.2)
      )
    default:
      return 0
  }
}

function doTrade(a: IdeaAgent, b: IdeaAgent): boolean {
  const res: ResourceKey[] = ['sugar', 'wood', 'metal', 'cooked']
  let best = null,
    bestGain = 0
  for (const give of res) {
    for (const recv of res) {
      if (give === recv) continue
      if ((a.inventory[give] || 0) < 1) continue
      if ((b.inventory[recv] || 0) < 1) continue
      const aGain = subjVal(a, recv) - subjVal(a, give)
      const bGain = subjVal(b, give) - subjVal(b, recv)
      if (aGain > 0 && bGain > 0 && aGain + bGain > bestGain) {
        bestGain = aGain + bGain
        best = { give, recv }
      }
    }
  }
  if (!best) return false
  a.inventory[best.give]--
  a.inventory[best.recv] = (a.inventory[best.recv] || 0) + 1
  b.inventory[best.recv]--
  b.inventory[best.give] = (b.inventory[best.give] || 0) + 1
  return true
}

// Share all memory between two agents (info is free to share)
function shareMemory(a: IdeaAgent, b: IdeaAgent): void {
  for (const [key, entry] of b.memory) {
    if (!a.memory.has(key)) a.memory.set(key, { ...entry })
  }
  for (const [key, entry] of a.memory) {
    if (!b.memory.has(key)) b.memory.set(key, { ...entry })
  }
}
