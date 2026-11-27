import type { CatalogItem, Photo } from "@/lib/hub/types";

export type ProviderId = "google" | "opentripmap" | "wikipedia";
export type Category = CatalogItem["category"];

/** One row in the admin "Add place" search results. Display-only. */
export type PlaceSearchResult = {
  provider: ProviderId;
  externalId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  ratingCount: number | null;
  /** Thumbnail to display now. Google thumbnails go through /api/places/photo and are never stored. */
  photoUrl: string;
  photoAttribution: string;
  photoAttributionUrl: string;
  category: Category;
  mapsUrl: string;
  /** Set when this external place is already in our catalog. */
  existingId?: string;
};

/**
 * Normalised import. Only fields listed in `persisted` may be written to our database.
 * Everything in `live` must be fetched again at display time (provider terms).
 */
export type PlaceImport = {
  provider: ProviderId;
  externalId: string;
  name: string;
  lat: number;
  lng: number;
  category: Category;
  address: string;
  hours: string;
  website: string;
  phone: string;
  description: string;
  descriptionSourceUrl: string;
  descriptionLicence: string;
  photos: Photo[];
  attribution: string;
  persisted: (keyof PlaceImport)[];
  live: {
    address?: string;
    hours?: string[];
    rating?: number;
    ratingCount?: number;
    website?: string;
    phone?: string;
    mapsUrl?: string;
  };
};

export interface PlaceProvider {
  id: ProviderId;
  label: string;
  /** Human-readable data policy shown in the admin UI. */
  policy: string;
  configured(): boolean;
  search(query: string): Promise<PlaceSearchResult[]>;
  details(externalId: string): Promise<PlaceImport>;
}

/** Almaty city centre; searches are biased to the city and Almaty Region. */
export const ALMATY = { lat: 43.2389, lng: 76.8897 } as const;
