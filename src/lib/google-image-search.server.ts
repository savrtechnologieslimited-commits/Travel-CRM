type GoogleImageSearchResponse = {
  items?: Array<{
    link?: string;
    image?: { thumbnailLink?: string };
  }>;
};

type WikimediaSearchResponse = {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{ thumburl?: string; url?: string }>;
    }>;
  };
};

function normalizeSearchText(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchGoogleActivityImage(
  query: string,
  destination = "",
  apiKey = process.env["GOOGLE_CUSTOM_SEARCH_API_KEY"] ?? "",
  searchEngineId = process.env["GOOGLE_CUSTOM_SEARCH_ENGINE_ID"] ?? "",
  fetcher: typeof fetch = fetch,
) {
  const key = apiKey.trim();
  const cx = searchEngineId.trim();
  if (!key || !cx) return searchWikimediaActivityImage(query, destination, fetcher);

  const textQuery = [normalizeSearchText(query), normalizeSearchText(destination), "travel activity"].filter(Boolean).join(" ");
  if (textQuery.length < 2) return null;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", textQuery.slice(0, 200));
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "1");
  url.searchParams.set("safe", "active");

  const response = await fetcher(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return searchWikimediaActivityImage(query, destination, fetcher);

  const payload = await response.json() as GoogleImageSearchResponse;
  const first = payload.items?.[0];
  return first?.link ?? first?.image?.thumbnailLink ?? searchWikimediaActivityImage(query, destination, fetcher);
}

async function searchWikimediaActivityImage(query: string, destination: string, fetcher: typeof fetch) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedDestination = normalizeSearchText(destination);
  const searchQueries = [...new Set([
    [normalizedQuery, normalizedDestination].filter(Boolean).join(" "),
    normalizedDestination,
    normalizedQuery,
  ].filter((value) => value.length >= 2))];

  for (const searchQuery of searchQueries) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", searchQuery);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "1");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|mime");
    url.searchParams.set("iiurlwidth", "1200");
    url.searchParams.set("format", "json");

    const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "TravelCRM/1.0" } });
    if (!response.ok) continue;
    const payload = await response.json() as WikimediaSearchResponse;
    const page = Object.values(payload.query?.pages ?? {})[0];
    const image = page?.imageinfo?.[0];
    if (image?.thumburl ?? image?.url) return image.thumburl ?? image.url ?? null;
  }
  return null;
}
