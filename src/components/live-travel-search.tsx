import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, LoaderCircle, Plane, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildFlightSearchLink, buildTrainSearchLink, flightSearchProviders, getTrainSearchValidationError, trainSearchProviders } from "@/lib/travel-search-providers";
import { searchLiveFlightOffersFn } from "@/lib/travel-search";
import type { TrainStation } from "@/lib/travel-search-providers";
import type { LiveFlightOffer } from "@/lib/travel-search-types";

const CABINS = ["Economy", "Premium Economy", "Business", "First"] as const;
const CURRENCIES = ["INR", "USD", "AED"] as const;

function TrainStationPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: TrainStation | null;
  onChange: (station: TrainStation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stationDirectory, setStationDirectory] = useState<TrainStation[] | null>(null);
  useEffect(() => {
    if (!open || stationDirectory) return;
    let cancelled = false;
    void import("@/lib/train-stations").then(({ TRAIN_STATIONS }) => {
      if (!cancelled) setStationDirectory(TRAIN_STATIONS);
    });
    return () => { cancelled = true; };
  }, [open, stationDirectory]);
  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search || !stationDirectory) return [];
    return stationDirectory.filter((station) => station.name.toLocaleLowerCase().includes(search)
      || station.code.toLocaleLowerCase().includes(search)).slice(0, 61);
  }, [query, stationDirectory]);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setQuery("");
    }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{value ? `${value.name} (${value.code}) · ${value.city}` : "Search station name or code"}</span>
          <span className="ml-2 text-muted-foreground">⌄</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search all stations by name or code…" />
          <CommandList>
            {!stationDirectory ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Loading the local station directory…</p>
            ) : !query.trim() ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Type a station name or code to search all stations.</p>
            ) : matches.length === 0 ? (
              <CommandEmpty>No station found.</CommandEmpty>
            ) : (
              matches.slice(0, 60).map((station) => {
                return (
                  <CommandItem
                    key={station.code}
                    value={`${station.name} ${station.code} ${station.city}`}
                    onSelect={() => {
                      onChange(station);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {station.name} ({station.code}) · {station.city}
                  </CommandItem>
                );
              })
            )}
            {matches.length > 60 && <p className="px-3 py-2 text-xs text-muted-foreground">Showing 60 matches. Refine your search.</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LiveTravelSearch({
  travelStart,
  travelEnd,
  adults,
  children,
  onAddFlight,
}: {
  travelStart: string;
  travelEnd: string;
  adults: number;
  children: number;
  onAddFlight?: (offer: LiveFlightOffer) => void;
}) {
  const [mode, setMode] = useState<"flight" | "train">("flight");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trainFrom, setTrainFrom] = useState<TrainStation | null>(null);
  const [trainTo, setTrainTo] = useState<TrainStation | null>(null);
  const [departure, setDeparture] = useState(travelStart);
  const [returnDate, setReturnDate] = useState(travelEnd);
  const [tripType, setTripType] = useState("one-way");
  const [currency, setCurrency] = useState("INR");
  const [adultsValue, setAdultsValue] = useState(String(Math.max(1, adults || 1)));
  const [childrenValue, setChildrenValue] = useState(String(Math.max(0, children || 0)));
  const [infants, setInfants] = useState("0");
  const [cabin, setCabin] = useState<(typeof CABINS)[number]>("Economy");
  const [trainClass, setTrainClass] = useState("Sleeper Class");
  const [directFlightOnly, setDirectFlightOnly] = useState(false);
  const [liveOffers, setLiveOffers] = useState<LiveFlightOffer[]>([]);
  const [searchingLiveOffers, setSearchingLiveOffers] = useState(false);
  const [searchedLiveOffers, setSearchedLiveOffers] = useState(false);
  const [liveSearchError, setLiveSearchError] = useState("");
  const liveSearchSequence = useRef(0);
  const searchLiveOffers = useServerFn(searchLiveFlightOffersFn);

  const flightLinkParams = useMemo(() => ({
    from: from.trim(),
    to: to.trim(),
    departure,
    ...(tripType === "round-trip" ? { returnDate } : {}),
    adults: Number(adultsValue || 1),
    children: Number(childrenValue || 0),
    infants: Number(infants || 0),
    cabin,
    tripType,
    currency,
    directFlight: directFlightOnly,
  }), [from, to, departure, returnDate, tripType, currency, adultsValue, childrenValue, infants, cabin, directFlightOnly]);

  const trainLinkParams = useMemo(() => ({
    from: trainFrom ?? { name: "", code: "", city: "" },
    to: trainTo ?? { name: "", code: "", city: "" },
    departure,
    travelClass: trainClass,
    adults: Number(adultsValue || 1),
    currency,
  }), [trainFrom, trainTo, departure, trainClass, adultsValue, currency]);

  const trainValidationError = getTrainSearchValidationError(trainFrom, trainTo, departure);

  useEffect(() => {
    liveSearchSequence.current += 1;
    setLiveOffers([]);
    setSearchedLiveOffers(false);
    setLiveSearchError("");
    setSearchingLiveOffers(false);
    return () => { liveSearchSequence.current += 1; };
  }, [from, to, departure, returnDate, tripType, currency, adultsValue, childrenValue, infants, cabin, directFlightOnly]);

  async function searchLiveFlights() {
    const sequence = ++liveSearchSequence.current;
    setLiveSearchError("");
    setLiveOffers([]);
    setSearchedLiveOffers(false);
    setSearchingLiveOffers(true);
    try {
      const offers = await searchLiveOffers({ data: {
        from: from.trim().toUpperCase(),
        to: to.trim().toUpperCase(),
        departure,
        adults: Number(adultsValue || 1),
        children: Number(childrenValue || 0),
        infants: Number(infants || 0),
        cabin,
        currency,
        directFlight: directFlightOnly,
      } });
      if (sequence === liveSearchSequence.current) {
        setLiveOffers(offers);
        setSearchedLiveOffers(true);
      }
    } catch (error) {
      if (sequence === liveSearchSequence.current) {
        setLiveSearchError(error instanceof Error ? error.message : "Unable to search live flight fares.");
      }
    } finally {
      if (sequence === liveSearchSequence.current) setSearchingLiveOffers(false);
    }
  }

  const providerButtons = mode === "flight"
    ? flightSearchProviders.map((provider) => ({
        name: provider.name,
        url: buildFlightSearchLink(provider, flightLinkParams),
      }))
    : trainSearchProviders.map((provider) => ({
        name: provider.name,
        url: buildTrainSearchLink(provider, trainLinkParams),
      }));

  const openAllProviders = () => {
    if (isDisabled) return;

    providerButtons.forEach(({ url }) => {
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  };

  const isDisabled = mode === "flight"
    ? !from.trim() || !to.trim() || !departure
    : Boolean(trainValidationError);

  return (
    <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-4" aria-label="Search external travel providers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Search external providers</h2>
          <p className="text-xs text-slate-600">Choose a provider to open the search with your trip details pre-filled.</p>
        </div>
        <div className="flex gap-1 rounded-md border bg-white p-1">
          <Button type="button" size="sm" variant={mode === "flight" ? "default" : "ghost"} onClick={() => setMode("flight")}>Flights</Button>
          <Button type="button" size="sm" variant={mode === "train" ? "default" : "ghost"} onClick={() => setMode("train")}>Trains</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          {mode === "flight" ? (
            <>
              <Label htmlFor="travel-search-from">Origin airport (IATA)</Label>
              <Input id="travel-search-from" value={from} onChange={(event) => setFrom(event.target.value.toUpperCase())} placeholder="HYD" />
            </>
          ) : (
            <>
              <Label htmlFor="travel-search-from">From Station</Label>
              <TrainStationPicker id="travel-search-from" value={trainFrom} onChange={setTrainFrom} />
            </>
          )}
        </div>
        <div className="space-y-1">
          {mode === "flight" ? (
            <>
              <Label htmlFor="travel-search-to">Destination airport (IATA)</Label>
              <Input id="travel-search-to" value={to} onChange={(event) => setTo(event.target.value.toUpperCase())} placeholder="AMD" />
            </>
          ) : (
            <>
              <Label htmlFor="travel-search-to">To Station</Label>
              <TrainStationPicker id="travel-search-to" value={trainTo} onChange={setTrainTo} />
            </>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="travel-search-departure">{mode === "flight" ? "Departure date" : "Journey Date"}</Label>
          <Input id="travel-search-departure" type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} />
        </div>
        {mode === "flight" ? (
          <div className="space-y-1">
            <Label htmlFor="travel-search-return">Return date</Label>
            <Input id="travel-search-return" type="date" min={departure || undefined} value={tripType === "round-trip" ? returnDate : ""} onChange={(event) => setReturnDate(event.target.value)} disabled={tripType !== "round-trip"} />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="travel-search-train-class">Class</Label>
            <Input id="travel-search-train-class" value={trainClass} onChange={(event) => setTrainClass(event.target.value)} placeholder="Sleeper Class" />
          </div>
        )}

        {mode === "flight" && (
          <>
            <div className="space-y-1">
              <Label>One way / Round trip</Label>
              <Select value={tripType} onValueChange={setTripType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-way">One Way</SelectItem>
                  <SelectItem value="round-trip">Round Trip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="travel-search-adults">Adults</Label>
              <Input id="travel-search-adults" type="number" min="1" value={adultsValue} onChange={(event) => setAdultsValue(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="travel-search-children">Children</Label>
              <Input id="travel-search-children" type="number" min="0" value={childrenValue} onChange={(event) => setChildrenValue(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="travel-search-infants">Infants</Label>
              <Input id="travel-search-infants" type="number" min="0" value={infants} onChange={(event) => setInfants(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Cabin class</Label>
              <Select value={cabin} onValueChange={(value) => setCabin(value as (typeof CABINS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABINS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={directFlightOnly} onChange={(event) => setDirectFlightOnly(event.target.checked)} />
              Direct Flight
            </label>
          </>
        )}

        {mode === "train" && (
          <>
            <div className="space-y-1">
              <Label htmlFor="travel-search-train-adults">Adults</Label>
              <Input id="travel-search-train-adults" type="number" min="1" value={adultsValue} onChange={(event) => setAdultsValue(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="travel-search-train-children">Children</Label>
              <Input id="travel-search-train-children" type="number" min="0" value={childrenValue} onChange={(event) => setChildrenValue(event.target.value)} />
            </div>
          </>
        )}
      </div>

      {mode === "train" && trainValidationError && (
        <p className="text-xs text-rose-600" role="alert">{trainValidationError}</p>
      )}

      {mode === "flight" && tripType === "round-trip" && (
        <p className="text-xs text-slate-600" role="status">
          In-CRM live fares currently support one-way trips only. Use an external provider below for complete round-trip options.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {mode === "flight" && (
          <>
            <Button type="button" variant="default" size="sm" disabled={isDisabled || tripType !== "one-way" || searchingLiveOffers} onClick={() => void searchLiveFlights()}>
              {searchingLiveOffers ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
              {searchingLiveOffers ? "Searching live fares…" : "Search live fares in CRM"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isDisabled || providerButtons.every((provider) => !provider.url)} onClick={openAllProviders}>
              <ExternalLink className="mr-2 size-4" />
              Open all {providerButtons.length} providers
            </Button>
          </>
        )}
        {providerButtons.map((provider) => (
          <Button
            key={provider.name}
            type="button"
            variant={mode === "train" ? "outline" : "outline"}
            size="sm"
            disabled={isDisabled || !provider.url}
            onClick={() => {
              if (!provider.url || (mode === "train" && trainValidationError)) return;
              window.open(provider.url, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="mr-2 size-4" />
            {mode === "flight" ? "Search on " : "Open in "}{provider.name}
          </Button>
        ))}
      </div>

      {liveSearchError && <p className="text-sm text-destructive" role="alert">{liveSearchError}</p>}
      {mode === "flight" && liveOffers.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          <h3 className="text-sm font-semibold text-slate-900">Live Google Flights results</h3>
          <p className="text-xs text-slate-600">Indicative fares from SearchApi. Prices and availability can change; the CRM does not book or issue tickets.</p>
          {liveOffers.map((offer) => (
            <article key={offer.id} className="flex flex-col gap-3 rounded-md border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Plane className="mt-0.5 size-4 shrink-0 text-sky-700" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{offer.from} → {offer.to} · {offer.airline}</p>
                  <p className="text-xs text-slate-600">
                    {offer.flight_number && `${offer.flight_number} · `}
                    {offer.departure_at.replace("T", " ")} – {offer.arrival_at.replace("T", " ")}
                  </p>
                  <p className="text-xs text-slate-600">
                    {offer.duration && `${offer.duration} · `}
                    {offer.stops === 0 ? "Non-stop" : `${offer.stops} stop(s)`}
                    {offer.cabin && ` · ${offer.cabin}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                <p className="text-sm font-semibold text-slate-900">
                  {new Intl.NumberFormat("en-IN", { style: "currency", currency: offer.currency || currency, maximumFractionDigits: 0 }).format(offer.price)}
                </p>
                {onAddFlight && <Button type="button" size="sm" variant="outline" onClick={() => onAddFlight(offer)}>
                  <Plus className="mr-1 size-4" />
                  Add to itinerary
                </Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {mode === "flight" && searchedLiveOffers && liveOffers.length === 0 && (
        <p className="text-sm text-slate-600">No live flight offers found. Try another search or use an external provider.</p>
      )}

      <p className="text-[11px] text-slate-500">{mode === "train" ? "Opens the selected provider with your search details pre-filled." : "SearchApi provides live search results through its Google Flights integration. External providers remain available as a fallback; this CRM does not complete bookings."}</p>
    </section>
  );
}
