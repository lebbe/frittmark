import { CFG } from './config'
import { stepToward } from './utils'

export type RouteType = 'none' | 'dirt_path' | 'stone_road'

export type PathCellLike = {
  sugar: number
  wood: number
  metal: number
  rock: number
  path: boolean
  routeType?: RouteType
  trailWear?: number
  ticksSinceTraversal?: number
  roadTraversals?: number
  building: unknown | null
}

export type PathWorldLike = {
  inBounds(x: number, y: number): boolean
  cell(x: number, y: number): PathCellLike
}

type Point = { x: number; y: number }

const NEIGHBORS: Array<{ dx: number; dy: number; dist: number }> = [
  { dx: 1, dy: 0, dist: 1 },
  { dx: -1, dy: 0, dist: 1 },
  { dx: 0, dy: 1, dist: 1 },
  { dx: 0, dy: -1, dist: 1 },
  { dx: 1, dy: 1, dist: Math.SQRT2 },
  { dx: 1, dy: -1, dist: Math.SQRT2 },
  { dx: -1, dy: 1, dist: Math.SQRT2 },
  { dx: -1, dy: -1, dist: Math.SQRT2 },
]

function key(x: number, y: number): string {
  return `${x},${y}`
}

function parseKey(value: string): Point {
  const [x, y] = value.split(',').map(Number)
  return { x, y }
}

function dominantTerrainCost(cell: PathCellLike): number {
  const dominant = Math.max(cell.sugar, cell.wood, cell.metal, cell.rock)
  if (dominant <= 0.4) return CFG.MOVE_COST_EMPTY
  if (dominant === cell.rock) return CFG.MOVE_COST_ROCK
  if (dominant === cell.metal) return CFG.MOVE_COST_METAL
  if (dominant === cell.wood) return CFG.MOVE_COST_WOOD
  return CFG.MOVE_COST_SUGAR
}

function heuristic(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = Math.abs(toX - fromX)
  const dy = Math.abs(toY - fromY)
  const d = Math.max(0.05, CFG.MOVE_COST_EMPTY * CFG.MOVE_MULT_STONE_ROAD)
  const d2 = d * Math.SQRT2
  const minD = Math.min(dx, dy)
  return d * (dx + dy) + (d2 - 2 * d) * minD
}

export function getRouteType(cell: PathCellLike): RouteType {
  if (cell.routeType) return cell.routeType
  return cell.path ? 'stone_road' : 'none'
}

export function setRouteType(cell: PathCellLike, routeType: RouteType): void {
  cell.routeType = routeType
  cell.path = routeType === 'stone_road'
}

export function traversalCost(cell: PathCellLike): number {
  if (cell.building) return Number.POSITIVE_INFINITY
  let cost = dominantTerrainCost(cell)
  const routeType = getRouteType(cell)
  if (routeType === 'dirt_path') {
    cost *= CFG.MOVE_MULT_DIRT_PATH
  } else if (routeType === 'stone_road') {
    cost *= CFG.MOVE_MULT_STONE_ROAD
  }
  return Math.max(0.05, cost)
}

export function applyTrailWearOnStep(
  cell: PathCellLike,
  wearDelta = CFG.TRAIL_WEAR_PER_STEP,
): void {
  const routeType = getRouteType(cell)
  cell.ticksSinceTraversal = 0

  if (routeType === 'stone_road') {
    const traversals = (cell.roadTraversals ?? 0) + 1
    cell.roadTraversals = traversals
    if (traversals >= CFG.ROAD_TRAVERSE_TO_PATH_THRESHOLD) {
      setRouteType(cell, 'dirt_path')
      cell.roadTraversals = 0
      cell.trailWear = Math.max(cell.trailWear ?? 0, CFG.TRAIL_CREATE_THRESHOLD)
    }
    return
  }

  const nextWear = (cell.trailWear ?? 0) + Math.max(0, wearDelta)
  cell.trailWear = nextWear
  if (routeType === 'none' && nextWear >= CFG.TRAIL_CREATE_THRESHOLD) {
    setRouteType(cell, 'dirt_path')
  }
}

export function decayTrailWear(cell: PathCellLike): void {
  const routeType = getRouteType(cell)
  cell.ticksSinceTraversal = (cell.ticksSinceTraversal ?? 0) + 1

  if (routeType === 'stone_road') {
    if (cell.ticksSinceTraversal >= CFG.ROAD_UNUSED_TO_PATH_TICKS) {
      setRouteType(cell, 'dirt_path')
      cell.trailWear = Math.max(cell.trailWear ?? 0, CFG.TRAIL_CREATE_THRESHOLD)
      cell.roadTraversals = 0
    }
    return
  }

  if (
    routeType === 'dirt_path' &&
    cell.ticksSinceTraversal >= CFG.PATH_UNUSED_TO_REMOVE_TICKS
  ) {
    setRouteType(cell, 'none')
    cell.trailWear = 0
    return
  }

  const nextWear = Math.max(0, (cell.trailWear ?? 0) - CFG.TRAIL_DECAY_PER_TICK)
  cell.trailWear = nextWear
  if (routeType === 'dirt_path' && nextWear <= CFG.TRAIL_REMOVE_THRESHOLD) {
    setRouteType(cell, 'none')
  }
}

export function findPath(
  world: PathWorldLike,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxNodes = CFG.PATH_MAX_SEARCH_NODES,
): Point[] | null {
  if (!world.inBounds(fromX, fromY) || !world.inBounds(toX, toY)) return null
  if (fromX === toX && fromY === toY) return [{ x: fromX, y: fromY }]
  if (world.cell(toX, toY).building) return null

  const open = new Set<string>([key(fromX, fromY)])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[key(fromX, fromY), 0]])
  const fScore = new Map<string, number>([
    [key(fromX, fromY), heuristic(fromX, fromY, toX, toY)],
  ])

  let visited = 0
  while (open.size > 0 && visited < maxNodes) {
    visited++

    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const candidate of open) {
      const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY
      if (score < best) {
        best = score
        current = candidate
      }
    }
    if (!current) break

    const here = parseKey(current)
    if (here.x === toX && here.y === toY) {
      const path: Point[] = [here]
      let trace = current
      while (cameFrom.has(trace)) {
        trace = cameFrom.get(trace)!
        path.push(parseKey(trace))
      }
      path.reverse()
      return path
    }

    open.delete(current)
    const hereG = gScore.get(current) ?? Number.POSITIVE_INFINITY

    for (const n of NEIGHBORS) {
      const nx = here.x + n.dx
      const ny = here.y + n.dy
      if (!world.inBounds(nx, ny)) continue
      const neighborCell = world.cell(nx, ny)
      if (neighborCell.building) continue

      const neighborKey = key(nx, ny)
      const travel = traversalCost(neighborCell) * n.dist
      const tentativeG = hereG + travel
      if (tentativeG >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        continue
      }

      cameFrom.set(neighborKey, current)
      gScore.set(neighborKey, tentativeG)
      const h = heuristic(nx, ny, toX, toY)
      fScore.set(neighborKey, tentativeG + h)
      open.add(neighborKey)
    }
  }

  return null
}

export function getNextPathStep(
  world: PathWorldLike,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Point {
  const route = findPath(world, fromX, fromY, toX, toY)
  if (route && route.length >= 2) {
    return route[1]
  }
  return stepToward(fromX, fromY, toX, toY)
}
