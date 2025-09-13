// src/lib/types.ts
export interface Garden {
  id: string;
  name: string;
  created_at: string;
}

export interface GardenBed {
  id: string;
  garden_id: string;
  name: string;
  segments: number;
  sort_order?: number | null;
  is_greenhouse?: boolean;
  length_cm?: number | null;
  width_cm?: number | null;
  location_x?: number | null;
  location_y?: number | null;
  created_at: string;
}

export type SowingType = 'direct' | 'presow' | 'both';

export interface Seed {
  id: string;
  garden_id: string;
  name: string;
  crop_type_id?: string | null;

  presow_duration_weeks?: number | null;
  grow_duration_weeks?: number | null;
  harvest_duration_weeks?: number | null;

  presow_months?: number[] | null;
  direct_sow_months?: number[] | null;
  plant_months?: number[] | null;
  harvest_months?: number[] | null;

  greenhouse_compatible?: boolean;
  sowing_type: SowingType;

  default_color?: string | null;
  notes?: string | null;

  in_stock?: boolean; // nieuwe boolean
  created_at?: string;
  updated_at?: string;
}

export interface Planting {
  id: string;
  garden_id: string;
  garden_bed_id: string;
  seed_id: string;

  method: 'direct' | 'presow';

  // Eén bronveld voor planning (de grond in)
  planned_date: string; // YYYY-MM-DD

  // Afgeleiden (door trigger of UI berekend)
  planned_harvest_start: string | null;
  planned_harvest_end: string | null;

  // Eventuele werkelijke data (laten we ongemoeid)
  actual_sow_date?: string | null;
  actual_plant_date?: string | null;
  actual_harvest_start?: string | null;
  actual_harvest_end?: string | null;

  start_segment: number;
  segments_used: number;
  color?: string | null;
  status?: string | null;

  created_at?: string;
  updated_at?: string;
}
