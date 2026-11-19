import { Buffer } from 'node:buffer';
import { config } from '../config.js';

let cachedToken:{value:string;expiresAt:number}|null=null;
const baseUrl=()=>config.MPESA_ENV==='production'?'https://api.safaricom.co.ke':'https://sandbox.safaricom.co.ke';
export const isMpesaConfigured=()=>Boolean(config.MPESA_CONSUMER_KEY&&config.MPESA_CONSUMER_SECRET&&config.MPESA_SHORTCODE&&config.MPESA_PASSKEY&&config.MPESA_CALLBACK_BASE_URL&&config.MPESA_CALLBACK_SECRET);
export function normalizeKenyanPhone(value:string):string{
 const digits=value.replace(/\\D/g,'');
 if(/^254[17]\\d{8}$/.test(digits))return digits;
 if(/^0[17]\\d{8}$/.test(digits))return '254'+digits.slice(1);
 if(/^[17]\\d{8}$/.test(digits))return '254'+digits;
 throw new Error('INVALID_MPESA_PHONE');
}
export function darajaTimestamp(date=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return String(values.year)+String(values.month)+String(values.day)+String(values.hour)+String(values.minute)+String(values.second);
}
async function accessToken():Promise<string>{
 if(!isMpesaConfigured())throw new Error('MPESA_NOT_CONFIGURED');
 if(cachedToken&&cachedToken.expiresAt>Date.now()+30000)return cachedToken.value;
 const credentials=Buffer.from(config.MPESA_CONSUMER_KEY+':'+config.MPESA_CONSUMER_SECRET).toString('base64');
 const response=await fetch(baseUrl()+'/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:'Basic '+credentials,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 const body=await response.json().catch(()=>({})) as {access_token?:string;expires_in?:string};
 if(!response.ok||!body.access_token)throw new Error('MPESA_AUTH_FAILED');
 const seconds=Math.max(60,Number(body.expires_in??3600));
 cachedToken={value:body.access_token,expiresAt:Date.now()+Math.max(30,seconds-60)*1000};
 return cachedToken.value;
}
export type StkPushAccepted={merchantRequestId:string;checkoutRequestId:string;customerMessage:string;};
export async function initiateStkPush(input:{phoneNumber:string;amountMinor:number;agencyId:string}):Promise<StkPushAccepted>{
 if(!isMpesaConfigured())throw new Error('MPESA_NOT_CONFIGURED');
 if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0||input.amountMinor%100!==0)throw new Error('INVALID_MPESA_AMOUNT');
 const phone=normalizeKenyanPhone(input.phoneNumber);
 const timestamp=darajaTimestamp();
 const shortcode=config.MPESA_SHORTCODE!;
 const password=Buffer.from(shortcode+config.MPESA_PASSKEY+timestamp).toString('base64');
 const callback=config.MPESA_CALLBACK_BASE_URL!.replace(/\\/+$/,'')+'/api/v1/webhooks/mpesa/'+config.MPESA_CALLBACK_SECRET;
 const payload={BusinessShortCode:shortcode,Password:password,Timestamp:timestamp,TransactionType:'CustomerPayBillOnline',Amount:input.amountMinor/100,PartyA:phone,PartyB:shortcode,PhoneNumber:phone,CallBackURL:callback,AccountReference:'SP'+input.agencyId.replace(/-/g,'').slice(0,8),TransactionDesc:'Agency subscription'};
 const response=await fetch(baseUrl()+'/mpesa/stkpush/v1/processrequest',{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({})) as {ResponseCode?:string;ResponseDescription?:string;CustomerMessage?:string;CheckoutRequestID?:string;MerchantRequestID?:string;errorMessage?:string};
 if(!response.ok||body.ResponseCode!=='0'||!body.CheckoutRequestID||!body.MerchantRequestID)throw new Error('MPESA_STK_REJECTED: '+String(body.errorMessage??body.ResponseDescription??'Daraja did not accept the STK request').slice(0,250));
 return {merchantRequestId:body.MerchantRequestID,checkoutRequestId:body.CheckoutRequestID,customerMessage:String(body.CustomerMessage??'Payment prompt sent to your phone')};
}
