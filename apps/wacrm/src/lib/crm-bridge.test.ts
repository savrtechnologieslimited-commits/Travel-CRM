import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createCrmBridgeClient,
  CrmBridgeError,
  type TravelFlowCompletion,
} from './crm-bridge';

const secret = 'test-bridge-secret-with-at-least-32-bytes';

describe('Travel CRM bridge', () => {
  it('signs destination requests and validates the response', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = String(init?.body);
      const timestamp = String(
        new Headers(init?.headers).get('x-wacrm-timestamp')
      );
      expect(new Headers(init?.headers).get('x-wacrm-signature')).toBe(
        createHmac('sha256', secret)
          .update(`${timestamp}.${body}`)
          .digest('hex')
      );
      return new Response(
        JSON.stringify({
          version: 1,
          scope: 'domestic',
          destinations: [
            {
              id: 'destination-1',
              name: 'Goa',
              scope: 'domestic',
              pdf: { name: 'goa.pdf', url: 'https://crm.example/signed.pdf' },
              assignment_status: 'assigned',
              assigned_employee_id: 'employee-1',
            },
          ],
        }),
        { status: 200 }
      );
    });
    const client = createCrmBridgeClient({
      baseUrl: 'http://localhost:5173',
      secret,
      fetcher,
      now: () => 1_700_000_000_000,
    });

    await expect(client.getDestinations('domestic')).resolves.toMatchObject([
      { id: 'destination-1', name: 'Goa', scope: 'domestic' },
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'http://localhost:5173/api/wacrm/destinations'
    );
  });

  it('returns only destination details from the live CRM lookup', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const scope = JSON.parse(String(init?.body)).scope;
      return new Response(
        JSON.stringify({
          version: 1,
          scope,
          destinations:
            scope === 'domestic'
              ? [
                  {
                    id: 'destination-1',
                    name: 'Goa',
                    scope: 'domestic',
                    pdf: {
                      name: 'goa.pdf',
                      url: 'https://crm.example/signed.pdf',
                    },
                    assignment_status: 'assigned',
                    assigned_employee_id: 'employee-1',
                  },
                ]
              : [],
        }),
        { status: 200 },
      );
    });
    const client = createCrmBridgeClient({
      baseUrl: 'https://crm.example.com',
      secret,
      fetcher,
    });

    await expect(client.getDestination('destination-1')).resolves.toEqual({
      destination_id: 'destination-1',
      destination_name: 'Goa',
      travel_type: 'domestic',
      assigned_employee_id: 'employee-1',
      pdf_url: 'https://crm.example/signed.pdf',
      pdf_available: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects insecure remote CRM URLs and undersized bridge secrets', () => {
    expect(() =>
      createCrmBridgeClient({
        baseUrl: 'http://crm.example.com',
        secret,
      })
    ).toThrow(CrmBridgeError);
    expect(() =>
      createCrmBridgeClient({
        baseUrl: 'https://crm.example.com',
        secret: 'short',
      })
    ).toThrow(CrmBridgeError);
  });

  it('posts completed enquiries to the CRM receiver', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            customer_id: 'customer-1',
            requirement_id: 'requirement-1',
            lead_id: 'lead-1',
            enquiry_id: 'enquiry-1',
            enquiry_number: 'ENQ-1',
            created_customer: true,
          }),
          { status: 200 },
        )
    );
    const client = createCrmBridgeClient({
      baseUrl: 'https://crm.example.com',
      secret,
      fetcher,
    });
    const completion: TravelFlowCompletion = {
      version: 1,
      flow_run_id: 'run-id',
      flow_id: 'flow-id',
      wacrm_contact_id: 'contact-id',
      flow_name: 'Travel enquiry',
      completed_at: new Date().toISOString(),
      contact: { name: 'Customer', email: 'customer@example.com', phone: null },
      destination: null,
      answers: {},
    };

    await expect(client.completeFlow(completion)).resolves.toMatchObject({
      enquiry_id: 'enquiry-1',
      enquiry_number: 'ENQ-1',
    });
    expect(fetcher.mock.calls[0]?.[0]).toEqual(
      new URL('/api/wacrm/flow-completed', 'https://crm.example.com')
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(
      completion
    );
  });
});
