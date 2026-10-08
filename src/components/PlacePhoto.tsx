import { useState } from 'react';
import { Building2, Camera, Landmark, MapPin, Store, TreePine, Utensils } from 'lucide-react';
import { venuePhotos } from '../data/venue-photos';
import type { Place, VenuePhoto } from '../types';

type Props = {
  place: Pick<Place, 'id' | 'name' | 'category'>;
  className?: string;
  photo?: VenuePhoto;
  showCredit?: boolean;
  loading?: 'eager' | 'lazy';
};

const icons = { landmark: Landmark, museum: Building2, market: Store, neighborhood: MapPin, viewpoint: Camera, food: Utensils, park: TreePine };

export function PlacePhoto({ place, photo: refreshedPhoto, className = '', showCredit = false, loading = 'lazy' }: Props) {
  const localPhoto = venuePhotos[place.id];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = refreshedPhoto && failedUrl !== refreshedPhoto.url ? refreshedPhoto : localPhoto;
  const available = photo && failedUrl !== photo.url;
  const Icon = icons[place.category];

  return <figure className={`place-photo ${className}`}>
    {available ? <img className="place-photo-image" src={photo.url} alt={place.name} loading={loading} decoding="async" onError={() => setFailedUrl(photo.url)} /> :
      <div className="place-photo-fallback" role="img" aria-label={`${place.name}: venue illustration`}><Icon size={38} strokeWidth={1.1} /><span>Photo unavailable</span></div>}
    {showCredit && available && <figcaption className="photo-credit">
      <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.title}</a>
      <span> · {photo.author} · {photo.license}</span>
      <span> · Resized to WebP</span>
    </figcaption>}
  </figure>;
}
