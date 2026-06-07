import type { Agent } from './Agent'
import { CFG } from './config'
import { ALL_IDEA_KEYS, IDEAS, hasPrereqs, type IdeaId } from './ideas'
import { PLAN_REGISTRY, type PlanName } from './planning'
import type { Renderer } from './Renderer'
import type { Simulation } from './Simulation'
import { grantIdea, totalWealth } from './utils'

let sim: Simulation | null = null
let renderer: Renderer | null = null
let running = false
let tickMs = CFG.DEFAULT_TICK_MS
let loop: ReturnType<typeof setTimeout> | null = null
let modalAgent: Agent | null = null
let modalHouse: { x: number; y: number } | null = null

function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing required element #${id}`)
  return el as T
}

function ensureState(): { sim: Simulation; renderer: Renderer } {
  if (!sim || !renderer) {
    throw new Error('GUI not initialized. Call initGUI(sim, renderer) first.')
  }
  return { sim, renderer }
}

export function initGUI(nextSim: Simulation, nextRenderer: Renderer): void {
  sim = nextSim
  renderer = nextRenderer
}

export function setTickMs(nextTickMs: number): void {
  tickMs = nextTickMs
}

export function isRunning(): boolean {
  return running
}

function doTick(): void {
  if (!running) return
  const { sim, renderer } = ensureState()
  const t0 = performance.now()
  sim.step()
  renderer.draw()
  updateUI()
  loop = setTimeout(doTick, Math.max(0, tickMs - (performance.now() - t0)))
}

export function play(): void {
  if (running) return
  running = true
  mustEl<HTMLButtonElement>('btn-play').classList.add('on')
  mustEl<HTMLButtonElement>('btn-pause').classList.remove('on')
  doTick()
}

export function pause(): void {
  running = false
  if (loop) clearTimeout(loop)
  loop = null
  mustEl<HTMLButtonElement>('btn-pause').classList.add('on')
  mustEl<HTMLButtonElement>('btn-play').classList.remove('on')
}

export function step(): void {
  const { sim, renderer } = ensureState()
  pause()
  sim.step()
  renderer.draw()
  if (modalHouse) renderHouseModal()
  if (modalAgent) renderModal()
  updateUI()
}

export function updateUI(): void {
  const { sim } = ensureState()
  const agents = sim.world.agents
  const cells = sim.world.cells
  mustEl('tick-badge').textContent = `tick ${sim.tickN}`
  mustEl('s-pop').textContent = String(agents.length)
  mustEl('s-gini').textContent = sim.gini().toFixed(3)
  mustEl('s-births').textContent = String(sim.births)
  mustEl('s-deaths').textContent = String(sim.deaths)
  mustEl('s-shelters').textContent = String(
    cells.filter((c) => c.building?.type === 'shelter' && c.building.complete)
      .length,
  )
  mustEl('s-houses').textContent = String(
    cells.filter((c) => c.building?.type === 'house' && c.building.complete)
      .length,
  )

  let sugar = 0
  let wood = 0
  let metal = 0
  let cooked = 0
  for (const a of agents) {
    sugar += a.inventory.sugar
    wood += a.inventory.wood
    metal += a.inventory.metal
    cooked += a.inventory.cooked || 0
  }

  mustEl('s-sugar').textContent = String(Math.floor(sugar))
  mustEl('s-wood').textContent = String(Math.floor(wood))
  mustEl('s-metal').textContent = String(Math.floor(metal))
  mustEl('s-cooked').textContent = String(Math.floor(cooked))

  const panel = mustEl('ideas-panel')
  if (panel.style.display !== 'none') renderIdeasRegistry()
  const plansPanel = mustEl('plans-panel')
  if (plansPanel.style.display !== 'none') renderPlanRegistry()
}

export function renderIdeasRegistry(): void {
  const { sim } = ensureState()
  const agents = sim.world.agents
  const panel = mustEl('ideas-panel')
  panel.innerHTML = ''

  for (const key of ALL_IDEA_KEYS) {
    const idea = IDEAS[key]
    const count = agents.filter((a) => a.ideas.has(key)).length
    const row = document.createElement('div')
    row.className = 'idea-reg-row'
    row.innerHTML = `
      <span class="ireg-tier t${idea.tier}">T${idea.tier}</span>
      <span class="ireg-name" title="${key}">${key.replace(/_/g, ' ').toLowerCase()}</span>
      <span class="ireg-count">${count}</span>
      <button class="ireg-teach" data-idea="${key}">⚡all</button>
    `
    panel.appendChild(row)
  }

  panel.querySelectorAll('.ireg-teach').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ideaId = (btn as HTMLButtonElement).dataset.idea
      if (!ideaId || !(ideaId in IDEAS)) return
      const safeIdeaId = ideaId as IdeaId
      for (const a of sim.world.agents) {
        if (!a.ideas.has(safeIdeaId) && hasPrereqs(a, safeIdeaId)) {
          grantIdea(a, safeIdeaId)
        }
      }
      renderIdeasRegistry()
      if (modalAgent) renderModal()
    })
  })
}

export function renderPlanRegistry(): void {
  const { sim } = ensureState()
  const agents = sim.world.agents
  const panel = mustEl('plans-panel')
  panel.innerHTML = ''

  for (const planName of PLAN_REGISTRY) {
    const count = agents.filter((a) => a.plan?.name === planName).length
    const row = document.createElement('div')
    row.className = 'plan-reg-row'
    row.innerHTML = `
      <span class="preg-name" title="${planName}">${formatPlanName(planName)}</span>
      <span class="preg-count">${count}</span>
    `
    panel.appendChild(row)
  }
}

function formatPlanName(name: PlanName): string {
  return name.replace(/_/g, ' ').toLowerCase()
}

export function openModal(agent: Agent): void {
  modalAgent = agent
  renderModal()
  mustEl('modal').style.display = 'flex'
}

export function openHouseModal(x: number, y: number): void {
  modalHouse = { x, y }
  renderHouseModal()
  mustEl('house-modal').style.display = 'flex'
}

export function closeModal(): void {
  const { renderer } = ensureState()
  modalAgent = null
  mustEl('modal').style.display = 'none'
  renderer.draw()
  if (modalHouse) renderHouseModal()
}

export function closeHouseModal(): void {
  const { renderer } = ensureState()
  modalHouse = null
  mustEl('house-modal').style.display = 'none'
  renderer.draw()
  if (modalAgent) renderModal()
}

function renderModal(): void {
  const { renderer } = ensureState()
  const a = modalAgent
  if (!a) return

  mustEl('m-agent-title').textContent = `AGENT  #${a.id}`
  const pb = mustEl('m-phase-badge')
  pb.textContent = a.phase
  pb.className = `m-phase-badge phase-${a.phase}`

  const actionStr = a.currentAction
  const planStepsStr = a.plan
    ? a.plan.steps.map((step) => step.label).join(' -> ')
    : 'none'
  const homeStr = a.homeCell ? `(${a.homeCell.x},${a.homeCell.y})` : 'none'

  mustEl('m-status').innerHTML = `
    <span class="m-k">Age</span>          <span class="m-v">${a.age} / ${CFG.MAX_AGE}</span>
    <span class="m-k">Position</span>     <span class="m-v">${a.x}, ${a.y}</span>
    <span class="m-k">Vision</span>       <span class="m-v">${a.vision}</span>
    <span class="m-k">Metabolism</span>   <span class="m-v">${a.metabolism}</span>
    <span class="m-k">Home</span>         <span class="m-v">${homeStr}</span>
    <span class="m-k">Hunger</span>       <span class="m-v">${(a.needs.hunger * 100).toFixed(0)}%</span>
    <span class="m-k">Wealth</span>       <span class="m-v">${totalWealth(a).toFixed(1)}</span>
    <span class="m-k">Memory</span>       <span class="m-v">${a.memory.size} cells</span>
    <span class="m-k">Idle ticks</span>   <span class="m-v">${a.idleTicks}</span>
    <span class="m-k">Action</span>       <span class="m-v nav-indicator">${actionStr}</span>
    <span class="m-k">Plan</span>         <span class="m-v nav-indicator">${planStepsStr}</span>
  `

  mustEl('m-values').innerHTML = Object.entries(a.values)
    .map(([k, v]) => barRow(k, v, 'bar-gold'))
    .join('')
  mustEl('m-morals').innerHTML = Object.entries(a.morals)
    .map(([k, v]) => barRow(k, v, 'bar-teal'))
    .join('')

  const invKeys: Array<[keyof Agent['inventory'], string]> = [
    ['sugar', 'Sugar'],
    ['wood', 'Wood'],
    ['metal', 'Metal'],
    ['cooked', 'Cooked food'],
    ['axe', 'Axe (dur)'],
    ['spade', 'Spade (dur)'],
    ['pick', 'Pickaxe (dur)'],
  ]
  mustEl('m-inventory').innerHTML = invKeys
    .map(
      ([k, label]) => `
    <div class="inv-row">
      <span class="inv-key">${label}</span>
      <span class="inv-val" id="inv-${k}">${a.inventory[k] || 0}</span>
      <span class="inv-spacer"></span>
      <button class="digi-btn" onclick="modInv('${k}',-1)">−</button>
      <button class="digi-btn" onclick="modInv('${k}',+1)">+</button>
    </div>
  `,
    )
    .join('')

  const kn = a.ideas.size
  const tot = ALL_IDEA_KEYS.length
  mustEl('m-idea-count').textContent = `(${kn}/${tot} known)`
  mustEl('m-ideas').innerHTML = ALL_IDEA_KEYS.map((key) => {
    const idea = IDEAS[key]
    const has = a.ideas.has(key)
    const prereq = hasPrereqs(a, key)
    const nameClass = has ? 'idea-have' : 'idea-miss'
    const check = has ? '✓' : prereq ? '○' : '·'
    let btn = ''
    if (has && idea.tier > 0) {
      btn = `<button class="idea-action revoke" onclick="toggleIdea('${key}',false)">remove</button>`
    } else if (!has) {
      btn = `<button class="idea-action grant" onclick="toggleIdea('${key}',true)" ${!prereq ? 'disabled title="Missing: ' + idea.requires.join(', ') + '"' : ''}>grant</button>`
    }
    return `<div class="idea-modal-row">
      <span class="ireg-tier t${idea.tier}">T${idea.tier}</span>
      <span class="idea-modal-name ${nameClass}">${check} ${key.replace(/_/g, ' ').toLowerCase()}</span>
      ${btn}
    </div>`
  }).join('')

  renderer.draw()
  if (a.alive) renderer.highlightCell(a.x, a.y)
}

function renderHouseModal(): void {
  const { sim, renderer } = ensureState()
  if (!modalHouse) return
  const { x, y } = modalHouse

  if (!sim.world.inBounds(x, y)) {
    closeHouseModal()
    return
  }

  const cell = sim.world.cell(x, y)
  const building = cell.building
  if (!building) {
    closeHouseModal()
    return
  }

  const title = `${building.type.toUpperCase()} @ (${x}, ${y})`
  mustEl('h-house-title').textContent = title

  mustEl('h-house-status').innerHTML = `
    <span class="m-k">Type</span>         <span class="m-v">${building.type}</span>
    <span class="m-k">Owner</span>        <span class="m-v">#${building.ownerId}</span>
    <span class="m-k">Progress</span>     <span class="m-v">${building.progress}/${building.progressMax}</span>
    <span class="m-k">Complete</span>     <span class="m-v">${building.complete ? 'yes' : 'no'}</span>
    <span class="m-k">Residents</span>    <span class="m-v">${building.residents.length}/${building.capacity}</span>
  `

  mustEl('h-inventory').innerHTML = `
    <div class="inv-row"><span class="inv-key">Sugar</span><span class="inv-val">${Math.floor(building.inv.sugar)}</span></div>
    <div class="inv-row"><span class="inv-key">Wood</span><span class="inv-val">${Math.floor(building.inv.wood)}</span></div>
    <div class="inv-row"><span class="inv-key">Metal</span><span class="inv-val">${Math.floor(building.inv.metal)}</span></div>
    <div class="inv-row"><span class="inv-key">Cooked food</span><span class="inv-val">${Math.floor(building.inv.cooked)}</span></div>
  `

  const residentsHost = mustEl('h-residents')
  if (building.residents.length === 0) {
    residentsHost.innerHTML = '<div class="m-v">No residents.</div>'
  } else {
    residentsHost.innerHTML = building.residents
      .map((id) => {
        const resident = sim.world.agents.find((a) => a.id === id)
        if (!resident) {
          return `<button class="resident-btn" disabled>Agent #${id} (missing)</button>`
        }
        return `<button class="resident-btn" data-agent-id="${resident.id}">Agent #${resident.id} (${resident.phase})</button>`
      })
      .join('')

    residentsHost
      .querySelectorAll<HTMLButtonElement>('.resident-btn')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const idText = btn.dataset.agentId
          if (!idText) return
          const resident = sim.world.agents.find((a) => a.id === Number(idText))
          if (!resident) return
          openModal(resident)
        })
      })
  }

  renderer.draw()
  renderer.highlightCell(x, y)
}

export function barRow(key: string, val: number, colorClass: string): string {
  const pct = Math.round(val * 100)
  const label = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return `<div class="bar-row">
    <div class="bar-label"><span class="bar-key">${label}</span><span class="bar-num">${pct}%</span></div>
    <div class="bar-track"><div class="bar-fill ${colorClass}" style="width:${pct}%"></div></div>
  </div>`
}

export function modInv(key: keyof Agent['inventory'], delta: number): void {
  if (!modalAgent) return
  modalAgent.inventory[key] = Math.max(
    0,
    (modalAgent.inventory[key] || 0) + delta,
  )
  mustEl(`inv-${key}`).textContent = String(modalAgent.inventory[key])
}

export function toggleIdea(ideaId: string, grant: boolean): void {
  if (!modalAgent || !(ideaId in IDEAS)) return
  const safeIdeaId = ideaId as IdeaId
  if (grant) {
    if (hasPrereqs(modalAgent, safeIdeaId)) grantIdea(modalAgent, safeIdeaId)
  } else {
    modalAgent.ideas.delete(safeIdeaId)
  }
  renderModal()
}

export function getCanvasCell(
  canvas: HTMLCanvasElement,
  e: MouseEvent,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.floor(
      ((e.clientX - rect.left) * (canvas.width / rect.width)) / CFG.CELL_PX,
    ),
    y: Math.floor(
      ((e.clientY - rect.top) * (canvas.height / rect.height)) / CFG.CELL_PX,
    ),
  }
}
