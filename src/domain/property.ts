import { z } from 'zod';

export const propertyInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  price: z.number().finite().positive().max(1_000_000_000),
  currency: z.enum(['KES', 'USD', 'GBP']).default('KES'),
  propertyType: z.enum(['apartment', 'house', 'land', 'commercial']),
  transactionType: z.enum(['sale', 'rent', 'lease']),
  bedrooms: z.number().int().min(0).max(100).default(0),
  bathrooms: z.number().int().min(0).max(100).default(0),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().min(2).max(100).default('Kenya'),
  imageUrls: z.array(z.string().url()).max(20).default([])
}).strict();
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type Property = PropertyInput & { id: string; createdAt: string; updatedAt: string };
export const propertyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  city: z.string().trim().min(1).max(100).optional(),
  propertyType: z.enum(['apartment','house','land','commercial']).optional(),
  transactionType: z.enum(['sale','rent','lease']).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  search: z.string().trim().min(1).max(120).optional()
}).strict().refine(q => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, { message: 'minPrice must be <= maxPrice', path: ['minPrice'] });
export type PropertyQuery = z.infer<typeof propertyQuerySchema>;
