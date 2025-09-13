export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      crop_types: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      garden_beds: {
        Row: {
          created_at: string
          garden_id: string | null
          id: string
          is_greenhouse: boolean | null
          length_cm: number
          location_x: number | null
          location_y: number | null
          name: string
          segments: number
          sort_order: number
          updated_at: string
          width_cm: number
        }
        Insert: {
          created_at?: string
          garden_id?: string | null
          id?: string
          is_greenhouse?: boolean | null
          length_cm: number
          location_x?: number | null
          location_y?: number | null
          name: string
          segments?: number
          sort_order?: number
          updated_at?: string
          width_cm: number
        }
        Update: {
          created_at?: string
          garden_id?: string | null
          id?: string
          is_greenhouse?: boolean | null
          length_cm?: number
          location_x?: number | null
          location_y?: number | null
          name?: string
          segments?: number
          sort_order?: number
          updated_at?: string
          width_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "garden_beds_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      garden_users: {
        Row: {
          created_at: string
          garden_id: string | null
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          garden_id?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          garden_id?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "garden_users_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      gardens: {
        Row: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: []
      }
      plantings: {
        Row: {
          actual_harvest_end: string | null
          actual_harvest_start: string | null
          actual_plant_date: string | null
          actual_sow_date: string | null
          color: string | null
          created_at: string
          garden_bed_id: string | null
          garden_id: string | null
          id: string
          method: string | null
          notes: string | null
          planned_harvest_end: string | null
          planned_harvest_start: string | null
          planned_plant_date: string | null
          planned_sow_date: string | null
          plants_per_row: number | null
          rows: number | null
          seed_id: string | null
          segments_used: number
          start_segment: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_plant_date?: string | null
          actual_sow_date?: string | null
          color?: string | null
          created_at?: string
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_plant_date?: string | null
          planned_sow_date?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number
          start_segment?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_plant_date?: string | null
          actual_sow_date?: string | null
          color?: string | null
          created_at?: string
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_plant_date?: string | null
          planned_sow_date?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number
          start_segment?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "bed_occupancy_by_week"
            referencedColumns: ["garden_bed_id"]
          },
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "garden_beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantings_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantings_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          notification_prefs: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          notification_prefs?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          notification_prefs?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      seeds: {
        Row: {
          created_at: string
          crop_type_id: string | null
          default_color: string | null
          direct_sow_months: number[] | null
          garden_id: string | null
          greenhouse_compatible: boolean | null
          grow_duration_weeks: number | null
          harvest_duration_weeks: number | null
          harvest_months: number[] | null
          id: string
          name: string
          notes: string | null
          plant_months: number[] | null
          plant_spacing_cm: number | null
          presow_duration_weeks: number | null
          presow_months: number[] | null
          purchase_date: string | null
          row_spacing_cm: number | null
          sowing_type: string | null
          stock_quantity: number | null
          stock_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crop_type_id?: string | null
          default_color?: string | null
          direct_sow_months?: number[] | null
          garden_id?: string | null
          greenhouse_compatible?: boolean | null
          grow_duration_weeks?: number | null
          harvest_duration_weeks?: number | null
          harvest_months?: number[] | null
          id?: string
          name: string
          notes?: string | null
          plant_months?: number[] | null
          plant_spacing_cm?: number | null
          presow_duration_weeks?: number | null
          presow_months?: number[] | null
          purchase_date?: string | null
          row_spacing_cm?: number | null
          sowing_type?: string | null
          stock_quantity?: number | null
          stock_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crop_type_id?: string | null
          default_color?: string | null
          direct_sow_months?: number[] | null
          garden_id?: string | null
          greenhouse_compatible?: boolean | null
          grow_duration_weeks?: number | null
          harvest_duration_weeks?: number | null
          harvest_months?: number[] | null
          id?: string
          name?: string
          notes?: string | null
          plant_months?: number[] | null
          plant_spacing_cm?: number | null
          presow_duration_weeks?: number | null
          presow_months?: number[] | null
          purchase_date?: string | null
          row_spacing_cm?: number | null
          sowing_type?: string | null
          stock_quantity?: number | null
          stock_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seeds_crop_type_id_fkey"
            columns: ["crop_type_id"]
            isOneToOne: false
            referencedRelation: "crop_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seeds_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          due_date: string
          garden_id: string | null
          id: string
          notes: string | null
          planting_id: string | null
          status: string | null
          type: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          due_date: string
          garden_id?: string | null
          id?: string
          notes?: string | null
          planting_id?: string | null
          status?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          due_date?: string
          garden_id?: string | null
          id?: string
          notes?: string | null
          planting_id?: string | null
          status?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting_timeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "plantings"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          garden_id: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          garden_id?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          garden_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bed_occupancy_by_week: {
        Row: {
          garden_bed_id: string | null
          garden_id: string | null
          occupancy_pct: number | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "garden_beds_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      planting_status: {
        Row: {
          actual_harvest_end: string | null
          actual_harvest_start: string | null
          actual_plant_date: string | null
          actual_sow_date: string | null
          color: string | null
          created_at: string | null
          current_phase: string | null
          garden_bed_id: string | null
          garden_id: string | null
          id: string | null
          method: string | null
          notes: string | null
          planned_harvest_end: string | null
          planned_harvest_start: string | null
          planned_plant_date: string | null
          planned_sow_date: string | null
          plants_per_row: number | null
          rows: number | null
          seed_id: string | null
          segments_used: number | null
          start_segment: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_plant_date?: string | null
          actual_sow_date?: string | null
          color?: string | null
          created_at?: string | null
          current_phase?: never
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string | null
          method?: string | null
          notes?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_plant_date?: string | null
          planned_sow_date?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number | null
          start_segment?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_plant_date?: string | null
          actual_sow_date?: string | null
          color?: string | null
          created_at?: string | null
          current_phase?: never
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string | null
          method?: string | null
          notes?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_plant_date?: string | null
          planned_sow_date?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number | null
          start_segment?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "bed_occupancy_by_week"
            referencedColumns: ["garden_bed_id"]
          },
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "garden_beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantings_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantings_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      planting_timeline: {
        Row: {
          color: string | null
          end_date: string | null
          garden_bed_id: string | null
          id: string | null
          seed_id: string | null
          segments_used: number | null
          start_date: string | null
          start_segment: number | null
        }
        Insert: {
          color?: string | null
          end_date?: never
          garden_bed_id?: string | null
          id?: string | null
          seed_id?: string | null
          segments_used?: number | null
          start_date?: never
          start_segment?: number | null
        }
        Update: {
          color?: string | null
          end_date?: never
          garden_bed_id?: string | null
          id?: string | null
          seed_id?: string | null
          segments_used?: number | null
          start_date?: never
          start_segment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "bed_occupancy_by_week"
            referencedColumns: ["garden_bed_id"]
          },
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "garden_beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantings_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "seeds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      join_garden_by_code: {
        Args: { join_code: string }
        Returns: string
      }
      plantings_for_week: {
        Args: { p_garden_id: string; p_week_start: string }
        Returns: {
          color: string
          end_date: string
          garden_bed_id: string
          id: string
          seed_id: string
          segments_used: number
          start_date: string
          start_segment: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
