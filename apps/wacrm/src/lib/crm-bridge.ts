import { createHmac } from 'node:crypto';

export type TravelDestination = {
  id: string;
  name: string;
  scope: 'domestic' | 'international';
  pdf: { name: string; url: string } | null;
  assignment_status: 'assigned' | 'unassigned' | 'ambiguous';
  assigned_employee_id: string;
};

export type TravelDestinationDetails = {
  destination_id: string;
  destination_name: string;
  travel_type: 'domestic' | 'international';
  assigned_employee_id: string;
  pdf_url: string | null;
  pdf_available: boolean;
};

export type TravelFlowCompletionResult = {
  customer_id: string;
  requirement_id: string;
  lead_id: string;
  enquiry_id: string;
  enquiry_number: string;
  created_customer: boolean;
};

export type TravelFlowCompletion = {
  version: 1;
  flow_run_id: string;
  flow_id: string;
  wacrm_contact_id: string;
  wacrm_conversation_id?: string | null;
  flow_name: string;
  completed_at: string;
  is_partial?: boolean;
  handoff_requested?: boolean;
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  destination?: {
    id: string;
    name: string;
    scope: 'domestic' | 'international';
    assignment_status: TravelDestination['assignment_status'];
    assigned_employee_id?: string | null;
  } | null;
  answers: Record<string, unknown>;
};

type CrmBridgeOptions = {
  baseUrl: string;
  secret: string;
  fetcher?: typeof fetch;
  now?: () => number;
};

export class CrmBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmBridgeError';
  }
}

function validateBridgeConfig(baseUrl: string, secret: string): URL {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new CrmBridgeError(
      'WACRM_BRIDGE_SECRET must contain at least 32 bytes.'
    );
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CrmBridgeError(
      'TRAVEL_CRM_BASE_URL must be a valid absolute URL.'
    );
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  ) {
    throw new CrmBridgeError(
      'TRAVEL_CRM_BASE_URL must use HTTPS except for local development.'
    );
  }
  return url;
}

export function createCrmBridgeClient(options: CrmBridgeOptions) {
  const baseUrl = validateBridgeConfig(options.baseUrl, options.secret);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;

  async function post<T>(path: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(now() / 1000).toString();
    const signature = createHmac('sha256', options.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    let response: Response;
    try {
      response = await fetcher(new URL(path, baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-wacrm-timestamp': timestamp,
          'x-wacrm-signature': signature,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
      });
    } catch (error) {
      throw new CrmBridgeError(
        `Travel CRM request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!response.ok) {
      throw new CrmBridgeError(
        `Travel CRM returned HTTP ${response.status} for ${path}.`
      );
    }
    return (await response.json()) as T;
  }

  return {
    async getDestinations(
      scope: TravelDestination['scope']
    ): Promise<TravelDestination[]> {
      const result = await post<{
        version?: unknown;
        scope?: unknown;
        destinations?: unknown;
      }>('/api/wacrm/destinations', { scope });
      if (
        result.version !== 1 ||
        result.scope !== scope ||
        !Array.isArray(result.destinations)
      ) {
        throw new CrmBridgeError(
          'Travel CRM returned an invalid destination response.'
        );
      }
      return result.destinations.map((raw): TravelDestination => {
        if (!raw || typeof raw !== 'object') {
          throw new CrmBridgeError(
            'Travel CRM returned an invalid destination.'
          );
        }
        const item = raw as Record<string, unknown>;
        const pdf = item.pdf;
        if (
          typeof item.id !== 'string' ||
          typeof item.name !== 'string' ||
          item.scope !== scope ||
          item.assignment_status !== 'assigned' ||
          typeof item.assigned_employee_id !== 'string' ||
          (pdf !== null &&
            (!pdf ||
              typeof pdf !== 'object' ||
              typeof (pdf as Record<string, unknown>).name !== 'string' ||
              typeof (pdf as Record<string, unknown>).url !== 'string'))
        ) {
          throw new CrmBridgeError(
            'Travel CRM returned an invalid destination.'
          );
        }
        return {
          id: item.id,
          name: item.name,
          scope,
          pdf: pdf as TravelDestination['pdf'],
          assignment_status:
            item.assignment_status as TravelDestination['assignment_status'],
          assigned_employee_id: item.assigned_employee_id,
        };
      });
    },
    async getDestination(
      destinationId: string
    ): Promise<TravelDestinationDetails> {
      if (!destinationId.trim()) {
        throw new CrmBridgeError('A Travel CRM destination ID is required.');
      }
      const destinations = (
        await Promise.all([
          this.getDestinations('domestic'),
          this.getDestinations('international'),
        ])
      ).flat();
      const destination = destinations.find(({ id }) => id === destinationId);
      if (!destination) {
        throw new CrmBridgeError(
          'The Travel CRM destination is no longer active or assigned.'
        );
      }
      return {
        destination_id: destination.id,
        destination_name: destination.name,
        travel_type: destination.scope,
        assigned_employee_id: destination.assigned_employee_id,
        pdf_url: destination.pdf?.url ?? null,
        pdf_available: Boolean(destination.pdf?.url),
      };
    },
    async completeFlow(
      completion: TravelFlowCompletion
    ): Promise<TravelFlowCompletionResult> {
      const result = await post<Partial<TravelFlowCompletionResult>>(
        '/api/wacrm/flow-completed',
        completion
      );
      if (
        typeof result.customer_id !== 'string' ||
        typeof result.requirement_id !== 'string' ||
        typeof result.lead_id !== 'string' ||
        typeof result.enquiry_id !== 'string' ||
        typeof result.enquiry_number !== 'string' ||
        typeof result.created_customer !== 'boolean'
      ) {
        throw new CrmBridgeError(
          'Travel CRM returned an invalid enquiry result.'
        );
      }
      return {
        customer_id: result.customer_id,
        requirement_id: result.requirement_id,
        lead_id: result.lead_id,
        enquiry_id: result.enquiry_id,
        enquiry_number: result.enquiry_number,
        created_customer: result.created_customer,
      };
    },
  };
}

export function getCrmBridgeClient() {
  const baseUrl = process.env.TRAVEL_CRM_BASE_URL?.trim();
  if (!baseUrl) {
    throw new CrmBridgeError('TRAVEL_CRM_BASE_URL is not configured in WACRM.');
  }
  return createCrmBridgeClient({
    baseUrl,
    secret: process.env.WACRM_BRIDGE_SECRET ?? '',
  });
}
