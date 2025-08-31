export type UUID = string;

/**
 * Gebruikersprofiel
 */
export interface Profile {
  id: UUID;
  display_name: string | null;
  notification_prefs: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Tuin en gebruikers
 */
export interface Garden {
  id: UUID;
  name: string;
  join_code: string;
  created_at: string;
}

export interface GardenUser {
  id: UUID;
  garden_id: UUID;
  user_id: UUID;
  role: "owner" | "member";
  created_at: string;
}

/**
 * Zaad / gewas
 */
export interface Seed {
  id: UUID;
  garden_id: UUID;
  name: string;
  purchase_date: string | null;

  sowing_type: "direct" | "presow" | "both";
  stock_status: "adequate" | "low" | "out";

  // Kleuren in HEX (#rrggbb)
  default_color: string;

  // Duurtijden in weken
  presow_duration_weeks: number;
  grow_duration_weeks: number;
  harvest_duration_weeks: number;

  // Maanden (arrays van 1–12)
  presow_months: number[];
  direct_sow_months: number[];
  plant_months: number[];
  harvest_months: number[];

  created_at?: string;
  updated_at?: string;
}

/**
 * Bedden in de tuin
 */
export interface GardenBed {
  id: UUID;
  garden_id: UUID;
  name: string;
  width_cm: number;
  length_cm: number;
  location_x: number;
  location_y: number;
  is_greenhouse: boolean;
  segments: number; // aantal visuele delen van de bak
  created_at?: string;
  updated_at?: string;
}

/**
 * Planting: geplande teelt
 */
export interface Planting {
  id: UUID;
  seed_id: UUID;
  garden_bed_id: UUID;
  garden_id: UUID;

  planned_sow_date: string | null;
  planned_plant_date: string | null;
  planned_harvest_start: string | null;
  planned_harvest_end: string | null;

  actual_sow_date: string | null;
  actual_plant_date: string | null;
  actual_harvest_start: string | null;
  actual_harvest_end: string | null;

  // Segmenten
  start_segment: number;
  segments_used: number;

  method: "direct" | "presow";
  status: "planned" | "sown" | "planted" | "growing" | "harvesting" | "completed";

  // Kleur in HEX
  color: string;

  created_at?: string;
  updated_at?: string;
}

/**
 * Taken (afgeleid van plantings)
 */
export interface Task {
  id: UUID;
  garden_id: UUID;
  planting_id: UUID;
  type: "sow" | "plant_out" | "harvest_start" | "harvest_end";
  due_date: string;
  status: "pending" | "done" | "skipped";
  assignee_user_id: UUID | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Bezetting view
 */
export interface BedOccupancyWeek {
  garden_bed_id: UUID;
  garden_id: UUID;
  week_start: string; // ISO date
  occupancy_pct: number;
}
