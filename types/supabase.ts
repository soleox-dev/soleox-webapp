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
      agents: {
        Row: {
          agent_email: string | null
          agent_name: string
          agent_offboard_date: string | null
          agent_onboard_date: string | null
          agent_phone: string | null
          agent_status: string | null
          archived: boolean | null
          client_id: string | null
          commission_attributes: Json | null
          created_at: string | null
          created_by: string | null
          custom_attributes: Json | null
          group_id: string | null
          id: string
          is_team_lead: boolean | null
          tms_id: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          agent_email?: string | null
          agent_name: string
          agent_offboard_date?: string | null
          agent_onboard_date?: string | null
          agent_phone?: string | null
          agent_status?: string | null
          archived?: boolean | null
          client_id?: string | null
          commission_attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          group_id?: string | null
          id?: string
          is_team_lead?: boolean | null
          tms_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          agent_email?: string | null
          agent_name?: string
          agent_offboard_date?: string | null
          agent_onboard_date?: string | null
          agent_phone?: string | null
          agent_status?: string | null
          archived?: boolean | null
          client_id?: string | null
          commission_attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          group_id?: string | null
          id?: string
          is_team_lead?: boolean | null
          tms_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      client_field_configurations: {
        Row: {
          archived: boolean | null
          calculation_formula: string | null
          client_id: string | null
          created_at: string | null
          dropdown_options: string[] | null
          field_key: string
          field_label: string
          field_type: string | null
          id: string
          is_enabled: boolean | null
          is_required: boolean | null
          is_system: boolean | null
          max_length: number | null
          max_value: number | null
          min_date: string | null
          min_value: number | null
          regex_mode: string | null
          regex_pattern: string | null
          section_name: string | null
          section_sort_order: number | null
          sort_order: number | null
          storage_type: string | null
          target_table: string
          updated_at: string | null
          updated_by: string | null
          visibility_rules: Json | null
        }
        Insert: {
          archived?: boolean | null
          calculation_formula?: string | null
          client_id?: string | null
          created_at?: string | null
          dropdown_options?: string[] | null
          field_key: string
          field_label: string
          field_type?: string | null
          id?: string
          is_enabled?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_date?: string | null
          min_value?: number | null
          regex_mode?: string | null
          regex_pattern?: string | null
          section_name?: string | null
          section_sort_order?: number | null
          sort_order?: number | null
          storage_type?: string | null
          target_table: string
          updated_at?: string | null
          updated_by?: string | null
          visibility_rules?: Json | null
        }
        Update: {
          archived?: boolean | null
          calculation_formula?: string | null
          client_id?: string | null
          created_at?: string | null
          dropdown_options?: string[] | null
          field_key?: string
          field_label?: string
          field_type?: string | null
          id?: string
          is_enabled?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_date?: string | null
          min_value?: number | null
          regex_mode?: string | null
          regex_pattern?: string | null
          section_name?: string | null
          section_sort_order?: number | null
          sort_order?: number | null
          storage_type?: string | null
          target_table?: string
          updated_at?: string | null
          updated_by?: string | null
          visibility_rules?: Json | null
        }
        Relationships: []
      }
      client_lookup_values: {
        Row: {
          archived: boolean | null
          category: string
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          option_label: string
          option_value: string
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          category: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          option_label: string
          option_value: string
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          category?: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          option_label?: string
          option_value?: string
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      client_user_roles: {
        Row: {
          agent_access_scope: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_primary_team: boolean | null
          role: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          agent_access_scope?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_primary_team?: boolean | null
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          agent_access_scope?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_primary_team?: boolean | null
          role?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_client_user_roles_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_client_user_roles_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "web_users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived: boolean | null
          billing_email: string | null
          client_name: string
          client_type: string
          created_at: string | null
          created_by: string | null
          currency_code: string | null
          custom_domain: string | null
          default_financial_visibility: string | null
          id: string
          logo_url: string | null
          max_users: number | null
          primary_color: string | null
          require_compliance_approval: boolean | null
          settings_json: Json | null
          status: string
          subscription_plan: string
          subscription_status: string
          track_detailed_payments: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          billing_email?: string | null
          client_name: string
          client_type?: string
          created_at?: string | null
          created_by?: string | null
          currency_code?: string | null
          custom_domain?: string | null
          default_financial_visibility?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          primary_color?: string | null
          require_compliance_approval?: boolean | null
          settings_json?: Json | null
          status?: string
          subscription_plan?: string
          subscription_status?: string
          track_detailed_payments?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          billing_email?: string | null
          client_name?: string
          client_type?: string
          created_at?: string | null
          created_by?: string | null
          currency_code?: string | null
          custom_domain?: string | null
          default_financial_visibility?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          primary_color?: string | null
          require_compliance_approval?: boolean | null
          settings_json?: Json | null
          status?: string
          subscription_plan?: string
          subscription_status?: string
          track_detailed_payments?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      commission_entities: {
        Row: {
          archived: boolean | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          created_by: string | null
          entity_name: string
          entity_type: string | null
          id: string
          is_active: boolean | null
          tax_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_name: string
          entity_type?: string | null
          id?: string
          is_active?: boolean | null
          tax_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_name?: string
          entity_type?: string | null
          id?: string
          is_active?: boolean | null
          tax_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      commission_template_logic: {
        Row: {
          archived: boolean | null
          calculation_formula: string | null
          cap_condition_key: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          payee_entity_id: string | null
          payee_type: string | null
          rule_name: string
          section: string | null
          step_number: number
          template_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          calculation_formula?: string | null
          cap_condition_key?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          payee_entity_id?: string | null
          payee_type?: string | null
          rule_name: string
          section?: string | null
          step_number: number
          template_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          calculation_formula?: string | null
          cap_condition_key?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          payee_entity_id?: string | null
          payee_type?: string | null
          rule_name?: string
          section?: string | null
          step_number?: number
          template_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      commission_template_parameters: {
        Row: {
          archived: boolean | null
          autofill_formula: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          data_type: string | null
          default_value: number | null
          id: string
          is_user_editable: boolean | null
          parameter_key: string
          parameter_name: string
          sort_order: number | null
          template_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          autofill_formula?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_type?: string | null
          default_value?: number | null
          id?: string
          is_user_editable?: boolean | null
          parameter_key: string
          parameter_name: string
          sort_order?: number | null
          template_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          autofill_formula?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_type?: string | null
          default_value?: number | null
          id?: string
          is_user_editable?: boolean | null
          parameter_key?: string
          parameter_name?: string
          sort_order?: number | null
          template_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      commission_template_submissions: {
        Row: {
          archived: boolean | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          status: string | null
          submitted_parameters: Json | null
          template_id: string
          transaction_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string | null
          submitted_parameters?: Json | null
          template_id: string
          transaction_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          status?: string | null
          submitted_parameters?: Json | null
          template_id?: string
          transaction_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      commission_templates: {
        Row: {
          archived: boolean | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          template_name: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archived?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          template_name: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archived?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          template_name?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_paid: number
          archived: boolean | null
          client_id: string | null
          commission_item_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          reference_number: string | null
          transaction_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount_paid?: number
          archived?: boolean | null
          client_id?: string | null
          commission_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          reference_number?: string | null
          transaction_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount_paid?: number
          archived?: boolean | null
          client_id?: string | null
          commission_item_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          reference_number?: string | null
          transaction_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_approve_payouts: boolean | null
          can_create: boolean | null
          can_delete: boolean | null
          can_read: boolean | null
          can_update: boolean | null
          created_at: string | null
          created_by: string | null
          id: string
          resource: string
          role: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          can_approve_payouts?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_read?: boolean | null
          can_update?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          resource: string
          role: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          can_approve_payouts?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_read?: boolean | null
          can_update?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          resource?: string
          role?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      transaction_commission_items: {
        Row: {
          agent_id: string | null
          archived: boolean | null
          calculated_amount: number | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          final_amount: number | null
          id: string
          is_manual_override: boolean | null
          override_reason: string | null
          payee_entity_id: string | null
          payee_type: string | null
          rule_name: string
          section: string | null
          step_number: number
          submission_id: string | null
          transaction_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agent_id?: string | null
          archived?: boolean | null
          calculated_amount?: number | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          final_amount?: number | null
          id?: string
          is_manual_override?: boolean | null
          override_reason?: string | null
          payee_entity_id?: string | null
          payee_type?: string | null
          rule_name: string
          section?: string | null
          step_number?: number
          submission_id?: string | null
          transaction_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agent_id?: string | null
          archived?: boolean | null
          calculated_amount?: number | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          final_amount?: number | null
          id?: string
          is_manual_override?: boolean | null
          override_reason?: string | null
          payee_entity_id?: string | null
          payee_type?: string | null
          rule_name?: string
          section?: string | null
          step_number?: number
          submission_id?: string | null
          transaction_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          acceptance_date: string | null
          address_details: Json | null
          agent_id: string | null
          archived: boolean | null
          client_id: string | null
          client_name: string | null
          closing_date: string | null
          co_broker: Json | null
          created_at: string | null
          created_by: string | null
          custom_attributes: Json | null
          finance_status: string | null
          gci_amount: number | null
          gci_perc: number | null
          gci_type: string | null
          id: string
          isa: string[] | null
          lead_owner: string | null
          lead_source: string | null
          list_date: string | null
          list_price: number | null
          notes: string | null
          property_address: string | null
          sales_price: number | null
          settlement_vendors: Json | null
          tms_id: string | null
          total_commission: number | null
          transaction_coordinator: string[] | null
          transaction_fee: number | null
          transaction_side: string | null
          transaction_status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          acceptance_date?: string | null
          address_details?: Json | null
          agent_id?: string | null
          archived?: boolean | null
          client_id?: string | null
          client_name?: string | null
          closing_date?: string | null
          co_broker?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          finance_status?: string | null
          gci_amount?: number | null
          gci_perc?: number | null
          gci_type?: string | null
          id?: string
          isa?: string[] | null
          lead_owner?: string | null
          lead_source?: string | null
          list_date?: string | null
          list_price?: number | null
          notes?: string | null
          property_address?: string | null
          sales_price?: number | null
          settlement_vendors?: Json | null
          tms_id?: string | null
          total_commission?: number | null
          transaction_coordinator?: string[] | null
          transaction_fee?: number | null
          transaction_side?: string | null
          transaction_status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          acceptance_date?: string | null
          address_details?: Json | null
          agent_id?: string | null
          archived?: boolean | null
          client_id?: string | null
          client_name?: string | null
          closing_date?: string | null
          co_broker?: Json | null
          created_at?: string | null
          created_by?: string | null
          custom_attributes?: Json | null
          finance_status?: string | null
          gci_amount?: number | null
          gci_perc?: number | null
          gci_type?: string | null
          id?: string
          isa?: string[] | null
          lead_owner?: string | null
          lead_source?: string | null
          list_date?: string | null
          list_price?: number | null
          notes?: string | null
          property_address?: string | null
          sales_price?: number | null
          settlement_vendors?: Json | null
          tms_id?: string | null
          total_commission?: number | null
          transaction_coordinator?: string[] | null
          transaction_fee?: number | null
          transaction_side?: string | null
          transaction_status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      web_users: {
        Row: {
          agent_id: string | null
          archived: boolean | null
          auth_provider_id: string | null
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          email: string
          first_name: string | null
          id: string
          last_login_at: string | null
          last_name: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agent_id?: string | null
          archived?: boolean | null
          auth_provider_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agent_id?: string | null
          archived?: boolean | null
          auth_provider_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_prefixed_id: { Args: { prefix: string }; Returns: string }
      get_request_email: { Args: never; Returns: string }
      is_client_admin: { Args: { target_client_id: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
