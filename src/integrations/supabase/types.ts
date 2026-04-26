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
          created_at: string
          id: string
          level: number
          skill_points: number
          updated_at: string
          user_id: string
          username: string
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          level?: number
          skill_points?: number
          updated_at?: string
          user_id: string
          username: string
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          level?: number
          skill_points?: number
          updated_at?: string
          user_id?: string
          username?: string
          xp?: number
        }
        Relationships: []
      }
      quests: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          is_daily: boolean
          reward_xp: number
          title: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          is_daily?: boolean
          reward_xp?: number
          title: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          is_daily?: boolean
          reward_xp?: number
          title?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_activity_xp: {
        Args: { p_duration: number; p_subtype: string; p_type: string }
        Returns: number
      }
      get_behavior_profile: { Args: never; Returns: Json }
      get_stat_xp_multiplier: {
        Args: { p_type: string; p_user: string }
        Returns: number
      }
      get_streak_skill_bonus: { Args: { p_user: string }; Returns: number }
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
      reset_daily_quests: { Args: { p_user: string }; Returns: undefined }
      upgrade_skill: { Args: { p_skill_id: string }; Returns: Json }
    }
    Enums: {
      activity_difficulty: "easy" | "medium" | "hard"
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
      stat_kind: ["intelligence", "strength", "discipline", "charisma"],
    },
  },
} as const
