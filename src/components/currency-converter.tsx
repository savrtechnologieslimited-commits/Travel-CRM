import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  convertCurrency,
  convertToInr,
  fetchFallbackInrExchangeRates,
  formatCurrencyAmount,
  getLiveInrExchangeRatesFn,
  POPULAR_CURRENCIES,
  type CurrencyCode,
  type InrExchangeRates,
} from "@/lib/currency-converter";

const RATE_REFRESH_MS = 30 * 60 * 1000;
const SERVER_RATE_TIMEOUT_MS = 3500;
const RATE_REQUEST_TIMEOUT_MS = 15_000;
const RATE_CACHE_KEY = "savr-currency-rates";

type CurrencyContextValue = {
  rates: InrExchangeRates | null;
  error: string | null;
  loading: boolean;
  cached: boolean;
};
const CurrencyContext = createContext<CurrencyContextValue>({
  rates: null,
  error: null,
  loading: true,
  cached: false,
});

function readCachedRates(): InrExchangeRates | null {
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<InrExchangeRates>;
    if (
      value.base !== "INR" ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt)) ||
      !value.rates ||
      typeof value.rates !== "object"
    ) {
      return null;
    }
    const rates = value.rates as InrExchangeRates["rates"];
    if (
      POPULAR_CURRENCIES.some(
        (currency) =>
          typeof rates[currency] !== "number" ||
          !Number.isFinite(rates[currency]) ||
          rates[currency]! <= 0,
      )
    ) {
      return null;
    }
    return { base: "INR", rates, updatedAt: value.updatedAt };
  } catch (cause) {
    console.warn("[Currency converter] Could not read cached exchange rates.", cause);
    return null;
  }
}

function writeCachedRates(rates: InrExchangeRates) {
  try {
    window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(rates));
  } catch (cause) {
    console.warn("[Currency converter] Could not cache exchange rates.", cause);
  }
}

export function useCurrencyRates() {
  return useContext(CurrencyContext);
}

export function CurrencyRatesProvider({ children }: { children: ReactNode }) {
  const fetchRates = useServerFn(getLiveInrExchangeRatesFn);
  const fetchRatesRef = useRef(fetchRates);
  fetchRatesRef.current = fetchRates;
  const [rates, setRates] = useState<InrExchangeRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    let disposed = false;
    const savedRates = readCachedRates();
    if (savedRates) {
      setRates(savedRates);
      setCached(true);
      setLoading(false);
    }
    const refresh = async () => {
      let timeoutId: number | undefined;
      try {
        const latest = await Promise.race([
          (async () => {
            let serverRates: InrExchangeRates | null = null;
            let serverTimeoutId: number | undefined;
            try {
              serverRates = await Promise.race([
                fetchRatesRef.current(),
                new Promise<null>((resolve) => {
                  serverTimeoutId = window.setTimeout(() => resolve(null), SERVER_RATE_TIMEOUT_MS);
                }),
              ]);
              if (!serverRates) {
                console.warn("[Currency converter] Server rates timed out; using the direct rate provider.");
              }
            } catch (cause) {
              console.warn("[Currency converter] Server rates failed; using the direct rate provider.", cause);
            } finally {
              if (serverTimeoutId !== undefined) window.clearTimeout(serverTimeoutId);
            }
            return serverRates ?? fetchFallbackInrExchangeRates();
          })(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error("Currency rates are taking too long to load. Please try again.")),
              RATE_REQUEST_TIMEOUT_MS,
            );
          }),
        ]);
        if (!disposed) {
          writeCachedRates(latest);
          setRates(latest);
          setCached(latest.source === "shared-cache");
          setError(null);
          setLoading(false);
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "Live currency rates are unavailable.");
          setLoading(false);
        }
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), RATE_REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const value = useMemo(() => ({ rates, error, loading, cached }), [cached, error, loading, rates]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function InrEquivalent({
  amount,
  currency,
  className,
}: {
  amount: string | number;
  currency: string;
  className?: string;
}) {
  const { rates, error, loading, cached } = useContext(CurrencyContext);
  const parsed = Number(amount);
  const code = (POPULAR_CURRENCIES as readonly string[]).includes(currency)
    ? (currency as CurrencyCode)
    : null;
  if (amount === "" || !Number.isFinite(parsed) || !code) return null;
  const converted = convertToInr(parsed, code, rates?.rates);
  return (
    <div className={`space-y-1 ${className ?? ""}`} aria-live="polite">
      <Label className="text-xs text-slate-500">INR equivalent</Label>
      <Input
        readOnly
        aria-label="INR equivalent amount"
        value={
          converted !== null
            ? formatCurrencyAmount(converted, "INR")
            : loading
              ? "Loading live rates…"
              : "Rate unavailable"
        }
        className="h-9 bg-slate-50 text-sm text-slate-700"
      />
      {converted !== null && rates && code !== "INR" && (
        <p className="text-[10px] text-slate-500">
          {cached ? "Saved reference rate" : "Live reference rate"} · updated{" "}
          {new Date(rates.updatedAt).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      {cached && error && (
        <p role="status" className="text-[10px] text-amber-700">
          Live rates could not be refreshed; showing the saved reference rate.
        </p>
      )}
      {converted === null && !loading && error && (
        <p role="status" className="text-[10px] text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function CurrencyAmountField({
  amount,
  currency,
  label,
  onAmountChange,
  onCurrencyChange,
  placeholder,
  className,
}: {
  amount: string;
  currency: CurrencyCode;
  label: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange?: (value: CurrencyCode) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={onCurrencyChange ? "grid grid-cols-[minmax(0,1fr)_112px] gap-2" : "space-y-1.5"}
      >
        <div className="space-y-1.5">
          <Label>
            {label} ({currency})
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
        {onCurrencyChange && (
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select
              value={currency}
              onValueChange={(value) => onCurrencyChange(value as CurrencyCode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POPULAR_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <InrEquivalent amount={amount} currency={currency} className="mt-1.5" />
    </div>
  );
}

export function CurrencyConverterDialog() {
  const { rates, error, loading } = useContext(CurrencyContext);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState<CurrencyCode>("INR");
  const [to, setTo] = useState<CurrencyCode>("USD");
  const parsedAmount = Number(amount);
  const converted =
    rates && Number.isFinite(parsedAmount)
      ? convertCurrency(parsedAmount, from, to, rates.rates)
      : null;

  function swapCurrencies() {
    setFrom(to);
    setTo(from);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label="Open live currency converter"
        >
          <CircleDollarSign className="size-4" />
          <span className="hidden sm:inline">Currency</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Live currency converter</DialogTitle>
          <DialogDescription>
            Indicative exchange rates. Rates refresh automatically and are not a bank or card
            settlement quote.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="currency-from-amount">Amount</Label>
            <Input
              id="currency-from-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Select value={from} onValueChange={(value) => setFrom(value as CurrencyCode)}>
              <SelectTrigger aria-label="Convert from currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POPULAR_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-1"
            onClick={swapCurrencies}
            aria-label="Swap currencies"
          >
            <ArrowLeftRight className="size-4" />
          </Button>
          <div className="space-y-2">
            <Label>Converted amount</Label>
            <div
              className="flex h-10 items-center overflow-hidden rounded-md border border-input bg-slate-50 px-3 text-sm font-semibold"
              aria-live="polite"
            >
              {converted === null ? "—" : formatCurrencyAmount(converted, to)}
            </div>
            <Select value={to} onValueChange={(value) => setTo(value as CurrencyCode)}>
              <SelectTrigger aria-label="Convert to currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POPULAR_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p role="status" className="text-xs text-slate-500">
          {loading
            ? "Getting live rates…"
            : error
              ? error
              : rates
                ? `Rates updated ${new Date(rates.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`
                : "Live rates unavailable."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
