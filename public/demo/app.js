const form = document.querySelector('#filters');
const grid = document.querySelector('#properties');
const count = document.querySelector('#result-count');
const endpoint = document.querySelector('#endpoint');
const money = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });
const titleCase = value => value.charAt(0).toUpperCase() + value.slice(1);

function queryFromForm() {
  const values = new FormData(form);
  const params = new URLSearchParams();
  for (const [key, value] of values.entries()) if (String(value).trim()) params.set(key, String(value).trim());
  params.set('page', '1');
  params.set('limit', '6');
  return params;
}

function render(items) {
  if (!items.length) {
    grid.innerHTML = '<div class="empty">No sample listings match those filters. Try another location or reset your search.</div>';
    return;
  }
  grid.innerHTML = items.map(property => {
    const type = titleCase(property.propertyType);
    const purpose = titleCase(property.transactionType);
    const bedrooms = property.bedrooms ? property.bedrooms + ' beds' : 'Land / premises';
    const bathrooms = property.bathrooms ? property.bathrooms + ' baths' : '—';
    const symbol = property.propertyType === 'land' ? 'LAND' : property.propertyType === 'commercial' ? 'COMMERCIAL' : property.propertyType === 'house' ? 'HOME' : 'APT';
    return `<article class="property-card">
      <div class="property-art"><span>${symbol}</span></div>
      <div class="property-body">
        <span class="property-type">${type} · For ${purpose}</span>
        <h3>${escapeHtml(property.title)}</h3>
        <div class="property-location">${escapeHtml(property.city)}, ${escapeHtml(property.country)}</div>
        <div class="property-price">KES ${money.format(property.price)} <small>/ ${property.transactionType === 'sale' ? 'asking price' : 'month'}</small></div>
        <div class="property-meta"><span>${bedrooms}</span><span>${bathrooms}</span><span>Sample record</span></div>
      </div>
    </article>`;
  }).join('');
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
async function load() {
  const params = queryFromForm();
  endpoint.textContent = 'GET /demo/properties?' + params.toString();
  count.textContent = 'Searching sample inventory…';
  grid.innerHTML = '<div class="loading">Applying filters…</div>';
  try {
    const response = await fetch('/demo/properties?' + params.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Demo endpoint returned ' + response.status);
    const payload = await response.json();
    render(payload.data.items);
    count.textContent = payload.data.total + ' sample ' + (payload.data.total === 1 ? 'record' : 'records');
  } catch (error) {
    grid.innerHTML = '<div class="empty">The demo endpoint could not be reached. Please try again shortly.</div>';
    count.textContent = 'Demo unavailable';
  }
}
form.addEventListener('submit', event => { event.preventDefault(); load(); });
document.querySelectorAll('[data-city]').forEach(button => button.addEventListener('click', () => { form.elements.city.value = button.dataset.city; load(); }));
document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => { form.elements.propertyType.value = button.dataset.type; load(); }));
document.querySelectorAll('[data-purpose]').forEach(button => button.addEventListener('click', () => { form.elements.transactionType.value = button.dataset.purpose; load(); }));
document.querySelector('#reset').addEventListener('click', () => { form.reset(); load(); });
load();
