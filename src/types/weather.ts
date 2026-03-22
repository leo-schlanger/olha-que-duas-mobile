/**
 * Weather types and WMO weather code mappings
 */

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitation: number;
  precipitationProbability: number;
}

export interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitationSum: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  timezone: string;
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

/**
 * WMO Weather interpretation codes (WW)
 * https://open-meteo.com/en/docs
 */
export const weatherDescriptions: Record<number, string> = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Nevoeiro',
  48: 'Nevoeiro com geada',
  51: 'Chuvisco ligeiro',
  53: 'Chuvisco moderado',
  55: 'Chuvisco intenso',
  56: 'Chuvisco gelado ligeiro',
  57: 'Chuvisco gelado intenso',
  61: 'Chuva ligeira',
  63: 'Chuva moderada',
  65: 'Chuva intensa',
  66: 'Chuva gelada ligeira',
  67: 'Chuva gelada intensa',
  71: 'Neve ligeira',
  73: 'Neve moderada',
  75: 'Neve intensa',
  77: 'Granizo fino',
  80: 'Aguaceiros ligeiros',
  81: 'Aguaceiros moderados',
  82: 'Aguaceiros violentos',
  85: 'Nevões ligeiros',
  86: 'Nevões intensos',
  95: 'Trovoada',
  96: 'Trovoada com granizo ligeiro',
  99: 'Trovoada com granizo intenso',
};

/**
 * Map weather codes to MaterialCommunityIcons names
 */
export const weatherIcons: Record<number, { day: string; night: string }> = {
  0: { day: 'weather-sunny', night: 'weather-night' },
  1: { day: 'weather-sunny', night: 'weather-night' },
  2: { day: 'weather-partly-cloudy', night: 'weather-night-partly-cloudy' },
  3: { day: 'weather-cloudy', night: 'weather-cloudy' },
  45: { day: 'weather-fog', night: 'weather-fog' },
  48: { day: 'weather-fog', night: 'weather-fog' },
  51: { day: 'weather-rainy', night: 'weather-rainy' },
  53: { day: 'weather-rainy', night: 'weather-rainy' },
  55: { day: 'weather-rainy', night: 'weather-rainy' },
  56: { day: 'weather-snowy-rainy', night: 'weather-snowy-rainy' },
  57: { day: 'weather-snowy-rainy', night: 'weather-snowy-rainy' },
  61: { day: 'weather-rainy', night: 'weather-rainy' },
  63: { day: 'weather-rainy', night: 'weather-rainy' },
  65: { day: 'weather-pouring', night: 'weather-pouring' },
  66: { day: 'weather-snowy-rainy', night: 'weather-snowy-rainy' },
  67: { day: 'weather-snowy-rainy', night: 'weather-snowy-rainy' },
  71: { day: 'weather-snowy', night: 'weather-snowy' },
  73: { day: 'weather-snowy', night: 'weather-snowy' },
  75: { day: 'weather-snowy-heavy', night: 'weather-snowy-heavy' },
  77: { day: 'weather-hail', night: 'weather-hail' },
  80: { day: 'weather-rainy', night: 'weather-rainy' },
  81: { day: 'weather-rainy', night: 'weather-rainy' },
  82: { day: 'weather-pouring', night: 'weather-pouring' },
  85: { day: 'weather-snowy', night: 'weather-snowy' },
  86: { day: 'weather-snowy-heavy', night: 'weather-snowy-heavy' },
  95: { day: 'weather-lightning', night: 'weather-lightning' },
  96: { day: 'weather-lightning-rainy', night: 'weather-lightning-rainy' },
  99: { day: 'weather-lightning-rainy', night: 'weather-lightning-rainy' },
};

/**
 * Get the weather description in Portuguese
 */
export function getWeatherDescription(code: number): string {
  return weatherDescriptions[code] || 'Desconhecido';
}

/**
 * Get the weather icon name based on code and day/night
 */
export function getWeatherIcon(code: number, isDay: boolean): string {
  const icons = weatherIcons[code];
  if (!icons) {
    return isDay ? 'weather-sunny' : 'weather-night';
  }
  return isDay ? icons.day : icons.night;
}
