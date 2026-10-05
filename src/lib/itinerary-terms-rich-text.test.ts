import { describe, expect, test } from "bun:test";
import { itineraryTermHtmlToText, sanitizeItineraryTermHtml, splitItineraryTermHtmlLines } from "./itinerary-terms-rich-text";

describe("itinerary terms rich text", () => {
  test("retains safe inline formatting and text styling", () => {
    expect(sanitizeItineraryTermHtml('<b>Breakfast</b> <span style="color:#123456;font-size:16px">included</span>'))
      .toBe('<b>Breakfast</b> <span style="color:#123456;font-size:16px">included</span>');
  });

  test("escapes unsafe markup and removes event handlers and unsafe styles", () => {
    expect(sanitizeItineraryTermHtml('<img src=x onerror=alert(1)> <span style="background-image:url(javascript:alert(1));color:#fff">Safe</span>'))
      .toBe(' <span style="color:#fff">Safe</span>');
  });

  test("converts saved inline markup to plain text for search and summaries", () => {
    expect(itineraryTermHtmlToText("<strong>Cancel</strong> 7 days<br>before travel."))
      .toBe("Cancel 7 days\nbefore travel.");
  });

  test("normalizes contenteditable paragraph markup into separate lines", () => {
    expect(sanitizeItineraryTermHtml("<div>First policy</div><div>Second policy</div>"))
      .toBe("First policy<br>Second policy<br>");
  });

  test("splits pasted lines while preserving inline formatting on each item", () => {
    expect(splitItineraryTermHtmlLines('<strong>Breakfast</strong><br><span style="background-color:rgb(255, 242, 168)">Airport transfer</span>'))
      .toEqual(['<strong>Breakfast</strong>', '<span style="background-color:rgb(255, 242, 168)">Airport transfer</span>']);
  });
});
