import { describe,expect,it } from 'vitest';
import { darajaTimestamp,normalizeKenyanPhone,isMpesaConfigured,parseStkCallback } from '../src/services/mpesa.js';

describe('M-Pesa helpers',()=>{
 it('normalizes common Kenyan mobile number formats',()=>{
  expect(normalizeKenyanPhone('0712345678')).toBe('254712345678');
  expect(normalizeKenyanPhone('+254712345678')).toBe('254712345678');
  expect(normalizeKenyanPhone('712345678')).toBe('254712345678');
 });
 it('rejects invalid phone numbers',()=>{expect(()=>normalizeKenyanPhone('0201234567')).toThrow('INVALID_MPESA_PHONE');});
 it('formats the Daraja timestamp in East Africa Time',()=>{expect(darajaTimestamp(new Date('2026-11-19T07:00:00.000Z'))).toBe('20261119100000');});
 it('rejects malformed callback result codes instead of coercing them to success',()=>{
  for(const resultCode of ['',null,false,0.5,-1,'0']) {
   expect(parseStkCallback({Body:{stkCallback:{CheckoutRequestID:'ws_CO_123',ResultCode:resultCode}}})).toBeNull();
  }
 });
 it('ignores malformed callback metadata entries without throwing',()=>{
  expect(parseStkCallback({Body:{stkCallback:{CheckoutRequestID:'ws_CO_123',ResultCode:0,CallbackMetadata:{Item:[null,4,'invalid',{Name:'Amount',Value:2500}]}}}})?.amount).toBe(2500);
 });
 it('accepts and sanitizes a structurally valid Daraja callback',()=>{
  const parsed=parseStkCallback({Body:{stkCallback:{CheckoutRequestID:' ws_CO_123 ',ResultCode:0,ResultDesc:'Success',CallbackMetadata:{Item:[{Name:'Amount',Value:2500},{Name:'MpesaReceiptNumber',Value:'ABC123XYZ'}]}}}});
  expect(parsed).toEqual({checkoutRequestId:'ws_CO_123',resultCode:0,resultDescription:'Success',amount:2500,receipt:'ABC123XYZ',payload:{checkoutRequestId:'ws_CO_123',resultCode:0,resultDescription:'Success',amount:2500,receipt:'ABC123XYZ'}});
 });
 it('keeps checkout disabled until all Daraja credentials and callback settings exist',()=>{expect(isMpesaConfigured()).toBe(false);});
});
