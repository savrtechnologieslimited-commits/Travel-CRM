import {
  ITINERARY_CONTENT_ITEM_TYPES,
  type ItineraryContentItemType,
  validateItineraryDayItem,
} from "@/lib/itinerary-content";
import { HOTEL_MEAL_PLANS, HOTEL_STAR_CATEGORIES, ROOM_TYPES, nightsBetween } from "@/lib/hotel";
import { validateTripItineraryInput } from "@/lib/itinerary-library";
import { parseDurationMinutes } from "@/lib/transfer-time";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

export type ValidationSummary = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

function addIssue(list: ValidationIssue[], issue: ValidationIssue) {
  list.push(issue);
}

function validDate(value?: string | null) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value?: string | null) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dateOutsideTripRange(
  value: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!value || !validDate(value)) return false;
  return Boolean((start && value < start) || (end && value > end));
}

function isValidUrl(value?: string | null) {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

type ItineraryDraftValidationItem = {
  sequence?: number | null | undefined;
  item_type?: string | null | undefined;
  title?: string | null | undefined;
  hotel_name?: string | null | undefined;
  check_in?: string | null | undefined;
  check_out?: string | null | undefined;
  check_in_time?: string | null | undefined;
  check_out_time?: string | null | undefined;
  activity_date?: string | null | undefined;
  extra_transport_date?: string | null | undefined;
  departure_time?: string | null | undefined;
  arrival_time?: string | null | undefined;
  extra_transport_pickup_time?: string | null | undefined;
  extra_transport_drop_time?: string | null | undefined;
  duration?: string | null | undefined;
  nights?: number | null | undefined;
  rooms?: number | null | undefined;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  meal_plan?: string | null | undefined;
  star_category?: string | null | undefined;
  room_type?: string | null | undefined;
  flight_departure_date?: string | null | undefined;
  flight_arrival_date?: string | null | undefined;
  flight_departure_time?: string | null | undefined;
  flight_arrival_time?: string | null | undefined;
  flight_price?: number | null | undefined;
  flight_currency?: string | null | undefined;
  pickup?: string | null | undefined;
  dropoff?: string | null | undefined;
  extra_transport_passengers?: number | null | undefined;
  visa_country?: string | null | undefined;
  extra_transport_type?: string | null | undefined;
  hotel_city?: string | null | undefined;
  location?: string | null | undefined;
};

type ItineraryDraftValidationDay = {
  day_number?: number | null;
  date?: string | null;
  title?: string | null;
  items?: Array<ItineraryDraftValidationItem> | null;
};

export function validateItineraryDraftState(
  input: {
    title?: string | null;
    customer_id?: string | null;
    lead_id?: string | null;
    enquiry_id?: string | null;
    destination_id?: string | null;
    travel_start_date?: string | null;
    travel_end_date?: string | null;
    adults?: number | string | null;
    children?: number | string | null;
    assigned_to?: string | null;
    status?: string | null;
    summary?: string | null;
    inclusions?: string[] | null;
    exclusions?: string[] | null;
    cancellation_info?: string | null;
    custom_tables?: Array<{
      title?: string | null;
      columns?: string[] | null;
      rows?: string[][] | null;
    }> | null;
    photos?: Array<{
      url?: string | null;
      day_id?: string | null;
      day_item_id?: string | null;
      sequence?: number | null;
    }> | null;
    days?: ItineraryDraftValidationDay[] | null;
  },
  options: {
    allowMissingDestination?: boolean;
    allowMissingScheduledTimes?: boolean;
  } = {},
) {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const headerValidation = validateTripItineraryInput({
    ...(input.title != null ? { title: input.title } : {}),
    ...(input.customer_id != null ? { customer_id: input.customer_id } : {}),
    ...(input.lead_id != null ? { lead_id: input.lead_id } : {}),
    ...(input.enquiry_id != null ? { enquiry_id: input.enquiry_id } : {}),
    ...(input.destination_id != null ? { destination_id: input.destination_id } : {}),
    ...(input.travel_start_date != null ? { travel_start_date: input.travel_start_date } : {}),
    ...(input.travel_end_date != null ? { travel_end_date: input.travel_end_date } : {}),
    ...(input.adults != null ? { adults: input.adults } : {}),
    ...(input.children != null ? { children: input.children } : {}),
    ...(input.assigned_to != null ? { assigned_to: input.assigned_to } : {}),
    ...(input.status != null ? { status: input.status } : {}),
    ...(input.summary != null ? { summary: input.summary } : {}),
  });

  for (const [field, message] of Object.entries(headerValidation.errors)) {
    if (options.allowMissingDestination && field === "destination_id") continue;
    addIssue(errors, { severity: "error", code: "MISSING_REQUIRED_FIELD", message, path: field });
  }

  if (input.travel_start_date && input.travel_end_date) {
    const start = new Date(`${input.travel_start_date}T00:00:00Z`).getTime();
    const end = new Date(`${input.travel_end_date}T00:00:00Z`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      addIssue(errors, {
        severity: "error",
        code: "INVALID_DATE_RANGE",
        message: "Travel end date cannot be before the start date.",
        path: "travel_end_date",
      });
    }
  }

  const dayList = input.days ?? [];
  const hotelTripEndDate =
    input.travel_end_date && validDate(input.travel_end_date)
      ? input.travel_end_date
      : dayList
          .map((day) => day?.date)
          .filter((date): date is string => Boolean(date) && validDate(date))
          .sort()
          .at(-1);
  if (dayList.length === 0) {
    addIssue(errors, {
      severity: "error",
      code: "INVALID_DAY_SEQUENCE",
      message: "At least one itinerary day is required.",
      path: "days",
    });
  }

  const seenDayNumbers = new Set<number>();
  for (let index = 0; index < dayList.length; index += 1) {
    const day = dayList[index];
    if (!day) continue;
    const dayNumber = Number(day.day_number ?? index + 1);
    if (!Number.isFinite(dayNumber) || dayNumber < 1) {
      addIssue(errors, {
        severity: "error",
        code: "INVALID_DAY_SEQUENCE",
        message: `Day ${index + 1} has an invalid day number.`,
        path: `days[${index}].day_number`,
      });
      continue;
    }
    if (seenDayNumbers.has(dayNumber)) {
      addIssue(errors, {
        severity: "error",
        code: "INVALID_DAY_SEQUENCE",
        message: `Duplicate day number ${dayNumber}.`,
        path: `days[${index}].day_number`,
      });
    }
    seenDayNumbers.add(dayNumber);

    if (!day.title?.trim()) {
      addIssue(errors, {
        severity: "error",
        code: "MISSING_REQUIRED_FIELD",
        message: `Day ${dayNumber} title is required.`,
        path: `days[${index}].title`,
      });
    }

    if (day.date && !validDate(day.date)) {
      addIssue(errors, {
        severity: "error",
        code: "INVALID_DATE_RANGE",
        message: `Day ${dayNumber} date is invalid.`,
        path: `days[${index}].date`,
      });
    }

    if (input.travel_start_date && input.travel_end_date && day.date && validDate(day.date)) {
      const dayValue = new Date(`${day.date}T00:00:00Z`).getTime();
      if (
        dayValue < new Date(`${input.travel_start_date}T00:00:00Z`).getTime() ||
        dayValue > new Date(`${input.travel_end_date}T00:00:00Z`).getTime()
      ) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_DAY_SEQUENCE",
          message: `Day ${dayNumber} date falls outside the itinerary travel range.`,
          path: `days[${index}].date`,
        });
      }
    }

    const items = day.items ?? [];
    const seenSequences = new Set<number>();
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (!item) continue;
      for (const forbiddenKey of [
        "id",
        "destination_id",
        "customer_id",
        "lead_id",
        "enquiry_id",
        "booking_id",
        "supplier_id",
        "employee_id",
      ]) {
        if (
          Object.prototype.hasOwnProperty.call(item, forbiddenKey) &&
          (item as Record<string, unknown>)[forbiddenKey] != null
        ) {
          addIssue(errors, {
            severity: "error",
            code: "SOURCE_CONFLICT",
            message: `Item contains forbidden database identifier in ${forbiddenKey}.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
      }
      const itemType = (item.item_type ?? "NOTE") as ItineraryContentItemType;
      const serviceDate =
        itemType === "ACTIVITY" || itemType === "SIGHTSEEING"
          ? (item.activity_date ?? day.date)
          : itemType === "EXTRA_TRANSPORT"
            ? (item.extra_transport_date ?? day.date)
            : day.date;
      if ((item.activity_date || item.extra_transport_date) && !validDate(serviceDate)) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_DATE_RANGE",
          message: `Day ${dayNumber} activity or transport date is invalid.`,
          path: `days[${index}].items[${itemIndex}]`,
        });
      }
      if (
        (itemType === "ACTIVITY" || itemType === "SIGHTSEEING" || itemType === "EXTRA_TRANSPORT") &&
        dateOutsideTripRange(serviceDate, input.travel_start_date, input.travel_end_date)
      ) {
        addIssue(errors, {
          severity: "error",
          code: "OUTSIDE_TRAVEL_RANGE",
          message: `Day ${dayNumber} ${itemType === "EXTRA_TRANSPORT" ? "transport" : "activity"} date must be within the trip dates.`,
          path: `days[${index}].items[${itemIndex}]`,
        });
      }
      if (!ITINERARY_CONTENT_ITEM_TYPES.includes(itemType)) {
        addIssue(errors, {
          severity: "error",
          code: "UNSUPPORTED_CONTENT_TYPE",
          message: `Item ${itemIndex + 1} uses an unsupported content type.`,
          path: `days[${index}].items[${itemIndex}].item_type`,
        });
      }

      const requiredTimeFields: Array<[string, string | null | undefined]> =
        itemType === "ACCOMMODATION"
          ? [
              ["check-in time", item.check_in_time],
              ["check-out time", item.check_out_time],
            ]
          : itemType === "FLIGHT"
            ? [
                ["departure time", item.flight_departure_time],
                ["arrival time", item.flight_arrival_time],
              ]
            : itemType === "EXTRA_TRANSPORT"
              ? [
                  ["pickup time", item.extra_transport_pickup_time],
                  ["drop-off time", item.extra_transport_drop_time],
                ]
              : [
                  ["start time", item.departure_time],
                  ["end time", item.arrival_time],
                ];
      for (const [label, value] of requiredTimeFields) {
        if (!value) {
          const issue = {
            severity: options.allowMissingScheduledTimes ? "warning" : "error",
            code: options.allowMissingScheduledTimes
              ? "MISSING_SCHEDULE_TIME"
              : "MISSING_REQUIRED_FIELD",
            message: `Day ${dayNumber} ${itemType.replaceAll("_", " ").toLowerCase()} must include a ${label}.`,
            path: `days[${index}].items[${itemIndex}]`,
          } as const;
          addIssue(options.allowMissingScheduledTimes ? warnings : errors, issue);
        } else if (!validTime(value)) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_TIME",
            message: `Day ${dayNumber} ${itemType.replaceAll("_", " ").toLowerCase()} has an invalid ${label}.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
      }

      const sequence = Number(item.sequence ?? itemIndex + 1);
      if (!Number.isFinite(sequence) || sequence < 1) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_ITEM_SEQUENCE",
          message: `Item ${itemIndex + 1} has an invalid sequence.`,
          path: `days[${index}].items[${itemIndex}].sequence`,
        });
      } else if (seenSequences.has(sequence)) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_ITEM_SEQUENCE",
          message: `Duplicate item sequence ${sequence}.`,
          path: `days[${index}].items[${itemIndex}].sequence`,
        });
      } else {
        seenSequences.add(sequence);
      }

      if (!item.title?.trim()) {
        addIssue(errors, {
          severity: "error",
          code: "MISSING_REQUIRED_FIELD",
          message: `Day ${dayNumber} item ${itemIndex + 1} title is required.`,
          path: `days[${index}].items[${itemIndex}].title`,
        });
      }

      try {
        validateItineraryDayItem({
          ...item,
          itinerary_day_id: "00000000-0000-0000-0000-000000000000",
          item_type: itemType,
          title: item.title ?? "Untitled",
          sequence,
        });
      } catch (error) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_CONTENT_ITEM",
          message: error instanceof Error ? error.message : "Invalid content item.",
          path: `days[${index}].items[${itemIndex}]`,
        });
      }

      if (itemType === "ACCOMMODATION") {
        if (
          item.check_in &&
          hotelTripEndDate &&
          validDate(item.check_in) &&
          item.check_in >= hotelTripEndDate
        ) {
          addIssue(errors, {
            severity: "error",
            code: "HOTEL_CHECKIN_ON_FINAL_DAY",
            message:
              "The final trip day is checkout-only; hotel check-in must be on an earlier day.",
            path: `days[${index}].items[${itemIndex}].check_in`,
          });
        }
        if (
          dateOutsideTripRange(item.check_in, input.travel_start_date, hotelTripEndDate) ||
          dateOutsideTripRange(item.check_out, input.travel_start_date, hotelTripEndDate)
        ) {
          addIssue(errors, {
            severity: "error",
            code: "OUTSIDE_TRAVEL_RANGE",
            message: `Accommodation item ${itemIndex + 1} check-in and check-out dates must be within the trip dates.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
        if (!item.hotel_name?.trim()) {
          addIssue(errors, {
            severity: "error",
            code: "MISSING_REQUIRED_FIELD",
            message: `Accommodation item ${itemIndex + 1} must include a hotel name.`,
            path: `days[${index}].items[${itemIndex}].hotel_name`,
          });
        }
        const hotelNights = Number(
          item.nights ?? nightsBetween(item.check_in ?? null, item.check_out ?? null),
        );
        if (
          item.check_in &&
          item.check_out &&
          new Date(`${item.check_out}T00:00:00Z`).getTime() <
            new Date(`${item.check_in}T00:00:00Z`).getTime()
        ) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_HOTEL_DATES",
            message: `Accommodation item ${itemIndex + 1} check-out is before check-in.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
        if (item.nights !== undefined && item.nights !== null && Number(item.nights) < 0) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_HOTEL_DATES",
            message: `Accommodation item ${itemIndex + 1} nights cannot be negative.`,
            path: `days[${index}].items[${itemIndex}].nights`,
          });
        }
        if ((item.rooms ?? 0) < 1) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_ROOM_COUNT",
            message: `Accommodation item ${itemIndex + 1} must include at least one room.`,
            path: `days[${index}].items[${itemIndex}].rooms`,
          });
        }
        if (item.meal_plan && !HOTEL_MEAL_PLANS.includes(String(item.meal_plan) as never)) {
          addIssue(errors, {
            severity: "error",
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: `Accommodation item ${itemIndex + 1} meal plan is not supported.`,
            path: `days[${index}].items[${itemIndex}].meal_plan`,
          });
        }
        if (
          item.star_category &&
          !HOTEL_STAR_CATEGORIES.includes(String(item.star_category) as never)
        ) {
          addIssue(errors, {
            severity: "error",
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: `Accommodation item ${itemIndex + 1} star category is not supported.`,
            path: `days[${index}].items[${itemIndex}].star_category`,
          });
        }
        if (item.room_type && !ROOM_TYPES.includes(String(item.room_type) as never)) {
          addIssue(errors, {
            severity: "error",
            code: "UNSUPPORTED_CONTENT_TYPE",
            message: `Accommodation item ${itemIndex + 1} room type is not supported.`,
            path: `days[${index}].items[${itemIndex}].room_type`,
          });
        }
        if (Number(item.adults ?? 0) < 0 || Number(item.children ?? 0) < 0) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_ROOM_COUNT",
            message: `Accommodation item ${itemIndex + 1} occupancy cannot be negative.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
        if (item.nights !== undefined && item.nights !== null && item.check_in && item.check_out) {
          const expected = nightsBetween(item.check_in, item.check_out);
          if (Number(item.nights) !== expected) {
            addIssue(errors, {
              severity: "error",
              code: "INVALID_HOTEL_DATES",
              message: `Accommodation item ${itemIndex + 1} nights do not match the check-in/check-out dates.`,
              path: `days[${index}].items[${itemIndex}].nights`,
            });
          }
        }
      }

      if (itemType === "FLIGHT") {
        if (
          item.flight_departure_date &&
          item.flight_arrival_date &&
          validDate(item.flight_departure_date) &&
          validDate(item.flight_arrival_date)
        ) {
          const dep = new Date(`${item.flight_departure_date}T00:00:00Z`).getTime();
          const arr = new Date(`${item.flight_arrival_date}T00:00:00Z`).getTime();
          if (arr < dep) {
            addIssue(errors, {
              severity: "error",
              code: "INVALID_FLIGHT_TIMES",
              message: `Flight item ${itemIndex + 1} arrival date is before departure date.`,
              path: `days[${index}].items[${itemIndex}]`,
            });
          }
        }
        if ((item.flight_price ?? null) !== null && Number(item.flight_price) < 0) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_PRICE",
            message: `Flight item ${itemIndex + 1} price cannot be negative.`,
            path: `days[${index}].items[${itemIndex}].flight_price`,
          });
        }
        if (item.flight_currency && !/^[A-Z]{3}$/.test(String(item.flight_currency))) {
          addIssue(errors, {
            severity: "error",
            code: "INVALID_PRICE",
            message: `Flight item ${itemIndex + 1} currency must be a 3-letter ISO code.`,
            path: `days[${index}].items[${itemIndex}].flight_currency`,
          });
        }
      }

      if (itemType === "VISA") {
        if (!item.visa_country?.trim()) {
          addIssue(errors, {
            severity: "error",
            code: "MISSING_REQUIRED_FIELD",
            message: `Visa item ${itemIndex + 1} must include a country.`,
            path: `days[${index}].items[${itemIndex}].visa_country`,
          });
        }
      }

      if (
        (itemType === "TRANSPORT" || itemType === "EXTRA_TRANSPORT") &&
        !item.pickup?.trim() &&
        !item.dropoff?.trim()
      ) {
        addIssue(errors, {
          severity: "error",
          code: "MISSING_REQUIRED_FIELD",
          message: `Transport item ${itemIndex + 1} must include pickup and/or dropoff details.`,
          path: `days[${index}].items[${itemIndex}]`,
        });
      }

      const pickupTime =
        itemType === "EXTRA_TRANSPORT" ? item.extra_transport_pickup_time : item.departure_time;
      const arrivalTime =
        itemType === "EXTRA_TRANSPORT" ? item.extra_transport_drop_time : item.arrival_time;
      const durationMinutes = parseDurationMinutes(item.duration);
      const startMinutes =
        pickupTime && /^(\d{2}):(\d{2})$/.test(pickupTime)
          ? Number(pickupTime.slice(0, 2)) * 60 + Number(pickupTime.slice(3, 5))
          : null;
      const continuesAfterMidnight = Boolean(
        (pickupTime && arrivalTime && arrivalTime < pickupTime) ||
        (startMinutes !== null &&
          durationMinutes !== null &&
          startMinutes + durationMinutes >= 24 * 60),
      );
      if (
        itemType === "TRANSPORT" ||
        itemType === "EXTRA_TRANSPORT" ||
        itemType === "ACTIVITY" ||
        itemType === "SIGHTSEEING"
      ) {
        if (
          input.travel_end_date &&
          serviceDate === input.travel_end_date &&
          continuesAfterMidnight
        ) {
          addIssue(errors, {
            severity: "error",
            code: "OUTSIDE_TRAVEL_RANGE",
            message: `Day ${dayNumber} ${itemType === "ACTIVITY" || itemType === "SIGHTSEEING" ? "activity" : "transfer"} schedule cannot continue past the trip end date.`,
            path: `days[${index}].items[${itemIndex}]`,
          });
        }
      }

      if (
        (itemType === "TRANSPORT" || itemType === "EXTRA_TRANSPORT") &&
        item.extra_transport_passengers !== undefined &&
        item.extra_transport_passengers !== null &&
        Number(item.extra_transport_passengers) < 0
      ) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_TRANSPORT_TIMES",
          message: `Transport item ${itemIndex + 1} passenger count cannot be negative.`,
          path: `days[${index}].items[${itemIndex}].extra_transport_passengers`,
        });
      }
    }
  }

  if (input.custom_tables) {
    for (let index = 0; index < input.custom_tables.length; index += 1) {
      const table = input.custom_tables[index];
      if (!table?.title?.trim()) {
        addIssue(errors, {
          severity: "error",
          code: "MISSING_REQUIRED_FIELD",
          message: `Custom table ${index + 1} title is required.`,
          path: `custom_tables[${index}].title`,
        });
      }
      if (!Array.isArray(table?.columns) || table.columns.length === 0) {
        addIssue(errors, {
          severity: "error",
          code: "MISSING_REQUIRED_FIELD",
          message: `Custom table ${index + 1} must include columns.`,
          path: `custom_tables[${index}].columns`,
        });
      }
      if (Array.isArray(table?.rows)) {
        for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
          const row = table.rows[rowIndex] ?? [];
          if (row.length !== (table.columns ?? []).length) {
            addIssue(errors, {
              severity: "error",
              code: "INVALID_CONTENT_ITEM",
              message: `Custom table ${index + 1} row ${rowIndex + 1} does not match the column count.`,
              path: `custom_tables[${index}].rows[${rowIndex}]`,
            });
          }
        }
      }
    }
  }

  if (input.photos) {
    for (let index = 0; index < input.photos.length; index += 1) {
      const photo = input.photos[index];
      if (!photo?.url?.trim()) {
        addIssue(warnings, {
          severity: "warning",
          code: "MISSING_REQUIRED_FIELD",
          message: `Photo ${index + 1} is missing a URL.`,
          path: `photos[${index}].url`,
        });
        continue;
      }
      if (!isValidUrl(photo.url)) {
        addIssue(errors, {
          severity: "error",
          code: "INVALID_PHOTO_REFERENCE",
          message: `Photo ${index + 1} URL is invalid.`,
          path: `photos[${index}].url`,
        });
      }
    }
  }

  if (
    input.inclusions &&
    input.inclusions.some((value) => typeof value !== "string" || !value.trim())
  ) {
    addIssue(errors, {
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
      message: "Inclusions must be a list of non-empty strings.",
      path: "inclusions",
    });
  }

  if (
    input.exclusions &&
    input.exclusions.some((value) => typeof value !== "string" || !value.trim())
  ) {
    addIssue(errors, {
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
      message: "Exclusions must be a list of non-empty strings.",
      path: "exclusions",
    });
  }

  for (const value of input.cancellation_info ?? "") {
    if (typeof value === "string" && value.trim().length > 0) {
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
