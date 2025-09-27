declare module '@mapbox/mapbox-gl-geocoder' {
  import mapboxgl from 'mapbox-gl';
  interface GeocoderOptions {
    accessToken?: string;
    mapboxgl?: typeof mapboxgl;
    placeholder?: string;
    bbox?: number[];
    proximity?: { longitude: number; latitude: number };
    countries?: string | string[];
    types?: string | string[];
    minLength?: number;
  }
  class MapboxGeocoder {
    constructor(options?: GeocoderOptions);
    on(event: string, cb: (ev: any) => void): this;
    off(event: string, cb: (ev: any) => void): this;
  }
  export default MapboxGeocoder;
}
