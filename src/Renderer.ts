// ================================================================
//   7. RENDERER
// ================================================================

import { CFG } from './config'
import { getRouteType } from './paths'

type RenderAgent = {
  x: number
  y: number
  plan: { name: string; steps: unknown[] } | null
  phase: 'toddler' | 'child' | 'youth' | 'adult'
}

type RenderCell = {
  sugar: number
  wood: number
  metal: number
  rock: number
  path: boolean
  routeType?: 'none' | 'dirt_path' | 'stone_road'
  building: {
    type: 'shelter' | 'house'
    complete: boolean
    progress: number
    progressMax: number
  } | null
}

type RenderWorld = {
  W: number
  H: number
  agents: RenderAgent[]
  cell(x: number, y: number): RenderCell
}

const BG = [13, 13, 13]
const SUGAR = [200, 160, 30]
const WOOD = [50, 105, 60]
const METAL = [75, 115, 140]
const ROCK = [110, 110, 110]
const DIRT_PATH = [145, 110, 72]
const PATH = [150, 150, 150]

function blendRGB(rgb: number[], t: number): string {
  return `rgb(${Math.round(BG[0] + (rgb[0] - BG[0]) * t)},${Math.round(BG[1] + (rgb[1] - BG[1]) * t)},${Math.round(BG[2] + (rgb[2] - BG[2]) * t)})`
}

export class Renderer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  world: RenderWorld
  px: number

  constructor(canvas: HTMLCanvasElement, world: RenderWorld) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
    this.world = world
    this.px = CFG.CELL_PX
    canvas.width = world.W * this.px
    canvas.height = world.H * this.px
  }

  draw() {
    const { ctx, world, px } = this
    const W = world.W,
      H = world.H

    const aMap = new Map()
    for (const a of world.agents) {
      const k = a.y * W + a.x
      if (!aMap.has(k)) aMap.set(k, [])
      aMap.get(k).push(a)
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = world.cell(x, y)
        const dx = x * px,
          dy = y * px

        if (c.building) {
          ctx.fillStyle = c.building.type === 'house' ? '#140800' : '#1a0d00'
          ctx.fillRect(dx, dy, px, px)
          ctx.strokeStyle = c.building.complete
            ? c.building.type === 'house'
              ? '#ff9030'
              : '#7a3515'
            : '#333'
          ctx.lineWidth = 1
          ctx.strokeRect(dx + 0.5, dy + 0.5, px - 1, px - 1)
          if (!c.building.complete) {
            const pct = c.building.progress / c.building.progressMax
            ctx.fillStyle = '#252525'
            ctx.fillRect(dx + 1, dy + px - 3, px - 2, 2)
            ctx.fillStyle = '#888'
            ctx.fillRect(dx + 1, dy + px - 3, Math.round((px - 2) * pct), 2)
          }
        } else {
          const routeType = getRouteType(c)
          let col
          if (routeType === 'stone_road') col = blendRGB(PATH, 0.85)
          else if (routeType === 'dirt_path') col = blendRGB(DIRT_PATH, 0.78)
          else if (
            c.sugar >= c.wood &&
            c.sugar >= c.metal &&
            c.sugar >= c.rock &&
            c.sugar > 0.4
          )
            col = blendRGB(SUGAR, c.sugar / CFG.SUGAR_MAX)
          else if (c.wood >= c.metal && c.wood >= c.rock && c.wood > 0.4)
            col = blendRGB(WOOD, c.wood / CFG.WOOD_MAX)
          else if (c.metal >= c.rock && c.metal > 0.4)
            col = blendRGB(METAL, c.metal / CFG.METAL_MAX)
          else if (c.rock > 0.4) col = blendRGB(ROCK, c.rock / CFG.ROCK_MAX)
          else col = `rgb(${BG[0]},${BG[1]},${BG[2]})`
          ctx.fillStyle = col
          ctx.fillRect(dx, dy, px, px)
        }

        const here = aMap.get(y * W + x)
        if (here) {
          const a = here[0]
          // Agents currently executing a plan are shown in blue, others by phase
          ctx.fillStyle = a.plan
            ? '#44aaff'
            : a.phase === 'adult'
              ? '#ff4040'
              : a.phase === 'youth'
                ? '#ff8840'
                : a.phase === 'child'
                  ? '#ffcc66'
                  : '#ffee99'
          const d = Math.max(2, px - 3),
            o = Math.floor((px - d) / 2)
          ctx.fillRect(dx + o, dy + o, d, d)
          if (here.length > 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)'
            ctx.font = `${Math.max(4, px - 3)}px monospace`
            ctx.fillText(
              here.length > 9 ? '+' : here.length,
              dx + 1,
              dy + px - 1,
            )
          }
        }
      }
    }
  }

  highlightCell(x: number, y: number): void {
    this.ctx.strokeStyle = '#ffffff'
    this.ctx.lineWidth = 1.5
    this.ctx.strokeRect(
      x * this.px + 1,
      y * this.px + 1,
      this.px - 2,
      this.px - 2,
    )
  }
}
