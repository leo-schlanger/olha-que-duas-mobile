/**
 * Weather service using Open-Meteo API (free, no API key required)
 * https://open-meteo.com/en/docs
 */

import { WeatherData, LocationCoords, CurrentWeather, HourlyForecast, DailyForecast } from '../types/weather';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TIMING } from '../config/constants';

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
  };
}

/**
 * Fetch weather data from Open-Meteo API
 */
export async function fetchWeatherData(coords: LocationCoords): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: coords.latitude.toString(),
    longitude: coords.longitude.toString(),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation,precipitation_probability',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,sunrise,sunset',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });

  const url = `${OPEN_METEO_BASE_URL}?${params.toString()}`;

  logger.log('Fetching weather data');

  const response = await fetchWithTimeout(url, { timeout: TIMING.FETCH_TIMEOUT });

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  const data: OpenMeteoResponse = await response.json();

  return transformWeatherData(data);
}

/**
 * Transform Open-Meteo response to our local types
 */
function transformWeatherData(data: OpenMeteoResponse): WeatherData {
  const current: CurrentWeather = {
    temperature: Math.round(data.current.temperature_2m),
    apparentTemperature: Math.round(data.current.apparent_temperature),
    humidity: data.current.relative_humidity_2m,
    windSpeed: Math.round(data.current.wind_speed_10m),
    precipitation: data.current.precipitation,
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
  };

  // Get next 24 hours of hourly data
  const now = new Date();
  const hourly: HourlyForecast[] = data.hourly.time
    .map((time, index) => ({
      time,
      temperature: Math.round(data.hourly.temperature_2m[index]),
      weatherCode: data.hourly.weather_code[index],
      precipitation: data.hourly.precipitation[index],
      precipitationProbability: data.hourly.precipitation_probability[index],
    }))
    .filter((item) => new Date(item.time) >= now)
    .slice(0, 24);

  // Get 7 days of daily data
  const daily: DailyForecast[] = data.daily.time.map((date, index) => ({
    date,
    temperatureMax: Math.round(data.daily.temperature_2m_max[index]),
    temperatureMin: Math.round(data.daily.temperature_2m_min[index]),
    weatherCode: data.daily.weather_code[index],
    precipitationSum: data.daily.precipitation_sum[index],
    sunrise: data.daily.sunrise[index],
    sunset: data.daily.sunset[index],
  }));

  return {
    current,
    hourly,
    daily,
    timezone: data.timezone,
  };
}
