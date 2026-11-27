/** Subset of the Google Places API (New) `Place` resource used by this app. */
export type GoogleLocalizedText = { text: string; languageCode?: string };
export type GoogleAuthorAttribution = {
  displayName: string;
  uri?: string;
  photoUri?: string;
};
export type GooglePhoto = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: GoogleAuthorAttribution[];
  googleMapsUri?: string;
};
export type GoogleReview = {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: GoogleLocalizedText;
  originalText?: GoogleLocalizedText;
  authorAttribution?: GoogleAuthorAttribution;
  publishTime?: string;
  googleMapsUri?: string;
};
export type GooglePlace = {
  id: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  priceLevel?: string;
  editorialSummary?: GoogleLocalizedText;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: {
      open?: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }[];
  };
  photos?: GooglePhoto[];
  reviews?: GoogleReview[];
  attributions?: { provider: string; providerUri?: string }[];
};
