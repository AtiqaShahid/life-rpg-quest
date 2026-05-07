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
      adaptive_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      adaptive_state: {
        Row: {
          computed_at: string
          difficulty_bias: number
          mode: string
          rationale: string
          reward_bias: number
          risk_burnout: number
          risk_dropoff: number
          risk_streak_break: number
          signals: Json
          user_id: string
          xp_bias: number
        }
        Insert: {
          computed_at?: string
          difficulty_bias?: number
          mode?: string
          rationale?: string
          reward_bias?: number
          risk_burnout?: number
          risk_dropoff?: number
          risk_streak_break?: number
          signals?: Json
          user_id: string
          xp_bias?: number
        }
        Update: {
          computed_at?: string
          difficulty_bias?: number
          mode?: string
          rationale?: string
          reward_bias?: number
          risk_burnout?: number
          risk_dropoff?: number
          risk_streak_break?: number
          signals?: Json
          user_id?: string
          xp_bias?: number
        }
        Relationships: []
      }
      behavior_memory: {
        Row: {
          avoidance: Json
          failure_triggers: Json
          last_session_minutes: number
          peak_hours: Json
          preferred_types: Json
          recovery_pattern: Json
          reward_responsiveness: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avoidance?: Json
          failure_triggers?: Json
          last_session_minutes?: number
          peak_hours?: Json
          preferred_types?: Json
          recovery_pattern?: Json
          reward_responsiveness?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avoidance?: Json
          failure_triggers?: Json
          last_session_minutes?: number
          peak_hours?: Json
          preferred_types?: Json
          recovery_pattern?: Json
          reward_responsiveness?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      class_catalog: {
        Row: {
          color: string
          description: string
          icon: string
          id: Database["public"]["Enums"]["character_class"]
          meta: Json
          name: string
          strengths: string[]
          tagline: string
          weaknesses: string[]
          xp_modifiers: Json
        }
        Insert: {
          color?: string
          description: string
          icon?: string
          id: Database["public"]["Enums"]["character_class"]
          meta?: Json
          name: string
          strengths?: string[]
          tagline: string
          weaknesses?: string[]
          xp_modifiers?: Json
        }
        Update: {
          color?: string
          description?: string
          icon?: string
          id?: Database["public"]["Enums"]["character_class"]
          meta?: Json
          name?: string
          strengths?: string[]
          tagline?: string
          weaknesses?: string[]
          xp_modifiers?: Json
        }
        Relationships: []
      }
      depth_events: {
        Row: {
          created_at: string
          delta: Json
          id: string
          kind: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta?: Json
          id?: string
          kind: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: Json
          id?: string
          kind?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      depth_state: {
        Row: {
          burnout: number
          comeback_window_until: string | null
          computed_at: string
          consistency: number
          energy: number
          friction_expires_at: string | null
          friction_multiplier: number
          intensity_recent: number
          rest_gap_days: number
          snapshot: Json
          streak_state: string
          unstable_since: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          burnout?: number
          comeback_window_until?: string | null
          computed_at?: string
          consistency?: number
          energy?: number
          friction_expires_at?: string | null
          friction_multiplier?: number
          intensity_recent?: number
          rest_gap_days?: number
          snapshot?: Json
          streak_state?: string
          unstable_since?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          burnout?: number
          comeback_window_until?: string | null
          computed_at?: string
          consistency?: number
          energy?: number
          friction_expires_at?: string | null
          friction_multiplier?: number
          intensity_recent?: number
          rest_gap_days?: number
          snapshot?: Json
          streak_state?: string
          unstable_since?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          delivered_at: string | null
          expires_at: string
          id: string
          receiver_id: string
          seen_at: string | null
          sender_id: string
          status: Database["public"]["Enums"]["dm_status"]
          type: Database["public"]["Enums"]["dm_type"]
        }
        Insert: {
          content: string
          created_at?: string
          delivered_at?: string | null
          expires_at?: string
          id?: string
          receiver_id: string
          seen_at?: string | null
          sender_id: string
          status?: Database["public"]["Enums"]["dm_status"]
          type?: Database["public"]["Enums"]["dm_type"]
        }
        Update: {
          content?: string
          created_at?: string
          delivered_at?: string | null
          expires_at?: string
          id?: string
          receiver_id?: string
          seen_at?: string | null
          sender_id?: string
          status?: Database["public"]["Enums"]["dm_status"]
          type?: Database["public"]["Enums"]["dm_type"]
        }
        Relationships: []
      }
      event_history: {
        Row: {
          awarded_coins: number
          awarded_items: string[]
          awarded_tokens: number
          awarded_xp: number
          ended_at: string
          event_id: string | null
          id: string
          outcome: Database["public"]["Enums"]["participation_status"]
          progress: number
          scope: Database["public"]["Enums"]["event_scope"]
          target: number
          template_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          awarded_coins?: number
          awarded_items?: string[]
          awarded_tokens?: number
          awarded_xp?: number
          ended_at?: string
          event_id?: string | null
          id?: string
          outcome: Database["public"]["Enums"]["participation_status"]
          progress?: number
          scope: Database["public"]["Enums"]["event_scope"]
          target?: number
          template_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          awarded_coins?: number
          awarded_items?: string[]
          awarded_tokens?: number
          awarded_xp?: number
          ended_at?: string
          event_id?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["participation_status"]
          progress?: number
          scope?: Database["public"]["Enums"]["event_scope"]
          target?: number
          template_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      event_participation: {
        Row: {
          awarded_items: string[]
          claimed_at: string | null
          completed_at: string | null
          event_id: string
          id: string
          joined_at: string
          meta: Json
          progress: number
          status: Database["public"]["Enums"]["participation_status"]
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          awarded_items?: string[]
          claimed_at?: string | null
          completed_at?: string | null
          event_id: string
          id?: string
          joined_at?: string
          meta?: Json
          progress?: number
          status?: Database["public"]["Enums"]["participation_status"]
          target?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          awarded_items?: string[]
          claimed_at?: string | null
          completed_at?: string | null
          event_id?: string
          id?: string
          joined_at?: string
          meta?: Json
          progress?: number
          status?: Database["public"]["Enums"]["participation_status"]
          target?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participation_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rewards_catalog: {
        Row: {
          active: boolean
          created_at: string
          description: string
          effect: Json
          icon: string
          id: string
          kind: string
          name: string
          rarity: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          effect?: Json
          icon?: string
          id: string
          kind: string
          name: string
          rarity?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          effect?: Json
          icon?: string
          id?: string
          kind?: string
          name?: string
          rarity?: string
        }
        Relationships: []
      }
      event_templates: {
        Row: {
          active: boolean
          base_coins: number
          base_tokens: number
          base_xp: number
          category: string
          created_at: string
          criteria: Json
          difficulty_max: number
          difficulty_min: number
          duration_hours: number
          flavor: string | null
          id: string
          multiplier: number
          reward_item_ids: string[]
          scope: Database["public"]["Enums"]["event_scope"]
          tagline: string
          title: string
          weight: number
        }
        Insert: {
          active?: boolean
          base_coins?: number
          base_tokens?: number
          base_xp?: number
          category: string
          created_at?: string
          criteria?: Json
          difficulty_max?: number
          difficulty_min?: number
          duration_hours?: number
          flavor?: string | null
          id: string
          multiplier?: number
          reward_item_ids?: string[]
          scope: Database["public"]["Enums"]["event_scope"]
          tagline: string
          title: string
          weight?: number
        }
        Update: {
          active?: boolean
          base_coins?: number
          base_tokens?: number
          base_xp?: number
          category?: string
          created_at?: string
          criteria?: Json
          difficulty_max?: number
          difficulty_min?: number
          duration_hours?: number
          flavor?: string | null
          id?: string
          multiplier?: number
          reward_item_ids?: string[]
          scope?: Database["public"]["Enums"]["event_scope"]
          tagline?: string
          title?: string
          weight?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          category: string
          created_at: string
          criteria: Json
          difficulty: number
          ends_at: string
          flavor: string | null
          global_progress: number
          global_target: number | null
          id: string
          multiplier: number
          reward_coins: number
          reward_item_ids: string[]
          reward_tokens: number
          reward_xp: number
          scope: Database["public"]["Enums"]["event_scope"]
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          tagline: string
          template_id: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          criteria?: Json
          difficulty?: number
          ends_at: string
          flavor?: string | null
          global_progress?: number
          global_target?: number | null
          id?: string
          multiplier?: number
          reward_coins?: number
          reward_item_ids?: string[]
          reward_tokens?: number
          reward_xp?: number
          scope: Database["public"]["Enums"]["event_scope"]
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          tagline: string
          template_id?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          criteria?: Json
          difficulty?: number
          ends_at?: string
          flavor?: string | null
          global_progress?: number
          global_target?: number | null
          id?: string
          multiplier?: number
          reward_coins?: number
          reward_item_ids?: string[]
          reward_tokens?: number
          reward_xp?: number
          scope?: Database["public"]["Enums"]["event_scope"]
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          tagline?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_entries: {
        Row: {
          current_streak: number
          discipline_score: number
          fitness_xp: number
          study_xp: number
          total_xp: number
          updated_at: string
          user_id: string
          username: string
          week_start: string
          weekly_quests: number
          weekly_xp: number
        }
        Insert: {
          current_streak?: number
          discipline_score?: number
          fitness_xp?: number
          study_xp?: number
          total_xp?: number
          updated_at?: string
          user_id: string
          username: string
          week_start?: string
          weekly_quests?: number
          weekly_xp?: number
        }
        Update: {
          current_streak?: number
          discipline_score?: number
          fitness_xp?: number
          study_xp?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
          username?: string
          week_start?: string
          weekly_quests?: number
          weekly_xp?: number
        }
        Relationships: []
      }
      parties: {
        Row: {
          accountability_mode: boolean
          created_at: string
          grace_used_week: string | null
          id: string
          invite_code: string
          last_streak_date: string | null
          leader_id: string
          level: number
          longest_shared_streak: number
          name: string
          shared_streak: number
          updated_at: string
          xp_pool: number
        }
        Insert: {
          accountability_mode?: boolean
          created_at?: string
          grace_used_week?: string | null
          id?: string
          invite_code: string
          last_streak_date?: string | null
          leader_id: string
          level?: number
          longest_shared_streak?: number
          name: string
          shared_streak?: number
          updated_at?: string
          xp_pool?: number
        }
        Update: {
          accountability_mode?: boolean
          created_at?: string
          grace_used_week?: string | null
          id?: string
          invite_code?: string
          last_streak_date?: string | null
          leader_id?: string
          level?: number
          longest_shared_streak?: number
          name?: string
          shared_streak?: number
          updated_at?: string
          xp_pool?: number
        }
        Relationships: []
      }
      party_activity_log: {
        Row: {
          activity_date: string
          created_at: string
          id: string
          party_id: string
          quests_completed: number
          user_id: string
          xp_contributed: number
        }
        Insert: {
          activity_date?: string
          created_at?: string
          id?: string
          party_id: string
          quests_completed?: number
          user_id: string
          xp_contributed?: number
        }
        Update: {
          activity_date?: string
          created_at?: string
          id?: string
          party_id?: string
          quests_completed?: number
          user_id?: string
          xp_contributed?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_activity_log_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_goals: {
        Row: {
          completed: boolean
          created_at: string
          current: number
          expires_at: string | null
          id: string
          metric: string
          party_id: string
          period: string
          target: number
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          current?: number
          expires_at?: string | null
          id?: string
          metric?: string
          party_id: string
          period?: string
          target?: number
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          current?: number
          expires_at?: string | null
          id?: string
          metric?: string
          party_id?: string
          period?: string
          target?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_goals_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_members: {
        Row: {
          id: string
          joined_at: string
          last_active_date: string | null
          party_id: string
          role: Database["public"]["Enums"]["party_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_active_date?: string | null
          party_id: string
          role?: Database["public"]["Enums"]["party_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_active_date?: string | null
          party_id?: string
          role?: Database["public"]["Enums"]["party_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          class_changed_at: string | null
          class_type: Database["public"]["Enums"]["character_class"] | null
          coins: number
          created_at: string
          exhaustion: number
          exhaustion_updated_at: string
          id: string
          last_daily_reset: string | null
          last_weekly_reset: string | null
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
          class_changed_at?: string | null
          class_type?: Database["public"]["Enums"]["character_class"] | null
          coins?: number
          created_at?: string
          exhaustion?: number
          exhaustion_updated_at?: string
          id?: string
          last_daily_reset?: string | null
          last_weekly_reset?: string | null
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
          class_changed_at?: string | null
          class_type?: Database["public"]["Enums"]["character_class"] | null
          coins?: number
          created_at?: string
          exhaustion?: number
          exhaustion_updated_at?: string
          id?: string
          last_daily_reset?: string | null
          last_weekly_reset?: string | null
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
      quest_archive: {
        Row: {
          archive_date: string
          archived_at: string
          completed: boolean
          id: string
          is_compulsory: boolean
          payload: Json
          quest_type: string
          template_key: string | null
          title: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          archive_date: string
          archived_at?: string
          completed?: boolean
          id?: string
          is_compulsory?: boolean
          payload?: Json
          quest_type: string
          template_key?: string | null
          title: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          archive_date?: string
          archived_at?: string
          completed?: boolean
          id?: string
          is_compulsory?: boolean
          payload?: Json
          quest_type?: string
          template_key?: string | null
          title?: string
          user_id?: string
          xp_earned?: number
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
          duration_minutes: number | null
          ends_at: string | null
          energy: Database["public"]["Enums"]["quest_energy"]
          expires_at: string | null
          generation_reason: string | null
          id: string
          is_compulsory: boolean
          is_daily: boolean
          linked_stats: string[]
          paused_at: string | null
          pauses_used: number
          quest_type: Database["public"]["Enums"]["quest_type"]
          reward_xp: number
          selection_group: string | null
          slot_index: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["quest_status"]
          template_key: string | null
          timer_penalty: number
          title: string
          total_paused_ms: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          difficulty?: number
          duration_minutes?: number | null
          ends_at?: string | null
          energy?: Database["public"]["Enums"]["quest_energy"]
          expires_at?: string | null
          generation_reason?: string | null
          id?: string
          is_compulsory?: boolean
          is_daily?: boolean
          linked_stats?: string[]
          paused_at?: string | null
          pauses_used?: number
          quest_type?: Database["public"]["Enums"]["quest_type"]
          reward_xp?: number
          selection_group?: string | null
          slot_index?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["quest_status"]
          template_key?: string | null
          timer_penalty?: number
          title: string
          total_paused_ms?: number
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          criteria?: Json
          description?: string | null
          difficulty?: number
          duration_minutes?: number | null
          ends_at?: string | null
          energy?: Database["public"]["Enums"]["quest_energy"]
          expires_at?: string | null
          generation_reason?: string | null
          id?: string
          is_compulsory?: boolean
          is_daily?: boolean
          linked_stats?: string[]
          paused_at?: string | null
          pauses_used?: number
          quest_type?: Database["public"]["Enums"]["quest_type"]
          reward_xp?: number
          selection_group?: string | null
          slot_index?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["quest_status"]
          template_key?: string | null
          timer_penalty?: number
          title?: string
          total_paused_ms?: number
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
      user_event_inventory: {
        Row: {
          acquired_at: string
          id: string
          reward_id: string
          source_event: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          reward_id: string
          source_event?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          reward_id?: string
          source_event?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_inventory_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "event_rewards_catalog"
            referencedColumns: ["id"]
          },
        ]
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
      user_status_effects: {
        Row: {
          active: boolean
          created_at: string
          difficulty_modifier: number
          expires_at: string
          id: string
          kind: Database["public"]["Enums"]["status_effect_kind"]
          multiplier: number
          reason: string | null
          starts_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          difficulty_modifier?: number
          expires_at: string
          id?: string
          kind: Database["public"]["Enums"]["status_effect_kind"]
          multiplier?: number
          reason?: string | null
          starts_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          difficulty_modifier?: number
          expires_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["status_effect_kind"]
          multiplier?: number
          reason?: string | null
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_leaderboard_rewards: {
        Row: {
          coins_awarded: number
          created_at: string
          id: string
          rank: number
          user_id: string
          week_start: string
          xp_awarded: number
        }
        Insert: {
          coins_awarded?: number
          created_at?: string
          id?: string
          rank: number
          user_id: string
          week_start: string
          xp_awarded?: number
        }
        Update: {
          coins_awarded?: number
          created_at?: string
          id?: string
          rank?: number
          user_id?: string
          week_start?: string
          xp_awarded?: number
        }
        Relationships: []
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
      _seed_three_daily_quests: {
        Args: { p_local_date: string; p_user: string }
        Returns: undefined
      }
      _seed_three_weekly_quests: {
        Args: { p_user: string; p_week_start: string }
        Returns: undefined
      }
      abandon_quest: { Args: { p_quest_id: string }; Returns: Json }
      adaptive_quest_pick: { Args: { p_user: string }; Returns: Json }
      add_custom_quest: {
        Args: {
          p_description?: string
          p_difficulty?: number
          p_quest_type: Database["public"]["Enums"]["quest_type"]
          p_title: string
        }
        Returns: Json
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      claim_event_rewards: { Args: { p_event: string }; Returns: Json }
      cleanup_expired_messages: { Args: never; Returns: undefined }
      cleanup_orphan_quests: { Args: never; Returns: Json }
      complete_quest: { Args: { p_quest_id: string }; Returns: Json }
      compute_activity_xp: {
        Args: { p_duration: number; p_subtype: string; p_type: string }
        Returns: number
      }
      compute_adaptive_state: { Args: { p_user: string }; Returns: Json }
      compute_quest_xp: {
        Args: {
          p_difficulty: number
          p_type: Database["public"]["Enums"]["quest_type"]
          p_user: string
        }
        Returns: Json
      }
      create_party: { Args: { p_name: string }; Returns: Json }
      depth_softcap: { Args: { k?: number; x: number }; Returns: number }
      depth_xp_multiplier: { Args: { p_user: string }; Returns: number }
      evaluate_status_effects: { Args: { p_user?: string }; Returns: Json }
      expire_active_effects: { Args: never; Returns: Json }
      generate_epic_options: { Args: never; Returns: Json }
      generate_quests: { Args: { p_force?: boolean }; Returns: Json }
      generate_weekly_options: { Args: never; Returns: Json }
      get_active_xp_multiplier: { Args: { p_user: string }; Returns: number }
      get_adaptive_dashboard: { Args: never; Returns: Json }
      get_behavior_profile: { Args: never; Returns: Json }
      get_class_xp_multiplier: {
        Args: { p_type: string; p_user: string }
        Returns: number
      }
      get_conversation: {
        Args: { p_limit?: number; p_other: string }
        Returns: {
          content: string
          created_at: string
          delivered_at: string
          expires_at: string
          id: string
          receiver_id: string
          seen_at: string
          sender_id: string
          status: Database["public"]["Enums"]["dm_status"]
          type: Database["public"]["Enums"]["dm_type"]
        }[]
      }
      get_depth_dashboard: { Args: never; Returns: Json }
      get_event_dashboard: { Args: never; Returns: Json }
      get_fatigue_multiplier: { Args: { p_fatigue: number }; Returns: number }
      get_life_score: { Args: never; Returns: Json }
      get_public_profiles: {
        Args: { p_user_ids: string[] }
        Returns: {
          avatar_url: string
          level: number
          user_id: string
          username: string
        }[]
      }
      get_repeat_multiplier: {
        Args: { p_subtype: string; p_type: string; p_user: string }
        Returns: number
      }
      get_stat_xp_multiplier: {
        Args: { p_type: string; p_user: string }
        Returns: number
      }
      get_status_difficulty_modifier: {
        Args: { p_user: string }
        Returns: number
      }
      get_status_xp_multiplier: { Args: { p_user: string }; Returns: number }
      get_streak_skill_bonus: { Args: { p_user: string }; Returns: number }
      hard_daily_reset: { Args: { p_local_date: string }; Returns: Json }
      hard_weekly_reset: { Args: { p_local_week_start: string }; Returns: Json }
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
      is_party_leader: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      is_party_member: {
        Args: { _party_id: string; _user_id: string }
        Returns: boolean
      }
      is_quest_timer_valid: {
        Args: {
          p_completed_at: string
          p_duration_minutes: number
          p_ends_at: string
          p_started_at: string
        }
        Returns: boolean
      }
      join_event: { Args: { p_event: string }; Returns: Json }
      join_party: { Args: { p_invite_code: string }; Returns: Json }
      join_seasonal_template: { Args: { p_template: string }; Returns: Json }
      kick_party_member: { Args: { p_target: string }; Returns: Json }
      leave_party: { Args: never; Returns: Json }
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
      mark_messages_delivered: { Args: { p_sender: string }; Returns: number }
      mark_messages_seen: { Args: { p_sender: string }; Returns: number }
      pause_quest: { Args: { p_quest_id: string }; Returns: Json }
      purchase_shop_item: {
        Args: { p_item_id: string; p_quantity?: number }
        Returns: Json
      }
      recompute_depth_state: { Args: { p_user: string }; Returns: Json }
      record_event_progress_for_user: {
        Args: { p_event_kind: string; p_payload: Json; p_user: string }
        Returns: undefined
      }
      recover_fatigue: { Args: never; Returns: Json }
      refresh_leaderboard_entry: { Args: { p_user?: string }; Returns: Json }
      regenerate_daily_slot: { Args: { p_slot: number }; Returns: Json }
      regenerate_daily_slots_all: { Args: never; Returns: Json }
      remove_friend: { Args: { p_friend_id: string }; Returns: Json }
      reset_daily_quests: { Args: { p_user: string }; Returns: undefined }
      reset_weekly_leaderboard: { Args: never; Returns: Json }
      respond_friend_request: {
        Args: { p_accept: boolean; p_id: string }
        Returns: Json
      }
      resume_quest: { Args: { p_quest_id: string }; Returns: Json }
      roll_weekly_events_for_user: { Args: { p_user?: string }; Returns: Json }
      search_users: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          friendship_status: string
          level: number
          user_id: string
          username: string
        }[]
      }
      seed_compulsory_quests: { Args: never; Returns: Json }
      select_character_class: {
        Args: {
          p_class: Database["public"]["Enums"]["character_class"]
          p_pay_to_skip?: boolean
        }
        Returns: Json
      }
      select_quest_option: { Args: { p_quest_id: string }; Returns: Json }
      send_direct_message: {
        Args: {
          p_content: string
          p_receiver: string
          p_type?: Database["public"]["Enums"]["dm_type"]
        }
        Returns: Json
      }
      send_friend_request: { Args: { p_username: string }; Returns: Json }
      set_party_goal: {
        Args: { p_metric: string; p_target: number; p_title: string }
        Returns: Json
      }
      set_party_settings: {
        Args: { p_accountability: boolean; p_name: string }
        Returns: Json
      }
      start_quest: {
        Args: { p_duration_minutes?: number; p_quest_id: string }
        Returns: Json
      }
      tick_event_lifecycle: { Args: never; Returns: Json }
      tick_party_streaks_daily: { Args: never; Returns: Json }
      unlock_quest: { Args: { p_quest_id: string }; Returns: Json }
      upgrade_skill: { Args: { p_skill_id: string }; Returns: Json }
      use_inventory_item: { Args: { p_item_id: string }; Returns: Json }
    }
    Enums: {
      activity_difficulty: "easy" | "medium" | "hard"
      character_class: "scholar" | "warrior" | "creator" | "leader"
      dm_status: "sent" | "delivered" | "seen"
      dm_type: "text" | "image"
      event_scope: "weekly" | "seasonal" | "global"
      event_status: "upcoming" | "active" | "completed" | "expired"
      friendship_status: "pending" | "accepted" | "blocked"
      participation_status:
        | "not_joined"
        | "active"
        | "completed"
        | "expired"
        | "claimed"
      party_role: "leader" | "member"
      quest_energy: "low" | "medium" | "high"
      quest_status:
        | "active"
        | "completed"
        | "failed"
        | "paused"
        | "locked"
        | "candidate"
        | "discarded"
        | "in_progress"
      quest_type: "daily" | "weekly" | "epic" | "dynamic"
      stat_kind: "intelligence" | "strength" | "discipline" | "charisma"
      status_effect_kind: "burnout" | "flow_state" | "fatigue"
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
      character_class: ["scholar", "warrior", "creator", "leader"],
      dm_status: ["sent", "delivered", "seen"],
      dm_type: ["text", "image"],
      event_scope: ["weekly", "seasonal", "global"],
      event_status: ["upcoming", "active", "completed", "expired"],
      friendship_status: ["pending", "accepted", "blocked"],
      participation_status: [
        "not_joined",
        "active",
        "completed",
        "expired",
        "claimed",
      ],
      party_role: ["leader", "member"],
      quest_energy: ["low", "medium", "high"],
      quest_status: [
        "active",
        "completed",
        "failed",
        "paused",
        "locked",
        "candidate",
        "discarded",
        "in_progress",
      ],
      quest_type: ["daily", "weekly", "epic", "dynamic"],
      stat_kind: ["intelligence", "strength", "discipline", "charisma"],
      status_effect_kind: ["burnout", "flow_state", "fatigue"],
    },
  },
} as const
