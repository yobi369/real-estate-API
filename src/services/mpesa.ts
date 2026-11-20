import { Buffer } from 'node:buffer';
import { config } from '../config.js';

let cachedToken:{value:string;expiresAt:number}|null=null;
const baseUrl=()=>config.MPESA_ENV==='production'?'https://api.safaricom.co.ke':'https://sandbox.safaricom.co.ke';
const backslash=String.fromCharCode(92);
export const isMpesaConfigured=()=>Boolean(config.MPESA_CONSUMER_KEY&&config.MPESA_CONSUMER_SECRET&&config.MPESA_SHORTCODE&&config.MPESA_PASSKEY&&config.MPESA_CALLBACK_BASE_URL&&config.MPESA_CALLBACK_SECRET);
export function normalizeKenyanPhone(value:string):string{
 const digits=value.replace(new RegExp(backslash+'D','g'),'');
 if(new RegExp('^254[17]'+backslash+'d{8}$').test(digits))return digits;
 if(new RegExp('^0[17]'+backslash+'d{8}$').test(digits))return '254'+digits.slice(1);
 if(new RegExp('^[17]'+backslash+'d{8}$').test(digits))return '254'+digits;
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
 const callbackBase=config.MPESA_CALLBACK_BASE_URL!;
 const callback=(callbackBase.endsWith('/')?callbackBase.slice(0,-1):callbackBase)+'/api/v1/webhooks/mpesa/'+config.MPESA_CALLBACK_SECRET;
 const accountReference='SP'+input.agencyId.replaceAll('-','').slice(0,8);
 const payload={BusinessShortCode:shortcode,Password:password,Timestamp:timestamp,TransactionType:'CustomerPayBillOnline',Amount:input.amountMinor/100,PartyA:phone,PartyB:shortcode,PhoneNumber:phone,CallBackURL:callback,AccountReference:accountReference,TransactionDesc:'Agency subscription'};
 const token=await accessToken();
 let response:Response;try{response=await fetch(baseUrl()+'/mpesa/stkpush/v1/processrequest',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});}catch{throw new Error('MPESA_OUTCOME_UNKNOWN');}
 if(response.status>=500)throw new Error('MPESA_OUTCOME_UNKNOWN');
 const body=await response.json().catch(()=>({})) as {ResponseCode?:string;ResponseDescription?:string;CustomerMessage?:string;CheckoutRequestID?:string;MerchantRequestID?:string;errorMessage?:string};
 if(!response.ok||body.ResponseCode!==undefined&&body.ResponseCode!=='0')throw new Error('MPESA_STK_REJECTED: '+String(body.errorMessage??body.ResponseDescription??'Daraja rejected the STK request').slice(0,250));
 if(body.ResponseCode!=='0'||!body.CheckoutRequestID||!body.MerchantRequestID)throw new Error('MPESA_OUTCOME_UNKNOWN');
 return {merchantRequestId:body.MerchantRequestID,checkoutRequestId:body.CheckoutRequestID,customerMessage:String(body.CustomerMessage??'Payment prompt sent to your phone')};
}
export type StkQueryResult={responseCode:string|null;resultCode:number|null;resultDescription:string;};
export async function queryStkPush(checkoutRequestId:string):Promise<StkQueryResult>{
 if(!isMpesaConfigured())throw new Error('MPESA_NOT_CONFIGURED');
 const timestamp=darajaTimestamp();
 const shortcode=config.MPESA_SHORTCODE!;
 const password=Buffer.from(shortcode+config.MPESA_PASSKEY+timestamp).toString('base64');
 const payload={BusinessShortCode:shortcode,Password:password,Timestamp:timestamp,CheckoutRequestID:checkoutRequestId};
 const response=await fetch(baseUrl()+'/mpesa/stkpushquery/v1/query',{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({})) as {ResponseCode?:string;ResultCode?:string|number;ResultDesc?:string;ResponseDescription?:string};
 if(!response.ok||body.ResponseCode!=='0')throw new Error('MPESA_QUERY_FAILED');
 const resultCode=body.ResultCode===undefined||body.ResultCode===null?null:Number(body.ResultCode);
 return {responseCode:String(body.ResponseCode),resultCode:Number.isFinite(resultCode as number)?resultCode:null,resultDescription:String(body.ResultDesc??body.ResponseDescription??'Payment is still being processed')};
}

export type ParsedStkCallback = {
 checkoutRequestId:string;
 resultCode:number;
 resultDescription:string;
 amount:number|null;
 receipt:string|null;
 payload:{checkoutRequestId:string;resultCode:number;resultDescription:string;amount:number|null;receipt:string|null};
};

export function parseStkCallback(input:unknown):ParsedStkCallback|null{
 if(!input||typeof input!=='object')return null;
 const body=(input as {Body?:unknown}).Body;
 if(!body||typeof body!=='object')return null;
 const callback=(body as {stkCallback?:unknown}).stkCallback;
 if(!callback||typeof callback!=='object')return null;
 const value=callback as {
  CheckoutRequestID?:unknown;ResultCode?:unknown;ResultDesc?:unknown;
  CallbackMetadata?:{Item?:Array<{Name?:unknown;Value?:unknown}>};
 };
 if(typeof value.CheckoutRequestID!=='string'||value.CheckoutRequestID.trim().length===0||value.CheckoutRequestID.length>128)return null;
 if(typeof value.ResultCode!=='number'||!Number.isSafeInteger(value.ResultCode)||value.ResultCode<0)return null;
 const rawItems=value.CallbackMetadata?.Item;
 const items=Array.isArray(rawItems)?rawItems.filter((item):item is {Name?:unknown;Value?:unknown}=>Boolean(item)&&typeof item==='object'):[];
 const amountValue=items.find(item=>item.Name==='Amount')?.Value;
 const receiptValue=items.find(item=>item.Name==='MpesaReceiptNumber')?.Value;
 const amount=typeof amountValue==='number'&&Number.isSafeInteger(amountValue)&&amountValue>=0?amountValue:null;
 const receipt=typeof receiptValue==='string'&&receiptValue.trim().length>0&&receiptValue.length<=64?receiptValue.trim():null;
 const resultDescription=typeof value.ResultDesc==='string'?value.ResultDesc.slice(0,500):'';
 const checkoutRequestId=value.CheckoutRequestID.trim();
 const payload={checkoutRequestId,resultCode:value.ResultCode,resultDescription,amount,receipt};
 return {...payload,payload};
}
