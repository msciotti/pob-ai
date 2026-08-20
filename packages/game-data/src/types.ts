// ─────────────────────────────────────────────────────────────────────────────
// RePoE data shapes
//
// These interfaces model only the fields poe-ai actually consumes. They were
// derived by inspecting real repoe-fork exports (patch 3.29.3.1.4), not
// guessed -- see scripts/download-repoe.js for provenance. RePoE's raw JSON
// has more fields than modeled here (e.g. per-item-class `properties`);
// extend as new consumers need them.
// ─────────────────────────────────────────────────────────────────────────────

/** A tag + weight pair, used in `spawn_weights` and `generation_weights`. */
export interface RePoESpawnWeight {
  tag: string;
  weight: number;
}

export interface RePoEModStat {
  id: string;
  min: number;
  max: number;
}

export interface RePoEGrantedEffect {
  granted_effect_id: string;
  level: number;
}

/** A single entry in mods.min.json, keyed by mod id (e.g. "Strength1"). */
export interface RePoEMod {
  name: string;
  type: string;
  domain: string;
  generation_type: string;
  required_level: number;
  groups: string[];
  implicit_tags: string[];
  adds_tags: string[];
  is_essence_only: boolean;
  text: string;
  stats: RePoEModStat[];
  /** Per-item-class-tag spawn weight; first matching tag wins (RePoE convention). */
  spawn_weights: RePoESpawnWeight[];
  generation_weights: RePoESpawnWeight[];
  grants_effects: RePoEGrantedEffect[];
}

/** mods.min.json: mod id -> mod definition. */
export type RePoEMods = Record<string, RePoEMod>;

/** A single entry in mod_types.min.json, keyed by mod type name. */
export interface RePoEModType {
  sell_price_types: string[];
}

/** mod_types.min.json: mod type name -> mod type metadata. */
export type RePoEModTypes = Record<string, RePoEModType>;

/** tags.min.json: a flat list of every tag string used across spawn_weights. */
export type RePoETags = string[];

export interface RePoEFossil {
  name: string;
  added_mods: string[];
  allowed_tags: string[];
  forbidden_tags: string[];
  forced_mods: string[];
  /** Tags whose mod spawn weight this fossil zeroes/reduces on the item. */
  negative_mod_weights: RePoESpawnWeight[];
  /** Tags whose mod spawn weight this fossil boosts on the item. */
  positive_mod_weights: RePoESpawnWeight[];
  descriptions: Record<string, string>;
  blocked_descriptions: Record<string, string>;
  changes_quality: boolean;
  corrupted_essence_chance: number;
  mirrors: boolean;
  rolls_lucky: boolean;
  rolls_white_sockets: boolean;
  sell_price_mods: string[];
}

/** fossils.min.json: currency item metadata id -> fossil definition. */
export type RePoEFossils = Record<string, RePoEFossil>;

export interface RePoEEssenceType {
  is_corruption_only: boolean;
  tier: number;
}

export interface RePoEEssence {
  name: string;
  level: number;
  item_level_restriction: number;
  spawn_level_min: number;
  /** Item class display name (e.g. "Body Armour") -> mod id granted on that class. */
  mods: Record<string, string>;
  type: RePoEEssenceType;
}

/** essences.min.json: currency item metadata id -> essence definition. */
export type RePoEEssences = Record<string, RePoEEssence>;

export interface RePoEBaseItemVisualIdentity {
  dds_file: string;
  id: string;
}

export interface RePoEBaseItem {
  name: string;
  /** Key into item_classes.min.json, e.g. "Ring". */
  item_class: string;
  domain: string;
  drop_level: number;
  inventory_width: number;
  inventory_height: number;
  /** Tags used to resolve which mods can spawn on this base (see RePoEMod.spawn_weights). */
  tags: string[];
  /** Mod ids always granted as implicits on this base. */
  implicits: string[];
  inherits_from: string;
  release_state: string;
  /** Item-class-specific properties (weapon damage, armour values, etc.) -- not modeled in detail. */
  properties: Record<string, unknown>;
  visual_identity: RePoEBaseItemVisualIdentity;
}

/** base_items.min.json: item metadata id -> base item definition. */
export type RePoEBaseItems = Record<string, RePoEBaseItem>;

export interface RePoEItemClass {
  name: string;
  category: string;
  category_id: string;
  /** Present on classes that can roll influence-specific mods. */
  influence_tags?: string[];
}

/** item_classes.min.json: item class id (e.g. "Ring") -> item class definition. */
export type RePoEItemClasses = Record<string, RePoEItemClass>;

export interface RePoECraftingBenchOption {
  bench_tier: number;
  master: string;
  item_classes: string[];
  /** Currency item metadata id -> quantity required. */
  cost: Record<string, number>;
  /** The effect this bench option applies, e.g. { add_explicit_mod: "ModId" }. */
  actions: Record<string, unknown>;
}

/** crafting_bench_options.min.json: a flat array of bench craft options. */
export type RePoECraftingBenchOptions = RePoECraftingBenchOption[];
