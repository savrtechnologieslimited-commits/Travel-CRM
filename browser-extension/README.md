# SAVR Flight Import

This unpacked Chrome extension reads the selected itinerary from Google Flights and sends it to the open SAVR Travel CRM itinerary builder. It does not call a flight API, book a ticket, or transmit flight details to a third-party service.

## Install for local testing

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` folder.
4. Sign in to the CRM and open the itinerary builder's **Flights & trains** panel.
5. Search Google Flights, select the outbound flight and (for round trips) the return flight, and wait for Google's **Itinerary summary**.
6. Open the **SAVR Flight Import** toolbar extension, choose **Read selected flight**, review the summary, then choose **Import to itinerary**.

The CRM tab and its **Flights & trains** panel must remain open during the import. The extension reads the Google Flights page only after the user chooses **Read selected flight**.

Google may change its page structure or labels, which can require updating the importer. Always verify the captured price and availability on the airline or booking provider before purchase.
