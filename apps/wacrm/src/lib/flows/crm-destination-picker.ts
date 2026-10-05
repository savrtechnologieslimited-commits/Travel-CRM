import type { TravelDestination } from '@/lib/crm-bridge';

export type CrmDestinationOption = Pick<
  TravelDestination,
  'id' | 'name' | 'scope'
>;

export const CRM_DESTINATION_STATE_KEY = '__crm_destination_picker';
export const CRM_DESTINATION_RESULT_KEY = '__crm_destination';
export const CRM_ENQUIRY_ENABLED_KEY = '__crm_enquiry_enabled';
export const CRM_DESTINATION_PAGE_SIZE = 8;

export type CrmDestinationPickerState = {
  enabled: true;
  options: CrmDestinationOption[];
  page: number;
};

export type CrmDestinationListRow = {
  id: string;
  title: string;
  description: string;
};

export function getCrmDestinationPage(
  options: CrmDestinationOption[],
  requestedPage: number
): { page: number; rows: CrmDestinationListRow[] } {
  const lastPage = Math.max(
    0,
    Math.ceil(options.length / CRM_DESTINATION_PAGE_SIZE) - 1
  );
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), lastPage);
  const start = page * CRM_DESTINATION_PAGE_SIZE;
  const pageOptions = options.slice(start, start + CRM_DESTINATION_PAGE_SIZE);
  const rows: CrmDestinationListRow[] = pageOptions.map((option, index) => ({
    id: `crm-destination:${start + index}`,
    title: option.name.trim().slice(0, 24),
    description: option.scope === 'domestic' ? 'Domestic' : 'International',
  }));
  if (page > 0) {
    rows.unshift({
      id: 'crm-destination:previous',
      title: 'Previous',
      description: 'Previous destinations',
    });
  }
  if (page < lastPage) {
    rows.push({
      id: 'crm-destination:next',
      title: 'More destinations',
      description: 'Next destinations',
    });
  }
  return { page, rows };
}

export function parseCrmDestinationPickerState(
  value: unknown
): CrmDestinationPickerState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    state.enabled !== true ||
    !Array.isArray(state.options) ||
    !Number.isInteger(state.page) ||
    !state.options.every((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option))
        return false;
      const entry = option as Record<string, unknown>;
      return (
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        (entry.scope === 'domestic' || entry.scope === 'international')
      );
    })
  ) {
    return null;
  }
  const options = state.options as CrmDestinationOption[];
  const lastPage = Math.max(
    0,
    Math.ceil(options.length / CRM_DESTINATION_PAGE_SIZE) - 1
  );
  return {
    enabled: true,
    options,
    page: Math.min(Math.max(0, state.page as number), lastPage),
  };
}
