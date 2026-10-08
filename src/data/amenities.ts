import type { Coordinate } from '../types';

export type Cafe = {
  id: string;
  name: string;
  coordinate: Coordinate;
  district: string;
  category: 'cafe' | 'food';
  description: string;
  sourceUrl: string;
};

// Curated premises, not a live directory. Pins are approximate street locations;
// menus, opening hours, availability and ratings are intentionally not invented.
export const cafes: Cafe[] = [
  { id: 'hafiz-sultanahmet', name: 'Hafız Mustafa · Sultanahmet', coordinate: { lat: 41.0079827, lng: 28.9769079 }, district: 'Sultanahmet', category: 'food', description: 'Turkish sweets, tea and coffee close to the main historic sights. Check the menu before ordering.', sourceUrl: 'https://www.hafizmustafa.com/' },
  { id: 'brew-sirkeci', name: 'Brew Coffeeworks · Sirkeci', coordinate: { lat: 41.0147, lng: 28.9742 }, district: 'Sirkeci', category: 'cafe', description: 'A coffee stop near Sirkeci, useful between the historic peninsula and Eminönü.', sourceUrl: 'https://www.instagram.com/brewcoffeeworks/' },
  { id: 'hafiz-eminonu', name: 'Hafız Mustafa · Eminönü', coordinate: { lat: 41.0164, lng: 28.9739 }, district: 'Eminönü', category: 'food', description: 'Turkish sweets and drinks near the waterfront. Order from the menu before choosing your desserts.', sourceUrl: 'https://www.hafizmustafa.com/' },
  { id: 'gulluoglu-karakoy', name: 'Karaköy Güllüoğlu', coordinate: { lat: 41.0233, lng: 28.9809 }, district: 'Karaköy', category: 'food', description: 'A well-known baklava shop on the Karaköy waterfront side, with tea and sweet treats.', sourceUrl: 'https://www.karakoygulluoglu.com/' },
  { id: 'namli-karakoy', name: 'Namlı Gurme · Karaköy', coordinate: { lat: 41.0229, lng: 28.9777 }, district: 'Karaköy', category: 'food', description: 'A deli and breakfast stop near the ferry piers. Food purchases are separate from your itinerary.', sourceUrl: 'https://www.namligurmeonline.com/' },
  { id: 'mandabatmaz', name: 'Mandabatmaz', coordinate: { lat: 41.0323, lng: 28.9765 }, district: 'Beyoğlu', category: 'cafe', description: 'A small Turkish-coffee stop on Olivia Geçidi, just off İstiklal Avenue.', sourceUrl: 'https://mandabatmaz.com.tr/' },
  { id: 'kronotrop-cihangir', name: 'Kronotrop · Cihangir', coordinate: { lat: 41.0322, lng: 28.9812 }, district: 'Cihangir', category: 'cafe', description: 'Specialty coffee in the streets between İstiklal and Cihangir. The approach can be hilly.', sourceUrl: 'https://www.kronotrop.com.tr/' },
  { id: 'velvet-galata', name: 'Velvet Cafe · Galata', coordinate: { lat: 41.0263, lng: 28.9739 }, district: 'Galata', category: 'cafe', description: 'A small café close to Galata Tower, suited to a pause on the uphill walk.', sourceUrl: 'https://www.instagram.com/velvetcafegalata/' },
  { id: 'coffee-department-balat', name: 'Coffee Department · Balat', coordinate: { lat: 41.0291, lng: 28.9477 }, district: 'Balat', category: 'cafe', description: 'Coffee on the neighborhood streets near Balat’s historic houses.', sourceUrl: 'https://coffeedepartment.co/' },
  { id: 'forno-balat', name: 'Forno · Balat', coordinate: { lat: 41.0296, lng: 28.9503 }, district: 'Balat', category: 'food', description: 'A bakery and food stop on Kiremit Street, close to the Balat–Fener walk.', sourceUrl: 'https://www.fornobalat.com/' },
  { id: 'minoa-akaretler', name: 'Minoa · Akaretler', coordinate: { lat: 41.0421, lng: 28.9990 }, district: 'Beşiktaş', category: 'cafe', description: 'Books and a café in Akaretler, uphill from the Beşiktaş waterfront.', sourceUrl: 'https://minoa.com/' },
  { id: 'petra-gayrettepe', name: 'Petra Roasting Co. · Gayrettepe', coordinate: { lat: 41.0562, lng: 29.0107 }, district: 'Beşiktaş', category: 'cafe', description: 'A coffee-roastery stop in Gayrettepe, better for a nearby day than a waterfront detour.', sourceUrl: 'https://www.petracoffee.com/' },
  { id: 'cupofjoy-bebek', name: 'Cup of Joy · Bebek', coordinate: { lat: 41.0774, lng: 29.0441 }, district: 'Bebek', category: 'cafe', description: 'Coffee near the Bebek waterfront and its public park.', sourceUrl: 'https://cupofjoy.com.tr/' },
  { id: 'baylan-bebek', name: 'Baylan · Bebek', coordinate: { lat: 41.0766, lng: 29.0442 }, district: 'Bebek', category: 'food', description: 'A historic patisserie’s Bosphorus-side branch. Check the menu before ordering.', sourceUrl: 'https://www.instagram.com/baylanpastanesi/' },
  { id: 'fazilbey-kadikoy', name: 'Fazıl Bey’s Turkish Coffee', coordinate: { lat: 40.9896, lng: 29.0249 }, district: 'Kadıköy', category: 'cafe', description: 'A compact Turkish-coffee stop on Serasker Street, within Kadıköy’s market lanes.', sourceUrl: 'https://www.fazilbey.com.tr/' },
  { id: 'montag-kadikoy', name: 'Montag Coffee · Kadıköy', coordinate: { lat: 40.9907, lng: 29.0272 }, district: 'Kadıköy', category: 'cafe', description: 'Specialty coffee close to the market and Bahariye Street.', sourceUrl: 'https://montagcoffee.com/' },
  { id: 'baylan-kadikoy', name: 'Baylan · Kadıköy', coordinate: { lat: 40.9908, lng: 29.0245 }, district: 'Kadıköy', category: 'food', description: 'A long-established patisserie on Muvakkithane Street, near the market and piers.', sourceUrl: 'https://www.instagram.com/baylanpastanesi/' },
  { id: 'walter-moda', name: 'Walter’s Coffee Roastery · Moda', coordinate: { lat: 40.9820, lng: 29.0307 }, district: 'Moda', category: 'cafe', description: 'Coffee on Dereboyu Street, a little inland from Moda’s coastal paths.', sourceUrl: 'https://walterscoffee.com/' },
  { id: 'nail-kuzguncuk', name: 'Nail Kitabevi · Kuzguncuk', coordinate: { lat: 41.0364, lng: 29.0303 }, district: 'Kuzguncuk', category: 'cafe', description: 'A bookshop and café on İcadiye Street, close to Kuzguncuk’s wooden houses.', sourceUrl: 'https://www.nailkitabevi.com/' },
  { id: 'nevmekan-sahil', name: 'Nevmekan Sahil', coordinate: { lat: 41.0238, lng: 29.0136 }, district: 'Üsküdar', category: 'cafe', description: 'A municipal library and café near Üsküdar’s shoreline; use posted access and café rules.', sourceUrl: 'https://www.uskudar.bel.tr/' },
  { id: 'cinaralti-cengelkoy', name: 'Çınaraltı Tea Garden · Çengelköy', coordinate: { lat: 41.0516, lng: 29.0512 }, district: 'Çengelköy', category: 'cafe', description: 'A waterside tea-garden stop under a large plane tree, north of Beylerbeyi.', sourceUrl: 'https://www.cengelkoycinaralti.com/' },
];
