/**
 * Reverse geocoding via Nominatim (OpenStreetMap).
 *
 * Given lat/lng, return a short human-readable label like "Knoxville, TN".
 * Best-effort: returns null if the lookup fails or the response is unusable.
 */

import "server-only";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  state_code?: string;
  country_code?: string;
};

type NominatimResponse = {
  address?: NominatimAddress;
  display_name?: string;
};

const US_STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};

function compactLabel(addr: NominatimAddress): string | null {
  const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county;
  if (!city) return null;
  const isUS = (addr.country_code || "").toLowerCase() === "us";
  if (isUS && addr.state) {
    const abbr = US_STATE_ABBR[addr.state.toLowerCase()];
    if (abbr) return `${city}, ${abbr}`;
    return `${city}, ${addr.state}`;
  }
  return addr.state ? `${city}, ${addr.state}` : city;
}

export async function reverseGeocode(args: {
  lat: number;
  lng: number;
}): Promise<{ label: string } | null> {
  const params = new URLSearchParams({
    format: "json",
    lat: String(args.lat),
    lon: String(args.lng),
    zoom: "10",
    addressdetails: "1",
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Agora/0.1 (chat reverse-geocode)",
        "Accept-Language": "en",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: NominatimResponse;
  try {
    data = (await res.json()) as NominatimResponse;
  } catch {
    return null;
  }

  if (data.address) {
    const label = compactLabel(data.address);
    if (label) return { label };
  }
  if (data.display_name) {
    const short = data.display_name.split(",").slice(0, 2).join(",").trim();
    if (short) return { label: short };
  }
  return null;
}
