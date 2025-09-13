export type UUID = string;

export interface Profile {
  id: UUID;
  display_name: string | null;
  notification_prefs: Record<string, any>;
  created_at: string;
  updated_at: string;
}

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

export interface CropType {
  id: UUID;
  name: string;
  created_at: string;
}

//
// Zaden (voorraad)
//
export interface Seed {
  id: UUID;
  garden_id: UUID;
  name: string;
  crop_type_id: UUID | null;
  purchase_date: string | null;

  in_stock: boolean;

  row_spacing_cm: number | null;
  plant_spacing_cm: number | null;
  greenhouse_compatible: boolean;
  sowing_type: "direct" | "presow" | "both";

  presow_duration_weeks: number | null;
  grow_duration_weeks: number | null;
  harvest_duration_weeks: number | null;

  presow_months: number[] | null;
  ground_months: number[] | null;     // ✅ samengevoegd: direct/plant
  harvest_months: number[] | null;

  notes: string | null;
  default_color: string | null;

  created_at: string;
  updated_at: string;
}

export interface GardenBed {
  id: UUID;
  garden_id: UUID;
  name: string;
  width_cm: number;
  length_cm: number;
  location_x: number;
  location_y: number;
  is_greenhouse: boolean;
  segments: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

//
// Plantings
//
export interface Planting {
  id: UUID;
  garden_id: UUID;
  garden_bed_id: UUID;
  seed_id: UUID;

  planned_date: string | null;            // ✅ enige grond-datum
  planned_presow_date: string | null;     // ✅ alleen bij presow/both
  planned_harvest_start: string | null;
  planned_harvest_end: string | null;

  actual_presow_date: string | null;      // (voorzaaien daadwerkelijk)
  actual_ground_date: string | null;      // ✅ nieuw: direct of uitplanten
  actual_harvest_start: string | null;
  actual_harvest_end: string | null;

  method: "direct" | "presow" | null;
  status: "planned" | "sown" | "planted" | "growing" | "harvesting" | "completed";

  start_segment: number | null;
  segments_used: number | null;
  color: string | null;

  rows: number | null;
  plants_per_row: number | null;
  area_percentage: number | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
}

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

export interface BedOccupancyWeek {
  garden_bed_id: UUID;
  garden_id: UUID;
  week_start: string;
  occupancy_pct: number;
}
