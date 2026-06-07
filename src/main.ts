import {
  closeHouseModal,
  closeModal,
  getCanvasCell,
  initGUI,
  isRunning,
  modInv,
  openHouseModal,
  openModal,
  pause,
  play,
  renderIdeasRegistry,
  renderPlanRegistry,
  setTickMs,
  step,
  toggleIdea,
  updateUI,
} from './gui.ts'
import { Renderer } from './Renderer'
import { Simulation } from './Simulation'
import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<div id="sidebar">
  <div id="title-block">
    <h1>FRITTMARK</h1>
    <sub>FREE MARKET EMERGENCE SIM</sub>
    <div id="tick-badge">tick 0</div>
  </div>

  <div class="panel">
    <div class="panel-title">Controls</div>
    <div class="btn-row">
      <button class="btn on" id="btn-play">▶ Play</button>
      <button class="btn" id="btn-pause">⏸ Pause</button>
      <button class="btn" id="btn-step">⏭ Step</button>
    </div>
    <div class="slider-wrap">
      <div class="slider-labels"><span>Tick speed</span><span id="speed-val">1000ms</span></div>
      <input type="range" id="speed-slider" min="1" max="1000" value="1" step="1">
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Population</div>
    <div class="stat-grid">
      <span class="sk">Alive</span><span class="sv" id="s-pop">—</span>
      <span class="sk">Gini</span><span class="sv" id="s-gini">—</span>
      <span class="sk">Births</span><span class="sv" id="s-births">—</span>
      <span class="sk">Deaths</span><span class="sv" id="s-deaths">—</span>
      <span class="sk">Shelters</span><span class="sv" id="s-shelters">—</span>
      <span class="sk">Houses</span><span class="sv" id="s-houses">—</span>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Inventory (all agents)</div>
    <div class="stat-grid">
      <span class="sk">Sugar</span><span class="sv" id="s-sugar">—</span>
      <span class="sk">Wood</span><span class="sv" id="s-wood">—</span>
      <span class="sk">Metal</span><span class="sv" id="s-metal">—</span>
      <span class="sk">Cooked</span><span class="sv" id="s-cooked">—</span>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title clickable" id="ideas-toggle">
      <span>Idea Registry</span><span id="ideas-arrow">▸</span>
    </div>
    <div id="ideas-panel"></div>
  </div>

  <div class="panel">
    <div class="panel-title clickable" id="plans-toggle">
      <span>Plan Registry</span><span id="plans-arrow">▸</span>
    </div>
    <div id="plans-panel"></div>
  </div>

  <div class="panel">
    <div class="panel-title">Legend</div>
    <div class="legend">
      <div class="legend-row"><div class="sw legend-sugar"></div>Sugar</div>
      <div class="legend-row"><div class="sw legend-wood"></div>Wood</div>
      <div class="legend-row"><div class="sw legend-metal"></div>Metal</div>
      <div class="legend-row"><div class="sw legend-rock"></div>Rock</div>
      <div class="legend-row"><div class="sw legend-path"></div>Stone path</div>
      <div class="legend-row"><div class="sw legend-adult"></div>Adult agent</div>
      <div class="legend-row"><div class="sw legend-nav"></div>Navigating agent</div>
      <div class="legend-row"><div class="sw legend-young"></div>Toddler / Child</div>
      <div class="legend-row"><div class="sw legend-shelter"></div>Shelter</div>
      <div class="legend-row"><div class="sw legend-house"></div>House</div>
      <div class="legend-row legend-note">Pause → click agent or house to inspect</div>
    </div>
  </div>
</div>

<div id="canvas-wrap">
  <canvas id="world-canvas"></canvas>
</div>

<div id="modal">
  <div id="modal-box">
    <div id="modal-head">
      <span id="m-agent-title">AGENT #—</span>
      <div class="m-head-right">
        <span class="m-phase-badge phase-adult" id="m-phase-badge">adult</span>
        <button id="modal-close">✕</button>
      </div>
    </div>
    <div id="modal-body">
      <div class="m-sec"><div class="m-sec-title">Status</div><div class="m-kv-grid" id="m-status"></div></div>
      <div class="m-sec"><div class="m-sec-title">Values</div><div id="m-values"></div></div>
      <div class="m-sec"><div class="m-sec-title">Morals</div><div id="m-morals"></div></div>
      <div class="m-sec">
        <div class="m-sec-title">Inventory <span class="m-inline-note">(click − / + to modify)</span></div>
        <div id="m-inventory"></div>
      </div>
      <div class="m-sec">
        <div class="m-sec-title">Ideas <span id="m-idea-count" class="m-idea-count"></span></div>
        <div id="m-ideas"></div>
      </div>
    </div>
  </div>
</div>

<div id="house-modal">
  <div id="house-modal-box">
    <div id="house-modal-head">
      <span id="h-house-title">HOUSE</span>
      <button id="house-modal-close">✕</button>
    </div>
    <div id="house-modal-body">
      <div class="m-sec"><div class="m-sec-title">Status</div><div class="m-kv-grid" id="h-house-status"></div></div>
      <div class="m-sec"><div class="m-sec-title">Inventory</div><div id="h-inventory"></div></div>
      <div class="m-sec"><div class="m-sec-title">Residents (click to inspect)</div><div id="h-residents"></div></div>
    </div>
  </div>
</div>
`

// ================================================================
//   8. GUI
// ================================================================

// ---- Bootstrap ----

window.addEventListener('DOMContentLoaded', () => {
  const sim = new Simulation()
  const canvas = document.getElementById(
    'world-canvas',
  ) as HTMLCanvasElement | null
  if (!canvas) throw new Error('Missing #world-canvas')
  const renderer = new Renderer(canvas, sim.world)
  initGUI(sim, renderer)
  renderer.draw()
  updateUI()

  const btnPlay = document.getElementById('btn-play')
  const btnPause = document.getElementById('btn-pause')
  const btnStep = document.getElementById('btn-step')
  if (!btnPlay || !btnPause || !btnStep) {
    throw new Error('Missing control buttons')
  }

  btnPlay.addEventListener('click', play)
  btnPause.addEventListener('click', pause)
  btnStep.addEventListener('click', step)

  const sl = document.getElementById('speed-slider') as HTMLInputElement | null
  const speedVal = document.getElementById('speed-val')
  if (!sl || !speedVal) throw new Error('Missing speed controls')
  sl.addEventListener('input', () => {
    const tickMs = Number(sl.value)
    setTickMs(tickMs)
    speedVal.textContent = `${tickMs}ms`
  })

  const ideasToggle = document.getElementById('ideas-toggle')
  if (!ideasToggle) throw new Error('Missing #ideas-toggle')
  ideasToggle.addEventListener('click', () => {
    const p = document.getElementById('ideas-panel')
    const a = document.getElementById('ideas-arrow')
    if (!p || !a) return
    const open = p.style.display === 'none'
    p.style.display = open ? 'block' : 'none'
    a.textContent = open ? '▾' : '▸'
    if (open) renderIdeasRegistry()
  })

  const plansToggle = document.getElementById('plans-toggle')
  if (!plansToggle) throw new Error('Missing #plans-toggle')
  plansToggle.addEventListener('click', () => {
    const p = document.getElementById('plans-panel')
    const a = document.getElementById('plans-arrow')
    if (!p || !a) return
    const open = p.style.display === 'none'
    p.style.display = open ? 'block' : 'none'
    a.textContent = open ? '▾' : '▸'
    if (open) renderPlanRegistry()
  })

  const modalClose = document.getElementById('modal-close')
  const modal = document.getElementById('modal')
  const houseModalClose = document.getElementById('house-modal-close')
  const houseModal = document.getElementById('house-modal')
  if (!modalClose || !modal || !houseModalClose || !houseModal) {
    throw new Error('Missing modal elements')
  }
  modalClose.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
  houseModalClose.addEventListener('click', closeHouseModal)
  houseModal.addEventListener('click', (e) => {
    if (e.target === houseModal) closeHouseModal()
  })

  canvas.addEventListener('click', (e) => {
    if (isRunning()) return
    const { x, y } = getCanvasCell(canvas, e)
    if (!sim.world.inBounds(x, y)) return
    const cell = sim.world.cell(x, y)
    if (cell.building) {
      openHouseModal(x, y)
      return
    }

    const here = sim.world.agentsAt(x, y)
    if (here.length > 0) {
      openModal(here[0])
    }
  })

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasCell(canvas, e)
    if (!sim.world.inBounds(x, y)) {
      canvas.title = 'Out of bounds'
      if (isRunning()) {
        canvas.style.cursor = 'default'
        return
      }
      canvas.style.cursor = 'crosshair'
      return
    }

    const cell = sim.world.cell(x, y)
    const totalResource = cell.sugar + cell.wood + cell.metal + cell.rock
    let status = `Cell (${x}, ${y})\nType: empty`

    if (cell.building) {
      const b = cell.building
      const progress = `${b.progress}/${b.progressMax}`
      status = `Cell (${x}, ${y})\nType: ${b.type}${b.complete ? '' : ' (under construction)'}\nProgress: ${progress}\nInventory: sugar ${Math.floor(b.inv.sugar)}, wood ${Math.floor(b.inv.wood)}, metal ${Math.floor(b.inv.metal)}, cooked ${Math.floor(b.inv.cooked)}`
    } else if (cell.path) {
      status = `Cell (${x}, ${y})\nType: stone path`
    } else if (totalResource > 0) {
      const dominant =
        cell.sugar >= cell.wood &&
        cell.sugar >= cell.metal &&
        cell.sugar >= cell.rock
          ? 'sugar'
          : cell.wood >= cell.metal && cell.wood >= cell.rock
            ? 'wood'
            : cell.metal >= cell.rock
              ? 'metal'
              : 'rock'
      const dominantAmount =
        dominant === 'sugar'
          ? cell.sugar
          : dominant === 'wood'
            ? cell.wood
            : dominant === 'metal'
              ? cell.metal
              : cell.rock
      status = `Cell (${x}, ${y})\nType: resource (${dominant})\nAmount: ${dominantAmount.toFixed(1)}\nSugar: ${cell.sugar.toFixed(1)}, Wood: ${cell.wood.toFixed(1)}, Metal: ${cell.metal.toFixed(1)}, Rock: ${cell.rock.toFixed(1)}`
    }

    canvas.title = status

    if (isRunning()) {
      canvas.style.cursor = 'default'
      return
    }

    const hasBuilding = Boolean(sim.world.cell(x, y).building)
    const hasAgent = sim.world.agentsAt(x, y).length > 0
    canvas.style.cursor = hasBuilding || hasAgent ? 'pointer' : 'crosshair'
  })

  play()
})

Object.assign(window as Window & typeof globalThis, { modInv, toggleIdea })
