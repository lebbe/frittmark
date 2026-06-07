// ================================================================
//   2. UTILS
// ================================================================

type InventoryLike = {
  sugar?: number
  wood?: number
  metal?: number
  cooked?: number
  axe?: number
  spade?: number
  pick?: number
}

type WealthCarrier = {
  inventory: InventoryLike
}

type IdeaCarrier<IdeaId extends string = string> = {
  ideas: Set<IdeaId>
}

export const rand = (a: number, b: number): number =>
  Math.floor(Math.random() * (b - a + 1)) + a
export const randf = (a: number, b: number): number =>
  Math.random() * (b - a) + a
export const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, v))
export const pick = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const mdist = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.abs(x1 - x2) + Math.abs(y1 - y2)

export function stepToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (tx !== x) return { x: x + Math.sign(tx - x), y }
  if (ty !== y) return { x, y: y + Math.sign(ty - y) }
  return { x, y }
}

export function totalWealth(a: WealthCarrier): number {
  const i = a.inventory
  return (
    (i.sugar || 0) +
    (i.wood || 0) * 2 +
    (i.metal || 0) * 5 +
    (i.cooked || 0) * 1.5 +
    ((i.axe || 0) > 0 ? 4 : 0) +
    ((i.spade || 0) > 0 ? 4 : 0) +
    ((i.pick || 0) > 0 ? 4 : 0)
  )
}

// Centralized idea grant. Auto-grants connected ideas.
export function grantIdea<IdeaId extends string>(
  agent: IdeaCarrier<IdeaId>,
  ideaId: IdeaId,
): void {
  agent.ideas.add(ideaId)
  // Knowing how to cook implicitly means knowing to eat what you cooked
  if (ideaId === ('COOK_FOOD' as IdeaId)) {
    agent.ideas.add('EAT_COOKED' as IdeaId)
  }
}
