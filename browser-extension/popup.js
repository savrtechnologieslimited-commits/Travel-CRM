import { extractSelectedFlight } from "./extract-flight.js";

const readButton = document.querySelector("#read-flight");
const importButton = document.querySelector("#import-flight");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
let capturedOffer;
let imported = false;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}

function formatDateTime(value) {
  if (!value) return "";
  const [date, time] = value.split("T");
  return `${date} ${time}`;
}

function showOffer(offer) {
  imported = false;
  importButton.disabled = false;
  importButton.textContent = "Import to itinerary";
  capturedOffer = offer;
  document.querySelector("#route").textContent = `${offer.from} → ${offer.to}${offer.return_to ? ` → ${offer.return_to}` : ""}`;
  document.querySelector("#airline").textContent = `${offer.airline} ${offer.flight_number}`.trim();
  document.querySelector("#times").textContent = `${formatDateTime(offer.departure_at)}${offer.return_departure_at ? ` · Return ${formatDateTime(offer.return_departure_at)}–${formatDateTime(offer.return_arrival_at)}` : ""}`;
  document.querySelector("#fare").textContent = `${offer.currency} ${Number(offer.price).toLocaleString()}${offer.return_departure_at ? " round-trip total" : ""}`;
  preview.hidden = false;
}

readButton.addEventListener("click", async () => {
  readButton.disabled = true;
  preview.hidden = true;
  setStatus("Reading the selected Google Flights itinerary…");
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab?.id) throw new Error("Could not identify the active browser tab.");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: extractSelectedFlight,
    });
    if (!result?.ok || !result.offer) throw new Error(result?.error ?? "The selected flight could not be read.");
    showOffer(result.offer);
    setStatus("Review the captured itinerary, then import it to the CRM.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not read this Google Flights page.", true);
  } finally {
    readButton.disabled = false;
  }
});

importButton.addEventListener("click", async () => {
  if (!capturedOffer) return;
  importButton.disabled = true;
  setStatus("Sending flight to the itinerary builder…");
  try {
    const crmTabs = await chrome.tabs.query({
      url: [
        "https://travel-crm-khaki.vercel.app/itinerary-builder*",
        "https://travel-crm-savrtechnologieslimited-8832.vercel.app/itinerary-builder*",
        "http://localhost:5173/itinerary-builder*",
      ],
    });
    const crmTab = crmTabs.find((tab) => tab.id !== undefined);
    if (!crmTab?.id) throw new Error("Open the CRM itinerary builder in another tab first.");
    await chrome.scripting.executeScript({ target: { tabId: crmTab.id }, files: ["crm-bridge.js"] });
    const response = await chrome.tabs.sendMessage(crmTab.id, {
      type: "SAVR_IMPORT_FLIGHT",
      requestId: crypto.randomUUID(),
      offer: capturedOffer,
    });
    if (!response?.ok) throw new Error(response?.error ?? "The CRM did not confirm the import. Keep its Flights & trains panel open.");
    imported = true;
    importButton.textContent = "Imported to itinerary";
    setStatus("Flight added to the itinerary. Verify the fare before booking.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not import this flight to the CRM.", true);
  } finally {
    importButton.disabled = imported;
  }
});
