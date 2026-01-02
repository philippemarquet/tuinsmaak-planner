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
      audit_items: {
        Row: {
          audit_id: string
          bed_name: string | null
          created_at: string
          description: string
          id: string
          is_correct: boolean | null
          is_validated: boolean | null
          item_type: string
          notes: string | null
          phase: string | null
          reference_id: string | null
          segment_info: string | null
          validated_at: string | null
        }
        Insert: {
          audit_id: string
          bed_name?: string | null
          created_at?: string
          description: string
          id?: string
          is_correct?: boolean | null
          is_validated?: boolean | null
          item_type: string
          notes?: string | null
          phase?: string | null
          reference_id?: string | null
          segment_info?: string | null
          validated_at?: string | null
        }
        Update: {
          audit_id?: string
          bed_name?: string | null
          created_at?: string
          description?: string
          id?: string
          is_correct?: boolean | null
          is_validated?: boolean | null
          item_type?: string
          notes?: string | null
          phase?: string | null
          reference_id?: string | null
          segment_info?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_status_history: {
        Row: {
          audit_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["audit_status"]
          old_status: Database["public"]["Enums"]["audit_status"] | null
        }
        Insert: {
          audit_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["audit_status"]
          old_status?: Database["public"]["Enums"]["audit_status"] | null
        }
        Update: {
          audit_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["audit_status"]
          old_status?: Database["public"]["Enums"]["audit_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_status_history_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          completed_at: string | null
          created_at: string
          deadline: string
          garden_id: string
          id: string
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["audit_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deadline: string
          garden_id: string
          id?: string
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["audit_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deadline?: string
          garden_id?: string
          id?: string
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["audit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_types: {
        Row: {
          created_at: string
          icon_key: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon_key?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon_key?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          email_type: string
          error_message: string | null
          id: string
          overdue_count: number | null
          recipient_email: string
          sent_at: string
          status: string
          subject: string
          tasks_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_type: string
          error_message?: string | null
          id?: string
          overdue_count?: number | null
          recipient_email: string
          sent_at?: string
          status?: string
          subject: string
          tasks_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          overdue_count?: number | null
          recipient_email?: string
          sent_at?: string
          status?: string
          subject?: string
          tasks_count?: number | null
          user_id?: string
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
      garden_plot_objects: {
        Row: {
          created_at: string
          garden_id: string
          h: number
          id: string
          label: string | null
          type: string
          updated_at: string
          w: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          created_at?: string
          garden_id: string
          h?: number
          id?: string
          label?: string | null
          type: string
          updated_at?: string
          w?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          created_at?: string
          garden_id?: string
          h?: number
          id?: string
          label?: string | null
          type?: string
          updated_at?: string
          w?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "garden_plot_objects_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      garden_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_month: number
          due_week: number | null
          due_year: number
          garden_id: string
          id: string
          is_recurring: boolean | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_month: number
          due_week?: number | null
          due_year: number
          garden_id: string
          id?: string
          is_recurring?: boolean | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_month?: number
          due_week?: number | null
          due_year?: number
          garden_id?: string
          id?: string
          is_recurring?: boolean | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "garden_tasks_garden_id_fkey"
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
          actual_date: string | null
          actual_ground_date: string | null
          actual_harvest_end: string | null
          actual_harvest_start: string | null
          actual_presow_date: string | null
          color: string | null
          created_at: string
          garden_bed_id: string | null
          garden_id: string | null
          id: string
          method: string | null
          notes: string | null
          planned_date: string
          planned_harvest_end: string | null
          planned_harvest_start: string | null
          planned_presow_date: string | null
          plants_per_row: number | null
          rows: number | null
          seed_id: string | null
          segments_used: number
          start_segment: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          actual_ground_date?: string | null
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_presow_date?: string | null
          color?: string | null
          created_at?: string
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          planned_date: string
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_presow_date?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number
          start_segment?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          actual_ground_date?: string | null
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_presow_date?: string | null
          color?: string | null
          created_at?: string
          garden_bed_id?: string | null
          garden_id?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          planned_date?: string
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_presow_date?: string | null
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
          calendar_token: string | null
          created_at: string
          display_name: string | null
          id: string
          notification_prefs: Json | null
          updated_at: string
        }
        Insert: {
          calendar_token?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          notification_prefs?: Json | null
          updated_at?: string
        }
        Update: {
          calendar_token?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          notification_prefs?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh_key: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh_key: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh_key?: string
          user_id?: string
        }
        Relationships: []
      }
      seeds: {
        Row: {
          created_at: string
          crop_type_id: string | null
          default_color: string | null
          direct_plant_months: number[]
          garden_id: string | null
          greenhouse_compatible: boolean | null
          greenhouse_months: number[] | null
          grow_duration_weeks: number | null
          harvest_duration_weeks: number | null
          harvest_months: number[] | null
          icon_key: string | null
          id: string
          in_stock: boolean
          name: string
          notes: string | null
          plant_spacing_cm: number | null
          presow_duration_weeks: number | null
          presow_months: number[] | null
          purchase_date: string | null
          row_spacing_cm: number | null
          sowing_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crop_type_id?: string | null
          default_color?: string | null
          direct_plant_months?: number[]
          garden_id?: string | null
          greenhouse_compatible?: boolean | null
          greenhouse_months?: number[] | null
          grow_duration_weeks?: number | null
          harvest_duration_weeks?: number | null
          harvest_months?: number[] | null
          icon_key?: string | null
          id?: string
          in_stock?: boolean
          name: string
          notes?: string | null
          plant_spacing_cm?: number | null
          presow_duration_weeks?: number | null
          presow_months?: number[] | null
          purchase_date?: string | null
          row_spacing_cm?: number | null
          sowing_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crop_type_id?: string | null
          default_color?: string | null
          direct_plant_months?: number[]
          garden_id?: string | null
          greenhouse_compatible?: boolean | null
          greenhouse_months?: number[] | null
          grow_duration_weeks?: number | null
          harvest_duration_weeks?: number | null
          harvest_months?: number[] | null
          icon_key?: string | null
          id?: string
          in_stock?: boolean
          name?: string
          notes?: string | null
          plant_spacing_cm?: number | null
          presow_duration_weeks?: number | null
          presow_months?: number[] | null
          purchase_date?: string | null
          row_spacing_cm?: number | null
          sowing_type?: string | null
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
          completed_at: string | null
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
          completed_at?: string | null
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
          completed_at?: string | null
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
            referencedRelation: "bed_occupancy_by_week"
            referencedColumns: ["planting_id"]
          },
          {
            foreignKeyName: "tasks_planting_id_fkey"
            columns: ["planting_id"]
            isOneToOne: false
            referencedRelation: "planting_status"
            referencedColumns: ["planting_id"]
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
          is_checked: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          garden_id?: string | null
          id?: string
          is_checked?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          garden_id?: string | null
          id?: string
          is_checked?: boolean
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
          planting_id: string | null
          segments_used: number | null
          start_segment: number | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantings_garden_bed_id_fkey"
            columns: ["garden_bed_id"]
            isOneToOne: false
            referencedRelation: "garden_beds"
            referencedColumns: ["id"]
          },
        ]
      }
      planting_status: {
        Row: {
          actual_ground_date: string | null
          actual_harvest_end: string | null
          actual_harvest_start: string | null
          actual_presow_date: string | null
          color: string | null
          created_at: string | null
          garden_bed_id: string | null
          garden_id: string | null
          method: string | null
          notes: string | null
          phase: string | null
          planned_date: string | null
          planned_harvest_end: string | null
          planned_harvest_start: string | null
          planned_presow_date: string | null
          planting_id: string | null
          plants_per_row: number | null
          rows: number | null
          seed_id: string | null
          segments_used: number | null
          start_segment: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_ground_date?: string | null
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_presow_date?: string | null
          color?: string | null
          created_at?: string | null
          garden_bed_id?: string | null
          garden_id?: string | null
          method?: string | null
          notes?: string | null
          phase?: never
          planned_date?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_presow_date?: string | null
          planting_id?: string | null
          plants_per_row?: number | null
          rows?: number | null
          seed_id?: string | null
          segments_used?: number | null
          start_segment?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_ground_date?: string | null
          actual_harvest_end?: string | null
          actual_harvest_start?: string | null
          actual_presow_date?: string | null
          color?: string | null
          created_at?: string | null
          garden_bed_id?: string | null
          garden_id?: string | null
          method?: string | null
          notes?: string | null
          phase?: never
          planned_date?: string | null
          planned_harvest_end?: string | null
          planned_harvest_start?: string | null
          planned_presow_date?: string | null
          planting_id?: string | null
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
          due_date: string | null
          garden_id: string | null
          planting_id: string | null
          type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_task: {
        Args: { p_done_date?: string; p_task_id: string }
        Returns: {
          assignee_user_id: string | null
          completed_at: string | null
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
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_generate_tasks_for_planting: {
        Args: { p_planting_id: string }
        Returns: undefined
      }
      fn_recalc_planting_schedule: {
        Args: { p_planting_id: string }
        Returns: undefined
      }
      fn_upsert_tasks_for_planting: {
        Args: { p_planting_id: string }
        Returns: undefined
      }
      join_garden_by_code: { Args: { join_code: string }; Returns: string }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      audit_status: "open" | "onderhanden" | "afwachting" | "goedgekeurd"
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
    Enums: {
      audit_status: ["open", "onderhanden", "afwachting", "goedgekeurd"],
    },
  },
} as const
