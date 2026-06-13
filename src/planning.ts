import { CFG } from './config'

export type ResourceType = 'sugar' | 'wood' | 'metal' | 'rock'
// PlanName is now open — planner-owned names plus any idea ID used as a recipe plan
export type PlanName = string
export const PLAN_REGISTRY: PlanName[] = ['NAVIGATE_IDEA', 'SHELTER_STOCKPILE']

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
  path: boolean
  routeType?: 'none' | 'dirt_path' | 'stone_road'
  trailWear?: number
  building: {
    type: 'shelter' | 'house'
    ownerId: number
    residents: number[]
    complete: boolean
    inv?: { sugar: number; wood: number; metal: number; cooked: number }
  } | null
}

type PlanningWorld = {
  inBounds(x: number, y: number): boolean
  cell(x: number, y: number): PlanningCell
}

type PlanningAgent = {
  id: number
  x: number
  y: number
  homeCell: { x: number; y: number } | null
  needs: { hunger: number }
  ideas: Set<string>
  inventory: {
    sugar: number
    wood: number
    metal: number
    rock: number
    cooked: number
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

  if (
    !isNearHome(a) &&
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
