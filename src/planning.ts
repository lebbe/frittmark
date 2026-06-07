import { CFG } from './config'

export type ResourceType = 'sugar' | 'wood' | 'metal' | 'rock'
export type PlanName =
  | 'NAVIGATE_IDEA'
  | 'SHELTER_STOCKPILE'
  | 'STAY_IDLE'
  | 'HUNGER_RECOVERY'
  | 'COOK_AND_STORE'
  | 'TOOL_READINESS'
  | 'TRADE_REBALANCE'
  | 'RECOVERY_BUFFER'
  | 'HOUSE_UPGRADE'
  | 'PARENTING_PROVISION'
export const PLAN_REGISTRY: PlanName[] = [
  'NAVIGATE_IDEA',
  'SHELTER_STOCKPILE',
  'STAY_IDLE',
  'HUNGER_RECOVERY',
  'COOK_AND_STORE',
  'TOOL_READINESS',
  'TRADE_REBALANCE',
  'RECOVERY_BUFFER',
  'HOUSE_UPGRADE',
  'PARENTING_PROVISION',
]

export type PlanStep =
  | { kind: 'MOVE_TO'; label: string; x: number; y: number }
  | { kind: 'EXEC_IDEA'; label: string; ideaId: string }
  | {
      kind: 'GATHER_UNTIL'
      label: string
      ideaId: string
      resource: ResourceType
      targetTotal: number
      includeHomeInventory: boolean
    }
  | { kind: 'DEPOSIT_HOME'; label: string }

export type AgentPlan = {
  name: PlanName
  steps: PlanStep[]
}

type PlanningCell = {
  building: {
    complete: boolean
    inv?: { sugar: number; wood: number; metal: number; cooked: number }
  } | null
}

type PlanningWorld = {
  cell(x: number, y: number): PlanningCell
  agentsNear?(x: number, y: number, range: number): PlanningAgent[]
}

type PlanningAgent = {
  id: number
  x: number
  y: number
  alive?: boolean
  phase?: 'toddler' | 'child' | 'youth' | 'adult'
  parentIds?: number[]
  homeCell: { x: number; y: number } | null
  needs: { hunger: number }
  values?: { social: number }
  ideas: Set<string>
  inventory: {
    sugar: number
    wood: number
    metal: number
    rock: number
    cooked: number
    axe?: number
    spade?: number
    pick?: number
  }
}

function hasCompleteHome(a: PlanningAgent, world: PlanningWorld): boolean {
  if (!a.homeCell) return false
  const home = world.cell(a.homeCell.x, a.homeCell.y)
  return !!(home.building && home.building.complete && home.building.inv)
}

export function isNearHome(a: PlanningAgent): boolean {
  if (!a.homeCell) return false
  return Math.abs(a.x - a.homeCell.x) <= 1 && Math.abs(a.y - a.homeCell.y) <= 1
}

export function resourceTotal(
  a: PlanningAgent,
  world: PlanningWorld,
  resource: ResourceType,
  includeHomeInventory: boolean,
): number {
  let total = a.inventory[resource]
  if (!includeHomeInventory || !hasCompleteHome(a, world) || !a.homeCell) {
    return total
  }
  if (resource === 'rock') return total
  const home = world.cell(a.homeCell.x, a.homeCell.y)
  total += home.building!.inv![resource]
  return total
}

export function canFormPlanWithKnownIdeas(
  ideas: Set<string>,
  steps: PlanStep[],
): boolean {
  return steps.every((step) => {
    if (step.kind === 'EXEC_IDEA' || step.kind === 'GATHER_UNTIL') {
      return ideas.has(step.ideaId)
    }
    return true
  })
}

export function createNavigateIdeaPlan(
  ideaId: string,
  target: { x: number; y: number },
): AgentPlan {
  return {
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

export function createShelterStockpilePlan(
  a: PlanningAgent,
  world: PlanningWorld,
): AgentPlan | null {
  if (!hasCompleteHome(a, world) || !a.homeCell) return null

  const nearHome = isNearHome(a)
  if (
    !nearHome &&
    (a.inventory.sugar > 4 ||
      a.inventory.cooked > 1 ||
      a.inventory.wood > 2 ||
      a.inventory.metal > 0.5)
  ) {
    return {
      name: 'SHELTER_STOCKPILE',
      steps: [
        {
          kind: 'MOVE_TO',
          label: `return home ${a.homeCell.x},${a.homeCell.y}`,
          x: a.homeCell.x,
          y: a.homeCell.y,
        },
        { kind: 'DEPOSIT_HOME', label: 'deposit surplus at home' },
      ],
    }
  }

  const totalSugar = resourceTotal(a, world, 'sugar', true)
  const totalWood = resourceTotal(a, world, 'wood', true)
  const totalMetal = resourceTotal(a, world, 'metal', true)
  const home = world.cell(a.homeCell.x, a.homeCell.y)
  const totalCooked = a.inventory.cooked + (home.building?.inv?.cooked ?? 0)

  if (totalSugar < 10) {
    const steps: PlanStep[] = [
      {
        kind: 'GATHER_UNTIL',
        label: 'collect sugar stockpile',
        ideaId: 'HARVEST_SUGAR',
        resource: 'sugar',
        targetTotal: 10,
        includeHomeInventory: true,
      },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'SHELTER_STOCKPILE', steps }
      : null
  }

  if (totalWood < 8) {
    const steps: PlanStep[] = [
      {
        kind: 'GATHER_UNTIL',
        label: 'collect wood stockpile',
        ideaId: 'CHOP_WOOD',
        resource: 'wood',
        targetTotal: 8,
        includeHomeInventory: true,
      },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'SHELTER_STOCKPILE', steps }
      : null
  }

  if (totalMetal < 2) {
    const steps: PlanStep[] = [
      {
        kind: 'GATHER_UNTIL',
        label: 'collect metal stockpile',
        ideaId: 'DIG_METAL',
        resource: 'metal',
        targetTotal: 2,
        includeHomeInventory: true,
      },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'SHELTER_STOCKPILE', steps }
      : null
  }

  if (
    totalCooked < 4 &&
    a.inventory.sugar >= CFG.COOK_SUGAR &&
    a.inventory.wood >= CFG.COOK_WOOD
  ) {
    const steps: PlanStep[] = [
      {
        kind: 'EXEC_IDEA',
        label: 'cook food for stockpile',
        ideaId: 'COOK_FOOD',
      },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'SHELTER_STOCKPILE', steps }
      : null
  }

  return null
}

function isHomeWellStocked(a: PlanningAgent, world: PlanningWorld): boolean {
  if (!hasCompleteHome(a, world) || !a.homeCell) return false
  const home = world.cell(a.homeCell.x, a.homeCell.y)
  const totalSugar = resourceTotal(a, world, 'sugar', true)
  const totalWood = resourceTotal(a, world, 'wood', true)
  const totalMetal = resourceTotal(a, world, 'metal', true)
  const totalCooked = a.inventory.cooked + (home.building?.inv?.cooked ?? 0)
  return (
    totalSugar >= 10 && totalWood >= 8 && totalMetal >= 2 && totalCooked >= 4
  )
}

export function createStayIdlePlan(
  a: PlanningAgent,
  world: PlanningWorld,
): AgentPlan | null {
  if (!hasCompleteHome(a, world) || !a.homeCell) return null
  if (!isHomeWellStocked(a, world)) return null
  if (a.needs.hunger > CFG.STAY_IDLE_MAX_HUNGER) return null

  const steps: PlanStep[] = []
  if (!isNearHome(a)) {
    steps.push({
      kind: 'MOVE_TO',
      label: `return home ${a.homeCell.x},${a.homeCell.y}`,
      x: a.homeCell.x,
      y: a.homeCell.y,
    })
  }

  for (let i = 0; i < CFG.STAY_IDLE_PLAN_TICKS; i++) {
    steps.push({
      kind: 'EXEC_IDEA',
      label: 'rest and reflect',
      ideaId: 'IDLE',
    })
  }

  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'STAY_IDLE', steps }
}

export function createHungerRecoveryPlan(
  a: PlanningAgent,
  _world: PlanningWorld,
): AgentPlan | null {
  if (a.needs.hunger < 0.62) return null

  if (a.ideas.has('EAT_COOKED') && a.inventory.cooked > 0) {
    const steps: PlanStep[] = [
      { kind: 'EXEC_IDEA', label: 'eat cooked food', ideaId: 'EAT_COOKED' },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'HUNGER_RECOVERY', steps }
      : null
  }

  if (a.inventory.sugar > 0) {
    const steps: PlanStep[] = [
      { kind: 'EXEC_IDEA', label: 'eat sugar', ideaId: 'EAT_SUGAR' },
    ]
    return canFormPlanWithKnownIdeas(a.ideas, steps)
      ? { name: 'HUNGER_RECOVERY', steps }
      : null
  }

  if (!a.ideas.has('HARVEST_SUGAR')) return null
  const steps: PlanStep[] = [
    {
      kind: 'GATHER_UNTIL',
      label: 'forage emergency sugar',
      ideaId: 'HARVEST_SUGAR',
      resource: 'sugar',
      targetTotal: 3,
      includeHomeInventory: false,
    },
    { kind: 'EXEC_IDEA', label: 'eat sugar', ideaId: 'EAT_SUGAR' },
  ]
  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'HUNGER_RECOVERY', steps }
}

export function createCookAndStorePlan(
  a: PlanningAgent,
  world: PlanningWorld,
): AgentPlan | null {
  if (!a.homeCell || !hasCompleteHome(a, world)) return null
  if (!a.ideas.has('COOK_FOOD')) return null

  const home = world.cell(a.homeCell.x, a.homeCell.y)
  const totalCooked = a.inventory.cooked + (home.building?.inv?.cooked ?? 0)
  if (totalCooked >= 6) return null

  const steps: PlanStep[] = []
  if (a.inventory.sugar < CFG.COOK_SUGAR + 2 && a.ideas.has('HARVEST_SUGAR')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather sugar for cooking',
      ideaId: 'HARVEST_SUGAR',
      resource: 'sugar',
      targetTotal: CFG.COOK_SUGAR + 2,
      includeHomeInventory: false,
    })
  }
  if (a.inventory.wood < CFG.COOK_WOOD + 1 && a.ideas.has('CHOP_WOOD')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather wood for cooking',
      ideaId: 'CHOP_WOOD',
      resource: 'wood',
      targetTotal: CFG.COOK_WOOD + 1,
      includeHomeInventory: false,
    })
  }

  steps.push({
    kind: 'EXEC_IDEA',
    label: 'cook food batch',
    ideaId: 'COOK_FOOD',
  })
  if (!isNearHome(a)) {
    steps.push({
      kind: 'MOVE_TO',
      label: `return home ${a.homeCell.x},${a.homeCell.y}`,
      x: a.homeCell.x,
      y: a.homeCell.y,
    })
  }
  steps.push({ kind: 'DEPOSIT_HOME', label: 'store cooked food' })

  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'COOK_AND_STORE', steps }
}

export function createToolReadinessPlan(
  a: PlanningAgent,
  _world: PlanningWorld,
): AgentPlan | null {
  const missingSpade =
    a.ideas.has('MAKE_SPADE') && (a.inventory.spade ?? 0) <= 0
  const missingAxe = a.ideas.has('MAKE_AXE') && (a.inventory.axe ?? 0) <= 0
  const missingPick =
    a.ideas.has('MAKE_PICKAXE') && (a.inventory.pick ?? 0) <= 0
  if (!missingSpade && !missingAxe && !missingPick) return null

  let toolIdeaId: string = ''
  if (missingSpade) toolIdeaId = 'MAKE_SPADE'
  else if (missingAxe) toolIdeaId = 'MAKE_AXE'
  else toolIdeaId = 'MAKE_PICKAXE'

  const steps: PlanStep[] = []
  if (a.inventory.wood < CFG.TOOL_WOOD && a.ideas.has('CHOP_WOOD')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather wood for tool crafting',
      ideaId: 'CHOP_WOOD',
      resource: 'wood',
      targetTotal: CFG.TOOL_WOOD,
      includeHomeInventory: false,
    })
  }
  if (a.inventory.metal < CFG.TOOL_METAL && a.ideas.has('DIG_METAL')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather metal for tool crafting',
      ideaId: 'DIG_METAL',
      resource: 'metal',
      targetTotal: CFG.TOOL_METAL,
      includeHomeInventory: false,
    })
  }
  steps.push({
    kind: 'EXEC_IDEA',
    label: `craft ${toolIdeaId.toLowerCase()}`,
    ideaId: toolIdeaId,
  })

  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'TOOL_READINESS', steps }
}

export function createTradeRebalancePlan(
  a: PlanningAgent,
  world: PlanningWorld,
): AgentPlan | null {
  if (!a.ideas.has('TRADE')) return null
  if ((a.values?.social ?? 0) < 0.25) return null
  if (!world.agentsNear) return null

  const nearbyPartners = world
    .agentsNear(a.x, a.y, CFG.TRADE_RANGE)
    .filter((b) => b.id !== a.id && b.ideas.has('TRADE'))
  if (nearbyPartners.length === 0) return null

  const inv = a.inventory
  const high = Math.max(inv.sugar, inv.wood, inv.metal, inv.cooked)
  const low = Math.min(inv.sugar, inv.wood, inv.metal, inv.cooked)
  if (high - low < 3) return null

  const steps: PlanStep[] = [
    { kind: 'EXEC_IDEA', label: 'trade with nearby agent', ideaId: 'TRADE' },
    { kind: 'EXEC_IDEA', label: 'trade with nearby agent', ideaId: 'TRADE' },
  ]
  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'TRADE_REBALANCE', steps }
}

export function createRecoveryBufferPlan(
  a: PlanningAgent,
  _world: PlanningWorld,
): AgentPlan | null {
  const needsSugar = a.inventory.sugar < 3
  const needsWood = a.inventory.wood < 2
  const needsMetal = a.inventory.metal < 1
  if (!needsSugar && !needsWood && !needsMetal) return null
  if (a.needs.hunger > 0.7) return null

  const steps: PlanStep[] = []
  if (needsSugar && a.ideas.has('HARVEST_SUGAR')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'rebuild sugar buffer',
      ideaId: 'HARVEST_SUGAR',
      resource: 'sugar',
      targetTotal: 3,
      includeHomeInventory: false,
    })
  }
  if (needsWood && a.ideas.has('CHOP_WOOD')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'rebuild wood buffer',
      ideaId: 'CHOP_WOOD',
      resource: 'wood',
      targetTotal: 2,
      includeHomeInventory: false,
    })
  }
  if (needsMetal && a.ideas.has('DIG_METAL')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'rebuild metal buffer',
      ideaId: 'DIG_METAL',
      resource: 'metal',
      targetTotal: 1,
      includeHomeInventory: false,
    })
  }

  if (steps.length === 0 || !canFormPlanWithKnownIdeas(a.ideas, steps))
    return null
  return { name: 'RECOVERY_BUFFER', steps }
}

export function createHouseUpgradePlan(
  a: PlanningAgent,
  _world: PlanningWorld,
): AgentPlan | null {
  if (!a.ideas.has('BUILD_HOUSE')) return null
  if (a.homeCell) return null

  const steps: PlanStep[] = []
  if (a.inventory.wood < CFG.HOUSE_WOOD && a.ideas.has('CHOP_WOOD')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather wood for house',
      ideaId: 'CHOP_WOOD',
      resource: 'wood',
      targetTotal: CFG.HOUSE_WOOD,
      includeHomeInventory: false,
    })
  }
  if (a.inventory.rock < CFG.HOUSE_ROCK && a.ideas.has('QUARRY_ROCK')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'gather rock for house foundation',
      ideaId: 'QUARRY_ROCK',
      resource: 'rock',
      targetTotal: CFG.HOUSE_ROCK,
      includeHomeInventory: false,
    })
  }
  steps.push({
    kind: 'EXEC_IDEA',
    label: 'attempt house construction',
    ideaId: 'BUILD_HOUSE',
  })

  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'HOUSE_UPGRADE', steps }
}

export function createParentingProvisionPlan(
  a: PlanningAgent,
  world: PlanningWorld,
): AgentPlan | null {
  if (!a.homeCell || !hasCompleteHome(a, world) || !world.agentsNear)
    return null

  const dependents = world
    .agentsNear(a.x, a.y, CFG.GRID_W + CFG.GRID_H)
    .filter(
      (b) =>
        b.alive !== false &&
        b.phase === 'toddler' &&
        Array.isArray(b.parentIds) &&
        b.parentIds.includes(a.id),
    )
  if (dependents.length === 0) return null

  const totalSugar = resourceTotal(a, world, 'sugar', true)
  const home = world.cell(a.homeCell.x, a.homeCell.y)
  const totalCooked = a.inventory.cooked + (home.building?.inv?.cooked ?? 0)
  if (totalSugar >= 10 && totalCooked >= 4) return null

  const steps: PlanStep[] = []
  if (totalSugar < 10 && a.ideas.has('HARVEST_SUGAR')) {
    steps.push({
      kind: 'GATHER_UNTIL',
      label: 'provision sugar for dependents',
      ideaId: 'HARVEST_SUGAR',
      resource: 'sugar',
      targetTotal: 10,
      includeHomeInventory: true,
    })
  }
  if (totalCooked < 4 && a.ideas.has('COOK_FOOD')) {
    if (a.inventory.sugar < CFG.COOK_SUGAR && a.ideas.has('HARVEST_SUGAR')) {
      steps.push({
        kind: 'GATHER_UNTIL',
        label: 'gather sugar for family cooking',
        ideaId: 'HARVEST_SUGAR',
        resource: 'sugar',
        targetTotal: CFG.COOK_SUGAR,
        includeHomeInventory: false,
      })
    }
    if (a.inventory.wood < CFG.COOK_WOOD && a.ideas.has('CHOP_WOOD')) {
      steps.push({
        kind: 'GATHER_UNTIL',
        label: 'gather wood for family cooking',
        ideaId: 'CHOP_WOOD',
        resource: 'wood',
        targetTotal: CFG.COOK_WOOD,
        includeHomeInventory: false,
      })
    }
    steps.push({
      kind: 'EXEC_IDEA',
      label: 'cook family food',
      ideaId: 'COOK_FOOD',
    })
  }

  if (!isNearHome(a)) {
    steps.push({
      kind: 'MOVE_TO',
      label: `return home ${a.homeCell.x},${a.homeCell.y}`,
      x: a.homeCell.x,
      y: a.homeCell.y,
    })
  }
  steps.push({ kind: 'DEPOSIT_HOME', label: 'deposit family provisions' })

  if (!canFormPlanWithKnownIdeas(a.ideas, steps)) return null
  return { name: 'PARENTING_PROVISION', steps }
}
