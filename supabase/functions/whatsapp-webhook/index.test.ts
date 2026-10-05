import { describe, expect, test } from "bun:test";
import {
  handleIncomingWhatsAppMessage,
  createSupabaseWebhookOperations,
  createMetaInboundMediaMirror,
  hasUsableIdentity,
  identityDisplayName,
  normalizeWhatsAppPhone,
  parseWhatsAppWebhook,
  resolveContactSendTarget,
  resolveInboundIdentity,
  verificationResponse,
  webhookRequest,
  type WhatsAppWebhookOperations,
} from "./index";
import {
  parseAppSecrets,
  verifyMetaWebhookSignature,
} from "../_shared/whatsapp/webhook-signature.ts";

const APP_SECRET = "test-meta-app-secret";

async function signedPostRequest(body: string, secret = APP_SECRET): Promise<Request> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const signature = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://example.test", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${signature}` },
    body,
  });
}

const textPayload = {
  entry: [{
    changes: [{
      value: {
        metadata: { display_phone_number: "919999999999", phone_number_id: "meta-phone-id-1" },
        messages: [{
          from: "919888888888",
          id: "wamid.text-1",
          timestamp: "1720000000",
          type: "text",
          text: { body: "I want Bali in December" },
        }],
      },
    }],
  }],
};

function createOperations(mode: "AI_ACTIVE" | "HUMAN_ACTIVE" = "AI_ACTIVE") {
  const calls: string[] = [];
  const conversationInputs: Array<{ phone: string; customerId: string; leadId: string | null; enquiryId: string | null }> = [];
  const identityInputs: Array<{ phone: string; waUserId: string | null; waParentUserId: string | null; username: string | null; displayName: string | null }> = [];
  const statusUpdates: Array<{ whatsappMessageId: string; status: string; timestamp: string; error: string | null }> = [];
  const operations: WhatsAppWebhookOperations = {
    resolveCrmIdentity: async (identity) => {
      identityInputs.push(identity);
      return { customerId: "customer-1", leadId: "lead-1", enquiryId: "enquiry-1", displayName: "Asha Sharma" };
    },
    findOrCreateConversation: async (input) => {
      conversationInputs.push(input);
      return {
        id: "conversation-1",
        customer_id: input.customerId,
        lead_id: input.leadId,
        enquiry_id: input.enquiryId,
        conversation_mode: mode,
        current_flow: "WELCOME",
        current_step: "START",
      };
    },
    findMessageByWhatsAppId: async () => null,
    createInboundMessage: async () => {
      calls.push("create-message");
    },
    processRuleBasedWhatsAppConversation: async () => {
      calls.push("process-rule-based");
    },
    updateMessageStatus: async (input) => {
      statusUpdates.push(input);
      return input.whatsappMessageId !== "wamid.unknown";
    },
  };
  return { operations, calls, conversationInputs, identityInputs, statusUpdates };
}

function createSupabaseOperationsHarness(
  existingConversation: Record<string, unknown> | null = null,
  mirrorInboundMedia?: Parameters<typeof createSupabaseWebhookOperations>[2],
) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "resolve_whatsapp_crm_identity") {
        return { data: [{ customer_id: "customer-1", lead_id: "lead-1", enquiry_id: "enquiry-1", display_name: "Asha Sharma" }], error: null };
      }
      if (name === "find_or_create_whatsapp_conversation") {
        return {
          data: [{
            id: existingConversation?.id ?? "conversation-created",
            customer_id: existingConversation?.customer_id ?? args["p_customer_id"],
            assigned_employee_id: existingConversation?.assigned_employee_id ?? null,
            lead_id: existingConversation?.lead_id ?? args["p_lead_id"],
            enquiry_id: existingConversation?.enquiry_id ?? args["p_enquiry_id"],
            conversation_mode: existingConversation?.conversation_mode ?? "AI_ACTIVE",
            current_flow: existingConversation?.current_flow ?? "WELCOME",
            current_step: existingConversation?.current_step ?? "START",
          }],
          error: null,
        };
      }
      return { data: true, error: null };
    },
    from: (table: string) => {
      const state: { action: "select" | "insert" | "update"; values: Record<string, unknown> | null } = { action: "select", values: null };
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === "whatsapp_conversations" ? existingConversation : null, error: null }),
        single: async () => ({ data: { id: "conversation-created", ...state.values }, error: null }),
        insert: (values: Record<string, unknown>) => {
          state.action = "insert";
          state.values = values;
          inserts.push(values);
          return query;
        },
        update: (values: Record<string, unknown>) => {
          state.action = "update";
          state.values = values;
          updates.push(values);
          return query;
        },
        then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return query;
    },
  };
  const operations = createSupabaseWebhookOperations(supabase as never, async () => undefined, mirrorInboundMedia);
  return { operations, inserts, updates, rpcCalls };
}

describe("WhatsApp webhook foundation", () => {
  test("valid webhook verification returns the challenge", async () => {
    const response = verificationResponse(
      new Request("https://example.test?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=abc"),
      "secret",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc");
  });

  test("invalid verification token returns 403", () => {
    const response = verificationResponse(
      new Request("https://example.test?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc"),
      "secret",
    );
    expect(response.status).toBe(403);
  });

  test("parses configured app secrets and verifies valid/invalid Meta HMAC signatures", async () => {
    expect(parseAppSecrets(" first-secret, ,second-secret ")).toEqual(["first-secret", "second-secret"]);
    const body = JSON.stringify({ entry: [] });
    const request = await signedPostRequest(body);
    expect(await verifyMetaWebhookSignature(body, request.headers.get("x-hub-signature-256"), APP_SECRET)).toBe(true);
    expect(await verifyMetaWebhookSignature(body, "sha256=" + "0".repeat(64), APP_SECRET)).toBe(false);
    expect(await verifyMetaWebhookSignature(body, request.headers.get("x-hub-signature-256"), undefined)).toBe(false);
  });

  test("malformed JSON returns 400", async () => {
    const { operations } = createOperations();
    const response = await webhookRequest(
      await signedPostRequest("{"),
      { operations, appSecret: APP_SECRET },
    );
    expect(response.status).toBe(400);
  });

  test("unsupported webhook events are ignored", async () => {
    const { operations } = createOperations();
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [] } }] }] });
    const response = await webhookRequest(
      await signedPostRequest(body),
      { operations, appSecret: APP_SECRET },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ignored", reason: "unsupported_event" });
  });

  test("normalizes Indian WhatsApp phone number representations", () => {
    expect(normalizeWhatsAppPhone("+91 (98888) 88888")).toBe("919888888888");
    expect(normalizeWhatsAppPhone("09888888888")).toBe("919888888888");
    expect(normalizeWhatsAppPhone("9888888888")).toBe("919888888888");
    expect(normalizeWhatsAppPhone("919888888888")).toBe("919888888888");
  });

  test("rejects unsigned/invalid-signature POSTs before CRM processing", async () => {
    const { operations, calls } = createOperations();
    const response = await webhookRequest(
      new Request("https://example.test", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) },
        body: JSON.stringify(textPayload),
      }),
      { operations, appSecret: APP_SECRET },
    );
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  test("validly signed text reaches the existing travel rule processor", async () => {
    const { operations, calls } = createOperations();
    const body = JSON.stringify(textPayload);
    const response = await webhookRequest(await signedPostRequest(body), {
      operations,
      appSecret: APP_SECRET,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "processed", conversationId: "conversation-1" });
    expect(calls).toEqual(["create-message", "process-rule-based"]);
  });

  test("links a resolved customer, lead, and enquiry to the reused conversation", async () => {
    const { operations, conversationInputs } = createOperations();
    await handleIncomingWhatsAppMessage({
      senderPhone: "+91 98888 88888",
      whatsappMessageId: "wamid.linkage",
      messageType: "text",
      body: "Hi",
      businessPhoneNumber: null,
      businessPhoneNumberId: null,
      timestamp: null,
      selectionId: null,
      selectionTitle: null,
    }, operations);

    expect(conversationInputs).toEqual([{
      phone: "919888888888",
      customerId: "customer-1",
      leadId: "lead-1",
      enquiryId: "enquiry-1",
    }]);
  });

  test("resolves and links a no-phone message through its BSUID identity", async () => {
    const { operations, conversationInputs, identityInputs } = createOperations();
    await handleIncomingWhatsAppMessage({
      senderPhone: "",
      senderUserId: "US.1234567890",
      senderParentUserId: "US.ENT.1234567890",
      senderUsername: "maya_travels",
      senderDisplayName: "Maya Rao",
      whatsappMessageId: "wamid.bsuid-inbound",
      messageType: "text",
      body: "Hello",
      businessPhoneNumber: null,
      businessPhoneNumberId: null,
      timestamp: null,
      selectionId: null,
      selectionTitle: null,
    }, operations);

    expect(identityInputs[0]).toEqual({
      phone: "",
      waUserId: "US.1234567890",
      waParentUserId: "US.ENT.1234567890",
      username: "maya_travels",
      displayName: "Maya Rao",
    });
    expect(conversationInputs[0]).toMatchObject({ phone: "", customerId: "customer-1", leadId: "lead-1", enquiryId: "enquiry-1" });
  });

  test("resolves a CRM display name and reuses an existing conversation while filling missing links", async () => {
    const { operations, rpcCalls } = createSupabaseOperationsHarness({
      id: "conversation-existing",
      customer_id: null,
      lead_id: null,
      enquiry_id: "enquiry-existing",
      conversation_mode: "HUMAN_ACTIVE",
      current_flow: "WELCOME",
      current_step: "START",
    });
    const identity = await operations.resolveCrmIdentity({
      phone: "+91 (98888) 88888",
      waUserId: null,
      waParentUserId: null,
      username: null,
      displayName: null,
    });
    const conversation = await operations.findOrCreateConversation({
      phone: "+91 (98888) 88888",
      customerId: identity.customerId,
      leadId: identity.leadId,
      enquiryId: identity.enquiryId,
    });

    expect(identity.displayName).toBe("Asha Sharma");
    expect(rpcCalls).toEqual([
      { name: "resolve_whatsapp_crm_identity", args: { p_phone: "919888888888", p_wa_user_id: null, p_wa_parent_user_id: null, p_username: null, p_display_name: null } },
      { name: "find_or_create_whatsapp_conversation", args: { p_phone: "919888888888", p_customer_id: "customer-1", p_lead_id: "lead-1", p_enquiry_id: "enquiry-1" } },
    ]);
    expect(conversation.id).toBe("conversation-existing");
    expect(conversation.customer_id).toBe("customer-1");
    expect(conversation.enquiry_id).toBe("enquiry-existing");
  });

  test("creates a conversation with the existing CRM foreign keys when no thread exists", async () => {
    const { operations, rpcCalls } = createSupabaseOperationsHarness();
    const conversation = await operations.findOrCreateConversation({
      phone: "09888888888",
      customerId: "customer-1",
      leadId: "lead-1",
      enquiryId: "enquiry-1",
    });

    expect(conversation.id).toBe("conversation-created");
    expect(rpcCalls[0]).toEqual({
      name: "find_or_create_whatsapp_conversation",
      args: { p_phone: "919888888888", p_customer_id: "customer-1", p_lead_id: "lead-1", p_enquiry_id: "enquiry-1" },
    });
  });

  test("persists inbound Meta media references and sends status updates by Meta message ID", async () => {
    const { operations, inserts, rpcCalls } = createSupabaseOperationsHarness();
    await operations.createInboundMessage({
      conversationId: "conversation-1",
      message: {
        senderPhone: "919888888888",
        whatsappMessageId: "wamid.media-persisted",
        messageType: "document",
        body: "Booking PDF",
        mediaMetaId: "meta-media-42",
        mediaMimeType: "application/pdf",
        mediaFileName: "booking.pdf",
        selectionId: null,
        selectionTitle: null,
        businessPhoneNumberId: null,
        businessPhoneNumber: null,
        timestamp: "1720000000",
      },
    });
    await operations.updateMessageStatus({
      whatsappMessageId: "wamid.outbound-42",
      status: "delivered",
      timestamp: "2026-10-02T00:00:00.000Z",
      error: null,
    });

    expect(inserts[0]).toMatchObject({
      conversation_id: "conversation-1",
      wa_message_id: "wamid.media-persisted",
      media_meta_id: "meta-media-42",
      media_mime_type: "application/pdf",
      media_filename: "booking.pdf",
    });
    expect(rpcCalls.at(-1)).toEqual({
      name: "apply_whatsapp_message_status",
      args: {
        p_wa_message_id: "wamid.outbound-42",
        p_status: "delivered",
        p_status_timestamp: "2026-10-02T00:00:00.000Z",
        p_delivery_error: null,
      },
    });
  });

  test("stores mirrored inbound media under a private deterministic object path", async () => {
    const uploadCalls: Array<{ bucket: string; path: string; contentType: string }> = [];
    const mirror = createMetaInboundMediaMirror({
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _bytes: Uint8Array, options: { contentType: string }) => {
            uploadCalls.push({ bucket, path, contentType: options.contentType });
            return { error: null };
          },
        }),
      },
    } as never, {
      accessToken: "server-secret",
      fetchImpl: async (input) => String(input).includes("graph.facebook.com")
        ? new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/media/42", mime_type: "application/pdf", file_size: 4 }), { status: 200 })
        : new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    const result = await mirror({
      conversationId: "conversation-1",
      message: {
        senderPhone: "919888888888",
        whatsappMessageId: "wamid.private-media",
        messageType: "document",
        body: "Invoice",
        mediaMetaId: "meta-media-42",
        mediaMimeType: "application/pdf",
        mediaFileName: "invoice.pdf",
        selectionId: null,
        selectionTitle: null,
        businessPhoneNumberId: null,
        businessPhoneNumber: null,
        timestamp: "1720000000",
      },
    });

    expect(result).toEqual({ status: "stored", storagePath: "conversation-1/inbound/meta-media-42.pdf", mimeType: "application/pdf" });
    expect(uploadCalls).toEqual([{ bucket: "whatsapp-media", path: "conversation-1/inbound/meta-media-42.pdf", contentType: "application/pdf" }]);
  });

  test("records private storage path and mirror state on the existing inbound message", async () => {
    const { operations, updates } = createSupabaseOperationsHarness(null, async () => ({
      status: "stored",
      storagePath: "conversation-1/inbound/meta-media-42.pdf",
      mimeType: "application/pdf",
    }));
    await operations.createInboundMessage({
      conversationId: "conversation-1",
      message: {
        senderPhone: "919888888888",
        whatsappMessageId: "wamid.media-state",
        messageType: "document",
        body: "Invoice",
        mediaMetaId: "meta-media-42",
        mediaMimeType: "application/pdf",
        mediaFileName: "invoice.pdf",
        selectionId: null,
        selectionTitle: null,
        businessPhoneNumberId: null,
        businessPhoneNumber: null,
        timestamp: "1720000000",
      },
    });

    expect(updates).toContainEqual({
      media_storage_path: "conversation-1/inbound/meta-media-42.pdf",
      media_mime_type: "application/pdf",
      media_download_status: "stored",
    });
  });

  test("tenant-aware webhook boundary routes by Meta phone_number_id", async () => {
    const { operations, calls } = createOperations();
    let resolvedPhoneId = "";
    let processedTenantId = "";
    const response = await webhookRequest(await signedPostRequest(JSON.stringify(textPayload)), {
      operations,
      appSecret: APP_SECRET,
      tenantRouter: {
        resolveTenant: async (phoneNumberId) => {
          resolvedPhoneId = phoneNumberId;
          return { tenantId: "tenant-north", ready: true };
        },
        processMessage: async (tenantId) => {
          processedTenantId = tenantId;
          return { status: "processed", conversationId: "tenant-conversation", aiTriggered: false };
        },
      },
    });

    expect(response.status).toBe(200);
    expect(resolvedPhoneId).toBe("meta-phone-id-1");
    expect(processedTenantId).toBe("tenant-north");
    expect(calls).toEqual([]);
  });

  test("parses inbound text messages and metadata", () => {
    expect(parseWhatsAppWebhook(textPayload)).toEqual({
      kind: "message",
      message: {
        senderPhone: "919888888888",
        whatsappMessageId: "wamid.text-1",
        messageType: "text",
        body: "I want Bali in December",
        mediaMetaId: null,
        mediaMimeType: null,
        mediaFileName: null,
        senderUserId: null,
        senderParentUserId: null,
        senderUsername: null,
        senderDisplayName: "",
        selectionId: null,
        selectionTitle: null,
        businessPhoneNumberId: "meta-phone-id-1",
        businessPhoneNumber: "919999999999",
        timestamp: "1720000000",
      },
    });
  });

  test("parses inbound non-text messages without inventing a body", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: { messages: [{
        from: "919888888888",
        id: "wamid.image-1",
        type: "image",
        image: { id: "media-1" },
      }] } }] }],
    });
    expect(parsed.kind).toBe("message");
    if (parsed.kind === "message") {
      expect(parsed.message.messageType).toBe("image");
      expect(parsed.message.body).toBeNull();
      expect(parsed.message.selectionId).toBeNull();
      expect(parsed.message.businessPhoneNumberId).toBeNull();
    }
  });

  test("captures media metadata and captions from Meta media payloads", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        metadata: { display_phone_number: "+91 99999 99999", phone_number_id: "meta-phone-id-2" },
        messages: [{
          from: "919888888888",
          id: "wamid.image-2",
          timestamp: "1720000000",
          type: "image",
          image: { id: "meta-media-1", mime_type: "image/jpeg", caption: "Please check this itinerary" },
        }],
      } }] }],
    });

    expect(parsed.kind).toBe("message");
    if (parsed.kind === "message") {
      expect(parsed.message.body).toBe("Please check this itinerary");
      expect(parsed.message.mediaMetaId).toBe("meta-media-1");
      expect(parsed.message.mediaMimeType).toBe("image/jpeg");
      expect(parsed.message.mediaFileName).toBeNull();
    }
  });

  test("resolves username-only Meta messages through the paired BSUID contact", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        contacts: [{ user_id: "US.1234567890", parent_user_id: "US.ENT.1234567890", profile: { name: "Maya Rao", username: "@maya_travels" } }],
        messages: [{ from_user_id: "US.1234567890", from_parent_user_id: "US.ENT.1234567890", id: "wamid.bsuid-1", type: "text", text: { body: "Hello" } }],
      } }] }],
    });

    expect(parsed).toMatchObject({
      kind: "message",
      message: {
        senderPhone: "",
        senderUserId: "US.1234567890",
        senderParentUserId: "US.ENT.1234567890",
        senderUsername: "maya_travels",
        senderDisplayName: "Maya Rao",
      },
    });
  });

  test("parses document filename and caption without treating Meta media as a public URL", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: { messages: [{
        from: "919888888888",
        id: "wamid.document-1",
        type: "document",
        document: { id: "meta-document-1", mime_type: "application/pdf", filename: "booking.pdf", caption: "Booking copy" },
      }] } }] }],
    });
    expect(parsed).toMatchObject({
      kind: "message",
      message: { body: "Booking copy", mediaMetaId: "meta-document-1", mediaMimeType: "application/pdf", mediaFileName: "booking.pdf" },
    });
  });

  test("updates sent, delivered, read, and failed only from Meta status callbacks", async () => {
    const statuses = ["sent", "delivered", "read", "failed"];
    const { operations, statusUpdates } = createOperations();
    for (const status of statuses) {
      const payload = { entry: [{ changes: [{ value: { statuses: [{ id: `wamid.${status}`, status, timestamp: "1720000000", ...(status === "failed" ? { errors: [{ code: 131000, title: "Temporary failure" }] } : {}) }] } }] }] };
      const response = await webhookRequest(await signedPostRequest(JSON.stringify(payload)), { operations, appSecret: APP_SECRET });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "updated", messageId: `wamid.${status}` });
    }
    expect(statusUpdates.map((update) => update.status)).toEqual(statuses);
    expect(statusUpdates[3]?.error).toBe("Temporary failure");
  });

  test("reports unknown Meta message IDs as unmatched without claiming success", async () => {
    const { operations, statusUpdates } = createOperations();
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.unknown", status: "delivered", timestamp: "1720000000" }] } }] }] };
    const response = await webhookRequest(await signedPostRequest(JSON.stringify(payload)), { operations, appSecret: APP_SECRET });
    expect(await response.json()).toEqual({ status: "unmatched", messageId: "wamid.unknown" });
    expect(statusUpdates).toHaveLength(1);
  });

  test("normalizes contact identity and send targets to the canonical WhatsApp number", () => {
    const identity = resolveInboundIdentity({ from: "+91 (98888) 88888" }, { profile: { name: "  Asha Sharma  " } });

    expect(identity).toMatchObject({
      phone: "919888888888",
      name: "Asha Sharma",
    });
    expect(hasUsableIdentity(identity)).toBe(true);
    expect(resolveContactSendTarget({ phone: "+91 98888 88888" })).toEqual({ target: "919888888888", isPhone: true });
    const usernameOnly = resolveInboundIdentity({ from_user_id: "US.1234567890" }, { profile: { username: "@maya" } });
    expect(identityDisplayName(usernameOnly)).toBe("maya");
    expect(hasUsableIdentity(usernameOnly)).toBe(true);
    expect(resolveContactSendTarget({ wa_user_id: "US.1234567890" })).toEqual({ target: "US.1234567890", isPhone: false });
  });

  test("parses interactive button replies", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: { messages: [{
        from: "919888888888",
        id: "wamid.button-1",
        timestamp: "1720000000",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "speak_to_agent", title: "Speak to Agent" } },
      }] } }] }],
    });
    expect(parsed).toMatchObject({ kind: "message", message: { body: "Speak to Agent", selectionId: "speak_to_agent", selectionTitle: "Speak to Agent" } });
  });

  test("parses interactive list replies", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: { messages: [{
        from: "919888888888",
        id: "wamid.list-1",
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: "dubai", title: "Dubai" } },
      }] } }] }],
    });
    expect(parsed).toMatchObject({ kind: "message", message: { body: "Dubai", selectionId: "dubai", selectionTitle: "Dubai" } });
  });

  test("duplicate WhatsApp message IDs do not create or process again", async () => {
    const { operations, calls } = createOperations();
    operations.findMessageByWhatsAppId = async () => ({ conversation_id: "conversation-1" });
    const result = await handleIncomingWhatsAppMessage(
      {
        senderPhone: "919888888888",
        whatsappMessageId: "wamid.duplicate",
        messageType: "text",
        body: "Hello",
        businessPhoneNumber: "919999999999",
        timestamp: null,
        selectionId: null,
        selectionTitle: null,
      },
      operations,
    );
    expect(result).toEqual({ status: "duplicate", conversationId: "conversation-1" });
    expect(calls).toEqual([]);
  });

  test("HUMAN_ACTIVE records the inbound message but does not trigger AI", async () => {
    const { operations, calls } = createOperations("HUMAN_ACTIVE");
    const result = await handleIncomingWhatsAppMessage(
      { senderPhone: "919888888888", whatsappMessageId: "wamid.human", messageType: "text", body: "Hi", selectionId: null, selectionTitle: null, businessPhoneNumber: null, timestamp: null },
      operations,
    );
    expect(result).toEqual({ status: "processed", conversationId: "conversation-1", aiTriggered: false });
    expect(calls).toEqual(["create-message"]);
  });

  test("AI_ACTIVE records the inbound message and calls the rule-based processor", async () => {
    const { operations, calls } = createOperations("AI_ACTIVE");
    const result = await handleIncomingWhatsAppMessage(
      { senderPhone: "91 (98888) 88888", whatsappMessageId: "wamid.ai", messageType: "text", body: "Hi", selectionId: null, selectionTitle: null, businessPhoneNumber: null, timestamp: null },
      operations,
    );
    expect(result).toEqual({ status: "processed", conversationId: "conversation-1", aiTriggered: false });
    expect(calls).toEqual(["create-message", "process-rule-based"]);
  });
});
