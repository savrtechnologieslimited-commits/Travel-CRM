(() => {
  if (globalThis.__savrFlightImportBridgeInstalled) return;
  globalThis.__savrFlightImportBridgeInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SAVR_IMPORT_FLIGHT" || typeof message.requestId !== "string") return;

    let completed = false;
    const finish = (response) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      window.removeEventListener("message", onPageResponse);
      sendResponse(response);
    };
    const onPageResponse = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== "savr-flight-import-page" || event.data?.requestId !== message.requestId) return;
      finish({ ok: event.data.ok === true, error: event.data.error });
    };
    const timeout = setTimeout(() => {
      finish({ ok: false, error: "Keep the Flights & trains panel open in the itinerary builder, then try again." });
    }, 5000);

    window.addEventListener("message", onPageResponse);
    window.postMessage({
      source: "savr-flight-import-extension",
      requestId: message.requestId,
      offer: message.offer,
    }, window.location.origin);
    return true;
  });
})();
