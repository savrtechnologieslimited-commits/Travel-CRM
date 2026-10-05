export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          meta: Json;
          summary: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          meta?: Json;
          summary?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          meta?: Json;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      crm_tenants: {
        Row: {
          created_at: string;
          crm_data_isolation_status: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          crm_data_isolation_status?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          crm_data_isolation_status?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_memberships: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "crm_tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_connections: {
        Row: {
          access_token_secret_ref: string | null;
          business_name: string | null;
          connected_at: string | null;
          connection_status: string;
          created_at: string;
          display_phone_number: string | null;
          id: string;
          last_connected_at: string | null;
          last_error: string | null;
          last_webhook_at: string | null;
          meta_app_id: string | null;
          meta_business_id: string | null;
          onboarding_status: string;
          phone_number_id: string | null;
          tenant_id: string;
          token_expires_at: string | null;
          updated_at: string;
          waba_id: string | null;
          webhook_status: string;
        };
        Insert: {
          access_token_secret_ref?: string | null;
          business_name?: string | null;
          connected_at?: string | null;
          connection_status?: string;
          created_at?: string;
          display_phone_number?: string | null;
          id?: string;
          last_connected_at?: string | null;
          last_error?: string | null;
          last_webhook_at?: string | null;
          meta_app_id?: string | null;
          meta_business_id?: string | null;
          onboarding_status?: string;
          phone_number_id?: string | null;
          tenant_id: string;
          token_expires_at?: string | null;
          updated_at?: string;
          waba_id?: string | null;
          webhook_status?: string;
        };
        Update: {
          access_token_secret_ref?: string | null;
          business_name?: string | null;
          connected_at?: string | null;
          connection_status?: string;
          created_at?: string;
          display_phone_number?: string | null;
          id?: string;
          last_connected_at?: string | null;
          last_error?: string | null;
          last_webhook_at?: string | null;
          meta_app_id?: string | null;
          meta_business_id?: string | null;
          onboarding_status?: string;
          phone_number_id?: string | null;
          tenant_id?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          waba_id?: string | null;
          webhook_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "crm_tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcasts: {
        Row: {
          audience_mode: string;
          body: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          scheduled_for: string | null;
          status: string;
          template_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          audience_mode?: string;
          body: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          scheduled_for?: string | null;
          status?: string;
          template_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          audience_mode?: string;
          body?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          scheduled_for?: string | null;
          status?: string;
          template_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcasts_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "message_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_recipients: {
        Row: {
          broadcast_id: string;
          conversation_id: string | null;
          created_at: string;
          customer_id: string | null;
          display_name: string;
          failure_reason: string | null;
          id: string;
          lead_id: string | null;
          meta_message_id: string | null;
          phone: string;
          recipient_id: string;
          recipient_type: string;
          sent_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          broadcast_id: string;
          conversation_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          display_name: string;
          failure_reason?: string | null;
          id?: string;
          lead_id?: string | null;
          meta_message_id?: string | null;
          phone: string;
          recipient_id: string;
          recipient_type: string;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          broadcast_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          display_name?: string;
          failure_reason?: string | null;
          id?: string;
          lead_id?: string | null;
          meta_message_id?: string | null;
          phone?: string;
          recipient_id?: string;
          recipient_type?: string;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcast_recipients_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcast_recipients_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broadcast_recipients_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      broadcast_runs: {
        Row: {
          broadcast_id: string;
          created_at: string;
          finished_at: string | null;
          id: string;
          started_at: string;
          status: string;
          summary: Json | null;
        };
        Insert: {
          broadcast_id: string;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status: string;
          summary?: Json | null;
        };
        Update: {
          broadcast_id?: string;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status?: string;
          summary?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "broadcast_runs_broadcast_id_fkey";
            columns: ["broadcast_id"];
            isOneToOne: false;
            referencedRelation: "broadcasts";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_services: {
        Row: {
          activity_date: string | null;
          activity_name: string;
          activity_type: string;
          adults: number;
          booking_item_id: string | null;
          children: number;
          city: string | null;
          confirmation_number: string | null;
          created_at: string;
          created_by: string | null;
          duration_hours: number | null;
          end_time: string | null;
          id: string;
          location: string | null;
          meeting_point: string | null;
          notes: string | null;
          quotation_item_id: string | null;
          start_time: string | null;
          status: string;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          activity_date?: string | null;
          activity_name: string;
          activity_type?: string;
          adults?: number;
          booking_item_id?: string | null;
          children?: number;
          city?: string | null;
          confirmation_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_hours?: number | null;
          end_time?: string | null;
          id?: string;
          location?: string | null;
          meeting_point?: string | null;
          notes?: string | null;
          quotation_item_id?: string | null;
          start_time?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          activity_date?: string | null;
          activity_name?: string;
          activity_type?: string;
          adults?: number;
          booking_item_id?: string | null;
          children?: number;
          city?: string | null;
          confirmation_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_hours?: number | null;
          end_time?: string | null;
          id?: string;
          location?: string | null;
          meeting_point?: string | null;
          notes?: string | null;
          quotation_item_id?: string | null;
          start_time?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_services_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_services_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_services_quotation_item_id_fkey";
            columns: ["quotation_item_id"];
            isOneToOne: false;
            referencedRelation: "quotation_items";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_photo_library: {
        Row: {
          id: string;
          google_place_id: string;
          place_name: string;
          place_address: string;
          storage_path: string;
          caption: string | null;
          alt_text: string | null;
          display_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_place_id: string;
          place_name: string;
          place_address: string;
          storage_path: string;
          caption?: string | null;
          alt_text?: string | null;
          display_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          google_place_id?: string;
          place_name?: string;
          place_address?: string;
          storage_path?: string;
          caption?: string | null;
          alt_text?: string | null;
          display_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_photo_library_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_items: {
        Row: {
          booking_id: string;
          cost_price: number;
          cost_price_inr: number | null;
          created_at: string;
          details: Json;
          end_date: string | null;
          fulfilment_mode: string;
          id: string;
          item_type: string;
          quantity: number;
          sell_price: number;
          sell_price_inr: number | null;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          start_date: string | null;
          status: string;
          supplier_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          cost_price?: number;
          cost_price_inr?: number | null;
          created_at?: string;
          details?: Json;
          end_date?: string | null;
          fulfilment_mode?: string;
          id?: string;
          item_type?: string;
          quantity?: number;
          sell_price?: number;
          sell_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          start_date?: string | null;
          status?: string;
          supplier_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          cost_price?: number;
          cost_price_inr?: number | null;
          created_at?: string;
          details?: Json;
          end_date?: string | null;
          fulfilment_mode?: string;
          id?: string;
          item_type?: string;
          quantity?: number;
          sell_price?: number;
          sell_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          start_date?: string | null;
          status?: string;
          supplier_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_travellers: {
        Row: {
          booking_id: string;
          created_at: string;
          id: string;
          traveller_id: string;
          updated_at: string;
        };
        Insert: {
          booking_id: string;
          created_at?: string;
          id?: string;
          traveller_id: string;
          updated_at?: string;
        };
        Update: {
          booking_id?: string;
          created_at?: string;
          id?: string;
          traveller_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_travellers_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_travellers_traveller_id_fkey";
            columns: ["traveller_id"];
            isOneToOne: false;
            referencedRelation: "travellers";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          adults: number;
          amount_received: number;
          amount_received_inr: number | null;
          assigned_to: string | null;
          booking_date: string;
          children: number;
          city_nights: Json;
          code: string | null;
          cost_adjustment: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          deleted_at: string | null;
          destination_id: string | null;
          enquiry_id: string | null;
          exchange_rate: number;
          exchange_rate_updated_at: string | null;
          group_id: string | null;
          id: string;
          infants: number;
          invoice_code: string | null;
          invoice_date: string | null;
          notes: string | null;
          payment_deadline: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          price_adjustment: number;
          quotation_id: string | null;
          scope: Database["public"]["Enums"]["trip_scope"];
          status: Database["public"]["Enums"]["booking_status"];
          total_cost: number;
          total_cost_inr: number | null;
          total_price: number;
          total_price_inr: number | null;
          travel_end: string | null;
          travel_start: string | null;
          updated_at: string;
          updated_by: string | null;
          visa_status: Database["public"]["Enums"]["visa_status"];
        };
        Insert: {
          adults?: number;
          amount_received?: number;
          amount_received_inr?: number | null;
          assigned_to?: string | null;
          booking_date?: string;
          children?: number;
          city_nights?: Json;
          code?: string | null;
          cost_adjustment?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          deleted_at?: string | null;
          destination_id?: string | null;
          enquiry_id?: string | null;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          group_id?: string | null;
          id?: string;
          infants?: number;
          invoice_code?: string | null;
          invoice_date?: string | null;
          notes?: string | null;
          payment_deadline?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          price_adjustment?: number;
          quotation_id?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          status?: Database["public"]["Enums"]["booking_status"];
          total_cost?: number;
          total_cost_inr?: number | null;
          total_price?: number;
          total_price_inr?: number | null;
          travel_end?: string | null;
          travel_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visa_status?: Database["public"]["Enums"]["visa_status"];
        };
        Update: {
          adults?: number;
          amount_received?: number;
          amount_received_inr?: number | null;
          assigned_to?: string | null;
          booking_date?: string;
          children?: number;
          city_nights?: Json;
          code?: string | null;
          cost_adjustment?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          deleted_at?: string | null;
          destination_id?: string | null;
          enquiry_id?: string | null;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          group_id?: string | null;
          id?: string;
          infants?: number;
          invoice_code?: string | null;
          invoice_date?: string | null;
          notes?: string | null;
          payment_deadline?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          price_adjustment?: number;
          quotation_id?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          status?: Database["public"]["Enums"]["booking_status"];
          total_cost?: number;
          total_cost_inr?: number | null;
          total_price?: number;
          total_price_inr?: number | null;
          travel_end?: string | null;
          travel_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          visa_status?: Database["public"]["Enums"]["visa_status"];
        };
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "travel_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: false;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_rules: {
        Row: {
          action_type: string;
          config: Json;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          trigger_event: string;
          updated_at: string;
        };
        Insert: {
          action_type: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          trigger_event: string;
          updated_at?: string;
        };
        Update: {
          action_type?: string;
          config?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          trigger_event?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      communications: {
        Row: {
          body: string | null;
          booking_id: string | null;
          channel: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          direction: string;
          enquiry_id: string | null;
          id: string;
          lead_id: string | null;
          occurred_at: string;
          status: string;
          subject: string | null;
        };
        Insert: {
          body?: string | null;
          booking_id?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          direction?: string;
          enquiry_id?: string | null;
          id?: string;
          lead_id?: string | null;
          occurred_at?: string;
          status?: string;
          subject?: string | null;
        };
        Update: {
          body?: string | null;
          booking_id?: string | null;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          direction?: string;
          enquiry_id?: string | null;
          id?: string;
          lead_id?: string | null;
          occurred_at?: string;
          status?: string;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "communications_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          city: string | null;
          code: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          date_of_birth: string | null;
          deleted_at: string | null;
          email: string | null;
          emergency_contact: string | null;
          full_name: string;
          gstin: string | null;
          id: string;
          mobile: string | null;
          nationality: string | null;
          notes: string | null;
          owner_id: string | null;
          pan: string | null;
          passport_expiry: string | null;
          passport_number: string | null;
          preferences: string | null;
          segment: string;
          state: string | null;
          tags: string[] | null;
          updated_at: string;
          updated_by: string | null;
          wa_parent_user_id: string | null;
          wa_user_id: string | null;
          wa_username: string | null;
          whatsapp_opt_in: boolean;
          whatsapp_opt_in_at: string | null;
          whatsapp: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          code?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact?: string | null;
          full_name: string;
          gstin?: string | null;
          id?: string;
          mobile?: string | null;
          nationality?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pan?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          preferences?: string | null;
          segment?: string;
          state?: string | null;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          wa_parent_user_id?: string | null;
          wa_user_id?: string | null;
          wa_username?: string | null;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          code?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact?: string | null;
          full_name?: string;
          gstin?: string | null;
          id?: string;
          mobile?: string | null;
          nationality?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pan?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          preferences?: string | null;
          segment?: string;
          state?: string | null;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          wa_parent_user_id?: string | null;
          wa_user_id?: string | null;
          wa_username?: string | null;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_flow_requirements: {
        Row: {
          answers: Json;
          completed_at: string;
          created_at: string;
          customer_id: string;
          destination_id: string | null;
          enquiry_id: string | null;
          flow_name: string;
          id: string;
          is_partial: boolean;
          lead_id: string | null;
          wacrm_conversation_id: string | null;
          wacrm_contact_id: string;
          wacrm_flow_id: string;
          wacrm_run_id: string;
        };
        Insert: {
          answers?: Json;
          completed_at: string;
          created_at?: string;
          customer_id: string;
          destination_id?: string | null;
          enquiry_id?: string | null;
          flow_name: string;
          id?: string;
          is_partial?: boolean;
          lead_id?: string | null;
          wacrm_conversation_id?: string | null;
          wacrm_contact_id: string;
          wacrm_flow_id: string;
          wacrm_run_id: string;
        };
        Update: {
          answers?: Json;
          completed_at?: string;
          created_at?: string;
          customer_id?: string;
          destination_id?: string | null;
          enquiry_id?: string | null;
          flow_name?: string;
          id?: string;
          is_partial?: boolean;
          lead_id?: string | null;
          wacrm_conversation_id?: string | null;
          wacrm_contact_id?: string;
          wacrm_flow_id?: string;
          wacrm_run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_flow_requirements_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_flow_requirements_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_flow_requirements_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_flow_requirements_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_reports: {
        Row: {
          blockers: string | null;
          calls_made: number;
          created_at: string;
          hours_worked: number;
          id: string;
          meetings_count: number;
          pending_work: string | null;
          report_date: string;
          status: string;
          summary: string | null;
          updated_at: string;
          user_id: string | null;
          work_done: string | null;
        };
        Insert: {
          blockers?: string | null;
          calls_made?: number;
          created_at?: string;
          hours_worked?: number;
          id?: string;
          meetings_count?: number;
          pending_work?: string | null;
          report_date?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
          work_done?: string | null;
        };
        Update: {
          blockers?: string | null;
          calls_made?: number;
          created_at?: string;
          hours_worked?: number;
          id?: string;
          meetings_count?: number;
          pending_work?: string | null;
          report_date?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
          user_id?: string | null;
          work_done?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      destinations: {
        Row: {
          country: string;
          created_at: string;
          display_order: number;
          id: string;
          is_active: boolean;
          name: string;
          region: string | null;
          scope: Database["public"]["Enums"]["trip_scope"];
          updated_at: string;
        };
        Insert: {
          country?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name: string;
          region?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          updated_at?: string;
        };
        Update: {
          country?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          region?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          updated_at?: string;
        };
        Relationships: [];
      };
      destination_employee_assignments: {
        Row: {
          created_at: string;
          destination_id: string;
          employee_id: string;
          id: string;
          is_active: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          destination_id: string;
          employee_id: string;
          id?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          destination_id?: string;
          employee_id?: string;
          id?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "destination_employee_assignments_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "destination_employee_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_series: {
        Row: {
          created_at: string;
          doc_type: string;
          fin_year: string;
          id: string;
          is_active: boolean;
          next_number: number;
          prefix: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          doc_type: string;
          fin_year: string;
          id?: string;
          is_active?: boolean;
          next_number?: number;
          prefix: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          doc_type?: string;
          fin_year?: string;
          id?: string;
          is_active?: boolean;
          next_number?: number;
          prefix?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          booking_id: string | null;
          created_at: string;
          customer_id: string | null;
          doc_type: string;
          expiry_date: string | null;
          file_path: string | null;
          id: string;
          name: string;
          notes: string | null;
          status: string;
          traveller_id: string | null;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          booking_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          doc_type?: string;
          expiry_date?: string | null;
          file_path?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          status?: string;
          traveller_id?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          booking_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          doc_type?: string;
          expiry_date?: string | null;
          file_path?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          status?: string;
          traveller_id?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_traveller_id_fkey";
            columns: ["traveller_id"];
            isOneToOne: false;
            referencedRelation: "travellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      enquiries: {
        Row: {
          activity_preferences: string[] | null;
          adults: number;
          arrival_city: string | null;
          assigned_to: string | null;
          budget_per_person: number | null;
          budget_per_person_inr: number | null;
          children: number;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          customer_id: string | null;
          deleted_at: string | null;
          departure_city: string | null;
          departure_date: string | null;
          destination_id: string | null;
          flight_preference: string | null;
          group_id: string | null;
          hotel_category: string | null;
          id: string;
          infants: number;
          enquiry_number: string | null;
          lead_id: string | null;
          meal_plan: string | null;
          multi_city: string[] | null;
          nights: number | null;
          requirements: string | null;
          return_date: string | null;
          room_type: string | null;
          scope: Database["public"]["Enums"]["trip_scope"];
          source: string;
          status: string;
          total_budget: number | null;
          total_budget_inr: number | null;
          transport_type: string | null;
          trip_types: string[] | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          activity_preferences?: string[] | null;
          adults?: number;
          arrival_city?: string | null;
          assigned_to?: string | null;
          budget_per_person?: number | null;
          budget_per_person_inr?: number | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          customer_id?: string | null;
          deleted_at?: string | null;
          departure_city?: string | null;
          departure_date?: string | null;
          destination_id?: string | null;
          flight_preference?: string | null;
          group_id?: string | null;
          hotel_category?: string | null;
          id?: string;
          infants?: number;
          enquiry_number?: string | null;
          lead_id?: string | null;
          meal_plan?: string | null;
          multi_city?: string[] | null;
          nights?: number | null;
          requirements?: string | null;
          return_date?: string | null;
          room_type?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          source?: string;
          status?: string;
          total_budget?: number | null;
          total_budget_inr?: number | null;
          transport_type?: string | null;
          trip_types?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          activity_preferences?: string[] | null;
          adults?: number;
          arrival_city?: string | null;
          assigned_to?: string | null;
          budget_per_person?: number | null;
          budget_per_person_inr?: number | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          customer_id?: string | null;
          deleted_at?: string | null;
          departure_city?: string | null;
          departure_date?: string | null;
          destination_id?: string | null;
          flight_preference?: string | null;
          group_id?: string | null;
          hotel_category?: string | null;
          id?: string;
          infants?: number;
          enquiry_number?: string | null;
          lead_id?: string | null;
          meal_plan?: string | null;
          multi_city?: string[] | null;
          nights?: number | null;
          requirements?: string | null;
          return_date?: string | null;
          room_type?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          source?: string;
          status?: string;
          total_budget?: number | null;
          total_budget_inr?: number | null;
          transport_type?: string | null;
          trip_types?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "enquiries_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "travel_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          amount_inr: number | null;
          category: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          description: string | null;
          expense_date: string;
          id: string;
          method: string;
          notes: string | null;
          paid_to: string | null;
          reference: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          amount_inr?: number | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_to?: string | null;
          reference?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          amount_inr?: number | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_to?: string | null;
          reference?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      google_activity_places_cache: {
        Row: {
          place_data: Json;
          place_id: string;
          updated_at: string;
        };
        Insert: {
          place_data: Json;
          place_id: string;
          updated_at?: string;
        };
        Update: {
          place_data?: Json;
          place_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_activity_place_search_cache: {
        Row: {
          place_ids: Json;
          search_key: string;
          updated_at: string;
        };
        Insert: {
          place_ids: Json;
          search_key: string;
          updated_at?: string;
        };
        Update: {
          place_ids?: Json;
          search_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hotel_bookings: {
        Row: {
          address: string | null;
          adults: number;
          booking_item_id: string | null;
          cancellation_deadline: string | null;
          check_in: string | null;
          check_out: string | null;
          children: number;
          city: string | null;
          confirmation_number: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          extra_beds: number;
          hotel_name: string;
          id: string;
          meal_plan: string | null;
          nights: number | null;
          notes: string | null;
          quotation_item_id: string | null;
          room_type: string | null;
          rooms: number;
          star_category: string | null;
          status: string;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          adults?: number;
          booking_item_id?: string | null;
          cancellation_deadline?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          children?: number;
          city?: string | null;
          confirmation_number?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          extra_beds?: number;
          hotel_name: string;
          id?: string;
          meal_plan?: string | null;
          nights?: number | null;
          notes?: string | null;
          quotation_item_id?: string | null;
          room_type?: string | null;
          rooms?: number;
          star_category?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          adults?: number;
          booking_item_id?: string | null;
          cancellation_deadline?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          children?: number;
          city?: string | null;
          confirmation_number?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          extra_beds?: number;
          hotel_name?: string;
          id?: string;
          meal_plan?: string | null;
          nights?: number | null;
          notes?: string | null;
          quotation_item_id?: string | null;
          room_type?: string | null;
          rooms?: number;
          star_category?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hotel_bookings_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hotel_bookings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hotel_bookings_quotation_item_id_fkey";
            columns: ["quotation_item_id"];
            isOneToOne: false;
            referencedRelation: "quotation_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hotel_bookings_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      itineraries: {
        Row: {
          adults: number;
          assigned_to: string | null;
          booking_id: string | null;
          cancellation_info: string;
          terms_conditions: string;
          children: number;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          description: string | null;
          destination_id: string | null;
          document_mime_type: string | null;
          document_name: string | null;
          document_path: string | null;
          document_size: number | null;
          duration_days: number | null;
          duration_nights: number | null;
          enquiry_id: string | null;
          hotel_category: string | null;
          id: string;
          inclusions: Json;
          exclusions: Json;
          custom_tables: Json;
          customer_id: string | null;
          customer_quotes: Json;
          lead_id: string | null;
          status: string;
          travel_end_date: string | null;
          travel_start_date: string | null;
          is_active: boolean;
          show_in_customer_bookings: boolean;
          name: string;
          package_id: string | null;
          price: number | null;
          price_inr: number | null;
          quotation_id: string | null;
          summary: string | null;
          title: string | null;
          trip_type: string | null;
          updated_at: string;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          adults?: number;
          assigned_to?: string | null;
          booking_id?: string | null;
          cancellation_info?: string;
          terms_conditions?: string;
          children?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          description?: string | null;
          destination_id?: string | null;
          document_mime_type?: string | null;
          document_name?: string | null;
          document_path?: string | null;
          document_size?: number | null;
          duration_days?: number | null;
          duration_nights?: number | null;
          enquiry_id?: string | null;
          hotel_category?: string | null;
          id?: string;
          inclusions?: Json;
          exclusions?: Json;
          custom_tables?: Json;
          customer_id?: string | null;
          customer_quotes?: Json;
          lead_id?: string | null;
          status?: string;
          travel_end_date?: string | null;
          travel_start_date?: string | null;
          is_active?: boolean;
          show_in_customer_bookings?: boolean;
          name?: string;
          package_id?: string | null;
          price?: number | null;
          price_inr?: number | null;
          quotation_id?: string | null;
          summary?: string | null;
          title?: string | null;
          trip_type?: string | null;
          updated_at?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          adults?: number;
          assigned_to?: string | null;
          booking_id?: string | null;
          cancellation_info?: string;
          terms_conditions?: string;
          children?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          description?: string | null;
          destination_id?: string | null;
          document_mime_type?: string | null;
          document_name?: string | null;
          document_path?: string | null;
          document_size?: number | null;
          duration_days?: number | null;
          duration_nights?: number | null;
          enquiry_id?: string | null;
          hotel_category?: string | null;
          id?: string;
          inclusions?: Json;
          exclusions?: Json;
          custom_tables?: Json;
          customer_id?: string | null;
          customer_quotes?: Json;
          lead_id?: string | null;
          status?: string;
          travel_end_date?: string | null;
          travel_start_date?: string | null;
          is_active?: boolean;
          show_in_customer_bookings?: boolean;
          name?: string;
          package_id?: string | null;
          price?: number | null;
          price_inr?: number | null;
          quotation_id?: string | null;
          summary?: string | null;
          title?: string | null;
          trip_type?: string | null;
          updated_at?: string;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "itineraries_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itineraries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itineraries_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itineraries_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itineraries_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itineraries_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: false;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_shares: {
        Row: {
          id: string;
          itinerary_id: string;
          package_id: string | null;
          template: string | null;
          token_hash: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          is_active: boolean;
          customer_pricing: Json | null;
        };
        Insert: {
          id?: string;
          itinerary_id: string;
          package_id?: string | null;
          template?: string | null;
          token_hash: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          is_active?: boolean;
          customer_pricing?: Json | null;
        };
        Update: {
          id?: string;
          itinerary_id?: string;
          package_id?: string | null;
          template?: string | null;
          token_hash?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          is_active?: boolean;
          customer_pricing?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_shares_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_shares_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_package_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_shares_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_days: {
        Row: {
          activities: string[] | null;
          city: string | null;
          created_at: string;
          day_date: string | null;
          day_number: number;
          description: string | null;
          drop_time: string | null;
          hotel: string | null;
          id: string;
          itinerary_id: string;
          meals: string | null;
          notes: string | null;
          pickup_time: string | null;
          title: string | null;
          transport: string | null;
          updated_at: string;
        };
        Insert: {
          itinerary_drafts: {
            Row: {
              created_at: string;
              draft_data: Json;
              id: string;
              itinerary_id: string | null;
              lead_id: string | null;
              updated_at: string;
              user_id: string;
            };
            Insert: {
              created_at?: string;
              draft_data: Json;
              id?: string;
              itinerary_id?: string | null;
              lead_id?: string | null;
              updated_at?: string;
              user_id: string;
            };
            Update: {
              created_at?: string;
              draft_data?: Json;
              id?: string;
              itinerary_id?: string | null;
              lead_id?: string | null;
              updated_at?: string;
              user_id?: string;
            };
            Relationships: [
              {
                foreignKeyName: "itinerary_drafts_itinerary_id_fkey";
                columns: ["itinerary_id"];
                isOneToOne: false;
                referencedRelation: "itineraries";
                referencedColumns: ["id"];
              },
              {
                foreignKeyName: "itinerary_drafts_lead_id_fkey";
                columns: ["lead_id"];
                isOneToOne: false;
                referencedRelation: "leads";
                referencedColumns: ["id"];
              },
              {
                foreignKeyName: "itinerary_drafts_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "profiles";
                referencedColumns: ["id"];
              },
            ];
          };
          activities?: string[] | null;
          city?: string | null;
          created_at?: string;
          day_date?: string | null;
          day_number?: number;
          description?: string | null;
          drop_time?: string | null;
          hotel?: string | null;
          id?: string;
          itinerary_id: string;
          meals?: string | null;
          notes?: string | null;
          pickup_time?: string | null;
          title?: string | null;
          transport?: string | null;
          updated_at?: string;
        };
        Update: {
          activities?: string[] | null;
          city?: string | null;
          created_at?: string;
          day_date?: string | null;
          day_number?: number;
          description?: string | null;
          drop_time?: string | null;
          hotel?: string | null;
          id?: string;
          itinerary_id?: string;
          meals?: string | null;
          notes?: string | null;
          pickup_time?: string | null;
          title?: string | null;
          transport?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_days_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_package_options: {
        Row: {
          id: string;
          itinerary_id: string;
          name: string;
          description: string | null;
          sequence: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          itinerary_id: string;
          name: string;
          description?: string | null;
          sequence?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          itinerary_id?: string;
          name?: string;
          description?: string | null;
          sequence?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_package_options_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_day_items: {
        Row: {
          id: string;
          itinerary_day_id: string;
          package_id: string | null;
          item_type: string;
          title: string;
          description: string;
          location: string | null;
          duration: string | null;
          notes: string | null;
          pickup: string | null;
          dropoff: string | null;
          departure_time: string | null;
          arrival_time: string | null;
          vehicle_details: string | null;
          meal_type: string | null;
          hotel_name: string | null;
          hotel_city: string | null;
          hotel_address: string | null;
          hotel_country: string | null;
          star_category: string | null;
          nights: number | null;
          room_type: string | null;
          rooms: number | null;
          adults: number | null;
          children: number | null;
          extra_beds: number | null;
          meal_plan: string | null;
          hotel_description: string | null;
          customer_facing_info: string | null;
          hotel_option_group: string | null;
          hotel_option_label: string | null;
          hotel_option_sequence: number | null;
          flight_airline: string | null;
          flight_number: string | null;
          departure_airport: string | null;
          departure_city: string | null;
          arrival_airport: string | null;
          arrival_city: string | null;
          flight_departure_date: string | null;
          flight_departure_time: string | null;
          flight_arrival_date: string | null;
          flight_arrival_time: string | null;
          flight_cabin: string | null;
          baggage_information: string | null;
          flight_duration: string | null;
          flight_price: number | null;
          flight_currency: string | null;
          visa_country: string | null;
          visa_type: string | null;
          visa_validity: string | null;
          visa_processing_time: string | null;
          visa_required_documents: string | null;
          visa_entry_exit_information: string | null;
          visa_customer_information: string | null;
          extra_transport_type: string | null;
          extra_transport_date: string | null;
          extra_transport_pickup_time: string | null;
          extra_transport_drop_time: string | null;
          extra_transport_vehicle_type: string | null;
          extra_transport_vehicle_details: string | null;
          extra_transport_driver_details: string | null;
          extra_transport_passengers: number | null;
          extra_transport_customer_notes: string | null;
          check_in: string | null;
          check_out: string | null;
          room_details: string | null;
          sequence: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          itinerary_day_id: string;
          package_id?: string | null;
          item_type: string;
          title: string;
          description?: string;
          location?: string | null;
          duration?: string | null;
          notes?: string | null;
          pickup?: string | null;
          dropoff?: string | null;
          departure_time?: string | null;
          arrival_time?: string | null;
          vehicle_details?: string | null;
          meal_type?: string | null;
          hotel_name?: string | null;
          hotel_city?: string | null;
          hotel_address?: string | null;
          hotel_country?: string | null;
          star_category?: string | null;
          nights?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          adults?: number | null;
          children?: number | null;
          extra_beds?: number | null;
          meal_plan?: string | null;
          hotel_description?: string | null;
          customer_facing_info?: string | null;
          hotel_option_group?: string | null;
          hotel_option_label?: string | null;
          hotel_option_sequence?: number | null;
          flight_airline?: string | null;
          flight_number?: string | null;
          departure_airport?: string | null;
          departure_city?: string | null;
          arrival_airport?: string | null;
          arrival_city?: string | null;
          flight_departure_date?: string | null;
          flight_departure_time?: string | null;
          flight_arrival_date?: string | null;
          flight_arrival_time?: string | null;
          flight_cabin?: string | null;
          baggage_information?: string | null;
          flight_duration?: string | null;
          flight_price?: number | null;
          flight_currency?: string | null;
          visa_country?: string | null;
          visa_type?: string | null;
          visa_validity?: string | null;
          visa_processing_time?: string | null;
          visa_required_documents?: string | null;
          visa_entry_exit_information?: string | null;
          visa_customer_information?: string | null;
          extra_transport_type?: string | null;
          extra_transport_date?: string | null;
          extra_transport_pickup_time?: string | null;
          extra_transport_drop_time?: string | null;
          extra_transport_vehicle_type?: string | null;
          extra_transport_vehicle_details?: string | null;
          extra_transport_driver_details?: string | null;
          extra_transport_passengers?: number | null;
          extra_transport_customer_notes?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          room_details?: string | null;
          sequence: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          itinerary_day_id?: string;
          package_id?: string | null;
          item_type?: string;
          title?: string;
          description?: string;
          location?: string | null;
          duration?: string | null;
          notes?: string | null;
          pickup?: string | null;
          dropoff?: string | null;
          departure_time?: string | null;
          arrival_time?: string | null;
          vehicle_details?: string | null;
          meal_type?: string | null;
          hotel_name?: string | null;
          hotel_city?: string | null;
          hotel_address?: string | null;
          hotel_country?: string | null;
          star_category?: string | null;
          nights?: number | null;
          room_type?: string | null;
          rooms?: number | null;
          adults?: number | null;
          children?: number | null;
          extra_beds?: number | null;
          meal_plan?: string | null;
          hotel_description?: string | null;
          customer_facing_info?: string | null;
          hotel_option_group?: string | null;
          hotel_option_label?: string | null;
          hotel_option_sequence?: number | null;
          flight_airline?: string | null;
          flight_number?: string | null;
          departure_airport?: string | null;
          departure_city?: string | null;
          arrival_airport?: string | null;
          arrival_city?: string | null;
          flight_departure_date?: string | null;
          flight_departure_time?: string | null;
          flight_arrival_date?: string | null;
          flight_arrival_time?: string | null;
          flight_cabin?: string | null;
          baggage_information?: string | null;
          flight_duration?: string | null;
          flight_price?: number | null;
          flight_currency?: string | null;
          visa_country?: string | null;
          visa_type?: string | null;
          visa_validity?: string | null;
          visa_processing_time?: string | null;
          visa_required_documents?: string | null;
          visa_entry_exit_information?: string | null;
          visa_customer_information?: string | null;
          extra_transport_type?: string | null;
          extra_transport_date?: string | null;
          extra_transport_pickup_time?: string | null;
          extra_transport_drop_time?: string | null;
          extra_transport_vehicle_type?: string | null;
          extra_transport_vehicle_details?: string | null;
          extra_transport_driver_details?: string | null;
          extra_transport_passengers?: number | null;
          extra_transport_customer_notes?: string | null;
          check_in?: string | null;
          check_out?: string | null;
          room_details?: string | null;
          sequence?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_day_items_itinerary_day_id_fkey";
            columns: ["itinerary_day_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_day_items_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_package_options";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_photos: {
        Row: {
          id: string;
          itinerary_id: string;
          day_id: string | null;
          day_item_id: string | null;
          url: string | null;
          storage_path: string | null;
          caption: string | null;
          alt_text: string | null;
          source: string;
          selection_type: string;
          is_primary: boolean;
          google_place_id: string | null;
          place_name: string | null;
          google_photo_reference: string | null;
          attribution: Json;
          sequence: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          itinerary_id: string;
          day_id?: string | null;
          day_item_id?: string | null;
          url?: string | null;
          storage_path?: string | null;
          caption?: string | null;
          alt_text?: string | null;
          source?: string;
          selection_type?: string;
          is_primary?: boolean;
          google_place_id?: string | null;
          place_name?: string | null;
          google_photo_reference?: string | null;
          attribution?: Json;
          sequence: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          itinerary_id?: string;
          day_id?: string | null;
          day_item_id?: string | null;
          url?: string | null;
          storage_path?: string | null;
          caption?: string | null;
          alt_text?: string | null;
          source?: string;
          selection_type?: string;
          is_primary?: boolean;
          google_place_id?: string | null;
          place_name?: string | null;
          google_photo_reference?: string | null;
          attribution?: Json;
          sequence?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_photos_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_photos_day_id_fkey";
            columns: ["day_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_photos_day_item_id_fkey";
            columns: ["day_item_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_day_items";
            referencedColumns: ["id"];
          },
        ];
      };
      itinerary_place_image_cache: {
        Row: {
          normalized_query: string;
          query_text: string;
          google_place_id: string;
          place_name: string;
          google_photo_reference: string;
          attribution: Json;
          storage_path: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          normalized_query: string;
          query_text: string;
          google_place_id: string;
          place_name: string;
          google_photo_reference: string;
          attribution?: Json;
          storage_path: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          normalized_query?: string;
          query_text?: string;
          google_place_id?: string;
          place_name?: string;
          google_photo_reference?: string;
          attribution?: Json;
          storage_path?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      itinerary_cost_lines: {
        Row: {
          id: string;
          itinerary_id: string;
          package_id: string | null;
          itinerary_item_id: string | null;
          cost_category: string;
          description: string;
          supplier_ref: string | null;
          quantity: number;
          unit: string;
          unit_cost: number;
          unit_cost_inr: number | null;
          currency: string;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          total_cost: number;
          total_cost_inr: number | null;
          notes: string | null;
          sequence: number;
          source: string | null;
          source_reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          itinerary_id: string;
          package_id?: string | null;
          itinerary_item_id?: string | null;
          cost_category: string;
          description: string;
          supplier_ref?: string | null;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          unit_cost_inr?: number | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          total_cost?: number;
          total_cost_inr?: number | null;
          notes?: string | null;
          sequence?: number;
          source?: string | null;
          source_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          itinerary_id?: string;
          package_id?: string | null;
          itinerary_item_id?: string | null;
          cost_category?: string;
          description?: string;
          supplier_ref?: string | null;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          unit_cost_inr?: number | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          total_cost?: number;
          total_cost_inr?: number | null;
          notes?: string | null;
          sequence?: number;
          source?: string | null;
          source_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "itinerary_cost_lines_itinerary_id_fkey";
            columns: ["itinerary_id"];
            isOneToOne: false;
            referencedRelation: "itineraries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_cost_lines_itinerary_item_id_fkey";
            columns: ["itinerary_item_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_day_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "itinerary_cost_lines_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "itinerary_package_options";
            referencedColumns: ["id"];
          },
        ];
      };
      wacrm_contact_links: {
        Row: {
          crm_record_id: string;
          crm_record_type: string;
          crm_user_id: string;
          match_method: string;
          updated_at: string;
          wacrm_contact_id: string;
          wacrm_user_id: string;
        };
        Insert: {
          crm_record_id: string;
          crm_record_type: string;
          crm_user_id: string;
          match_method: string;
          updated_at?: string;
          wacrm_contact_id: string;
          wacrm_user_id: string;
        };
        Update: {
          crm_record_id?: string;
          crm_record_type?: string;
          crm_user_id?: string;
          match_method?: string;
          updated_at?: string;
          wacrm_contact_id?: string;
          wacrm_user_id?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          adults: number;
          assigned_to: string | null;
          budget: number | null;
          budget_inr: number | null;
          children: number;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          customer_id: string | null;
          customer_name: string;
          deleted_at: string | null;
          destination_id: string | null;
          destination_text: string | null;
          email: string | null;
          enquiry_id: string | null;
          flexible_dates: boolean;
          hotel_category: string | null;
          id: string;
          infants: number;
          lead_date: string;
          lost_reason: string | null;
          meal_preference: string | null;
          mobile: string | null;
          next_follow_up: string | null;
          notes: string | null;
          priority: Database["public"]["Enums"]["lead_priority"];
          scope: Database["public"]["Enums"]["trip_scope"];
          source: string;
          source_campaign: string | null;
          special_requirements: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          transport_preference: string | null;
          travel_end: string | null;
          travel_start: string | null;
          trip_type: string | null;
          updated_at: string;
          updated_by: string | null;
          whatsapp: string | null;
        };
        Insert: {
          adults?: number;
          assigned_to?: string | null;
          budget?: number | null;
          budget_inr?: number | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          customer_id?: string | null;
          customer_name: string;
          deleted_at?: string | null;
          destination_id?: string | null;
          destination_text?: string | null;
          email?: string | null;
          enquiry_id?: string | null;
          flexible_dates?: boolean;
          hotel_category?: string | null;
          id?: string;
          infants?: number;
          lead_date?: string;
          lost_reason?: string | null;
          meal_preference?: string | null;
          mobile?: string | null;
          next_follow_up?: string | null;
          notes?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          scope?: Database["public"]["Enums"]["trip_scope"];
          source?: string;
          source_campaign?: string | null;
          special_requirements?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          transport_preference?: string | null;
          travel_end?: string | null;
          travel_start?: string | null;
          trip_type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          adults?: number;
          assigned_to?: string | null;
          budget?: number | null;
          budget_inr?: number | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          deleted_at?: string | null;
          destination_id?: string | null;
          destination_text?: string | null;
          email?: string | null;
          enquiry_id?: string | null;
          flexible_dates?: boolean;
          hotel_category?: string | null;
          id?: string;
          infants?: number;
          lead_date?: string;
          lost_reason?: string | null;
          meal_preference?: string | null;
          mobile?: string | null;
          next_follow_up?: string | null;
          notes?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          scope?: Database["public"]["Enums"]["trip_scope"];
          source?: string;
          source_campaign?: string | null;
          special_requirements?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          transport_preference?: string | null;
          travel_end?: string | null;
          travel_start?: string | null;
          trip_type?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_note_entries: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          kind: string;
          lead_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          kind: string;
          lead_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          kind?: string;
          lead_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_note_entries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_note_entries_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_note_entries_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      message_templates: {
        Row: {
          body: string;
          category: string | null;
          channel: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          category?: string | null;
          channel?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string | null;
          channel?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          category: string;
          created_at: string;
          id: string;
          is_read: boolean;
          link: string | null;
          title: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ops_jobs: {
        Row: {
          assigned_to: string | null;
          booking_id: string | null;
          booking_item_id: string | null;
          city: string | null;
          confirmation_number: string | null;
          cost_amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          service_date: string | null;
          service_type: string;
          status: string;
          supplier_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          booking_id?: string | null;
          booking_item_id?: string | null;
          city?: string | null;
          confirmation_number?: string | null;
          cost_amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          service_date?: string | null;
          service_type?: string;
          status?: string;
          supplier_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          booking_id?: string | null;
          booking_item_id?: string | null;
          city?: string | null;
          confirmation_number?: string | null;
          cost_amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          service_date?: string | null;
          service_type?: string;
          status?: string;
          supplier_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ops_jobs_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ops_jobs_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ops_jobs_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ops_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ops_jobs_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      packages: {
        Row: {
          code: string | null;
          created_at: string;
          currency: string;
          days: number;
          description: string | null;
          destination_id: string | null;
          exclusions: string[] | null;
          highlights: string[] | null;
          hotel_category: string | null;
          id: string;
          image_url: string | null;
          inclusions: string[] | null;
          is_active: boolean;
          name: string;
          nights: number;
          scope: Database["public"]["Enums"]["trip_scope"];
          season: string | null;
          starting_price: number;
          starting_price_inr: number | null;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          currency?: string;
          days?: number;
          description?: string | null;
          destination_id?: string | null;
          exclusions?: string[] | null;
          highlights?: string[] | null;
          hotel_category?: string | null;
          id?: string;
          image_url?: string | null;
          inclusions?: string[] | null;
          is_active?: boolean;
          name: string;
          nights?: number;
          scope?: Database["public"]["Enums"]["trip_scope"];
          season?: string | null;
          starting_price?: number;
          starting_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          currency?: string;
          days?: number;
          description?: string | null;
          destination_id?: string | null;
          exclusions?: string[] | null;
          highlights?: string[] | null;
          hotel_category?: string | null;
          id?: string;
          image_url?: string | null;
          inclusions?: string[] | null;
          is_active?: boolean;
          name?: string;
          nights?: number;
          scope?: Database["public"]["Enums"]["trip_scope"];
          season?: string | null;
          starting_price?: number;
          starting_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "packages_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          amount_inr: number | null;
          booking_id: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          direction: string;
          exchange_rate: number;
          exchange_rate_updated_at: string | null;
          id: string;
          method: string;
          notes: string | null;
          paid_on: string;
          receipt_code: string | null;
          reference: string | null;
          status: string;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          amount_inr?: number | null;
          booking_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          direction?: string;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_on?: string;
          receipt_code?: string | null;
          reference?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          amount_inr?: number | null;
          booking_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          direction?: string;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          id?: string;
          method?: string;
          notes?: string | null;
          paid_on?: string;
          receipt_code?: string | null;
          reference?: string | null;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          job_title: string | null;
          login_id: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          is_active?: boolean;
          job_title?: string | null;
          login_id?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          job_title?: string | null;
          login_id?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quotation_items: {
        Row: {
          city: string | null;
          cost_price: number;
          cost_price_inr: number | null;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          created_at: string;
          description: string | null;
          details: Json;
          end_date: string | null;
          fulfilment_mode: string;
          id: string;
          item_type: string;
          nights: number | null;
          quantity: number;
          quotation_id: string;
          sell_price: number;
          sell_price_inr: number | null;
          sort_order: number;
          start_date: string | null;
          supplier_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          cost_price?: number;
          cost_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          created_at?: string;
          description?: string | null;
          details?: Json;
          end_date?: string | null;
          fulfilment_mode?: string;
          id?: string;
          item_type?: string;
          nights?: number | null;
          quantity?: number;
          quotation_id: string;
          sell_price?: number;
          sell_price_inr?: number | null;
          sort_order?: number;
          start_date?: string | null;
          supplier_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          cost_price?: number;
          cost_price_inr?: number | null;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          created_at?: string;
          description?: string | null;
          details?: Json;
          end_date?: string | null;
          fulfilment_mode?: string;
          id?: string;
          item_type?: string;
          nights?: number | null;
          quantity?: number;
          quotation_id?: string;
          sell_price?: number;
          sell_price_inr?: number | null;
          sort_order?: number;
          start_date?: string | null;
          supplier_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: false;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotation_items_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      quotations: {
        Row: {
          accepted_at: string | null;
          adults: number;
          assigned_to: string | null;
          children: number;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          customer_id: string | null;
          deleted_at: string | null;
          destination_id: string | null;
          discount: number;
          enquiry_id: string | null;
          exchange_rate: number;
          exchange_rate_updated_at: string | null;
          id: string;
          infants: number;
          lead_id: string | null;
          markup_amount: number;
          notes: string | null;
          package_id: string | null;
          scope: Database["public"]["Enums"]["trip_scope"];
          sent_at: string | null;
          service_charge: number;
          status: Database["public"]["Enums"]["quotation_status"];
          tax_amount: number;
          terms: string | null;
          title: string;
          total_cost: number;
          total_cost_inr: number | null;
          total_price: number;
          total_price_inr: number | null;
          travel_end: string | null;
          travel_start: string | null;
          updated_at: string;
          updated_by: string | null;
          valid_until: string | null;
          version: number;
        };
        Insert: {
          accepted_at?: string | null;
          adults?: number;
          assigned_to?: string | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          deleted_at?: string | null;
          destination_id?: string | null;
          discount?: number;
          enquiry_id?: string | null;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          id?: string;
          infants?: number;
          lead_id?: string | null;
          markup_amount?: number;
          notes?: string | null;
          package_id?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          sent_at?: string | null;
          service_charge?: number;
          status?: Database["public"]["Enums"]["quotation_status"];
          tax_amount?: number;
          terms?: string | null;
          title?: string;
          total_cost?: number;
          total_cost_inr?: number | null;
          total_price?: number;
          total_price_inr?: number | null;
          travel_end?: string | null;
          travel_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          valid_until?: string | null;
          version?: number;
        };
        Update: {
          accepted_at?: string | null;
          adults?: number;
          assigned_to?: string | null;
          children?: number;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          customer_id?: string | null;
          deleted_at?: string | null;
          destination_id?: string | null;
          discount?: number;
          enquiry_id?: string | null;
          exchange_rate?: number;
          exchange_rate_updated_at?: string | null;
          id?: string;
          infants?: number;
          lead_id?: string | null;
          markup_amount?: number;
          notes?: string | null;
          package_id?: string | null;
          scope?: Database["public"]["Enums"]["trip_scope"];
          sent_at?: string | null;
          service_charge?: number;
          status?: Database["public"]["Enums"]["quotation_status"];
          tax_amount?: number;
          terms?: string | null;
          title?: string;
          total_cost?: number;
          total_cost_inr?: number | null;
          total_price?: number;
          total_price_inr?: number | null;
          travel_end?: string | null;
          travel_start?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          valid_until?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quotations_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_bills: {
        Row: {
          amount: number;
          amount_inr: number | null;
          amount_paid: number;
          amount_paid_inr: number | null;
          bill_date: string;
          bill_number: string | null;
          booking_id: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          exchange_rate: number | null;
          exchange_rate_updated_at: string | null;
          due_date: string | null;
          id: string;
          notes: string | null;
          service_type: string | null;
          status: string;
          supplier_id: string | null;
          tax_amount: number;
          tax_amount_inr: number | null;
          total_amount: number;
          total_amount_inr: number | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          amount_inr?: number | null;
          amount_paid?: number;
          amount_paid_inr?: number | null;
          bill_date?: string;
          bill_number?: string | null;
          booking_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          service_type?: string | null;
          status?: string;
          supplier_id?: string | null;
          tax_amount?: number;
          tax_amount_inr?: number | null;
          total_amount?: number;
          total_amount_inr?: number | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          amount_inr?: number | null;
          amount_paid?: number;
          amount_paid_inr?: number | null;
          bill_date?: string;
          bill_number?: string | null;
          booking_id?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          exchange_rate?: number | null;
          exchange_rate_updated_at?: string | null;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          service_type?: string | null;
          status?: string;
          supplier_id?: string | null;
          tax_amount?: number;
          tax_amount_inr?: number | null;
          total_amount?: number;
          total_amount_inr?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_bills_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_bills_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          bank_details: string | null;
          category: string;
          city: string | null;
          contact_person: string | null;
          country: string | null;
          created_at: string;
          credit_limit: number | null;
          currency: string;
          destination_id: string | null;
          email: string | null;
          gstin: string | null;
          id: string;
          is_active: boolean;
          legal_name: string | null;
          name: string;
          notes: string | null;
          payment_terms: string | null;
          phone: string | null;
          region: string | null;
          supplier_types: string[];
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          bank_details?: string | null;
          category?: string;
          city?: string | null;
          contact_person?: string | null;
          country?: string | null;
          created_at?: string;
          credit_limit?: number | null;
          currency?: string;
          destination_id?: string | null;
          email?: string | null;
          gstin?: string | null;
          id?: string;
          is_active?: boolean;
          legal_name?: string | null;
          name: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          region?: string | null;
          supplier_types?: string[];
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          bank_details?: string | null;
          category?: string;
          city?: string | null;
          contact_person?: string | null;
          country?: string | null;
          created_at?: string;
          credit_limit?: number | null;
          currency?: string;
          destination_id?: string | null;
          email?: string | null;
          gstin?: string | null;
          id?: string;
          is_active?: boolean;
          legal_name?: string | null;
          name?: string;
          notes?: string | null;
          payment_terms?: string | null;
          phone?: string | null;
          region?: string | null;
          supplier_types?: string[];
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          booking_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          description: string | null;
          due_date: string | null;
          due_time: string | null;
          enquiry_id: string | null;
          id: string;
          last_reported_at: string | null;
          lead_id: string | null;
          not_done_reason: string | null;
          priority: Database["public"]["Enums"]["lead_priority"];
          progress_note: string | null;
          status: Database["public"]["Enums"]["task_status"];
          task_type: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          booking_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          description?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          enquiry_id?: string | null;
          id?: string;
          last_reported_at?: string | null;
          lead_id?: string | null;
          not_done_reason?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          progress_note?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          task_type?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          booking_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          description?: string | null;
          due_date?: string | null;
          due_time?: string | null;
          enquiry_id?: string | null;
          id?: string;
          last_reported_at?: string | null;
          lead_id?: string | null;
          not_done_reason?: string | null;
          priority?: Database["public"]["Enums"]["lead_priority"];
          progress_note?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          task_type?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      transport_services: {
        Row: {
          booking_item_id: string | null;
          confirmation_number: string | null;
          created_at: string;
          created_by: string | null;
          driver_name: string | null;
          driver_notes: string | null;
          driver_phone: string | null;
          driver_reference: string | null;
          drop_location: string | null;
          drop_time: string | null;
          end_date: string | null;
          id: string;
          is_ac: boolean;
          notes: string | null;
          passengers: number;
          pickup_location: string | null;
          pickup_time: string | null;
          quotation_item_id: string | null;
          route_notes: string | null;
          start_date: string | null;
          status: string;
          supplier_id: string | null;
          transport_type: string;
          updated_at: string;
          vehicle_capacity: number | null;
          vehicle_notes: string | null;
          vehicle_registration: string | null;
          vehicle_type: string | null;
        };
        Insert: {
          booking_item_id?: string | null;
          confirmation_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          driver_name?: string | null;
          driver_notes?: string | null;
          driver_phone?: string | null;
          driver_reference?: string | null;
          drop_location?: string | null;
          drop_time?: string | null;
          end_date?: string | null;
          id?: string;
          is_ac?: boolean;
          notes?: string | null;
          passengers?: number;
          pickup_location?: string | null;
          pickup_time?: string | null;
          quotation_item_id?: string | null;
          route_notes?: string | null;
          start_date?: string | null;
          status?: string;
          supplier_id?: string | null;
          transport_type?: string;
          updated_at?: string;
          vehicle_capacity?: number | null;
          vehicle_notes?: string | null;
          vehicle_registration?: string | null;
          vehicle_type?: string | null;
        };
        Update: {
          booking_item_id?: string | null;
          confirmation_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          driver_name?: string | null;
          driver_notes?: string | null;
          driver_phone?: string | null;
          driver_reference?: string | null;
          drop_location?: string | null;
          drop_time?: string | null;
          end_date?: string | null;
          id?: string;
          is_ac?: boolean;
          notes?: string | null;
          passengers?: number;
          pickup_location?: string | null;
          pickup_time?: string | null;
          quotation_item_id?: string | null;
          route_notes?: string | null;
          start_date?: string | null;
          status?: string;
          supplier_id?: string | null;
          transport_type?: string;
          updated_at?: string;
          vehicle_capacity?: number | null;
          vehicle_notes?: string | null;
          vehicle_registration?: string | null;
          vehicle_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transport_services_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transport_services_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transport_services_quotation_item_id_fkey";
            columns: ["quotation_item_id"];
            isOneToOne: false;
            referencedRelation: "quotation_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transport_services_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      travel_groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          primary_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          primary_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          primary_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "travel_groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "travel_groups_primary_customer_id_fkey";
            columns: ["primary_customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      travellers: {
        Row: {
          created_at: string;
          customer_id: string | null;
          date_of_birth: string | null;
          full_name: string;
          gender: string | null;
          group_id: string | null;
          id: string;
          is_primary: boolean;
          meal_preference: string | null;
          nationality: string | null;
          passport_expiry: string | null;
          passport_number: string | null;
          relation: string | null;
          special_requirements: string | null;
          traveller_type: string;
          updated_at: string;
          visa_status: Database["public"]["Enums"]["visa_status"];
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          date_of_birth?: string | null;
          full_name: string;
          gender?: string | null;
          group_id?: string | null;
          id?: string;
          is_primary?: boolean;
          meal_preference?: string | null;
          nationality?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          relation?: string | null;
          special_requirements?: string | null;
          traveller_type?: string;
          updated_at?: string;
          visa_status?: Database["public"]["Enums"]["visa_status"];
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          date_of_birth?: string | null;
          full_name?: string;
          gender?: string | null;
          group_id?: string | null;
          id?: string;
          is_primary?: boolean;
          meal_preference?: string | null;
          nationality?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          relation?: string | null;
          special_requirements?: string | null;
          traveller_type?: string;
          updated_at?: string;
          visa_status?: Database["public"]["Enums"]["visa_status"];
        };
        Relationships: [
          {
            foreignKeyName: "travellers_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "travellers_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "travel_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      user_tab_permissions: {
        Row: {
          created_at: string;
          tab_path: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          tab_path: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          tab_path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_tab_permissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_conversations: {
        Row: {
          ai_last_processed_at: string | null;
          ai_last_processed_message_id: string | null;
          ai_processing_error: string | null;
          ai_processing_status: string;
          assigned_employee_id: string | null;
          conversation_mode: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          current_flow: string;
          current_step: string;
          enquiry_id: string | null;
          id: string;
          last_message_at: string | null;
          last_message_text: string | null;
          lead_id: string | null;
          phone_number: string;
          status: string;
          tenant_id: string;
          unread_count: number;
          updated_at: string;
          whatsapp_connection_id: string | null;
        };
        Insert: {
          ai_last_processed_at?: string | null;
          ai_last_processed_message_id?: string | null;
          ai_processing_error?: string | null;
          ai_processing_status?: string;
          assigned_employee_id?: string | null;
          conversation_mode?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          current_flow?: string;
          current_step?: string;
          enquiry_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          last_message_text?: string | null;
          lead_id?: string | null;
          phone_number: string;
          status?: string;
          tenant_id?: string;
          unread_count?: number;
          updated_at?: string;
          whatsapp_connection_id?: string | null;
        };
        Update: {
          ai_last_processed_at?: string | null;
          ai_last_processed_message_id?: string | null;
          ai_processing_error?: string | null;
          ai_processing_status?: string;
          assigned_employee_id?: string | null;
          conversation_mode?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          current_flow?: string;
          current_step?: string;
          enquiry_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          last_message_text?: string | null;
          lead_id?: string | null;
          phone_number?: string;
          status?: string;
          tenant_id?: string;
          unread_count?: number;
          updated_at?: string;
          whatsapp_connection_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "crm_tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_whatsapp_connection_id_fkey";
            columns: ["whatsapp_connection_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_assigned_employee_id_fkey";
            columns: ["assigned_employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_ai_last_processed_message_id_fkey";
            columns: ["ai_last_processed_message_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_travel_requirements: {
        Row: {
          adults: number | null;
          approximate_budget: number | null;
          children: number | null;
          conversation_id: string;
          created_at: string;
          customer_id: string | null;
          document_status: string;
          departure_city: string | null;
          destination_id: string | null;
          destination_text: string | null;
          enquiry_id: string | null;
          extraction_metadata: Json;
          hotel_preference: string | null;
          id: string;
          lead_id: string | null;
          scope: string | null;
          special_requirements: string | null;
          travel_end_date: string | null;
          travel_month: string | null;
          travel_start_date: string | null;
          trip_type: string | null;
          updated_at: string;
        };
        Insert: {
          adults?: number | null;
          approximate_budget?: number | null;
          children?: number | null;
          conversation_id: string;
          created_at?: string;
          customer_id?: string | null;
          document_status?: string;
          departure_city?: string | null;
          destination_id?: string | null;
          destination_text?: string | null;
          enquiry_id?: string | null;
          extraction_metadata?: Json;
          hotel_preference?: string | null;
          id?: string;
          lead_id?: string | null;
          scope?: string | null;
          special_requirements?: string | null;
          travel_end_date?: string | null;
          travel_month?: string | null;
          travel_start_date?: string | null;
          trip_type?: string | null;
          updated_at?: string;
        };
        Update: {
          adults?: number | null;
          approximate_budget?: number | null;
          children?: number | null;
          conversation_id?: string;
          created_at?: string;
          customer_id?: string | null;
          document_status?: string;
          departure_city?: string | null;
          destination_id?: string | null;
          destination_text?: string | null;
          enquiry_id?: string | null;
          extraction_metadata?: Json;
          hotel_preference?: string | null;
          id?: string;
          lead_id?: string | null;
          scope?: string | null;
          special_requirements?: string | null;
          travel_end_date?: string | null;
          travel_month?: string | null;
          travel_start_date?: string | null;
          trip_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_travel_requirements_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: true;
            referencedRelation: "whatsapp_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_travel_requirements_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_travel_requirements_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_travel_requirements_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_travel_requirements_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_messages: {
        Row: {
          body: string | null;
          conversation_id: string;
          created_at: string;
          created_by: string | null;
          delivery_status: string;
          delivery_error: string | null;
          direction: string;
          id: string;
          media_filename: string | null;
          media_meta_id: string | null;
          media_storage_path: string | null;
          media_download_status: string;
          media_mime_type: string | null;
          media_url: string | null;
          message_timestamp: string;
          status_updated_at: string | null;
          message_type: string;
          wa_message_id: string | null;
        };
        Insert: {
          body?: string | null;
          conversation_id: string;
          created_at?: string;
          created_by?: string | null;
          delivery_status?: string;
          delivery_error?: string | null;
          direction?: string;
          id?: string;
          media_filename?: string | null;
          media_meta_id?: string | null;
          media_storage_path?: string | null;
          media_download_status?: string;
          media_mime_type?: string | null;
          media_url?: string | null;
          message_timestamp?: string;
          status_updated_at?: string | null;
          message_type?: string;
          wa_message_id?: string | null;
        };
        Update: {
          body?: string | null;
          conversation_id?: string;
          created_at?: string;
          created_by?: string | null;
          delivery_status?: string;
          delivery_error?: string | null;
          direction?: string;
          id?: string;
          media_filename?: string | null;
          media_meta_id?: string | null;
          media_storage_path?: string | null;
          media_download_status?: string;
          media_mime_type?: string | null;
          media_url?: string | null;
          message_timestamp?: string;
          status_updated_at?: string | null;
          message_type?: string;
          wa_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_business_visible_profiles: {
        Args: { p_include_inactive?: boolean };
        Returns: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          job_title: string | null;
          login_id: string | null;
          phone: string | null;
        }[];
      };
      set_destination_employee_assignment: {
        Args: {
          p_destination_id: string;
          p_employee_id?: string | null;
        };
        Returns: undefined;
      };
      bootstrap_current_user: { Args: never; Returns: undefined };
      convert_quotation_to_booking: {
        Args: { p_quotation_id: string };
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      replace_user_tab_permissions: {
        Args: { p_tab_paths: string[]; p_user_id: string };
        Returns: undefined;
      };
      create_crm_tenant: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      issue_invoice_number: { Args: { p_booking_id: string }; Returns: string };
      create_enquiry: {
        Args: {
          p_assigned_employee_id?: string | null;
          p_customer_id?: string | null;
          p_destination_id?: string | null;
          p_source?: string;
          p_status?: string;
        };
        Returns: {
          enquiry_number: string;
          id: string;
        }[];
      };
      record_booking_payment: {
        Args: {
          p_amount: number;
          p_booking_id: string;
          p_currency?: string;
          p_customer_id?: string;
          p_direction?: string;
          p_method: string;
          p_notes?: string;
          p_paid_on?: string;
          p_reference?: string;
          p_status?: string;
          p_supplier_id?: string;
        };
        Returns: string;
      };
      record_wacrm_flow_requirement: {
        Args: {
          p_answers: Json;
          p_completed_at: string;
          p_contact_email: string | null;
          p_contact_name: string | null;
          p_contact_phone: string | null;
          p_destination_id?: string | null;
          p_flow_name: string;
          p_wacrm_contact_id: string;
          p_wacrm_flow_id: string;
          p_wacrm_run_id: string;
        };
        Returns: {
          created_customer: boolean;
          customer_id: string;
          lead_id: string | null;
          requirement_id: string;
        }[];
      };
      record_wacrm_flow_enquiry: {
        Args: {
          p_answers: Json;
          p_assigned_employee_id?: string | null;
          p_completed_at: string;
          p_contact_email: string | null;
          p_contact_name: string | null;
          p_contact_phone: string | null;
          p_destination_id?: string | null;
          p_flow_name: string;
          p_handoff_requested: boolean;
          p_is_partial: boolean;
          p_wacrm_contact_id: string;
          p_wacrm_conversation_id: string | null;
          p_wacrm_flow_id: string;
          p_wacrm_run_id: string;
        };
        Returns: {
          created_customer: boolean;
          customer_id: string;
          enquiry_id: string | null;
          enquiry_number: string | null;
          lead_id: string | null;
          requirement_id: string;
        }[];
      };
    };
    Enums: {
      app_role:
        | "admin"
        | "developer"
        | "manager"
        | "sales_executive"
        | "operations"
        | "accounts"
        | "visa_executive"
        | "read_only";
      booking_status:
        | "pending"
        | "confirmed"
        | "partially_confirmed"
        | "fully_confirmed"
        | "cancelled"
        | "completed";
      lead_priority: "low" | "medium" | "high" | "urgent";
      lead_status:
        | "new"
        | "contacted"
        | "requirement_collected"
        | "itinerary_preparing"
        | "quotation_sent"
        | "negotiation"
        | "follow_up"
        | "confirmed"
        | "lost"
        | "cancelled";
      payment_status: "unpaid" | "partially_paid" | "paid" | "refund_pending" | "refunded";
      quotation_status:
        "draft" | "sent" | "viewed" | "negotiation" | "accepted" | "rejected" | "expired";
      task_status: "pending" | "in_progress" | "completed" | "overdue";
      trip_scope: "domestic" | "international";
      visa_status:
        | "not_required"
        | "required"
        | "documents_pending"
        | "documents_submitted"
        | "appointment_scheduled"
        | "under_processing"
        | "approved"
        | "rejected"
        | "expired";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "developer",
        "manager",
        "sales_executive",
        "operations",
        "accounts",
        "visa_executive",
        "read_only",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "partially_confirmed",
        "fully_confirmed",
        "cancelled",
        "completed",
      ],
      lead_priority: ["low", "medium", "high", "urgent"],
      lead_status: [
        "new",
        "contacted",
        "requirement_collected",
        "itinerary_preparing",
        "quotation_sent",
        "negotiation",
        "follow_up",
        "confirmed",
        "lost",
        "cancelled",
      ],
      payment_status: ["unpaid", "partially_paid", "paid", "refund_pending", "refunded"],
      quotation_status: [
        "draft",
        "sent",
        "viewed",
        "negotiation",
        "accepted",
        "rejected",
        "expired",
      ],
      task_status: ["pending", "in_progress", "completed", "overdue"],
      trip_scope: ["domestic", "international"],
      visa_status: [
        "not_required",
        "required",
        "documents_pending",
        "documents_submitted",
        "appointment_scheduled",
        "under_processing",
        "approved",
        "rejected",
        "expired",
      ],
    },
  },
} as const;
