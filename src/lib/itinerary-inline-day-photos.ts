export type InlineItineraryDayPhoto = {
  day_number: number;
  url: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
};

const DAY_HEADING_BLOCK = /(<h[1-6]\b[^>]*>\s*DAY\s+(\d+)\b[\s\S]*?<\/h[1-6]>)([\s\S]*?)(?=<h[1-6]\b[^>]*>\s*DAY\s+\d+\b|$)/gi;
const INLINE_PHOTO_BLOCK = /<(?:figure|div)\b[^>]*\bdata-itinerary-day-photo=["']true["'][^>]*>[\s\S]*?<\/(?:figure|div)>/gi;

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

export function removeInlineItineraryDayPhotos(html: string) {
  return html.replace(INLINE_PHOTO_BLOCK, "");
}

export function insertInlineItineraryDayPhotos(html: string, photos: InlineItineraryDayPhoto[]) {
  const safeHtml = removeInlineItineraryDayPhotos(html);
  const photosByDay = new Map<number, InlineItineraryDayPhoto[]>();
  for (const photo of photos) {
    if (!Number.isInteger(photo.day_number) || !photo.url.trim()) continue;
    const group = photosByDay.get(photo.day_number) ?? [];
    group.push(photo);
    photosByDay.set(photo.day_number, group);
  }

  if (photosByDay.size === 0) return safeHtml;
  return safeHtml.replace(DAY_HEADING_BLOCK, (wholeBlock, heading: string, dayNumberText: string, dayContent: string) => {
    const dayPhotos = photosByDay.get(Number(dayNumberText));
    if (!dayPhotos?.length) return wholeBlock;
    const markup = dayPhotos.map((photo) => {
      const caption = photo.caption?.trim() || "";
      const credit = photo.credit?.trim() || "";
      return `<figure data-itinerary-day-photo="true" contenteditable="false" style="margin:16px 0 24px"><img src="${escapeHtmlAttribute(photo.url)}" alt="${escapeHtmlAttribute(photo.alt_text?.trim() || caption || `Day ${photo.day_number} destination photo`)}" style="display:block;width:100%;max-height:320px;object-fit:cover;border-radius:10px" />${caption || credit ? `<figcaption style="margin-top:6px;font-size:12px;color:#64748b">${caption ? `${escapeHtmlAttribute(caption)}${credit ? " · " : ""}` : ""}${escapeHtmlAttribute(credit)}</figcaption>` : ""}</figure>`;
    }).join("");
    return `${heading}${dayContent}${markup}`;
  });
}