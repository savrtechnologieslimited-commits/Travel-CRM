export function sanitizeListValues(values: string[]) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

export function updateListValue(values: string[], index: number, nextValue: string) {
  return values.map((value, itemIndex) => (itemIndex === index ? nextValue : value));
}

export function addListValue(values: string[]) {
  const lastValue = values[values.length - 1] ?? "";
  if (values.length > 0 && lastValue.trim() === "") {
    return values;
  }
  return [...values, ""];
}

export function moveListValue(values: string[], index: number, direction: "up" | "down") {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= values.length) return values;
  const reordered = [...values];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex]!, reordered[index]!];
  return reordered;
}

export function removeListValue(values: string[], index: number) {
  return values.filter((_, itemIndex) => itemIndex !== index);
}
