// Today's weather for a place, from Open-Meteo (free, no key), and finding a typed city.
// Outfits use it for warmth and rain; when it can't load, they fall back on the season.

export interface Place {
  latitude: number;
  longitude: number;
  name: string;
}

export interface Weather {
  tempC: number;
  highC: number;
  lowC: number;
  /** 0-100, today's highest chance of rain. */
  rainChance: number;
  label: string;
  /** An Ionicons name for the sky. */
  icon: string;
}

const SKIES: [number[], string, string][] = [
  [[0], "Clear", "sunny-outline"],
  [[1, 2], "Partly cloudy", "partly-sunny-outline"],
  [[3], "Overcast", "cloudy-outline"],
  [[45, 48], "Foggy", "cloudy-outline"],
  [[51, 53, 55, 56, 57], "Drizzle", "rainy-outline"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "rainy-outline"],
  [[71, 73, 75, 77, 85, 86], "Snow", "snow-outline"],
  [[95, 96, 99], "Thunderstorms", "thunderstorm-outline"],
];

function sky(code: number): { label: string; icon: string } {
  const match = SKIES.find(([codes]) => codes.includes(code));
  return match
    ? { label: match[1], icon: match[2] }
    : { label: "Mixed", icon: "partly-sunny-outline" };
}

export async function fetchWeather(place: Place): Promise<Weather> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${place.latitude.toFixed(3)}&longitude=${place.longitude.toFixed(3)}` +
    "&current=temperature_2m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=auto&forecast_days=1";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather is unavailable right now.");
  const data = (await response.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: (number | null)[];
    };
  };
  const tempC = data.current?.temperature_2m;
  if (typeof tempC !== "number") throw new Error("Weather is unavailable right now.");
  const { label, icon } = sky(data.current?.weather_code ?? -1);
  return {
    tempC,
    highC: data.daily?.temperature_2m_max?.[0] ?? tempC,
    lowC: data.daily?.temperature_2m_min?.[0] ?? tempC,
    rainChance: data.daily?.precipitation_probability_max?.[0] ?? 0,
    label,
    icon,
  };
}

/** The best match for a typed city name, or null. */
export async function findCity(name: string): Promise<Place | null> {
  const query = name.trim();
  if (query.length < 2) return null;
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&format=json`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    results?: {
      latitude: number;
      longitude: number;
      name: string;
      admin1?: string;
      country_code?: string;
    }[];
  };
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    name: [hit.name, hit.admin1 ?? hit.country_code].filter(Boolean).join(", "),
  };
}

/** A typical temperature for this month, for when the weather can't load (northern-hemisphere guess, refined by latitude). */
export function seasonalTempC(date: Date = new Date(), latitude = 40): number {
  const northern = [3, 5, 9, 13, 18, 22, 25, 24, 20, 14, 8, 4];
  const month = date.getMonth();
  const value = latitude >= 0 ? northern[month]! : northern[(month + 6) % 12]!;
  return Math.abs(latitude) < 23 ? Math.max(value, 24) : value;
}

/** "18°" in the person's unit. */
export function formatTemp(tempC: number, unit: "c" | "f"): string {
  return unit === "f" ? `${Math.round((tempC * 9) / 5 + 32)}°` : `${Math.round(tempC)}°`;
}

/** Fahrenheit for the US and a few others, Celsius everywhere else. */
export function defaultUnit(): "c" | "f" {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    return /-(US|LR|MM|BS|BZ|KY|PW)\b/.test(locale) ? "f" : "c";
  } catch {
    return "c";
  }
}
