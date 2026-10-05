import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useDestinations } from "@/lib/data";
import { searchCitySuggestionsFn, type CitySuggestion } from "@/lib/city-suggestions";

const COMMON_DESTINATIONS = [
  { name: "Agra", country: "India", scope: "domestic" },
  { name: "Ahmedabad", country: "India", scope: "domestic" },
  { name: "Amritsar", country: "India", scope: "domestic" },
  { name: "Bengaluru", country: "India", scope: "domestic" },
  { name: "Bhopal", country: "India", scope: "domestic" },
  { name: "Bhubaneswar", country: "India", scope: "domestic" },
  { name: "Chandigarh", country: "India", scope: "domestic" },
  { name: "Chennai", country: "India", scope: "domestic" },
  { name: "Coimbatore", country: "India", scope: "domestic" },
  { name: "Delhi", country: "India", scope: "domestic" },
  { name: "Goa", country: "India", scope: "domestic" },
  { name: "Hyderabad", country: "India", scope: "domestic" },
  { name: "Jaipur", country: "India", scope: "domestic" },
  { name: "Kochi", country: "India", scope: "domestic" },
  { name: "Kolkata", country: "India", scope: "domestic" },
  { name: "Mumbai", country: "India", scope: "domestic" },
  { name: "Mysuru", country: "India", scope: "domestic" },
  { name: "Pune", country: "India", scope: "domestic" },
  { name: "Srinagar", country: "India", scope: "domestic" },
  { name: "Udaipur", country: "India", scope: "domestic" },
  { name: "Abu Dhabi", country: "United Arab Emirates", scope: "international" },
  { name: "Bangkok", country: "Thailand", scope: "international" },
  { name: "Cairo", country: "Egypt", scope: "international" },
  { name: "Calgary", country: "Canada", scope: "international" },
  { name: "Cancun", country: "Mexico", scope: "international" },
  { name: "Cape Town", country: "South Africa", scope: "international" },
  { name: "Cardiff", country: "United Kingdom", scope: "international" },
  { name: "Casablanca", country: "Morocco", scope: "international" },
  { name: "Colombo", country: "Sri Lanka", scope: "international" },
  { name: "Copenhagen", country: "Denmark", scope: "international" },
  { name: "Dubai", country: "United Arab Emirates", scope: "international" },
  { name: "Istanbul", country: "Türkiye", scope: "international" },
  { name: "Kuala Lumpur", country: "Malaysia", scope: "international" },
  { name: "London", country: "United Kingdom", scope: "international" },
  { name: "Malé", country: "Maldives", scope: "international" },
  { name: "New York", country: "United States", scope: "international" },
  { name: "Paris", country: "France", scope: "international" },
  { name: "Rome", country: "Italy", scope: "international" },
  { name: "Singapore", country: "Singapore", scope: "international" },
  { name: "Tokyo", country: "Japan", scope: "international" },
] as const;

/**
 * Free-text destination field with suggestions from destinations entered before.
 * Anything new the user types is saved on submit and becomes a future suggestion.
 */
export function DestinationInput({
  id,
  value,
  onChange,
  scope,
  placeholder = "Type destination e.g. Manali, Bali",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  scope?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [worldCities, setWorldCities] = useState<CitySuggestion[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);
  const requestSequence = useRef(0);
  const searchCities = useServerFn(searchCitySuggestionsFn);
  const { data: destinations = [] } = useDestinations();

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 2) {
      setWorldCities([]);
      setSearchingCities(false);
      return;
    }

    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setSearchingCities(true);
      void searchCities({ data: { query } })
        .then((results) => {
          if (sequence === requestSequence.current) {
            setWorldCities(results);
            setSearchingCities(false);
          }
        })
        .catch(() => {
          if (sequence === requestSequence.current) {
            setWorldCities([]);
            setSearchingCities(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      requestSequence.current += 1;
    };
  }, [focused, searchCities, value]);

  const suggestions = useMemo(() => {
    const query = value.trim().toLocaleLowerCase();
    if (!query) return [];
    const catalog = new Map<string, { id: string; name: string; country: string | null; scope: string | null; population: number }>();
    for (const destination of destinations) {
      catalog.set(`${destination.name}|${destination.country ?? ""}`.toLocaleLowerCase(), { ...destination, population: 0 });
    }
    for (const [index, destination] of COMMON_DESTINATIONS.entries()) {
      const key = `${destination.name}|${destination.country}`.toLocaleLowerCase();
      if (!catalog.has(key)) catalog.set(key, { ...destination, id: `common-${index}`, country: destination.country, population: 0 });
    }
    for (const destination of worldCities) {
      const key = `${destination.name}|${destination.country}`.toLocaleLowerCase();
      const existing = catalog.get(key);
      catalog.set(key, { ...existing, ...destination, id: existing?.id ?? destination.id, population: destination.population });
    }
    return [...catalog.values()]
      .filter((destination) => {
        const name = destination.name.toLocaleLowerCase();
        const country = destination.country?.toLocaleLowerCase() ?? "";
        return name.startsWith(query) || `${name}, ${country}`.startsWith(query);
      })
      .sort((left, right) => {
        const leftInScope = Boolean(scope && left.scope === scope);
        const rightInScope = Boolean(scope && right.scope === scope);
        return Number(rightInScope) - Number(leftInScope) || right.population - left.population || left.name.localeCompare(right.name);
      })
      .slice(0, 8);
  }, [destinations, scope, value, worldCities]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused && (suggestions.length > 0 || searchingCities)}
        aria-controls={id ? `${id}-suggestions` : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFocused(false);
        }}
      />
      {focused && (suggestions.length > 0 || searchingCities || value.trim().length === 1) && <div
        id={id ? `${id}-suggestions` : undefined}
        role="listbox"
        aria-label="City suggestions"
        className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
      >
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suggestions</p>
        {searchingCities && <p className="px-2 py-2 text-sm text-slate-500">Searching cities worldwide…</p>}
        {!searchingCities && suggestions.length === 0 && value.trim().length === 1 && <p className="px-2 py-2 text-sm text-slate-500">Type at least 2 letters to search cities worldwide.</p>}
        {suggestions.map((destination) => {
          const nameAlreadyIncludesCountry = destination.country
            && destination.name.toLocaleLowerCase().includes(destination.country.toLocaleLowerCase());
          const label = nameAlreadyIncludesCountry || !destination.country
            ? destination.name
            : `${destination.name}, ${destination.country}`;
          return <button
            key={destination.id}
            type="button"
            role="option"
            aria-selected={false}
            className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange(label);
              setFocused(false);
            }}
          >
            <span>{label}</span>
          </button>;
        })}
      </div>}
    </div>
  );
}

/** Resolves a typed destination name to an id, creating it the first time it is used. */
export function useDestinationResolver() {
  const qc = useQueryClient();

  return async function resolve(name: string, scope = "domestic"): Promise<string | null> {
    const clean = name.trim();
    if (!clean) return null;

    const { data: existing } = await supabase
      .from("destinations")
      .select("id")
      .ilike("name", clean)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from("destinations")
      .insert({
        name: clean,
        scope: scope === "international" ? "international" : "domestic",
      })
      .select("id")
      .single();
    if (error) throw error;

    await qc.invalidateQueries({ queryKey: ["destinations"] });
    return created.id;
  };
}
