/**
 * app.js — Fluxo de agendamento
 */

const SERVICE_ICONS = ['✂️', '🪒', '💈', '👁️', '💧', '🌿'];

const state = {
  step: 1,
  services: [],
  date: null,
  time: null,
  client: {},
  pixConfig: {},
  bookingId: null,
  calYear: null,
  calMonth: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  state.calYear  = today.getFullYear();
  state.calMonth = today.getMonth();

  // Carrega serviços da planilha (com fallback para CONFIG.SERVICES)
  try {
    const svcs = await API.getServices();
    if (svcs && svcs.length) CONFIG.SERVICES = svcs;
  } catch {}

  renderServices();
  renderCalendar();
  await loadPixConfig();
  bindEvents();
});

/* ---- Serviços (multi-select) ---- */

function renderServices() {
  const container = document.getElementById('services-list');
  container.innerHTML = CONFIG.SERVICES.map((s, i) => `
    <div class="service-card" data-id="${s.id}">
      <div class="service-icon">${SERVICE_ICONS[i] || '✂️'}</div>
      <div class="service-body">
        <span class="service-name">${s.name}</span>
        <span class="service-duration">${s.duration}</span>
      </div>
      <span class="service-price">${formatCurrency(s.price)}</span>
      <div class="service-check">
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4L4 7.5L10 1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      const id      = parseInt(card.dataset.id);
      const service = CONFIG.SERVICES.find(s => s.id === id);
      const idx     = state.services.findIndex(s => s.id === id);
      if (idx === -1) { state.services.push(service); card.classList.add('selected'); }
      else            { state.services.splice(idx,1);  card.classList.remove('selected'); }
      updateSelectionBar();
    });
  });
}

function updateSelectionBar() {
  const bar   = document.getElementById('selection-bar');
  const count = state.services.length;
  const total = state.services.reduce((sum, s) => sum + s.price, 0);
  if (!bar) return;
  if (count === 0) { bar.classList.remove('visible'); return; }
  document.getElementById('bar-count').textContent =
    count === 1 ? '1 serviço selecionado' : `${count} serviços selecionados`;
  document.getElementById('bar-total').textContent = formatCurrency(total);
  bar.classList.add('visible');
}

/* ---- Calendário ---- */

function renderCalendar() {
  const label  = document.getElementById('cal-month-label');
  const daysEl = document.getElementById('calendar-days');
  const date   = new Date(state.calYear, state.calMonth, 1);
  label.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDow    = date.getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(state.calYear, state.calMonth, d);
    const dateStr  = toDateStr(cellDate);
    const dow      = cellDate.getDay();
    const isPast    = cellDate < today;
    const isBlocked = CONFIG.BLOCKED_DATES.includes(dateStr) || CONFIG.BLOCKED_WEEKDAYS.includes(dow);
    let cls = 'cal-day';
    if (isPast)         cls += ' past disabled';
    else if (isBlocked) cls += ' disabled';
    if (cellDate.getTime() === today.getTime()) cls += ' today';
    if (dateStr === state.date) cls += ' selected';
    html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }
  daysEl.innerHTML = html;
  daysEl.querySelectorAll('.cal-day:not(.disabled):not(.past):not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => selectDate(cell.dataset.date));
  });
}

async function selectDate(dateStr) {
  state.date = dateStr;
  renderCalendar();
  goToStep(3);
  await loadSlots(dateStr);
}

async function loadSlots(dateStr) {
  const container = document.getElementById('times-list');
  const noMsg     = document.getElementById('no-times-msg');
  const label     = document.getElementById('selected-date-label');
  const [y,m,d]   = dateStr.split('-');
  label.textContent = `${d}/${m}/${y}`;
  container.innerHTML = '<div style="color:var(--text-secondary);padding:24px;grid-column:span 3;text-align:center;font-size:.875rem">Carregando...</div>';

  const slots = await API.getAvailableSlots(dateStr);
  container.innerHTML = '';
  if (!slots || slots.length === 0) { noMsg.classList.remove('hidden'); return; }
  noMsg.classList.add('hidden');

  slots.forEach(slot => {
    const div = document.createElement('div');
    div.className = 'time-slot';
    div.textContent = slot;
    div.addEventListener('click', () => {
      container.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
      div.classList.add('selected');
      state.time = slot;
      setTimeout(() => goToStep(4), 300);
    });
    container.appendChild(div);
  });
}

/* ---- Pré-preenchimento ---- */

function fillClientForm() {
  const name  = sessionStorage.getItem('clientName')  || '';
  const phone = sessionStorage.getItem('clientPhone') || '';
  const nameInput = document.getElementById('client-name');
  const waInput   = document.getElementById('client-whatsapp');
  if (name && nameInput && !nameInput.value) {
    nameInput.value = name; nameInput.readOnly = true;
  }
  if (phone && waInput && !waInput.value) {
    const p = phone.replace(/\D/g, '');
    let fmt = p;
    if (p.length === 11)      fmt = p.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    else if (p.length === 10) fmt = p.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    waInput.value = fmt; waInput.readOnly = true;
  }
}

/* ---- Eventos ---- */

function bindEvents() {
  document.getElementById('prev-month').addEventListener('click', () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; } else state.calMonth--;
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; } else state.calMonth++;
    renderCalendar();
  });

  document.getElementById('bar-continue-btn')?.addEventListener('click', () => {
    if (state.services.length > 0) goToStep(2);
  });

  document.getElementById('client-form').addEventListener('submit', e => {
    e.preventDefault();
    if (validateClientForm()) { fillSummaryStep5(); goToStep(5); }
  });

  document.getElementById('confirm-booking-btn').addEventListener('click', submitBooking);

  document.getElementById('copy-pix-btn')?.addEventListener('click', () => {
    const key = document.getElementById('pix-key').textContent;
    navigator.clipboard.writeText(key).then(() => showToast('Chave Pix copiada!', 'success'));
  });
}

function validateClientForm() {
  let valid = true;
  clearErrors();
  const name = document.getElementById('client-name');
  const wa   = document.getElementById('client-whatsapp');
  if (!name.value.trim() || name.value.trim().length < 2) {
    showError('err-name', 'Informe seu nome.'); name.classList.add('error'); valid = false;
  }
  const waClean = wa.value.replace(/\D/g, '');
  if (!waClean || waClean.length < 10) {
    showError('err-whatsapp', 'Informe um WhatsApp válido.'); wa.classList.add('error'); valid = false;
  }
  if (valid) state.client = { name: name.value.trim(), whatsapp: wa.value.trim(), email: '' };
  return valid;
}

function clearErrors() {
  ['client-name','client-whatsapp'].forEach(id => document.getElementById(id)?.classList.remove('error'));
  ['err-name','err-whatsapp'].forEach(id => showError(id, ''));
}

/* ---- Resumos ---- */

function fillSummaryStep4() {
  const names = state.services.map(s => s.name).join(' + ');
  const total = state.services.reduce((sum, s) => sum + s.price, 0);
  document.getElementById('sum-service').textContent = names || '—';
  document.getElementById('sum-date').textContent    = formatDatePt(state.date);
  document.getElementById('sum-time').textContent    = state.time || '—';
  document.getElementById('sum-value').textContent   = formatCurrency(total);
}

async function loadPixConfig() {
  const cfg = await API.getConfig();
  state.pixConfig = {
    key:      cfg.chavePix          || '00.000.000/0001-00',
    receiver: cfg.nomeRecebedor     || 'BarberCell Barbearia',
    phone:    cfg.telefoneBarbearia || '5521985900023',
  };
}

function fillSummaryStep5() {
  const total = state.services.reduce((sum, s) => sum + s.price, 0);
  document.getElementById('pix-key').textContent      = state.pixConfig.key;
  document.getElementById('pix-receiver').textContent = state.pixConfig.receiver;
  document.getElementById('pix-amount').textContent   = formatCurrency(total);
  const qr = document.getElementById('pix-qr');
  if (qr) {
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(state.pixConfig.key)}`;
    qr.classList.remove('hidden');
  }
  buildWhatsappLink();
}

function buildWhatsappLink() {
  const services = state.services.map(s => s.name).join(' + ');
  const total    = state.services.reduce((sum, s) => sum + s.price, 0);
  const msg = encodeURIComponent(
    `Olá! Realizei o pagamento do agendamento.\n\n` +
    `Nome: ${state.client.name}\nServiço: ${services}\n` +
    `Data: ${formatDatePt(state.date)}\nHorário: ${state.time}\n` +
    `Total: ${formatCurrency(total)}\n\nSegue o comprovante. 🧾`
  );
  const phone = state.pixConfig.phone.replace(/\D/g, '');
  document.getElementById('whatsapp-btn').href = `https://wa.me/${phone}?text=${msg}`;
}

/* ---- Salvar agendamento ---- */

const _MSGS_BOOK = [
  'Separando a gilete...', 'Ajustando o pezinho...', 'Trocando o pente...',
  'Afiando a navalha...', 'Preparando a espuma...', 'Checando o horário...',
  'Confirmando com o barbeiro...', 'Quase pronto...'
];
let _bookTimer = null;
function showBookingLoading() {
  const msgEl = document.getElementById('loading-msg');
  const overlay = document.getElementById('loading-overlay');
  msgEl.textContent = _MSGS_BOOK[0];
  overlay.classList.remove('hidden');
  let i = 0;
  _bookTimer = setInterval(() => {
    i = (i + 1) % _MSGS_BOOK.length;
    msgEl.textContent = _MSGS_BOOK[i];
  }, 1800);
}
function hideBookingLoading() {
  clearInterval(_bookTimer);
  document.getElementById('loading-overlay').classList.add('hidden');
}

async function submitBooking() {
  showBookingLoading();
  try {
    const serviceNames = state.services.map(s => s.name).join(' + ');
    const totalPrice   = state.services.reduce((sum, s) => sum + s.price, 0);
    const result = await API.createBooking({
      nome: state.client.name, whatsapp: state.client.whatsapp, email: state.client.email,
      servico: serviceNames, valor: totalPrice,
      dataAgendada: state.date, horario: state.time,
    });
    state.bookingId = result.id;
    fillSuccessScreen(result);
    goToStep(6);
  } catch (err) {
    showToast('Erro ao salvar. Tente novamente.', 'error');
    console.error(err);
  } finally {
    hideBookingLoading();
  }
}

function fillSuccessScreen(data) {
  const names = state.services.map(s => s.name).join(' + ');
  const total = state.services.reduce((sum, s) => sum + s.price, 0);
  document.getElementById('final-id').textContent      = data.id || '—';
  document.getElementById('final-name').textContent    = state.client.name;
  document.getElementById('final-service').textContent = names;
  document.getElementById('final-date').textContent    = formatDatePt(state.date);
  document.getElementById('final-time').textContent    = state.time;
  document.getElementById('final-value').textContent   = formatCurrency(total);
}

/* ---- Navegação ---- */

function goToStep(n) {
  document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${n}`)?.classList.add('active');
  document.querySelectorAll('.step[data-step]').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active','completed');
    if (s < n) dot.classList.add('completed'); else if (s === n) dot.classList.add('active');
  });
  state.step = n;
  if (n === 4) { fillSummaryStep4(); fillClientForm(); }
  const bar = document.getElementById('selection-bar');
  if (n !== 1) bar?.classList.remove('visible'); else updateSelectionBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.goToStep = goToStep;

/* ---- Utilidades ---- */

function formatCurrency(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDatePt(dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-'); return `${d}/${m}/${y}`;
}
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function showError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }
function showToast(msg, type = '') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = `toast ${type}`;
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => t.classList.remove('show'), 3200);
}
