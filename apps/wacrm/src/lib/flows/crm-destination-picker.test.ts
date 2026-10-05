import { describe, expect, it } from 'vitest';
import {
  CRM_DESTINATION_PAGE_SIZE,
  getCrmDestinationPage,
  parseCrmDestinationPickerState,
  type CrmDestinationOption,
} from './crm-destination-picker';

function options(count: number): CrmDestinationOption[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `destination-${index}`,
    name: `Destination ${index}`,
    scope: index % 2 === 0 ? 'domestic' : 'international',
  }));
}

describe('CRM destination picker pages', () => {
  it('keeps every WhatsApp list at ten rows or fewer and supports navigation', () => {
    const destinations = options(20);
    const first = getCrmDestinationPage(destinations, 0);
    const second = getCrmDestinationPage(destinations, 1);
    const last = getCrmDestinationPage(destinations, 2);

    expect(first.rows).toHaveLength(CRM_DESTINATION_PAGE_SIZE + 1);
    expect(second.rows).toHaveLength(CRM_DESTINATION_PAGE_SIZE + 2);
    expect(last.rows).toHaveLength(5);
    expect(second.rows[0]?.id).toBe('crm-destination:previous');
    expect(second.rows.at(-1)?.id).toBe('crm-destination:next');
    expect(first.rows.every((row) => row.title.length <= 24)).toBe(true);
    expect(getCrmDestinationPage(destinations, 50).page).toBe(2);
  });

  it('validates persisted picker state before using it', () => {
    const state = { enabled: true, options: options(2), page: 0 };
    expect(parseCrmDestinationPickerState(state)).toEqual(state);
    expect(
      parseCrmDestinationPickerState({
        enabled: true,
        options: [{ id: 'x', name: 'Bad scope', scope: 'other' }],
        page: 0,
      })
    ).toBeNull();
    expect(parseCrmDestinationPickerState(null)).toBeNull();
  });
});
