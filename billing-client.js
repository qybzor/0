import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let client = null;
const $ = (id) => document.getElementById(id);
const say = (message) => { if ($('billingMessage')) $('billingMessage').textContent = message; window.qybzorGateMessage?.(message); };
async function applyPlatformRole(user){ if(!user||!client)return false; let isAdmin=false; try{const {data,error}=await client.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle();if(!error)isAdmin=!!data;else console.warn('No se pudo consultar el rol de administrador:',error.message);}catch(e){console.warn(e)} window.qybzorIsPlatformAdmin=isAdmin;window.qybzorShowApp?.(user,isAdmin);return isAdmin; }

window.connectQybzorBilling = async function () {
  const url = $('billingSupabaseUrl').value.trim();
  const key = $('billingSupabaseKey').value.trim();
  if (!url || !key) return say('Escribe el Project URL y la clave pública.');
  try {
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    window.qybzorSupabase = client;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    $('billingConnectionStatus').textContent = 'Conectado';
    $('billingConnectionStatus').className = 'status';
    say(data.session ? 'Conexión lista. Sesión encontrada.' : 'Conexión lista. Inicia sesión o crea una cuenta.');
    if (data.session) { window.qybzorBusinessId=''; window.applyAuthenticatedProfile?.(data.session.user); await applyPlatformRole(data.session.user); await loadBusinesses(); }
    client.auth.onAuthStateChange(async (event, session)=>{if(session?.user){window.applyAuthenticatedProfile?.(session.user);await applyPlatformRole(session.user);}else if(event==='SIGNED_OUT'){window.qybzorIsPlatformAdmin=false;document.getElementById('authGate')?.classList.remove('hidden');}});
  } catch (e) { say(`No se pudo conectar: ${e.message}`); }
};

window.billingAuth = async function (mode) {
  if (!client) return say('Primero conecta Supabase.');
  const email = $('billingEmail').value.trim();
  const password = $('billingPassword').value;
  if (!email || password.length < 8) return say('Escribe un correo y una contraseña de al menos 8 caracteres.');
  const fullName = $('billingFullName')?.value.trim() || '';
  const result = mode === 'signup'
    ? await client.auth.signUp({ email, password, options: { data: { full_name: fullName, owner_name: window.qybzorSignupDetails?.ownerName || fullName, business_name: window.qybzorSignupDetails?.businessName || '', business_type: window.qybzorSignupDetails?.businessType || '' } } })
    : await client.auth.signInWithPassword({ email, password });
  if (result.error) return say(result.error.message);
  if (mode === 'signup' && !result.data.session) return say('Cuenta creada. Revisa tu correo para confirmar la dirección y luego inicia sesión.');
  const user = result.data?.user || result.data?.session?.user;
  if (user) { window.qybzorBusinessId=''; window.applyAuthenticatedProfile?.(user); await applyPlatformRole(user); }
  say(mode === 'signup' ? 'Cuenta creada y sesión iniciada.' : 'Sesión iniciada.');
  await loadBusinesses();
};

async function loadBusinesses() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { data, error } = await client.from('memberships').select('business_id,businesses(id,name,business_type)').eq('user_id', user.id);
  if (error) return say(`No se pudieron cargar los negocios: ${error.message}`);
  // Si el usuario acaba de registrarse y confirmó su correo, crear su espacio al iniciar sesión por primera vez.
  if (!(data || []).length) {
    const meta = user.user_metadata || {};
    const businessName = String(meta.business_name || '').trim();
    const businessType = String(meta.business_type || '').trim();
    if (businessName && businessType) {
      const slug = `${businessName.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${crypto.randomUUID().slice(0,6)}`;
      const created = await client.from('businesses').insert({ name: businessName, slug, business_type: businessType, owner_id: user.id });
      if (created.error) return say(`La cuenta está lista, pero no se pudo crear el negocio: ${created.error.message}`);
      const refreshed = await client.from('memberships').select('business_id,businesses(id,name,business_type)').eq('user_id', user.id);
      if (refreshed.error) return say(`No se pudo cargar el negocio: ${refreshed.error.message}`);
      data.splice(0, data.length, ...(refreshed.data || []));
    }
  }
  const select = $('billingBusiness');
  select.innerHTML = '<option value="">Selecciona un negocio</option>';
  (data || []).forEach(row => {
    const b = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    if (!b) return;
    const option = document.createElement('option'); option.value = b.id; option.textContent = b.name; select.append(option);
  });
  const selectedRow = (data || []).find(row => row.business_id === select.value);
  const selectedBusiness = selectedRow ? (Array.isArray(selectedRow.businesses) ? selectedRow.businesses[0] : selectedRow.businesses) : null;
  if (selectedBusiness) window.qybzorSetBusinessType?.(selectedBusiness.business_type, selectedBusiness.name);
  if (!data?.length) say('No tienes negocios todavía. Crea tu primer espacio de trabajo.');
  await loadCurrentPlan();
  window.qybzorBusinessId = select.value || '';
  if (window.qybzorHydrateRemote && window.qybzorBusinessId) { try { await window.qybzorHydrateRemote(); say('Datos reales cargados desde Supabase.'); } catch(e) { say('Error cargando datos: '+e.message); } }
}

window.createQybzorBusiness = async function () {
  if (!client) return say('Primero conecta Supabase e inicia sesión.');
  const name = $('billingNewBusiness').value.trim();
  if (!name) return say('Escribe el nombre del negocio.');
  const { data: { user } } = await client.auth.getUser();
  if (!user) return say('Inicia sesión primero.');
  const slug = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${crypto.randomUUID().slice(0,6)}`;
  const { data, error } = await client.from('businesses').insert({ name, slug, owner_id: user.id }).select('id').single();
  if (error) return say(`No se pudo crear el negocio: ${error.message}`);
  // The base schema trigger should create the owner membership.
  await loadBusinesses(); $('billingBusiness').value = data.id; window.qybzorBusinessId=data.id; await window.qybzorHydrateRemote?.(); say('Espacio creado y conectado a Supabase.');
};

async function loadCurrentPlan() {
  const businessId = $('billingBusiness').value;
  if (!businessId) return;
  const { data, error } = await client.rpc('current_business_plan', { p_business_id: businessId });
  $('billingCurrentPlan').textContent = error ? `No se pudo consultar el plan: ${error.message}` : `Plan: ${data?.plan_id ?? 'Inicial'} · Estado: ${data?.status ?? 'active'}`;
}
$('billingBusiness')?.addEventListener('change', async () => { window.qybzorBusinessId = $('billingBusiness').value; await loadCurrentPlan(); if(window.qybzorBusinessId){const result=await client.from('businesses').select('name,business_type').eq('id',window.qybzorBusinessId).single();if(!result.error&&result.data)window.qybzorSetBusinessType?.(result.data.business_type,result.data.name);} if(window.qybzorHydrateRemote && window.qybzorBusinessId){try{await window.qybzorHydrateRemote();say('Datos reales cargados desde Supabase.')}catch(e){say('Error cargando datos: '+e.message)}} });

window.startQybzorCheckout = async function (planId) {
  if (!client) return say('Conecta Supabase primero.');
  const businessId = $('billingBusiness').value;
  if (!businessId) return say('Selecciona o crea un negocio antes de contratar.');
  say('Creando checkout seguro…');
  const { data, error } = await client.functions.invoke('create-subscription', { body: { business_id: businessId, plan_id: planId } });
  if (error) return say(`No se pudo iniciar el checkout: ${error.message}`);
  if (!data?.checkout_url) return say(data?.error || 'No se recibió el enlace de pago.');
  window.location.assign(data.checkout_url);
};

// Meta Embedded Signup: cada negocio autoriza su propia WABA desde la ventana oficial de Meta.
let metaSdkInitialized = false;
const waEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.startQybzorWhatsappSignup = function () {
  const appId = $('waMetaAppId')?.value.trim();
  const configId = $('waMetaConfigId')?.value.trim();
  const businessId = $('billingBusiness')?.value || window.qybzorBusinessId;
  if (!client) return say('Primero inicia sesión y conecta Supabase.');
  if (!businessId) return say('Crea o selecciona el negocio que va a vincular WhatsApp.');
  if (!appId || !configId) return say('Introduce el App ID y el Configuration ID públicos de Meta.');
  if (!window.FB) return say('El SDK de Meta todavía está cargando. Espera unos segundos y vuelve a pulsar.');
  localStorage.setItem('qybzor_meta_app_id', appId);
  localStorage.setItem('qybzor_meta_config_id', configId);
  if (!metaSdkInitialized) { window.FB.init({ appId, cookie: true, xfbml: false, version: 'v27.0' }); metaSdkInitialized = true; }
  const button = $('waConnectButton'); if (button) { button.disabled = true; button.textContent = 'Abriendo Meta…'; }
  say('Completa la autorización en la ventana oficial de Meta.');
  let code = null, signup = null, finished = false;
  const cleanup = () => { window.removeEventListener('message', onMetaMessage); clearTimeout(timeout); if (button) { button.disabled = false; button.textContent = 'Vincular mi WhatsApp Business con Meta'; } };
  const fail = message => { if (finished) return; finished = true; cleanup(); say(message); };
  const onMetaMessage = event => {
    if (!event.origin.includes('facebook.com') && !event.origin.includes('fb.com')) return;
    let payload = event.data;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { return; } }
    if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (payload.event === 'CANCEL') return fail('Vinculación cancelada en Meta. Puedes intentarlo de nuevo.');
    if (payload.event === 'ERROR') return fail('Meta informó un error durante la vinculación. Revisa la configuración de Embedded Signup.');
    if (payload.event === 'FINISH' || payload.event === 'FINISH_ONLY_WABA') {
      signup = payload.data || {};
      if (code && signup.waba_id && signup.phone_number_id) finish();
    }
  };
  const timeout = setTimeout(() => fail('La vinculación tardó demasiado o no se recibió la confirmación de Meta.'), 180000);
  const finish = async () => {
    if (finished || !code || !signup?.waba_id || !signup?.phone_number_id) return;
    finished = true; cleanup();
    say('Meta autorizó la cuenta. Guardando la conexión cifrada en Qybzor…');
    try {
      const { data, error } = await client.functions.invoke('connect-whatsapp-embedded', { body: { business_id: businessId, code, waba_id: String(signup.waba_id), phone_number_id: String(signup.phone_number_id) } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.error || 'No se pudo guardar el canal.');
      const status = $('waStatus'); if (status) { status.textContent = 'Conectado'; status.className = 'status'; }
      const info = $('waChannelInfo'); if (info) info.textContent = `Conectado: ${data.display_phone || 'número de WhatsApp'}${data.verified_name ? ' · '+data.verified_name : ''}. Los mensajes entrantes llegarán a Qybzor.`;
      say('WhatsApp Business quedó vinculado a este negocio.');
      await window.loadQybzorWhatsappConversations?.();
    } catch (e) { say(`No se pudo completar la conexión: ${e.message || 'Error del servidor'}`); }
  };
  window.addEventListener('message', onMetaMessage);
  window.FB.login(response => {
    code = response?.authResponse?.code || null;
    if (!code) return fail('No se recibió el código de autorización de Meta. Cierra la ventana y vuelve a intentarlo.');
    if (signup?.waba_id && signup?.phone_number_id) finish();
  }, { config_id: configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: 3 } });
};

window.loadQybzorWhatsappConversations = async function () {
  const host = $('waConversations'); const businessId = $('billingBusiness')?.value || window.qybzorBusinessId;
  if (!host || !client || !businessId) { if (host) host.innerHTML = '<div class="empty">Inicia sesión y selecciona un negocio para ver sus conversaciones.</div>'; return; }
  host.innerHTML = '<div class="empty">Cargando conversaciones…</div>';
  const { data, error } = await client.from('whatsapp_conversations').select('id,customer_phone,last_message_at,whatsapp_messages(body,direction,created_at)').eq('business_id', businessId).order('last_message_at', { ascending: false }).limit(30);
  if (error) { host.innerHTML = `<div class="empty">No se pudieron cargar los chats: ${waEsc(error.message)}</div>`; return; }
  if (!data?.length) { host.innerHTML = '<div class="empty">Todavía no hay mensajes en el WhatsApp conectado a este negocio.</div>'; return; }
  host.innerHTML = data.map(c => { const messages = (c.whatsapp_messages || []).sort((a,b) => new Date(a.created_at)-new Date(b.created_at)); const last = messages[messages.length-1]; return `<div class="activity-item"><div class="activity-icon">◉</div><div style="min-width:0;flex:1"><strong>${waEsc(c.customer_phone)}</strong><p>${waEsc(last ? `${last.direction === 'inbound' ? 'Cliente' : 'Qybzor'}: ${last.body}` : 'Conversación iniciada')}</p><time>${c.last_message_at ? new Date(c.last_message_at).toLocaleString('es-CO') : ''}</time></div></div>`; }).join('');
};

const savedMetaAppId = localStorage.getItem('qybzor_meta_app_id');
const savedMetaConfigId = localStorage.getItem('qybzor_meta_config_id');
if ($('waMetaAppId') && savedMetaAppId) $('waMetaAppId').value = savedMetaAppId;
if ($('waMetaConfigId') && savedMetaConfigId) $('waMetaConfigId').value = savedMetaConfigId;


// Recupera la configuración pública guardada y restaura una sesión válida.
const savedUrl=localStorage.getItem('qybzor_supabase_url');const savedKey=localStorage.getItem('qybzor_supabase_anon_key');if(savedUrl&&savedKey){if($('billingSupabaseUrl'))$('billingSupabaseUrl').value=savedUrl;if($('billingSupabaseKey'))$('billingSupabaseKey').value=savedKey;window.addEventListener('load',()=>{if(!client)window.connectQybzorBilling();});}
