/**
 * app.js — Lógica principal do fluxo de agendamento
 */

/* Estado global */
const state = {
  step: 1,
  service: null,
  date: null,      // YYYY-MM-DD
  time: null,
  client: {},
  pixConfig: {},
  bookingId: null,
  calYear: null,
  calMonth: null,
};

/* -----------------------------------------------
   Init
----------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  state.calYear  = today.getFullYear();
  state.calMonth = today.getMonth();

  renderServices();
  renderCalendar();
  await loadPixConfig();
  bindEvents();
});

/* -----------------------------------------------
   Serviços
----------------------------------------------- */
function renderServices() {
  const container = document.getElementById('services-list');
  container.innerHTML = CONFIG.SERVICES.map(s => `
    <div class="service-card" data-id="${s.id}">
      <span class="service-name">${s.name}</span>
      <div class="service-meta">
        <span class="service-price">${formatCurrency(s.price)}</span>
        <span class="service-duration">${s.duration}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.service-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      state.service = CONFIG.SERVICES.find(s => s.id === id);
      container.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => goToStep(2), 350);
    });
  });
}

/* -----------------------------------------------
   Calendário
----------------------------------------------- */
function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  const daysEl = document.getElementById('calendar-days');

  const date = new Date(state.calYear, state.calMonth, 1);
  label.textContent = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDow = date.getDay(); // 0=dom
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

  let html = '';
  // Células em branco antes do 1º dia
  for (let i = 0; i < firstDow; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(state.calYear, state.calMonth, d);
    const dateStr = toDateStr(cellDate);
    const dow = cellDate.getDay();

    const isPast    = cellDate < today;
    const isBlocked = CONFIG.BLOCKED_DATES.includes(dateStr) || CONFIG.BLOCKED_WEEKDAYS.includes(dow);
    const isToday   = cellDate.getTime() === today.getTime();
    const isSelected = dateStr === state.date;

    let cls = 'cal-day';
    if (isPast)      cls += ' past disabled';
    else if (isBlocked) cls += ' disabled';
    if (isToday)     cls += ' today';
    if (isSelected)  cls += ' selected';

    html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }

  daysEl.innerHTML = html;

  // Eventos de clique
  daysEl.querySelectorAll('.cal-day:not(.disabled):not(.past):not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => selectDate(cell.dataset.date));
  });
}

async function selectDate(dateStr) {
  state.date = dateStr;
  renderCalendar(); // re-render para mostrar seleção

  // Vai para step 3 e carrega horários
  goToStep(3);
  await loadSlots(dateStr);
}

async function loadSlots(dateStr) {
  const container = document.getElementById('times-list');
  const noMsg     = document.getElementById('no-times-msg');
  const label     = document.getElementById('selected-date-label');

  const [y, m, d] = dateStr.split('-');
  label.textContent = `${d}/${m}/${y}`;

  container.innerHTML = '<div style="color:var(--text-muted);padding:20px;grid-column:span 3;text-align:center">Carregando horários...</div>';

  const slots = await API.getAvailableSlots(dateStr);

  container.innerHTML = '';
  if (!slots || slots.length === 0) {
    noMsg.classList.remove('hidden');
    return;
  }
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

/* -----------------------------------------------
   Formulário do cliente
----------------------------------------------- */
function bindEvents() {
  document.getElementById('prev-month').addEventListener('click', () => {
    if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; }
    else state.calMonth--;
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; }
    else state.calMonth++;
    renderCalendar();
  });

  document.getElementById('client-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateClientForm()) {
      fillSummaryStep5();
      goToStep(5);
    }
  });

  document.getElementById('confirm-booking-btn').addEventListener('click', submitBooking);

  document.getElementById('copy-pix-btn')?.addEventListener('click', () => {
    const key = document.getElementById('pix-key').textContent;
    navigator.clipboard.writeText(key).then(() => showToast('Chave Pix copiada!', 'success'));
  });
}

function validateClientForm() {
  let valid = true;

  const name  = document.getElementById('client-name');
  const wa    = document.getElementById('client-whatsapp');
  const email = document.getElementById('client-email');

  clearErrors();

  if (!name.value.trim() || name.value.trim().length < 3) {
    showError('err-name', 'Informe seu nome completo.');
    name.classList.add('error');
    valid = false;
  }

  const waClean = wa.value.replace(/\D/g, '');
  if (!waClean || waClean.length < 10) {
    showError('err-whatsapp', 'Informe um WhatsApp válido.');
    wa.classList.add('error');
    valid = false;
  }

  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    showError('err-email', 'E-mail inválido.');
    email.classList.add('error');
    valid = false;
  }

  if (valid) {
    state.client = {
      name:     name.value.trim(),
      whatsapp: wa.value.trim(),
      email:    email.value.trim(),
    };
  }
  return valid;
}

function clearErrors() {
  ['client-name','client-whatsapp','client-email'].forEach(id => {
    document.getElementById(id).classList.remove('error');
  });
  ['err-name','err-whatsapp','err-email'].forEach(id => showError(id, ''));
}

/* -----------------------------------------------
   Passo 4 — Resumo (preenchido ao chegar no step)
----------------------------------------------- */
function fillSummaryStep4() {
  document.getElementById('sum-service').textContent = state.service?.name || '—';
  document.getElementById('sum-date').textContent    = formatDatePt(state.date);
  document.getElementById('sum-time').textContent    = state.time || '—';
  document.getElementById('sum-value').textContent   = formatCurrency(state.service?.price || 0);
}

/* -----------------------------------------------
   Passo 5 — Pagamento Pix
----------------------------------------------- */
async function loadPixConfig() {
  const cfg = await API.getConfig();
  state.pixConfig = {
    key:      cfg.chavePix      || '00.000.000/0001-00',
    receiver: cfg.nomeRecebedor || 'BarberCell Barbearia',
    phone:    cfg.telefoneBarbearia || '5511999999999',
  };
}

function fillSummaryStep5() {
  document.getElementById('pix-key').textContent      = state.pixConfig.key;
  document.getElementById('pix-receiver').textContent = state.pixConfig.receiver;
  document.getElementById('pix-amount').textContent   = formatCurrency(state.service?.price || 0);

  const qr = document.getElementById('pix-qr');
  if (qr) {
    const pixStr = encodeURIComponent(state.pixConfig.key);
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${pixStr}`;
    qr.classList.remove('hidden');
  }

  buildWhatsappLink();
}

function buildWhatsappLink() {
  const { name, whatsapp } = state.client;
  const service = state.service?.name || '';
  const date    = formatDatePt(state.date);
  const time    = state.time || '';

  const msg = encodeURIComponent(
    `Olá!\n\nRealizei o pagamento do agendamento.\n\n` +
    `Nome: ${name}\nServiço: ${service}\nData: ${date}\nHorário: ${time}\n\nSegue o comprovante.`
  );

  const phone = state.pixConfig.phone.replace(/\D/g, '');
  document.getElementById('whatsapp-btn').href = `https://wa.me/${phone}?text=${msg}`;
}

/* -----------------------------------------------
   Salvar agendamento
----------------------------------------------- */
async function submitBooking() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('hidden');

  try {
    const result = await API.createBooking({
      nome:         state.client.name,
      whatsapp:     state.client.whatsapp,
      email:        state.client.email,
      servico:      state.service.name,
      valor:        state.service.price,
      dataAgendada: state.date,
      horario:      state.time,
    });

    state.bookingId = result.id;
    fillSuccessScreen(result);
    goToStep(6);
  } catch (err) {
    showToast('Erro ao salvar agendamento. Tente novamente.', 'error');
    console.error(err);
  } finally {
    overlay.classList.add('hidden');
  }
}

function fillSuccessScreen(data) {
  document.getElementById('final-id').textContent      = data.id || '—';
  document.getElementById('final-name').textContent    = state.client.name;
  document.getElementById('final-service').textContent = state.service.name;
  document.getElementById('final-date').textContent    = formatDatePt(state.date);
  document.getElementById('final-time').textContent    = state.time;
}

/* -----------------------------------------------
   Navegação entre passos
----------------------------------------------- */
function goToStep(n) {
  document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${n}`)?.classList.add('active');

  document.querySelectorAll('.step[data-step]').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'completed');
    if (s < n)       dot.classList.add('completed');
    else if (s === n) dot.classList.add('active');
  });

  state.step = n;

  // Ações ao entrar em determinado step
  if (n === 4) fillSummaryStep4();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Expõe globalmente para uso em onclick inline do HTML
window.goToStep = goToStep;

/* -----------------------------------------------
   Utilidades
----------------------------------------------- */
function formatCurrency(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDatePt(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function showToast(msg, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); }, 3200);
}
