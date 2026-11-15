export const now = new Date("2026-11-16T09:00:00+05:00");
export function weatherFixture() {
  const start = Date.parse("2026-11-16T00:00:00+05:00") / 1000;
  const times = Array.from({ length: 168 }, (_, i) => start + i * 3600),
    dayTimes = Array.from({ length: 7 }, (_, i) => start + i * 86400);
  const hour = (v: number) => times.map(() => v),
    day = (v: number) => dayTimes.map(() => v);
  return {
    current: {
      time: now.valueOf() / 1000,
      temperature_2m: 15,
      apparent_temperature: 14,
      relative_humidity_2m: 50,
      is_day: 1,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 10,
      wind_gusts_10m: 15,
    },
    hourly: {
      time: times,
      temperature_2m: hour(15),
      apparent_temperature: hour(14),
      relative_humidity_2m: hour(50),
      is_day: times.map((t) => {
        const h = new Date((t + 18000) * 1000).getUTCHours();
        return h >= 8 && h < 18 ? 1 : 0;
      }),
      precipitation: hour(0),
      precipitation_probability: hour(10),
      weather_code: hour(1),
      wind_speed_10m: hour(10),
      wind_gusts_10m: hour(15),
      uv_index: hour(4),
    },
    daily: {
      time: dayTimes,
      temperature_2m_min: day(7),
      temperature_2m_max: day(19),
      weather_code: day(1),
      precipitation_sum: day(0),
      precipitation_probability_max: day(10),
      wind_speed_10m_max: day(15),
      wind_gusts_10m_max: day(20),
      uv_index_max: day(4),
      sunrise: dayTimes.map((t) => t + 8 * 3600),
      sunset: dayTimes.map((t) => t + 18 * 3600),
    },
  };
}
