import { describe,expect,it } from 'vitest';
import { darajaTimestamp,normalizeKenyanPhone,isMpesaConfigured } from '../src/services/mpesa.js';

describe('M-Pesa helpers',()=>{
 it('normalizes common Kenyan mobile number formats',()=>{
  expect(normalizeKenyanPhone('0712345678')).toBe('254712345678');
  expect(normalizeKenyanPhone('+254712345678')).toBe('254712345678');
  expect(normalizeKenyanPhone('712345678')).toBe('254712345678');
 });
 it('rejects invalid phone numbers',()=>{expect(()=>normalizeKenyanPhone('0201234567')).toThrow('INVALID_MPESA_PHONE');});
 it('formats the Daraja timestamp in East Africa Time',()=>{expect(darajaTimestamp(new Date('2026-11-19T07:00:00.000Z'))).toBe('20261119100000');});
 it('keeps checkout disabled until all Daraja credentials and callback settings exist',()=>{expect(isMpesaConfigured()).toBe(false);});
});
