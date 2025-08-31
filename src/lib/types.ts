export type UUID = string;

/**
 * Profielen (gebruikersinstellingen, notificaties)
 */
export interface Profile {
  id: UUID;
  display_name?: string | null;
  notification_prefs?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Tuin & gebruikers
 */
export interface Garden {
  id: UUID;
  name: string;
  join_code?: string;
  created_at?: string;
}

export interface GardenUser {
  id: UUID;
  garden_id: UUID;
  user_id: UUID;
  role?: "owner" | "member";
  created_at?: string;
}

/**
 * Gewassoorten (lookup)
 */
export interface CropType {
  id: UUID;
  name: string;
  created_at?: string;
}

/**
 * Zaden (voorraad)
 *
 * Let op: veel velden zijn optioneel of null-toelaatbaar zodat forms en selects
 * niet crashen als waarden ontbreken.
 */
export interface Seed {
  id: UUID;
  garden_id: UUID;
  name: string;

  crop_type_id?: UUID | null;
  purchase_date?: string | null;

  stock_status?: "adequate" | "low" | "out";
  stock_quantity?: number | null;

  row_spacing_cm?: number | null;
  plant_spacing_cm?: number | null;
  greenhouse_compatible?: boolean;

  sowing_type?: "direct" | "presow" | "both";

  // Duurtijden (weken)
  presow_duration_weeks?: number | null;
  grow_duration_weeks?: number | null;
  harvest_duration_weeks?: number | null;

  // Maanden (1–12) – in DB vaak integer[]
  presow_months?: number[] | null;
  direct_sow_months?: number[] | null;
  plant_months?: number[] | null;
  harvest_months?: number[] | null;

  notes?: string | null;

  // Kleur (mag je negeren als je geen kleur kiest)
  default_color?: string | null;

  created_at?: string;
  updated_at?: string;
}

/**
 * Tuinbakken
 */
export interface GardenBed {
  id: UUID;
  garden_id: UUID;
  name: string;
  width_cm: number;
  length_cm: number;
  location_x?: number;
  location_y?: number;
  is_greenhouse?: boolean;

  // visuele indeling; in UI verwachten we een getal
  segments: number;

  created_at?: string;
  updated_at?: string;
}

/**
 * Plantings (ingeplande / actuele beplanting)
 */
export interface Planting {
  id: UUID;
  garden_id: UUID;
  garden_bed_id: UUID;
  seed_id: UUID;

  planned_sow_date?: string | null;
  planned_plant_date?: string | null;
  planned_harvest_start?: string | null;
  planned_harvest_end?: string | null;

  actual_sow_date?: string | null;
  actual_plant_date?: string | null;
  actual_harvest_start?: string | null;
  actual_harvest_end?: string | null;

  method?: "direct" | "presow" | null;
  status?: "planned" | "sown" | "planted" | "growing" | "harvesting" | "completed";

  // Segment-gebaseerde indeling
  start_segment?: number | null;
  segments_used?: number | null;
  color?: string | null;

  rows?: number | null;
  plants_per_row?: number | null;
  area_percentage?: number | null;

  notes?: string | null;

  created_at?: string;
  updated_at?: string;
}

/**
 * Taken (afgeleid)
 */
export interface Task {
  id: UUID;
  garden_id: UUID;
  planting_id: UUID;
  type: "sow" | "plant_out" | "harvest_start" | "harvest_end";
  due_date: string;
  status?: "pending" | "done" | "skipped";
  assignee_user_id?: UUID | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Bezetting per week (view)
 */
export interface BedOccupancyWeek {
  garden_bed_id: UUID;
  garden_id: UUID;
  week_start: string; // ISO date
  occupancy_pct: number;
}
