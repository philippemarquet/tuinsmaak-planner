export type UUID = string;

/**
 * Profiel van een gebruiker
 */
export interface Profile {
  id: UUID; // gelijk aan auth.users.id
  display_name: string | null;
  notification_prefs: {
    remind_sow?: boolean;
    remind_plant?: boolean;
    remind_harvest?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

/**
 * Een tuin (garden)
 */
export interface Garden {
  id: UUID;
  name: string;
  join_code: string;
  created_at: string;
}

/**
 * Relatie tussen gebruiker en tuin
 */
export interface GardenUser {
  id: UUID;
  garden_id: UUID;
  user_id: UUID;
  role: "owner" | "member";
  created_at: string;
}

/**
 * Categorie van een gewas (bv. Bladgroenten, Peulvruchten)
 */
export interface CropType {
  id: UUID;
  name: string;
  created_at: string;
}

/**
 * Zaad/plantsoort in de voorraad
 */
export interface Seed {
  id: UUID;
  garden_id: UUID;
  name: string;
  crop_type_id: UUID | null;
  purchase_date: string | null;
  stock_status: "adequate" | "low" | "out";
  stock_quantity?: number | null;

  // Teelt-informatie
  row_spacing_cm?: number | null;
  plant_spacing_cm?: number | null;
  greenhouse_compatible?: boolean;
  sowing_type?: "direct" | "presow" | "both";
  presow_duration_weeks?: number | null;
  grow_duration_weeks?: number | null;
  harvest_duration_weeks?: number | null;
  presow_months?: number[] | null;
  direct_sow_months?: number[] | null;
  plant_months?: number[] | null;
  harvest_months?: number[] | null;

  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Moestuinbak
 */
export interface GardenBed {
  id: UUID;
  garden_id: UUID;
  name: string;
  width_cm: number;
  length_cm: number;
  location_x?: number | null;
  location_y?: number | null;
  is_greenhouse?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Planting = een zaad dat in een bak staat (planning of realiteit)
 */
export interface Planting {
  id: UUID;
  garden_id: UUID;
  seed_id: UUID;
  garden_bed_id: UUID;

  // Data
  planned_sow_date?: string | null;
  planned_plant_date?: string | null;
  planned_harvest_start?: string | null;
  planned_harvest_end?: string | null;
  actual_sow_date?: string | null;
  actual_plant_date?: string | null;
  actual_harvest_start?: string | null;
  actual_harvest_end?: string | null;

  // Overige
  method?: "direct" | "presow" | null;
  rows?: number | null;
  plants_per_row?: number | null;
  area_percentage?: number | null;
  status: "planned" | "sown" | "planted" | "growing" | "harvesting" | "completed";
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Taken die automatisch uit plantings komen
 */
export interface Task {
  id: UUID;
  garden_id: UUID;
  planting_id: UUID;
  type: "sow" | "plant_out" | "harvest_start" | "harvest_end";
  due_date: string;
  status: "pending" | "done" | "skipped";
  assignee_user_id?: UUID | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Bezetting per week per bak (view: bed_occupancy_by_week)
 */
export interface BedOccupancyWeek {
  garden_bed_id: UUID;
  garden_id: UUID;
  week_start: string; // YYYY-MM-DD
  occupancy_pct: number;
}
