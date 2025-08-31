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
  role: 'owner' | 'member';
  created_at: string;
}

export interface CropType {
  id: UUID;
  name: string;
  created_at: string;
}

export interface Seed {
  id: UUID;
  garden_id: UUID;
  name: string;
  crop_type_id: UUID | null;
  purchase_date: string | null;
  stock_status: 'adequate' | 'low' | 'out';
  stock_quantity: number;
  row_spacing_cm: number | null;
  plant_spacing_cm: number | null;
  greenhouse_compatible: boolean;
  sowing_type: 'direct' | 'presow' | 'both';
  presow_duration_weeks: number | null;
 
