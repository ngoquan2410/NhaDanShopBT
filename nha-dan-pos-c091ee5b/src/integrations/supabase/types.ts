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
      ghn_quote_logs: {
        Row: {
          created_at: string
          district_name: string | null
          eta_max: number | null
          eta_min: number | null
          fee: number | null
          id: string
          latency_ms: number | null
          message: string | null
          ok: boolean
          order_code: string | null
          province_name: string | null
          raw_response: Json | null
          reason: string | null
          service_id: number | null
          subtotal: number | null
          ward_name: string | null
          weight_grams: number | null
        }
        Insert: {
          created_at?: string
          district_name?: string | null
          eta_max?: number | null
          eta_min?: number | null
          fee?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          ok?: boolean
          order_code?: string | null
          province_name?: string | null
          raw_response?: Json | null
          reason?: string | null
          service_id?: number | null
          subtotal?: number | null
          ward_name?: string | null
          weight_grams?: number | null
        }
        Update: {
          created_at?: string
          district_name?: string | null
          eta_max?: number | null
          eta_min?: number | null
          fee?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          ok?: boolean
          order_code?: string | null
          province_name?: string | null
          raw_response?: Json | null
          reason?: string | null
          service_id?: number | null
          subtotal?: number | null
          ward_name?: string | null
          weight_grams?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          date: string
          discount: number
          gift_lines: Json
          id: string
          items: Json
          note: string | null
          number: string
          paid_amount: number
          payment_type: string
          pending_order_id: string | null
          pricing_breakdown_snapshot: Json | null
          promotion_snapshot: Json | null
          shipping_address: Json | null
          shipping_fee: number
          shipping_quote_snapshot: Json | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          voucher_snapshot: Json | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          date?: string
          discount?: number
          gift_lines?: Json
          id?: string
          items?: Json
          note?: string | null
          number: string
          paid_amount?: number
          payment_type?: string
          pending_order_id?: string | null
          pricing_breakdown_snapshot?: Json | null
          promotion_snapshot?: Json | null
          shipping_address?: Json | null
          shipping_fee?: number
          shipping_quote_snapshot?: Json | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          voucher_snapshot?: Json | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          date?: string
          discount?: number
          gift_lines?: Json
          id?: string
          items?: Json
          note?: string | null
          number?: string
          paid_amount?: number
          payment_type?: string
          pending_order_id?: string | null
          pricing_breakdown_snapshot?: Json | null
          promotion_snapshot?: Json | null
          shipping_address?: Json | null
          shipping_fee?: number
          shipping_quote_snapshot?: Json | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          voucher_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_pending_order_id_fkey"
            columns: ["pending_order_id"]
            isOneToOne: false
            referencedRelation: "pending_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number
          bank_account: string | null
          bank_sub_acc: string | null
          created_at: string
          id: string
          linked_at: string | null
          linked_by: string | null
          linked_order_code: string | null
          matched_code: string | null
          provider: string
          provider_tx_id: string
          raw_payload: Json | null
          status: string
          transfer_content: string
          tx_time: string | null
        }
        Insert: {
          amount: number
          bank_account?: string | null
          bank_sub_acc?: string | null
          created_at?: string
          id?: string
          linked_at?: string | null
          linked_by?: string | null
          linked_order_code?: string | null
          matched_code?: string | null
          provider?: string
          provider_tx_id: string
          raw_payload?: Json | null
          status?: string
          transfer_content?: string
          tx_time?: string | null
        }
        Update: {
          amount?: number
          bank_account?: string | null
          bank_sub_acc?: string | null
          created_at?: string
          id?: string
          linked_at?: string | null
          linked_by?: string | null
          linked_order_code?: string | null
          matched_code?: string | null
          provider?: string
          provider_tx_id?: string
          raw_payload?: Json | null
          status?: string
          transfer_content?: string
          tx_time?: string | null
        }
        Relationships: []
      }
      pending_orders: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount: number
          gift_lines: Json
          id: string
          items: Json
          note: string | null
          paid_amount: number
          payment_type: string
          pricing_breakdown_snapshot: Json | null
          promotion_snapshot: Json | null
          shipping_address: Json | null
          shipping_fee: number
          shipping_quote_snapshot: Json | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          voucher_snapshot: Json | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          discount?: number
          gift_lines?: Json
          id?: string
          items?: Json
          note?: string | null
          paid_amount?: number
          payment_type?: string
          pricing_breakdown_snapshot?: Json | null
          promotion_snapshot?: Json | null
          shipping_address?: Json | null
          shipping_fee?: number
          shipping_quote_snapshot?: Json | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          voucher_snapshot?: Json | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount?: number
          gift_lines?: Json
          id?: string
          items?: Json
          note?: string | null
          paid_amount?: number
          payment_type?: string
          pricing_breakdown_snapshot?: Json | null
          promotion_snapshot?: Json | null
          shipping_address?: Json | null
          shipping_fee?: number
          shipping_quote_snapshot?: Json | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          voucher_snapshot?: Json | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_admin: { Args: never; Returns: boolean }
      get_order_by_code: {
        Args: { _code: string; _phone: string }
        Returns: {
          code: string
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          items: Json
          paid_amount: number
          payment_type: string
          shipping_address: Json
          status: string
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
