export type ItineraryPackageOption = {
  id?: string | null;
  itinerary_id: string;
  name: string;
  description?: string | null;
  sequence: number;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function createItineraryPackageOption(input: Partial<ItineraryPackageOption> & { itinerary_id: string; name?: string; sequence?: number }): ItineraryPackageOption {
  const name = typeof input.name === "string" ? input.name.trim() : "Package option";
  const sequence = Number(input.sequence ?? 0);

  return {
    id: input.id ?? null,
    itinerary_id: input.itinerary_id,
    name: name || "Package option",
    description: typeof input.description === "string" ? input.description.trim() || null : null,
    sequence: Number.isFinite(sequence) ? Math.max(0, sequence) : 0,
    is_active: input.is_active ?? true,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
  };
}

export function validateItineraryPackageOption(input: Partial<ItineraryPackageOption>) {
  if (!input.itinerary_id || !UUID_PATTERN.test(input.itinerary_id.trim())) {
    throw new Error("Itinerary reference is invalid.");
  }

  if (!input.name || !input.name.trim()) {
    throw new Error("Package name is required.");
  }

  const sequence = Number(input.sequence ?? 0);
  if (!Number.isFinite(sequence) || sequence < 0) {
    throw new Error("Package sequence must be a non-negative integer.");
  }

  return createItineraryPackageOption({
    ...input,
    itinerary_id: input.itinerary_id,
    name: input.name,
    sequence,
  });
}

export function reorderItineraryPackageOptions<T extends { id?: string | null; sequence: number; name?: string }>(items: T[]) {
  return [...items]
    .map((item, index) => ({
      ...item,
      name: typeof item.name === "string" ? item.name.trim() || `Package ${index + 1}` : `Package ${index + 1}`,
      sequence: Number(item.sequence) || index + 1,
    }))
    .sort((left, right) => {
      const leftName = left.name.toLowerCase();
      const rightName = right.name.toLowerCase();

      if (leftName < rightName) return -1;
      if (leftName > rightName) return 1;
      return (Number(left.sequence) || 0) - (Number(right.sequence) || 0);
    })
    .map((item, index) => ({ ...item, sequence: index + 1 }));
}

export function validatePackageScope(itineraryId: string, packageItem: { package_id?: string | null }, itemItineraryId?: string | null) {
  if (packageItem.package_id && itemItineraryId && itemItineraryId !== itineraryId) {
    throw new Error("Package item must belong to the same itinerary.");
  }
}
