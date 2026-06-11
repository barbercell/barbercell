/**
 * assistencia-admin.js — Painel da Ana (Assistência Técnica)
 */

let allRepairs    = [];
let currentFilter = 'all';
let pendingAction = null;

(function checkAuth() {
  const ok = sessionStorage.getItem('adminAuth') === 'true'
          && sessionStorage.getItem('adminType')  === 'ana';
  if (!ok) window.location.href = 'index.html';
})();

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
  });
});

/* ----- Carregar reparos ----- */
async function loadRepairs() {
  showLoading(true);
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    allRepairs = await API.listRepairs(pwd);
    renderStats();
    renderRepairs(currentFilter);
  } catch {
    showToastAt('Erro ao carregar reparos.', 'error');
  } finally {
    showLoading(false);
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadRepairs);
loadRepairs();

/* ----- Filtro de status ----- */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderRepairs(currentFilter);
  });
});

/* ----- Stats ----- */
function renderStats() {
  const c = { pending: 0, progress: 0, done: 0, cancelled: 0 };
  allRepairs.forEach(r => {
    if      (r.status === 'AGUARDANDO')    c.pending++;
    else if (r.status === 'EM ANDAMENTO')  c.progress++;
    else if (r.status === 'CONCLUÍDO')     c.done++;
    else if (r.status === 'CANCELADO')     c.cancelled++;
  });
  document.getElementById('stat-pending').textContent  = c.pending;
  document.getElementById('stat-progress').textContent = c.progress;
  document.getElementById('stat-done').textContent     = c.done;
  document.getElementById('stat-cancelled').textContent= c.cancelled;
}

/* ----- Cards de reparo ----- */
function renderRepairs(filter) {
  const container = document.getElementById('repairs-list');
  const list = filter === 'all' ? allRepairs : allRepairs.filter(r => r.status === filter);

  if (!list.length) {
    container.innerHTML = '<p class="bookings-empty">Nenhum reparo encontrado.</p>';
    return;
  }

  container.innerHTML = list.map(r => {
    const wa   = (r.whatsapp || '').replace(/\D/g, '');
    const val  = r.valor ? formatCurrency(parseFloat(r.valor)) : '—';
    const btns = repairButtons(r);
    const sc   = repairStatusClass(r.status);
    return `
      <div class="booking-card" data-id="${r.id}">
        <div class="bc-header">
          <div>
            <div class="bc-name">${r.nome}</div>
            <div class="bc-id">${r.id}</div>
          </div>
          <span class="status-badge ${sc}">${r.status}</span>
        </div>
        <div class="bc-service">📱 ${r.dispositivo || '—'}</div>
        <div class="bc-meta" style="flex-direction:column;align-items:flex-start;gap:4px">
          <span style="color:var(--text-secondary);font-size:.8rem">${r.problema || '—'}</span>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:4px">
            <span class="bc-meta-item">📅 ${formatDate(r.dataCadastro)}</span>
            <span class="bc-meta-item">💰 ${val}</span>
            <a href="https://wa.me/${wa}" target="_blank" class="bc-meta-item" style="color:var(--pix-green)">📲 ${r.whatsapp}</a>
          </div>
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

function repairButtons(r) {
  const out = [];
  if (r.status === 'AGUARDANDO') {
    out.push(`<button class="action-btn confirm" data-status="EM ANDAMENTO">🔧 Iniciar</button>`);
    out.push(`<button class="action-btn reject"  data-status="CANCELADO">❌ Cancelar</button>`);
  }
  if (r.status === 'EM ANDAMENTO') {
    out.push(`<button class="action-btn done"   data-status="CONCLUÍDO">✅ Concluir</button>`);
    out.push(`<button class="action-btn cancel" data-status="CANCELADO">🗑 Cancelar</button>`);
  }
  return out.join('');
}

function repairStatusClass(status) {
  const map = {
    'AGUARDANDO':   'pending',
    'EM ANDAMENTO': 'confirmed',
    'CONCLUÍDO':    'done',
    'CANCELADO':    'cancelled',
  };
  return map[status] || 'pending';
}

/* ----- Financeiro ----- */
function renderFinancial() {
  function sum(statusList) {
    return allRepairs.filter(r => statusList.includes(r.status)).reduce((s, r) => s + parseFloat(r.valor || 0), 0);
  }
  function count(statusList) {
    return allRepairs.filter(r => statusList.includes(r.status)).length;
  }
  document.getElementById('fin-receita').textContent           = formatCurrency(sum(['CONCLUÍDO']));
  document.getElementById('fin-receita-count').textContent     = count(['CONCLUÍDO']) + ' reparos';
  document.getElementById('fin-andamento').textContent         = formatCurrency(sum(['EM ANDAMENTO']));
  document.getElementById('fin-andamento-count').textContent   = count(['EM ANDAMENTO']) + ' reparos';
  document.getElementById('fin-pendentes').textContent         = formatCurrency(sum(['AGUARDANDO']));
  document.getElementById('fin-pendentes-count').textContent   = count(['AGUARDANDO']) + ' reparos';
  document.getElementById('fin-cancelados').textContent        = formatCurrency(sum(['CANCELADO']));
  document.getElementById('fin-cancelados-count').textContent  = count(['CANCELADO']) + ' reparos';
}

/* ----- Modal ----- */
function confirmAction(id, status) {
  pendingAction = { id, status };
  const labels = {
    'EM ANDAMENTO': 'Iniciar reparo',
    'CONCLUÍDO':    'Marcar como concluído',
    'CANCELADO':    'Cancelar reparo',
  };
  document.getElementById('modal-title').textContent = labels[status] || 'Confirmar';
  document.getElementById('modal-body').textContent  = `Alterar reparo para "${status}"?`;
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
    await API.updateRepairStatus(id, status, pwd);
    await loadRepairs();
    showToastAt('Status atualizado!', 'success');
  } catch {
    showToastAt('Erro ao atualizar.', 'error');
  } finally {
    showLoading(false);
  }
});

/* ----- Helpers ----- */
function showLoading(v) { document.getElementById('loading-overlay').classList.toggle('hidden', !v); }

function formatDate(val) {
  if (!val) return '—';
  const s = String(val);
  if (s.includes('T')) { const d = new Date(s); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
  const [y, m, d] = s.split('-');
  return d && m ? `${d}/${m}/${y}` : s;
}

function formatCurrency(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showToastAt(msg, type = '') {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = `toast ${type}`;
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => t.classList.remove('show'), 3200);
}
