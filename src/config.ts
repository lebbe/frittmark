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
  POP_CAP: 4000,
  HUNGER_PER_TICK: 0.035,
  HUNGER_DEATH: 1.0,
  MAX_AGE: 700,

  VISION_MIN: 1,
  VISION_MAX: 6,
  METABOLISM_MIN: 1,
  METABOLISM_MAX: 4,

  SUGAR_EAT_RESTORE: 0.35,
  COOKED_EAT_RESTORE: 0.8,
  SHELTER_EAT_BONUS: 1.25,
  CARRIED_SUGAR_SPOIL_CHANCE: 0.03,
  CARRIED_COOKED_SPOIL_CHANCE: 0.04,
  SHELTER_CARRIED_SPOIL_MULT: 0.45,
  STORED_SUGAR_SPOIL_CHANCE: 0.01,
  STORED_COOKED_SPOIL_CHANCE: 0.015,
  METAL_CARRY_CAP: 1.5,
  HUNGER_NOFOOD_FORAGE: 0.72,
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

  IDLE_THRESHOLD: 1,
  DISCOVER_CHANCE: 0.08,
  SPREAD_CHANCE: 0.03,
  MEM_SHARE_CHANCE: 0.12, // chance per tick to share memory with nearby agent
  MEM_CAP: 200, // max memory entries per agent

  TRADE_RANGE: 2,
  DEFAULT_TICK_MS: 1,

  // Plan behavior under hunger
  HUNGER_PAUSE_PLAN: 0.6,
  HUNGER_ABORT_PLAN_NOFOOD: 0.72,
  // Low-integrity agents may occasionally drop a plan and re-score ideas.
  PLAN_RECONSIDER_MAX_CHANCE: 0.08,

  // When fed and home is well stocked, agents can pause work and reflect.
  STAY_IDLE_MAX_HUNGER: 0.4,
  STAY_IDLE_PLAN_TICKS: 6,
  STAY_IDLE_DISCOVER_MULT: 2.25,
}
