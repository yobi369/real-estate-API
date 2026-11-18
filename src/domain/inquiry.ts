import { z } from 'zod';
import { listingCategorySchema } from './property.js';
export const inquiryInputSchema=z.object({
 requestType:z.enum(['general','booking','viewing','site_visit']), name:z.string().trim().min(2).max(120),
 email:z.string().trim().email().max(254), phone:z.string().trim().min(7).max(32),
 message:z.string().trim().min(1).max(4000), service:z.string().trim().max(120).optional(), agencySlug:z.string().trim().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
 listingId:z.string().uuid().optional(), listingTitle:z.string().trim().max(160).optional(),
 listingCategory:listingCategorySchema.optional(), checkIn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 checkOut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), guests:z.number().int().min(1).max(20).optional(),
 visitDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), pickupPoint:z.string().trim().max(160).optional()
}).strict().refine(v=>!v.checkIn||!v.checkOut||v.checkOut>v.checkIn,{message:'Check-out must be after check-in',path:['checkOut']});
export type InquiryInput=z.infer<typeof inquiryInputSchema>;
export type StoredInquiry=InquiryInput & {id:string;status:'new'|'contacted'|'closed';createdAt:string};
