import snapshot from './venue-prices.json';
import type { VenuePrice } from '../types';

export const venuePrices = snapshot as Record<string, VenuePrice>;
