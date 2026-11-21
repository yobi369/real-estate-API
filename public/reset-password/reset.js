const form=document.querySelector('#reset-form');
const status=document.querySelector('#status');
const token=new URLSearchParams(window.location.search).get('token');
if(token)window.history.replaceState(null,'',window.location.pathname);
if(!token){form.hidden=true;status.textContent='This reset link is missing or invalid. Request a new password reset email.';}
form.addEventListener('submit',async(event)=>{
 event.preventDefault();
 const password=document.querySelector('#password').value;
 const confirmation=document.querySelector('#confirm-password').value;
 if(password!==confirmation){status.textContent='The passwords do not match.';return;}
 const button=form.querySelector('button');button.disabled=true;status.textContent='Updating password…';
 try{
  const response=await fetch('/api/v1/auth/password-reset/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password})});
  if(response.status===204){form.hidden=true;status.textContent='Your password has been updated. All previous sessions are now signed out.';return;}
  const body=await response.json().catch(()=>({}));
  status.textContent=body.error?.message??'The reset link is invalid or expired. Request a new one.';
 }catch{status.textContent='Unable to reach the service. Please try again.';}
 finally{button.disabled=false;}
});
