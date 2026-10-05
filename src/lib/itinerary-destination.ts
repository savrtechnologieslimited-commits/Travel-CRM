export type ItineraryDestinationChoice = { id: string; name: string };

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "").replace(/bengaluru/g, "bangalore").replace(/mysuru/g, "mysore");
}

export function matchItineraryDestinationId(title: string, requirements: string, destinations: ItineraryDestinationChoice[]): string | null {
  const route = /visit these cities in order:\s*([^.]+)/i.exec(requirements)?.[1];
  const routeCandidates = route
    ? route.split(/\s*(?:→|->|,|;|\band\b|&)\s*/i).map((city) => city.replace(/:\s*\d+\s*nights?\b.*$/i, "").trim())
    : [];
  const titleCandidates = title
    .replace(/\b(?:trip|itinerary|holiday|vacation)\b/gi, "")
    .split(/\s*(?:→|->|,|;|\band\b|&|[-–—])\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = [...routeCandidates, ...titleCandidates].map(normalize).filter(Boolean);
  const match = destinations.find((destination) => candidates.includes(normalize(destination.name)));
  return match?.id ?? null;
}
