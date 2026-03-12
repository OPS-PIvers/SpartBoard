export interface OpenWeatherData {
  cod: number | string;
  message?: string;
  name: string;
  main: {
    temp: number;
    feels_like: number;
  };
  weather: [{ main: string }, ...{ main: string }[]];
}

export interface EarthNetworksResponse {
  o?: {
    t: number;
    ic: number;
    fl?: number;
  };
}

export const STATION_CONFIG = {
  id: 'BLLST',
  lat: 44.99082,
  lon: -93.59635,
  name: 'Orono IS',
};

export const EARTH_NETWORKS_API = {
  BASE_URL: 'https://owc.enterprise.earthnetworks.com/Data/GetData.ashx',
  PARAMS: {
    dt: 'o',
    pi: '3',
    units: 'english',
    verbose: 'false',
  },
};

export const EARTH_NETWORKS_ICONS = {
  SNOW: [140, 186, 210, 102],
  CLOUDY: [1, 13, 24, 70, 71, 73, 79],
  SUNNY: [0, 2, 3, 4, 7],
  RAIN: [10, 11, 12, 14, 15, 16, 17, 18, 19],
};
