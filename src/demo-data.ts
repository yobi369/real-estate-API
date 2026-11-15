export type DemoProperty = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: 'KES';
  propertyType: 'apartment' | 'house' | 'land' | 'commercial';
  transactionType: 'sale' | 'rent' | 'lease';
  bedrooms: number;
  bathrooms: number;
  city: string;
  country: 'Kenya';
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

const demoDate = '2026-11-01T09:00:00.000Z';

// Fictional sample records for product demonstration only.
// These are not live listings, offers, valuations, or properties for sale.
export const demoProperties: DemoProperty[] = [
  { id: 'sample-001', title: 'Modern two-bedroom apartment', description: 'Illustrative apartment listing near the Nairobi metropolitan area, with parking and shared amenities.', price: 85000, currency: 'KES', propertyType: 'apartment', transactionType: 'rent', bedrooms: 2, bathrooms: 2, city: 'Nairobi', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate },
  { id: 'sample-002', title: 'Three-bedroom family home', description: 'Fictional family home example in a quiet residential neighbourhood.', price: 18500000, currency: 'KES', propertyType: 'house', transactionType: 'sale', bedrooms: 3, bathrooms: 3, city: 'Kiambu', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate },
  { id: 'sample-003', title: 'Residential plot example', description: 'Illustrative land listing for demonstrating location and price filters.', price: 4200000, currency: 'KES', propertyType: 'land', transactionType: 'sale', bedrooms: 0, bathrooms: 0, city: 'Machakos', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate },
  { id: 'sample-004', title: 'One-bedroom city apartment', description: 'Fictional compact apartment example close to urban services.', price: 52000, currency: 'KES', propertyType: 'apartment', transactionType: 'rent', bedrooms: 1, bathrooms: 1, city: 'Mombasa', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate },
  { id: 'sample-005', title: 'Retail and office unit', description: 'Illustrative commercial premises for lease in a mixed-use area.', price: 140000, currency: 'KES', propertyType: 'commercial', transactionType: 'lease', bedrooms: 0, bathrooms: 1, city: 'Nairobi', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate },
  { id: 'sample-006', title: 'Four-bedroom suburban house', description: 'Fictional spacious house example with garden and parking.', price: 26500000, currency: 'KES', propertyType: 'house', transactionType: 'sale', bedrooms: 4, bathrooms: 3, city: 'Nakuru', country: 'Kenya', imageUrls: [], createdAt: demoDate, updatedAt: demoDate }
];
