export type WeatherHour = {
  time: number;
  temperature: number;
  feelsLike: number;
  humidity: number;
  rainChance: number;
  precipitation: number;
  wind: number;
  gust: number;
  uv: number;
  code: number;
  daylight: boolean;
};
export type WeatherDay = {
  date: string;
  min: number;
  max: number;
  code: number;
  rainChance: number;
  precipitation: number;
  wind: number;
  gust: number;
  uv: number;
  sunrise: number;
  sunset: number;
};
export type WeatherData = {
  provider: "Open-Meteo";
  attributionUrl: string;
  fetchedAt: string;
  current: Omit<WeatherHour, "rainChance" | "uv"> & {
    rainChance: number;
    uv: number;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
};
export type WeatherAdvice = {
  clothing: string[];
  cautions: string[];
  outdoorWindow: { start: number; end: number } | null;
  outdoorHint: string;
  date: string;
};
