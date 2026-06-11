/**
 * admin.js — Painel administrativo
 */

let allBookings   = [];
let currentFilter = 'all';
let currentPeriod = 'futuro'; // padrão: hoje + próximos
let pendingAction = null;

/* ----- Auth check ----- */
(function checkAuth() {
  const ok = sessionStorage.getItem('adminAuth') === 'true'
          && sessionStorage.getItem('adminType')  === 'dammy';
  if (!ok) window.location.href = 'index.html';
})();

/* ----- Logout ----- */
document.getElementById('logout-btn').addEventListener('click', () => {
  ['adminAuth','adminPwd','adminPhone','adminType'].forEach(k => sessionStorage.removeItem(k));
  window.location.href = 'index.html';
});

/* ----- Abas ----- */
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'financeiro') renderFinancial();
    if (tab.dataset.tab === 'servicos')   loadAdminServices();
  });
});

/* ----- Período (agendamentos) ----- */
document.getElementById('period-select').addEventListener('change', function () {
  currentPeriod = this.value;
  renderStats();
  renderTable(currentFilter);
});

/* ----- Período (financeiro) ----- */
document.getElementById('fin-period-select').addEventListener('change', renderFinancial);

/* ----- Carregar ----- */
async function loadBookings() {
  showLoading(true);
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    allBookings = await API.listBookings(pwd);
    renderStats();
    renderTable(currentFilter);
  } catch {
    showToastAdmin('Erro ao carregar agendamentos.', 'error');
  } finally {
    showLoading(false);
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadBookings);
loadBookings();

/* ----- Filtro de período ----- */
function filterByPeriod(bookings, period) {
  const today = todayStr();
  const [ty, tm, td] = today.split('-').map(Number);

  return bookings.filter(b => {
    const d = b.dataAgendada || '';
    if (!d) return false;
    const [by, bm, bd] = d.split('-').map(Number);

    if (period === 'futuro') return d >= today;
    if (period === 'hoje')   return d === today;
    if (period === 'antigos') return d < today;

    if (period === 'semana') {
      const now   = new Date(ty, tm - 1, td);
      const dow   = now.getDay();
      const mon   = new Date(ty, tm - 1, td - dow + 1);
      const sun   = new Date(ty, tm - 1, td - dow + 7);
      const bDate = new Date(by, bm - 1, bd);
      return bDate >= mon && bDate <= sun;
    }
    if (period === 'mes') return by === ty && bm === tm;
    if (period === 'total') return true;
    return true;
  });
}

/* ----- Stats ----- */
function renderStats() {
  const visible = filterByPeriod(allBookings, currentPeriod);
  const counts  = { pending: 0, confirmed: 0, done: 0, cancelled: 0 };
  visible.forEach(b => {
    if      (b.status === 'AGUARDANDO CONFIRMAÇÃO')                 counts.pending++;
    else if (b.status === 'CONFIRMADO')                              counts.confirmed++;
    else if (b.status === 'CONCLUÍDO')                               counts.done++;
    else if (b.status === 'CANCELADO' || b.status === 'REJEITADO')  counts.cancelled++;
  });
  document.getElementById('stat-pending').textContent   = counts.pending;
  document.getElementById('stat-confirmed').textContent = counts.confirmed;
  document.getElementById('stat-done').textContent      = counts.done;
  document.getElementById('stat-cancelled').textContent = counts.cancelled;
}

/* ----- Filtros de status ----- */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable(currentFilter);
  });
});

/* ----- Cards de agendamentos ----- */
function renderTable(filter) {
  const container = document.getElementById('bookings-list');
  const inPeriod  = filterByPeriod(allBookings, currentPeriod);
  const list      = filter === 'all' ? inPeriod : inPeriod.filter(b => b.status === filter);

  if (list.length === 0) {
    container.innerHTML = '<p class="bookings-empty">Nenhum agendamento encontrado.</p>';
    return;
  }

  container.innerHTML = list.map(b => {
    const wa    = (b.whatsapp || '').replace(/\D/g, '');
    const valor = formatCurrency(parseFloat(b.valor || 0));
    const btns  = actionButtons(b);
    return `
      <div class="booking-card" data-id="${b.id}">
        <div class="bc-header">
          <div>
            <div class="bc-name">${b.nome}</div>
            <div class="bc-id">${b.id}</div>
          </div>
          <span class="status-badge ${statusClass(b.status)}">${statusShort(b.status)}</span>
        </div>
        <div class="bc-service">✂️ ${b.servico}</div>
        <div class="bc-meta">
          <span class="bc-meta-item">📅 ${formatDate(b.dataAgendada)}</span>
          <span class="bc-meta-item">⏰ ${b.horario}</span>
          <span class="bc-meta-item">💰 ${valor}</span>
          <a href="https://wa.me/${wa}" target="_blank" class="bc-meta-item" style="color:var(--pix-green)">📲 ${b.whatsapp}</a>
        </div>
        ${btns ? `<div class="bc-actions action-btns">${btns}</div>` : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction(btn.closest('.booking-card').dataset.id, btn.dataset.status);
    });
  });
}

function statusShort(status) {
  const map = {
    'AGUARDANDO CONFIRMAÇÃO': 'AGUARDANDO',
    'CONFIRMADO':  'CONFIRMADO',
    'CONCLUÍDO':   'CONCLUÍDO',
    'REJEITADO':   'REJEITADO',
    'CANCELADO':   'CANCELADO',
  };
  return map[status] || status;
}

function actionButtons(b) {
  const s = b.status;
  const out = [];
  if (s === 'AGUARDANDO CONFIRMAÇÃO') {
    out.push(`<button class="action-btn confirm" data-status="CONFIRMADO">✅ Confirmar</button>`);
    out.push(`<button class="action-btn reject"  data-status="REJEITADO">❌ Rejeitar</button>`);
  }
  if (s === 'CONFIRMADO') {
    out.push(`<button class="action-btn done"   data-status="CONCLUÍDO">✔ Concluir</button>`);
    out.push(`<button class="action-btn cancel" data-status="CANCELADO">🗑 Cancelar</button>`);
  }
  return out.join('');
}

/* ----- Financeiro ----- */
function renderFinancial() {
  const period   = document.getElementById('fin-period-select').value;
  const inPeriod = filterByPeriod(allBookings, period);

  function sumGroup(statusList) {
    return inPeriod.filter(b => statusList.includes(b.status)).reduce((s, b) => s + parseFloat(b.valor || 0), 0);
  }
  function countGroup(statusList) {
    return inPeriod.filter(b => statusList.includes(b.status)).length;
  }

  const receita     = sumGroup(['CONCLUÍDO']);
  const confirmados = sumGroup(['CONFIRMADO']);
  const pendentes   = sumGroup(['AGUARDANDO CONFIRMAÇÃO']);
  const cancelados  = sumGroup(['CANCELADO', 'REJEITADO']);

  document.getElementById('fin-receita').textContent          = formatCurrency(receita);
  document.getElementById('fin-receita-count').textContent    = countGroup(['CONCLUÍDO']) + ' atendimentos';
  document.getElementById('fin-confirmados').textContent      = formatCurrency(confirmados);
  document.getElementById('fin-confirmados-count').textContent= countGroup(['CONFIRMADO']) + ' agendamentos';
  document.getElementById('fin-pendentes').textContent        = formatCurrency(pendentes);
  document.getElementById('fin-pendentes-count').textContent  = countGroup(['AGUARDANDO CONFIRMAÇÃO']) + ' agendamentos';
  document.getElementById('fin-cancelados').textContent       = formatCurrency(cancelados);
  document.getElementById('fin-cancelados-count').textContent = countGroup(['CANCELADO','REJEITADO']) + ' agendamentos';
}

/* ----- Modal ----- */
function confirmAction(id, status) {
  pendingAction = { id, status };
  const labels = {
    'CONFIRMADO': 'Confirmar agendamento',
    'REJEITADO':  'Rejeitar agendamento',
    'CANCELADO':  'Cancelar agendamento',
    'CONCLUÍDO':  'Marcar como concluído',
  };
  document.getElementById('modal-title').textContent = labels[status] || 'Confirmar';
  document.getElementById('modal-body').textContent  =
    `Deseja alterar este agendamento para "${status}"?`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  pendingAction = null;
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (!pendingAction) return;
  const { id, status } = pendingAction;
  pendingAction = null;
  showLoading(true);
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    await API.updateStatus(id, status, pwd);
    await loadBookings();
    showToastAdmin('Status atualizado!', 'success');
  } catch {
    showToastAdmin('Erro ao atualizar status.', 'error');
  } finally {
    showLoading(false);
  }
});

/* ===== SERVIÇOS ===== */

let adminServices = [];

async function loadAdminServices() {
  const container = document.getElementById('services-admin-list');
  container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:24px">Carregando...</p>';
  try {
    adminServices = await API.getServices();
    renderAdminServices();
  } catch {
    container.innerHTML = '<p style="color:var(--status-rejected);text-align:center;padding:24px">Erro ao carregar serviços.</p>';
  }
}

function renderAdminServices() {
  const container = document.getElementById('services-admin-list');
  if (!adminServices.length) {
    container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:24px">Nenhum serviço cadastrado.</p>';
    return;
  }
  container.innerHTML = adminServices.map(s => `
    <div class="svc-admin-card" data-id="${s.id}">
      <div class="svc-admin-info">
        <span class="svc-admin-name">${s.name}</span>
        <span class="svc-admin-meta">${s.duration} &nbsp;·&nbsp; ${formatCurrency(s.price)}</span>
      </div>
      <div class="svc-admin-actions">
        <button class="btn btn-sm btn-secondary svc-edit-btn" data-id="${s.id}">✎ Editar</button>
        <button class="btn btn-sm btn-danger   svc-del-btn"  data-id="${s.id}">🗑</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.svc-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAdminService(Number(btn.dataset.id)));
  });
  container.querySelectorAll('.svc-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditService(Number(btn.dataset.id)));
  });
}

function startEditService(id) {
  const s = adminServices.find(x => x.id === id);
  if (!s) return;
  const card = document.querySelector(`.svc-admin-card[data-id="${id}"]`);
  card.innerHTML = `
    <div class="svc-edit-row">
      <input class="svc-edit-name"     value="${s.name}"     placeholder="Nome" />
      <input class="svc-edit-price"    value="${s.price}"    placeholder="Preço" type="number" step="0.01" min="0" />
      <input class="svc-edit-duration" value="${s.duration}" placeholder="Duração" />
      <button class="btn btn-sm btn-primary svc-save-btn">✓ Salvar</button>
      <button class="btn btn-sm btn-outline svc-cancel-btn">✕</button>
    </div>
  `;
  card.querySelector('.svc-save-btn').addEventListener('click', () => saveEditService(id, card));
  card.querySelector('.svc-cancel-btn').addEventListener('click', () => renderAdminServices());
}

async function saveEditService(id, card) {
  const name     = card.querySelector('.svc-edit-name').value.trim();
  const price    = parseFloat(card.querySelector('.svc-edit-price').value);
  const duration = card.querySelector('.svc-edit-duration').value.trim();
  if (!name || isNaN(price)) { showToastAdmin('Preencha nome e preço.', 'error'); return; }
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    await API.updateService(id, name, price, duration, pwd);
    showToastAdmin('Serviço atualizado!', 'success');
    await loadAdminServices();
  } catch (err) {
    showToastAdmin(err.message || 'Erro ao atualizar.', 'error');
  }
}

async function deleteAdminService(id) {
  if (!confirm('Excluir este serviço?')) return;
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    await API.deleteService(id, pwd);
    showToastAdmin('Serviço removido.', 'success');
    await loadAdminServices();
  } catch (err) {
    showToastAdmin(err.message || 'Erro ao excluir.', 'error');
  }
}

document.getElementById('btn-show-svc-form').addEventListener('click', () => {
  document.getElementById('svc-form-card').classList.remove('hidden');
  document.getElementById('btn-show-svc-form').classList.add('hidden');
  document.getElementById('svc-name').focus();
});

document.getElementById('btn-cancel-svc-form').addEventListener('click', () => {
  document.getElementById('svc-form-card').classList.add('hidden');
  document.getElementById('btn-show-svc-form').classList.remove('hidden');
  document.getElementById('svc-name').value = '';
  document.getElementById('svc-price').value = '';
  document.getElementById('svc-duration').value = '';
  document.getElementById('err-svc').textContent = '';
});

document.getElementById('btn-add-service').addEventListener('click', async () => {
  const name     = document.getElementById('svc-name').value.trim();
  const price    = parseFloat(document.getElementById('svc-price').value);
  const duration = document.getElementById('svc-duration').value.trim();
  const errEl    = document.getElementById('err-svc');
  errEl.textContent = '';

  if (!name)      { errEl.textContent = 'Informe o nome.';  return; }
  if (isNaN(price) || price < 0) { errEl.textContent = 'Informe um preço válido.'; return; }

  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    await API.createService(name, price, duration || '', pwd);
    document.getElementById('svc-name').value = '';
    document.getElementById('svc-price').value = '';
    document.getElementById('svc-duration').value = '';
    showToastAdmin('Serviço adicionado!', 'success');
    await loadAdminServices();
  } catch (err) {
    errEl.textContent = err.message || 'Erro ao adicionar.';
  }
});

/* ----- Helpers ----- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const _MSGS_BARBER = [
  'Separando a gilete...', 'Ajustando o pezinho...', 'Trocando o pente...',
  'Afiando a navalha...', 'Preparando a espuma...', 'Checando o corte...',
  'Limpando a cadeira...', 'Regulando a máquina...'
];
let _loadingTimer = null;
function showLoading(visible) {
  const overlay = document.getElementById('loading-overlay');
  const msgEl   = document.getElementById('loading-msg');
  if (visible) {
    msgEl.textContent = _MSGS_BARBER[0];
    overlay.classList.remove('hidden');
    let i = 0;
    _loadingTimer = setInterval(() => {
      i = (i + 1) % _MSGS_BARBER.length;
      msgEl.textContent = _MSGS_BARBER[i];
    }, 1800);
  } else {
    clearInterval(_loadingTimer);
    overlay.classList.add('hidden');
  }
}

function statusClass(status) {
  const map = {
    'AGUARDANDO CONFIRMAÇÃO': 'pending',
    'CONFIRMADO':  'confirmed',
    'REJEITADO':   'rejected',
    'CANCELADO':   'cancelled',
    'CONCLUÍDO':   'done',
  };
  return map[status] || 'pending';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showToastAdmin(msg, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3200);
}
