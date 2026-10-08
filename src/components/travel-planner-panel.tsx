import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateTravelPlannerTripFn } from "@/lib/travel-planner";
import type { PlannerResult, TripPlan } from "@/lib/travel-planner-engine";
import { buildTravelPlannerRequest } from "@/lib/travel-planner-adapter";

export function TravelPlannerPanel({
  initialRequirements = "",
  disabled,
  builderMessage,
  onAccept,
}: {
  initialRequirements?: string;
  disabled: boolean;
  builderMessage?: string | null;
  onAccept: (plan: TripPlan, requirements: string) => Promise<boolean>;
}) {
  const generate = useServerFn(generateTravelPlannerTripFn);
  const draftId =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("draftId") ?? "default")
      : "default";
  const storageKey = `savr-travel-planner-requirements:${draftId}`;

  const requirementPresets = useMemo(
    () => ({
      custom: "Custom",
      family: "Family trip",
      luxury: "Luxury escape",
      cityBreak: "City break",
    }),
    [],
  );

  const [requirementPreset, setRequirementPreset] =
    useState<keyof typeof requirementPresets>("custom");
  const [requirements, setRequirements] = useState(() => {
    const trimmedInitial = initialRequirements.trim();
    if (trimmedInitial) return trimmedInitial;
    try {
      return typeof window !== "undefined" ? (window.localStorage.getItem(storageKey) ?? "") : "";
    } catch {
      return "";
    }
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const trimmedInitial = initialRequirements.trim();
    if (trimmedInitial) setRequirements(trimmedInitial);
  }, [initialRequirements]);

  useEffect(() => {
    if (!requirements.trim()) return;
    try {
      window.localStorage.setItem(storageKey, requirements);
    } catch {
      // Ignore browser storage restrictions; the requirement text is still sent to the server on generation.
    }
  }, [requirements, storageKey]);

  function applyRequirementPreset(value: keyof typeof requirementPresets) {
    setRequirementPreset(value);
    if (value === "custom") return;
    const presets: Record<keyof typeof requirementPresets, string> = {
      custom: "",
      family:
        "Plan a relaxed family holiday with two adults and children, comfortable sightseeing, a balanced mix of cultural stops and downtime, and a mid-range hotel close to key attractions.",
      luxury:
        "Design a luxury getaway with iconic highlights, premium stays, seamless transfers, curated dining, and a refined pace with time for leisure.",
      cityBreak:
        "Create a compact city-break itinerary with a clear route, 2-3 key neighbourhoods, strong dining and cultural highlights, and efficient transit between each stop.",
    };
    setRequirements((current) => current.trim() || presets[value]);
  }

  async function generatePlan() {
    if (!requirements.trim()) {
      setError("Describe the destination, trip duration, route, and preferences first.");
      return;
    }
    setGenerating(true);
    setError("");
    setSuccess("");
    try {
      const generated = (await generate({
        data: buildTravelPlannerRequest(requirements),
      })) as PlannerResult;
      if (!generated.validation.valid) {
        setError(
          `The planner returned a draft with validation errors: ${generated.validation.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message)
            .join(" ")}`,
        );
        return;
      }
      const saved = await onAccept(generated.plan, requirements.trim());
      if (!saved) {
        setError(
          "The itinerary could not be saved to the editor. Review the builder message and try again.",
        );
        return;
      }
      setSuccess(
        "Itinerary created in the editor and saved as a draft. You can review and edit it in the white workspace.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The itinerary planner could not create a plan.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Complete Itinerary</p>
        <p className="mt-1 text-xs text-slate-600">
          The itinerary is generated only from the requirements written below—not saved CRM records
          or web research—and inserted into the white editor workspace.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Label htmlFor="travel-planner-requirements">Trip requirements</Label>
          <Select
            value={requirementPreset}
            onValueChange={(value) =>
              applyRequirementPreset(value as keyof typeof requirementPresets)
            }
          >
            <SelectTrigger
              id="travel-planner-requirement-preset"
              className="h-9 w-[180px] bg-white text-xs"
            >
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(requirementPresets).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          id="travel-planner-requirements"
          value={requirements}
          onChange={(event) => {
            setRequirements(event.target.value);
            if (event.target.value.trim()) setRequirementPreset("custom");
          }}
          placeholder="Destination, cities in order, nights per city, dates, travellers, interests, pace and hotel category"
          className="min-h-28 resize-y bg-white"
        />
      </div>
      <Button
        type="button"
        className="w-full bg-teal-800 text-white hover:bg-teal-900"
        disabled={disabled || generating || !requirements.trim()}
        onClick={() => void generatePlan()}
      >
        <Sparkles className={`mr-2 size-4 ${generating ? "animate-pulse" : ""}`} />
        {generating ? "Generating and saving itinerary…" : "Create itinerary in editor"}
      </Button>
      {success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}
      {builderMessage && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600"
        >
          {builderMessage}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
