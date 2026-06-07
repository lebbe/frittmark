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
    w.regenerate()
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
          a.inventory.sugar >= CFG.REPRO_MIN_SUGAR,
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
              b.inventory.sugar >= CFG.REPRO_MIN_SUGAR,
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
