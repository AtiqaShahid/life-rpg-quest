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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          description: string | null
          id: string
          title: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          title: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          title?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      active_effects: {
        Row: {
          created_at: string
          effect_kind: string
          effect_value: number
          expires_at: string | null
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          effect_kind: string
          effect_value?: number
          expires_at?: string | null
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          effect_kind?: string
          effect_value?: number
          expires_at?: string | null
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_effects_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_date: string
          base_xp: number | null
          created_at: string
          difficulty: Database["public"]["Enums"]["activity_difficulty"]
          duration_minutes: number | null
          id: string
          multiplier_breakdown: Json | null
          note: string | null
          subtype: string | null
          type_id: string
          user_id: string
          xp_gained: number
        }
        Insert: {
          activity_date?: string
          base_xp?: number | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["activity_difficulty"]
          duration_minutes?: number | null
          id?: string
          multiplier_breakdown?: Json | null
          note?: string | null
          subtype?: string | null
          type_id: string
          user_id: string
          xp_gained: number
        }
        Update: {
          activity_date?: string
          base_xp?: number | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["activity_difficulty"]
          duration_minutes?: number | null
          id?: string
          multiplier_breakdown?: Json | null
          note?: string | null
          subtype?: string | null
          type_id?: string
          user_id?: string
          xp_gained?: number
        }
        Relationships: [
          {
            foreignKeyName: "activities_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_repeats: {
        Row: {
          id: string
          occurred_at: string
          subtype: string
          type_id: string
          user_id: string
        }
        Insert: {
          id?: string
          occurred_at?: string
          subtype?: string
          type_id: string
          user_id: string
        }
        Update: {
          id?: string
          occurred_at?: string
          subtype?: string
          type_id?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_types: {
        Row: {
          description: string | null
          icon: string
          id: string
          label: string
          stat: Database["public"]["Enums"]["stat_kind"]
          xp: number
        }
        Insert: {
          description?: string | null
          icon: string
          id: string
          label: string
          stat: Database["public"]["Enums"]["stat_kind"]
          xp: number
        }
        Update: {
          description?: string | null
          icon?: string
          id?: string
          label?: string
          stat?: Database["public"]["Enums"]["stat_kind"]
          xp?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          coins: number
          created_at: string
          fatigue: number
          fatigue_updated_at: string
          id: string
          level: number
          skill_points: number
          tokens: number
          updated_at: string
          user_id: string
          username: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          fatigue?: number
          fatigue_updated_at?: string
          id?: string
          level?: number
          skill_points?: number
          tokens?: number
          updated_at?: string
          user_id: string
          username: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          coins?: number
          created_at?: string
          fatigue?: number
          fatigue_updated_at?: string
          id?: string
          level?: number
          skill_points?: number
          tokens?: number
          updated_at?: string
          user_id?: string
          username?: string
          xp?: number
        }
        Relationships: []
      }
      quest_progress: {
        Row: {
          created_at: string
          current: number
          id: string
          last_event_at: string | null
          quest_id: string
          target: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current?: number
          id?: string
          last_event_at?: string | null
          quest_id: string
          target?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current?: number
          id?: string
          last_event_at?: string | null
          quest_id?: string
          target?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_progress_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: true
            referencedRelation: "quests"
            referencedColumns: ["id"]
          },
        ]
      }
      quests: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          criteria: Json
          description: string | null
          difficulty: number
          energy: Database["public"]["Enums"]["quest_energy"]
          expires_at: string | null
          generation_reason: string | null
          id: string
          is_compulsory: boolean
          is_daily: boolean
          linked_stats: string[]
          quest_type: Database["public"]["Enums"]["quest_type"]
          reward_xp: number
          selection_group: string | null
          slot_index: number | null
          status: Database["public"]["Enums"]["quest_status"]
          template_key: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          difficulty?: number
          energy?: Database["public"]["Enums"]["quest_energy"]
          expires_at?: string | null
          generation_reason?: string | null
          id?: string
          is_compulsory?: boolean
          is_daily?: boolean
          linked_stats?: string[]
          quest_type?: Database["public"]["Enums"]["quest_type"]
          reward_xp?: number
          selection_group?: string | null
          slot_index?: number | null
          status?: Database["public"]["Enums"]["quest_status"]
          template_key?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          difficulty?: number
          energy?: Database["public"]["Enums"]["quest_energy"]
          expires_at?: string | null
          generation_reason?: string | null
          id?: string
          is_compulsory?: boolean
          is_daily?: boolean
          linked_stats?: string[]
          quest_type?: Database["public"]["Enums"]["quest_type"]
          reward_xp?: number
          selection_group?: string | null
          slot_index?: number | null
          status?: Database["public"]["Enums"]["quest_status"]
          template_key?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          active: boolean
          category: string
          cooldown_min: number
          cost: number
          currency: string
          description: string
          duration_min: number | null
          effect_kind: string
          effect_value: number
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category: string
          cooldown_min?: number
          cost: number
          currency: string
          description: string
          duration_min?: number | null
          effect_kind: string
          effect_value?: number
          icon?: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category?: string
          cooldown_min?: number
          cost?: number
          currency?: string
          description?: string
          duration_min?: number | null
          effect_kind?: string
          effect_value?: number
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      skill_catalog: {
        Row: {
          cost_per_level: number
          description: string
          effect: Json
          id: string
          label: string
          max_level: number
          parent_id: string | null
          sort_order: number
          stat: string
        }
        Insert: {
          cost_per_level?: number
          description: string
          effect: Json
          id: string
          label: string
          max_level?: number
          parent_id?: string | null
          sort_order?: number
          stat: string
        }
        Update: {
          cost_per_level?: number
          description?: string
          effect?: Json
          id?: string
          label?: string
          max_level?: number
          parent_id?: string | null
          sort_order?: number
          stat?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_catalog_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "skill_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_nodes: {
        Row: {
          id: string
          level: number
          skill_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          level?: number
          skill_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          level?: number
          skill_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_nodes_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skill_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      stats: {
        Row: {
          charisma: number
          discipline: number
          intelligence: number
          strength: number
          updated_at: string
          user_id: string
        }
        Insert: {
          charisma?: number
          discipline?: number
          intelligence?: number
          strength?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          charisma?: number
          discipline?: number
          intelligence?: number
          strength?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current_streak: number
          last_active_date: string | null
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_active_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_active_date?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_inventory: {
        Row: {
          created_at: string
          id: string
          item_id: string
          last_used_at: string | null
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          last_used_at?: string | null
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          last_used_at?: string | null
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _discard_daily_dynamic_slot: {
        Args: { p_slot: number; p_user: string }
        Returns: undefined
      }
      _has_active_selection: {
        Args: {
          p_type: Database["public"]["Enums"]["quest_type"]
          p_user: string
        }
        Returns: boolean
      }
      _pick_daily_template: {
        Args: { p_recovery: boolean; p_user: string }
        Returns: Record<string, unknown>
      }
      add_custom_quest: {
        Args: {
          p_description?: string
          p_difficulty?: number
          p_quest_type: Database["public"]["Enums"]["quest_type"]
          p_title: string
        }
        Returns: Json
      }
      cleanup_orphan_quests: { Args: never; Returns: Json }
      complete_quest: { Args: { p_quest_id: string }; Returns: Json }
      compute_activity_xp: {
        Args: { p_duration: number; p_subtype: string; p_type: string }
        Returns: number
      }
      compute_quest_xp: {
        Args: {
          p_difficulty: number
          p_type: Database["public"]["Enums"]["quest_type"]
          p_user: string
        }
        Returns: Json
      }
      expire_active_effects: { Args: never; Returns: Json }
      generate_epic_options: { Args: never; Returns: Json }
      generate_quests: { Args: { p_force?: boolean }; Returns: Json }
      generate_weekly_options: { Args: never; Returns: Json }
      get_active_xp_multiplier: { Args: { p_user: string }; Returns: number }
      get_behavior_profile: { Args: never; Returns: Json }
      get_fatigue_multiplier: { Args: { p_fatigue: number }; Returns: number }
      get_repeat_multiplier: {
        Args: { p_subtype: string; p_type: string; p_user: string }
        Returns: number
      }
      get_stat_xp_multiplier: {
        Args: { p_type: string; p_user: string }
        Returns: number
      }
      get_streak_skill_bonus: { Args: { p_user: string }; Returns: number }
      insert_dynamic_quest: {
        Args: {
          p_criteria: Json
          p_description: string
          p_difficulty: number
          p_energy: Database["public"]["Enums"]["quest_energy"]
          p_linked_stats: string[]
          p_reason: string
          p_target: number
          p_title: string
          p_unit: string
        }
        Returns: Json
      }
      lock_quest: { Args: { p_quest_id: string }; Returns: Json }
      log_activity:
        | {
            Args: {
              p_duration: number
              p_note?: string
              p_subtype: string
              p_type: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_difficulty?: string
              p_duration: number
              p_note?: string
              p_subtype: string
              p_type: string
            }
            Returns: Json
          }
      purchase_shop_item: {
        Args: { p_item_id: string; p_quantity?: number }
        Returns: Json
      }
      recover_fatigue: { Args: never; Returns: Json }
      regenerate_daily_slot: { Args: { p_slot: number }; Returns: Json }
      regenerate_daily_slots_all: { Args: never; Returns: Json }
      reset_daily_quests: { Args: { p_user: string }; Returns: undefined }
      seed_compulsory_quests: { Args: never; Returns: Json }
      select_quest_option: { Args: { p_quest_id: string }; Returns: Json }
      unlock_quest: { Args: { p_quest_id: string }; Returns: Json }
      upgrade_skill: { Args: { p_skill_id: string }; Returns: Json }
      use_inventory_item: { Args: { p_item_id: string }; Returns: Json }
    }
    Enums: {
      activity_difficulty: "easy" | "medium" | "hard"
      quest_energy: "low" | "medium" | "high"
      quest_status:
        | "active"
        | "completed"
        | "failed"
        | "paused"
        | "locked"
        | "candidate"
        | "discarded"
      quest_type: "daily" | "weekly" | "epic" | "dynamic"
      stat_kind: "intelligence" | "strength" | "discipline" | "charisma"
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
      activity_difficulty: ["easy", "medium", "hard"],
      quest_energy: ["low", "medium", "high"],
      quest_status: [
        "active",
        "completed",
        "failed",
        "paused",
        "locked",
        "candidate",
        "discarded",
      ],
      quest_type: ["daily", "weekly", "epic", "dynamic"],
      stat_kind: ["intelligence", "strength", "discipline", "charisma"],
    },
  },
} as const
