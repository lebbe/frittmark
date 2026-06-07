// ================================================================
//   1. CONFIG
// ================================================================

export const CFG = {
  GRID_W: 100,
  GRID_H: 100,
  CELL_PX: 7,

  SUGAR_MAX: 10,
  WOOD_MAX: 8,
  METAL_MAX: 5,
  SUGAR_REGEN: 0.25,
  WOOD_REGEN: 0.08,
  METAL_REGEN: 0.025,

  INITIAL_AGENTS: 80,
  POP_CAP: 400,
  HUNGER_PER_TICK: 0.035,
  HUNGER_DEATH: 1.0,
  MAX_AGE: 700,

  VISION_MIN: 1,
  VISION_MAX: 6,
  METABOLISM_MIN: 1,
  METABOLISM_MAX: 4,

  SUGAR_EAT_RESTORE: 0.35,
  COOKED_EAT_RESTORE: 0.8,
  COOK_SUGAR: 2,
  COOK_WOOD: 1,

  AXE_DUR: 50,
  SPADE_DUR: 50,
  PICK_DUR: 50,
  AXE_BONUS: 2.0,
  SPADE_BONUS: 2.0,
  PICK_BONUS: 2.0,
  TOOL_WOOD: 2,
  TOOL_METAL: 1,

  SHELTER_WOOD: 4,
  SHELTER_BUILD: 6,
  SHELTER_CAP: 3,
  HOUSE_WOOD: 8,
  HOUSE_BUILD: 16,
  HOUSE_CAP: 5,

  REPRO_MIN_SUGAR: 5,
  REPRO_COOLDOWN: 60,
  AGE_TODDLER: 20,
  AGE_CHILD: 60,
  AGE_YOUTH: 120,

  IDLE_THRESHOLD: 5,
  DISCOVER_CHANCE: 0.05,
  SPREAD_CHANCE: 0.03,
  MEM_SHARE_CHANCE: 0.12, // chance per tick to share memory with nearby agent
  MEM_CAP: 200, // max memory entries per agent

  TRADE_RANGE: 2,
  DEFAULT_TICK_MS: 1000,

  // Navigation: abandon navTarget if critically hungry and can eat
  HUNGER_ABANDON_NAV: 0.85,
}
