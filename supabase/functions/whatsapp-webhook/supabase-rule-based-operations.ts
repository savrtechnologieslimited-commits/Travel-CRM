import type {
  RuleBasedConversation,
  RuleBasedDestination,
  RuleBasedFlowOperations,
  RuleBasedRequirements,
} from "./rule-based-flow.ts";

export type SupabaseLike = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
  storage?: { from: (bucket: string) => any };
};

type ReplySender = (conversationId: string, reply: { text: string; buttons?: string[]; list?: { id: string; title: string; description?: string }[]; document?: { url: string; name?: string | null } }) => Promise<void>;

const emptyRequirements = (): RuleBasedRequirements => ({
  destination_id: null,
  destination_text: null,
  scope: null,
  name: null,
  travel_start_date: null,
  adults: null,
  children: null,
  departure_city: null,
  approximate_budget: null,
  special_requirements: null,
  document_status: "not_checked",
});

export function createSupabaseRuleBasedOperations(
  supabase: SupabaseLike,
  sendReply: ReplySender,
): RuleBasedFlowOperations {
  return {
    async getConversation(conversationId): Promise<RuleBasedConversation> {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("id,customer_id,assigned_employee_id,lead_id,enquiry_id,conversation_mode,current_flow,current_step")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data;
    },
    async getRequirements(conversationId) {
      const { data, error } = await supabase
        .from("whatsapp_travel_requirements")
        .select("destination_id,destination_text,scope,travel_start_date,adults,children,departure_city,approximate_budget,special_requirements,document_status")
        .eq("conversation_id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...emptyRequirements(), ...data } : emptyRequirements();
    },
    async saveConversation({ conversationId, patch }) {
      const { error } = await supabase.from("whatsapp_conversations").update(patch).eq("id", conversationId);
      if (error) throw error;
    },
    async saveRequirements({ conversationId, patch }) {
      const { name: _name, ...persistablePatch } = patch;
      const { error } = await supabase
        .from("whatsapp_travel_requirements")
        .upsert({ conversation_id: conversationId, ...persistablePatch }, { onConflict: "conversation_id" });
      if (error) throw error;
    },
    async listDestinations(scope): Promise<RuleBasedDestination[]> {
      const { data, error } = await supabase
        .from("destinations")
        .select("id,name,scope,is_active,display_order")
        .eq("scope", scope)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    async findDestinationEmployee(destinationId) {
      if (!destinationId) return null;
      const { data, error } = await supabase
        .from("destination_employee_assignments")
        .select("employee_id")
        .eq("destination_id", destinationId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.employee_id ?? null;
    },
    async createEnquiry({ customerId, destinationId, assignedEmployeeId, source }) {
      const { data, error } = await supabase.rpc("create_enquiry", {
        p_customer_id: customerId,
        p_source: source,
        p_destination_id: destinationId,
        p_assigned_employee_id: assignedEmployeeId,
        p_status: "new",
      }).single();
      if (error) throw error;
      return data;
    },
    async upsertLead({ customerId, enquiryId, destinationId, assignedEmployeeId, customerName }) {
      const existing = await supabase
        .from("leads")
        .select("id")
        .eq("enquiry_id", enquiryId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      const values = {
        customer_name: customerName ?? "WhatsApp customer",
        customer_id: customerId,
        enquiry_id: enquiryId,
        destination_id: destinationId,
        assigned_to: assignedEmployeeId,
        source: "whatsapp",
      };
      if (existing.data) {
        const { error } = await supabase.from("leads").update(values).eq("id", existing.data.id);
        if (error) throw error;
        return { id: existing.data.id };
      }
      const created = await supabase.from("leads").insert(values).select("id").single();
      if (created.error) throw created.error;
      return { id: created.data.id };
    },
    async updateCustomerName(customerId, name) {
      const { error } = await supabase.from("customers").update({ full_name: name }).eq("id", customerId);
      if (error) throw error;
    },
    async notifyAssignedEmployee({ employeeId, conversationId, enquiryNumber }) {
      const { error } = await supabase.from("notifications").insert({
        user_id: employeeId,
        category: "whatsapp",
        title: "New WhatsApp enquiry assigned",
        body: `Enquiry ${enquiryNumber} has a WhatsApp conversation requiring attention.`,
        link: `/messaging?conversationId=${encodeURIComponent(conversationId)}`,
      });
      if (error) throw error;
    },
    async findDestinationDocument(destinationId) {
      const { data, error } = await supabase
        .from("itineraries")
        .select("document_path,document_name")
        .eq("destination_id", destinationId)
        .eq("is_active", true)
        .not("document_path", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.document_path || !supabase.storage) return null;
      const signed = await supabase.storage.from("itineraries").createSignedUrl(data.document_path, 3600);
      if (signed.error || !signed.data?.signedUrl) return null;
      return { url: signed.data.signedUrl, name: data.document_name };
    },
    sendReply,
  };
}