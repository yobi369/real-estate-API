const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const state = { token: sessionStorage.getItem('sp_token') || '', agencies: [], agency: null, listings: [], enquiries: [], members: [], plans: [], subscription: null, payments: [], register: false, view: 'overview' };
const money = new Intl.NumberFormat('en-KE', {maximumFractionDigits:0});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (path, options={}) => {
  const headers = {'Accept':'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(state.token ? {'Authorization':`Bearer ${state.token}`} : {}), ...(state.agency ? {'X-Agency-ID':state.agency.id} : {}), ...(options.headers||{})};
  const response = await fetch(path, {...options, headers});
  const payload = response.status===204 ? null : await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status})`);
  return payload;
};
function message(selector, text, kind='') { const node=$(selector); if(!node)return; node.textContent=text; node.className='notice'+(kind?' '+kind:''); }
function setAuthMode(register) {
  state.register=register; $('#auth-title').textContent=register?'Create your account':'Sign in';
  $('#auth-help').textContent=register?'Register as an agency owner or team member.':'Access your agency workspace.';
  $('#auth-submit').innerHTML=register?'Create account <span>→</span>':'Sign in <span>→</span>';
  $('#auth-switch').textContent=register?'Already have an account? Sign in':'New to Secure Properties? Create an account';
  $('#auth-form [name=password]').setAttribute('autocomplete',register?'new-password':'current-password');
  $('#auth-form [name=password]').setAttribute('minlength',register?'12':'1');
  message('#auth-message','');
}
function show(view) {
  state.view=view; $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
}
async function startWorkspace() {
  $('#auth-view').classList.add('hidden'); $('#create-agency-view').classList.add('hidden'); $('#workspace-view').classList.remove('hidden'); $('#sign-out').classList.remove('hidden');
  const result=await api('/api/v1/agencies/me'); state.agencies=result.data.items||[];
  if(!state.agencies.length){$('#workspace-view').classList.add('hidden');$('#create-agency-view').classList.remove('hidden');return;}
  $('#agency-select').innerHTML=state.agencies.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.role)}</option>`).join('');
  const selected=sessionStorage.getItem('sp_agency'); state.agency=state.agencies.find(a=>a.id===selected)||state.agencies[0];
  $('#agency-select').value=state.agency.id; await loadWorkspace();
}
async function loadWorkspace() {
  if(!state.agency)return;
  sessionStorage.setItem('sp_agency',state.agency.id);
  $('#workspace-message').textContent=`${state.agency.name} · ${state.agency.role}`;
  await Promise.all([loadListings(),loadEnquiries()]);
  if(['owner','admin'].includes(state.agency.role)) await loadTeam();
  $('.nav-item[data-view="billing"]').classList.toggle('hidden',!['owner','admin'].includes(state.agency.role));
  show(state.view);
}
async function loadListings() {
  const result=await api('/api/v1/agencies/properties?limit=100');
  state.listings=result.data.items||[];
  $('#stat-total').textContent=result.data.total;
  $('#stat-published').textContent=state.listings.filter(p=>p.publicationStatus==='published').length;
  $('#stat-drafts').textContent=state.listings.filter(p=>p.publicationStatus==='draft').length;
  renderListings();
  $('#recent-listings').innerHTML=state.listings.slice(0,5).map(p=>`<div class="table-row"><strong>${esc(p.title)}</strong><span>${esc(p.city)}</span><span class="pill ${esc(p.publicationStatus)}">${esc(p.publicationStatus)}</span><b>${esc(p.currency)} ${money.format(p.price)}</b></div>`).join('')||'<p class="empty">No listings yet. Add your first property to get started.</p>';
}
function renderListings() {
  const search=($('#listing-search')?.value||'').trim().toLowerCase(), status=$('#listing-status')?.value||'';
  const items=state.listings.filter(p=>(!status||p.publicationStatus===status)&&(!search||`${p.title} ${p.city} ${p.location}`.toLowerCase().includes(search)));
  $('#listing-list').innerHTML=items.map(p=>`<article class="listing-card">
    <div class="listing-top"><span class="pill ${esc(p.publicationStatus)}">${esc(p.publicationStatus)}</span><span class="category">${esc(p.category)}</span></div>
    <h3>${esc(p.title)}</h3><p class="muted">${esc(p.location||p.city)}, ${esc(p.city)}</p>
    <strong class="price">${esc(p.currency)} ${money.format(p.price)}</strong>
    <div class="listing-meta"><span>${esc(p.propertyType)}</span><span>${esc(p.transactionType)}</span><span>${Number(p.bedrooms)||0} beds</span></div>
    ${['owner','admin'].includes(state.agency.role)?`<div class="listing-actions">${p.publicationStatus==='published'?'<button data-status="archived" data-id="'+esc(p.id)+'" class="quiet">Archive</button>':'<button data-status="published" data-id="'+esc(p.id)+'" class="primary small-button">Publish</button>'}<button data-status="draft" data-id="${esc(p.id)}" class="quiet">Move to draft</button></div>`:''}
  </article>`).join('')||'<div class="empty">No listings match this filter.</div>';
}
async function loadEnquiries() {
  try { const result=await api('/api/v1/inquiries'); state.enquiries=result.data.items||[]; $('#stat-enquiries').textContent=state.enquiries.filter(e=>e.status==='new').length; renderEnquiries(); }
  catch(error){ $('#stat-enquiries').textContent='—'; $('#enquiry-list').innerHTML=`<p class="empty">${esc(error.message)}</p>`; }
}
function renderEnquiries() {
  $('#enquiry-list').innerHTML=state.enquiries.map(e=>`<article class="enquiry-card"><div><span class="pill ${esc(e.status)}">${esc(e.status)}</span><span class="muted small"> ${new Date(e.createdAt).toLocaleString()}</span></div><h3>${esc(e.name)} · ${esc(e.requestType)}</h3><p>${esc(e.message)}</p><div class="enquiry-contact"><a href="mailto:${encodeURIComponent(e.email)}">${esc(e.email)}</a><a href="tel:${esc(e.phone)}">${esc(e.phone)}</a></div>${e.listingTitle?`<small>Listing: ${esc(e.listingTitle)}</small>`:''}</article>`).join('')||'<p class="empty">No enquiries have arrived for this agency yet.</p>';
}
async function loadTeam() {
  try { const result=await api('/api/v1/agencies/members'); state.members=result.data.items||[]; renderTeam(); $('#invite-card').classList.remove('hidden'); }
  catch(error){ $('#team-list').innerHTML=`<p class="empty">${esc(error.message)}</p>`; $('#invite-card').classList.add('hidden'); }
}
async function loadBilling() {
  if(!['owner','admin'].includes(state.agency.role))return;
  try {
    const [plans,summary]=await Promise.all([api('/api/v1/billing/plans'),api('/api/v1/billing/subscription')]);
    state.plans=plans.data.items||[];state.subscription=summary.data.subscription;state.payments=summary.data.payments||[];
    $('#billing-plan').innerHTML=state.plans.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name)+' · KES '+money.format(p.priceMinor/100)+' / '+esc(p.billingInterval)+'</option>').join('')||'<option value="">No active plans</option>';
    $('#billing-submit').disabled=!state.plans.length;
    $('#billing-plan-help').textContent=state.plans.length?'Payment is confirmed only after the verified Daraja callback. An accepted STK prompt is not proof of payment.':'No active subscription plans are configured yet. Pricing must be approved before customers can subscribe.';
    const s=state.subscription;
    $('#billing-current-summary').textContent=s?s.plan.name+' · '+s.status+' · KES '+money.format(s.plan.priceMinor/100)+' per '+s.plan.billingInterval+(s.currentPeriodEnd?' · Period ends '+new Date(s.currentPeriodEnd).toLocaleDateString():'')+(s.cancelAtPeriodEnd?' · Cancellation scheduled at period end':''):'No active subscription for this agency.';
    $('#cancel-subscription').classList.toggle('hidden',!s||s.cancelAtPeriodEnd||!['active','trialing'].includes(s.status));
    $('#billing-payments').innerHTML=state.payments.map(p=>'<div class="table-row"><strong>'+esc(p.provider.toUpperCase())+' · '+esc(p.status)+'</strong><span>KES '+money.format(p.amountMinor/100)+'</span><span>'+esc(p.mpesaReceiptNumber||'—')+'</span><span>'+new Date(p.createdAt).toLocaleDateString()+'</span><span>'+(p.status==='pending'?'<button class="quiet" data-reconcile="'+esc(p.id)+'">Check status</button>':'')+'</span></div>').join('')||'<p class="empty">No payment transactions yet.</p>';
  } catch(error) { message('#billing-message',error.message,'error'); }
}
function renderTeam() {
  $('#team-list').innerHTML=state.members.map(m=>`<div class="table-row team-row"><div><strong>${esc(m.email)}</strong><small>${esc(m.status)}</small></div><span class="pill">${esc(m.role)}</span><div class="team-controls">${m.role==='owner'?'':`<select data-member-role="${esc(m.userId)}"><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option><option value="agent" ${m.role==='agent'?'selected':''}>Agent</option><option value="viewer" ${m.role==='viewer'?'selected':''}>Viewer</option></select><button class="quiet" data-remove-member="${esc(m.userId)}">Remove</button>`}</div></div>`).join('')||'<p class="empty">No team members found.</p>';
}
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault(); const form=new FormData(event.currentTarget); const body={email:String(form.get('email')).trim(),password:String(form.get('password'))};
 try { const result=await api(state.register?'/api/v1/auth/register':'/api/v1/auth/login',{method:'POST',body:JSON.stringify(body)}); state.token=result.data.token; sessionStorage.setItem('sp_token',state.token); state.view='overview'; await startWorkspace(); }
 catch(error){message('#auth-message',error.message,'error');}
});
$('#auth-switch').addEventListener('click',()=>setAuthMode(!state.register));
$('#sign-out').addEventListener('click',()=>{sessionStorage.removeItem('sp_token');sessionStorage.removeItem('sp_agency');state.token='';state.agency=null;$('#workspace-view').classList.add('hidden');$('#sign-out').classList.add('hidden');$('#auth-view').classList.remove('hidden');setAuthMode(false);});
$('#agency-form').addEventListener('submit',async event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('name')).trim();try{await api('/api/v1/agencies',{method:'POST',body:JSON.stringify({name})});await startWorkspace();}catch(error){message('#agency-message',error.message,'error');}});
$('#agency-select').addEventListener('change',async event=>{state.agency=state.agencies.find(a=>a.id===event.target.value)||null;state.view='overview';try{await loadWorkspace();}catch(error){message('#workspace-message',error.message,'error');}});
$('.nav-item').forEach(button=>button.addEventListener('click',()=>{show(button.dataset.view);if(button.dataset.view==='enquiries')loadEnquiries();if(button.dataset.view==='team')loadTeam();if(button.dataset.view==='billing')loadBilling();}));
$$('[data-go]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.go)));
$('#show-listing-form').addEventListener('click',()=>$('#listing-form').classList.remove('hidden'));
$('#hide-listing-form').addEventListener('click',()=>$('#listing-form').classList.add('hidden'));
$('#listing-form').addEventListener('submit',async event=>{
 event.preventDefault();const data=new FormData(event.currentTarget);
 const body={title:String(data.get('title')).trim(),description:String(data.get('description')).trim(),category:String(data.get('category')),propertyType:String(data.get('propertyType')),transactionType:String(data.get('transactionType')),price:Number(data.get('price')),currency:String(data.get('currency')),city:String(data.get('city')).trim(),location:String(data.get('location')).trim(),bedrooms:Number(data.get('bedrooms')),bathrooms:Number(data.get('bathrooms')),country:'Kenya',imageUrls:[]};
 try{await api('/api/v1/properties',{method:'POST',body:JSON.stringify(body)});event.currentTarget.reset();$('#listing-form').classList.add('hidden');message('#listing-message','Listing saved as a private draft.','success');await loadListings();}
 catch(error){message('#listing-message',error.message,'error');}
});
$('#listing-search').addEventListener('input',renderListings);$('#listing-status').addEventListener('change',renderListings);
$('#listing-list').addEventListener('click',async event=>{const button=event.target.closest('[data-status]');if(!button)return;try{await api(`/api/v1/properties/${encodeURIComponent(button.dataset.id)}/publication`,{method:'PATCH',body:JSON.stringify({status:button.dataset.status})});await loadListings();}catch(error){message('#workspace-message',error.message,'error');}});
$('#refresh-enquiries').addEventListener('click',loadEnquiries);$('#refresh-team').addEventListener('click',loadTeam);
$('#refresh-billing').addEventListener('click',loadBilling);
$('#billing-checkout').addEventListener('submit',async event=>{
 event.preventDefault();const data=new FormData(event.currentTarget);
 try{const result=await api('/api/v1/billing/mpesa/stk-push',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({planCode:String(data.get('planCode')),phoneNumber:String(data.get('phoneNumber')).trim()})});message('#billing-message',result.data.customerMessage+' Payment is pending until Safaricom confirms it.','success');await loadBilling();}
 catch(error){message('#billing-message',error.message,'error');}
});
$('#billing-payments').addEventListener('click',async event=>{const button=event.target.closest('[data-reconcile]');if(!button)return;button.disabled=true;try{const result=await api('/api/v1/billing/payments/'+encodeURIComponent(button.dataset.reconcile)+'/reconcile',{method:'POST',body:JSON.stringify({})});await loadBilling();message('#billing-message','Payment status: '+result.data.status+'.','success');}catch(error){message('#billing-message',error.message,'error');}finally{button.disabled=false;}});
$('#cancel-subscription').addEventListener('click',async()=>{if(!confirm('Schedule cancellation at the end of the current billing period?'))return;try{await api('/api/v1/billing/subscription/cancel',{method:'POST',body:JSON.stringify({})});await loadBilling();message('#billing-message','Cancellation scheduled at period end.','success');}catch(error){message('#billing-message',error.message,'error');}});

$('#invite-form').addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget);try{const result=await api('/api/v1/agencies/invitations',{method:'POST',body:JSON.stringify({email:String(data.get('email')).trim(),role:String(data.get('role'))})});$('#invite-result').textContent=`Invitation token (copy and deliver securely): ${result.data.token} · Expires ${new Date(result.data.expiresAt).toLocaleString()}`;$('#invite-result').className='notice success';event.currentTarget.reset();await loadTeam();}catch(error){message('#invite-result',error.message,'error');}});
$('#team-list').addEventListener('change',async event=>{const userId=event.target.dataset.memberRole;if(!userId)return;try{await api(`/api/v1/agencies/members/${encodeURIComponent(userId)}`,{method:'PATCH',body:JSON.stringify({role:event.target.value})});await loadTeam();}catch(error){message('#workspace-message',error.message,'error');await loadTeam();}});
$('#team-list').addEventListener('click',async event=>{const button=event.target.closest('[data-remove-member]');if(!button)return;if(!confirm('Remove this person from the agency?'))return;try{await api(`/api/v1/agencies/members/${encodeURIComponent(button.dataset.removeMember)}`,{method:'DELETE'});await loadTeam();}catch(error){message('#workspace-message',error.message,'error');}});
if(state.token){startWorkspace().catch(error=>{sessionStorage.removeItem('sp_token');state.token='';$('#workspace-view').classList.add('hidden');$('#auth-view').classList.remove('hidden');message('#auth-message',error.message,'error');});}
else setAuthMode(false);
