import { config } from '../config.js';

export function isEmailDeliveryConfigured():boolean{
 return Boolean(config.EMAIL_API_URL&&config.EMAIL_API_KEY&&config.EMAIL_FROM&&config.PUBLIC_APP_URL);
}

/**
 * Provider-neutral JSON delivery contract:
 * POST EMAIL_API_URL with a Bearer API key and {from,to,subject,text,html}.
 * A provider-specific adapter can replace this transport without changing auth flows.
 */
export async function sendPasswordResetEmail(to:string,token:string):Promise<void>{
 if(!isEmailDeliveryConfigured()||!config.EMAIL_API_URL||!config.EMAIL_API_KEY||!config.EMAIL_FROM||!config.PUBLIC_APP_URL){
  throw new Error('EMAIL_DELIVERY_NOT_CONFIGURED');
 }
 const link=new URL('/reset-password',config.PUBLIC_APP_URL);
 link.searchParams.set('token',token);
 const response=await fetch(config.EMAIL_API_URL,{
  method:'POST',
  headers:{'authorization':`Bearer ${config.EMAIL_API_KEY}`,'content-type':'application/json'},
  body:JSON.stringify({
   from:config.EMAIL_FROM,
   to,
   subject:'Reset your Secure Properties password',
   text:`A password reset was requested for your account. Use this one-time link within 30 minutes: ${link.toString()} If you did not request this, ignore this email.`,
   html:`<p>A password reset was requested for your account.</p><p><a href="${link.toString()}">Reset your password</a></p><p>This one-time link expires in 30 minutes. If you did not request this, ignore this email.</p>`
  }),
  signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error('EMAIL_PROVIDER_REJECTED_REQUEST');
}
