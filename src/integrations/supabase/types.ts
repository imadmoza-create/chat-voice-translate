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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      community_messages: {
        Row: {
          account_number: number | null
          content: string
          created_at: string
          display_name: string | null
          id: string
          lang: string
          user_id: string
        }
        Insert: {
          account_number?: number | null
          content: string
          created_at?: string
          display_name?: string | null
          id?: string
          lang: string
          user_id: string
        }
        Update: {
          account_number?: number | null
          content?: string
          created_at?: string
          display_name?: string | null
          id?: string
          lang?: string
          user_id?: string
        }
        Relationships: []
      }
      learning_progress: {
        Row: {
          completed_themes: string[]
          created_at: string
          id: string
          last_active_date: string | null
          level: string
          streak: number
          target_lang: string
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          completed_themes?: string[]
          created_at?: string
          id?: string
          last_active_date?: string | null
          level?: string
          streak?: number
          target_lang: string
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          completed_themes?: string[]
          created_at?: string
          id?: string
          last_active_date?: string | null
          level?: string
          streak?: number
          target_lang?: string
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_number: number
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          account_number?: number
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          account_number?: number
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      translations: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          mode: string
          source_lang: string | null
          source_text: string
          target_lang: string
          translated_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          mode?: string
          source_lang?: string | null
          source_text: string
          target_lang: string
          translated_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          mode?: string
          source_lang?: string | null
          source_text?: string
          target_lang?: string
          translated_text?: string
          user_id?: string
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          until: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          until: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          until?: string
          user_id?: string
        }
        Relationships: []
      }
      user_strikes: {
        Row: {
          count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vocab_reviews: {
        Row: {
          created_at: string
          due_at: string
          ease: number
          id: string
          interval_days: number
          lang: string
          level: string
          reps: number
          translation: string
          updated_at: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          lang: string
          level?: string
          reps?: number
          translation: string
          updated_at?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          lang?: string
          level?: string
          reps?: number
          translation?: string
          updated_at?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
