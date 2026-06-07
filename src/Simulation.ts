// ================================================================
//   6. SIMULATION
// ================================================================

import { CFG } from './config'
import { totalWealth } from './utils'
import { World } from './World'

export class Simulation {
  world: World
  tickN: number
  births: number
  deaths: number

  constructor() {
    this.world = new World()
    this.tickN = 0
    this.births = 0
    this.deaths = 0
    for (let i = 0; i < CFG.INITIAL_AGENTS; i++) this.world.spawn()
  }

  step() {
    this.tickN++
    const w = this.world
    const getCompletedHomeFood = (a: (typeof w.agents)[number]) => {
      if (!a.homeCell) return { sugar: 0, cooked: 0 }
      const c = w.cell(a.homeCell.x, a.homeCell.y)
      if (!c.building || !c.building.complete || !c.building.inv) {
        return { sugar: 0, cooked: 0 }
      }
      return {
        sugar: c.building.inv.sugar,
        cooked: c.building.inv.cooked,
      }
    }
    const hasReproFood = (a: (typeof w.agents)[number]) => {
      const homeFood = getCompletedHomeFood(a)
      const carriedEquivalent = a.inventory.sugar + a.inventory.cooked * 2
      const homeEquivalent = homeFood.sugar + homeFood.cooked * 2
      return carriedEquivalent + homeEquivalent >= CFG.REPRO_MIN_SUGAR
    }
    const nearCompletedShelter = (a: (typeof w.agents)[number]) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = a.x + dx
          const y = a.y + dy
          if (!w.inBounds(x, y)) continue
          const c = w.cell(x, y)
          if (
            c.building &&
            c.building.complete &&
            c.building.type === 'shelter'
          ) {
            return true
          }
        }
      }
      return false
    }
    w.regenerate()
    for (const c of w.cells) {
      if (!c.building || !c.building.complete || !c.building.inv) continue
      if (
        c.building.inv.sugar > 0 &&
        Math.random() < CFG.STORED_SUGAR_SPOIL_CHANCE
      ) {
        c.building.inv.sugar--
      }
      if (
        c.building.inv.cooked > 0 &&
        Math.random() < CFG.STORED_COOKED_SPOIL_CHANCE
      ) {
        c.building.inv.cooked--
      }
    }
    for (const a of w.agents) a.tick(w)

    // Reap dead
    for (const a of w.agents.filter((a) => !a.alive)) {
      this.deaths++
      if (a.homeCell) {
        const c = w.cell(a.homeCell.x, a.homeCell.y)
        if (c.building)
          c.building.residents = c.building.residents.filter(
            (id) => id !== a.id,
          )
      }
      w.remove(a)
    }

    // Reproduce
    if (w.agents.length < CFG.POP_CAP) {
      const eligible = w.agents.filter(
        (a) =>
          a.phase === 'adult' &&
          a.reproCooldown === 0 &&
          hasReproFood(a) &&
          nearCompletedShelter(a),
      )
      for (const a of eligible) {
        if (a.reproCooldown > 0) continue
        const p = w
          .agentsNear(a.x, a.y, 1)
          .find(
            (b) =>
              b !== a &&
              b.phase === 'adult' &&
              b.reproCooldown === 0 &&
              hasReproFood(b) &&
              nearCompletedShelter(b),
          )
        if (p) {
          w.spawn(a, p)
          a.reproCooldown = CFG.REPRO_COOLDOWN
          p.reproCooldown = CFG.REPRO_COOLDOWN
          this.births++
        }
      }
    }
  }

  gini(): number {
    const ws = this.world.agents.map(totalWealth).sort((a, b) => a - b)
    const n = ws.length
    if (!n) return 0
    const sum = ws.reduce((a, b) => a + b, 0)
    if (!sum) return 0
    let num = 0
    for (let i = 0; i < n; i++) num += (2 * (i + 1) - n - 1) * ws[i]
    return Math.max(0, num / (n * sum))
  }
}
