/**
 * admin.js — Lógica do painel administrativo
 *
 * A autenticação ocorre no index.html.
 * A senha é lida do sessionStorage ('adminPwd').
 */

let allBookings = [];
let currentFilter = 'all';
let pendingAction = null;

/* -----------------------------------------------
   Verificar autenticação ao carregar
----------------------------------------------- */
(function checkAuth() {
  const auth = sessionStorage.getItem('adminAuth');
  if (auth !== 'true') {
    // Não autenticado — redireciona para a home
    window.location.href = 'index.html';
  }
})();

/* -----------------------------------------------
   Logout
----------------------------------------------- */
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('adminAuth');
  sessionStorage.removeItem('adminPwd');
  sessionStorage.removeItem('adminPhone');
  window.location.href = 'index.html';
});

/* -----------------------------------------------
   Carregar agendamentos
----------------------------------------------- */
async function loadBookings() {
  showLoading(true);
  try {
    const pwd = sessionStorage.getItem('adminPwd') || '';
    allBookings = await API.listBookings(pwd);
    renderStats();
    renderTable(currentFilter);
  } catch (err) {
    showToastAdmin('Erro ao carregar agendamentos.', 'error');
  } finally {
    showLoading(false);
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadBookings);

// Carrega ao abrir
loadBookings();

/* -----------------------------------------------
   Stats
----------------------------------------------- */
function renderStats() {
  const counts = { pending: 0, confirmed: 0, done: 0, cancelled: 0 };
  allBookings.forEach(b => {
    if (b.status === 'AGUARDANDO CONFIRMAÇÃO') counts.pending++;
    else if (b.status === 'CONFIRMADO')        counts.confirmed++;
    else if (b.status === 'CONCLUÍDO')         counts.done++;
    else if (b.status === 'CANCELADO' || b.status === 'REJEITADO') counts.cancelled++;
  });
  document.getElementById('stat-pending').textContent   = counts.pending;
  document.getElementById('stat-confirmed').textContent = counts.confirmed;
  document.getElementById('stat-done').textContent      = counts.done;
  document.getElementById('stat-cancelled').textContent = counts.cancelled;
}

/* -----------------------------------------------
   Filtros
----------------------------------------------- */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable(currentFilter);
  });
});

/* -----------------------------------------------
   Tabela
----------------------------------------------- */
function renderTable(filter) {
  const tbody = document.getElementById('bookings-tbody');
  const list  = filter === 'all'
    ? allBookings
    : allBookings.filter(b => b.status === filter);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Nenhum agendamento encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(b => `
    <tr data-id="${b.id}">
      <td>${b.id}</td>
      <td>${b.nome}</td>
      <td>
        <a href="https://wa.me/${b.whatsapp.replace(/\D/g,'')}" target="_blank"
           style="color:var(--pix-green)">${b.whatsapp}</a>
      </td>
      <td>${b.servico}</td>
      <td>${formatDate(b.dataAgendada)}</td>
      <td>${b.horario}</td>
      <td>${formatCurrency(parseFloat(b.valor || 0))}</td>
      <td><span class="status-badge ${statusClass(b.status)}">${b.status}</span></td>
      <td>
        <div class="action-btns">
          ${actionButtons(b)}
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.closest('tr').dataset.id;
      const status = btn.dataset.status;
      confirmAction(id, status);
    });
  });
}

function actionButtons(b) {
  const s = b.status;
  const btns = [];
  if (s === 'AGUARDANDO CONFIRMAÇÃO') {
    btns.push(`<button class="action-btn confirm" data-status="CONFIRMADO">✅ Confirmar</button>`);
    btns.push(`<button class="action-btn reject"  data-status="REJEITADO">❌ Rejeitar</button>`);
  }
  if (s === 'CONFIRMADO') {
    btns.push(`<button class="action-btn done"   data-status="CONCLUÍDO">✔ Concluir</button>`);
    btns.push(`<button class="action-btn cancel" data-status="CANCELADO">🗑 Cancelar</button>`);
  }
  return btns.join('');
}

/* -----------------------------------------------
   Modal de confirmação
----------------------------------------------- */
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
    `Deseja realmente alterar o status deste agendamento para "${status}"?`;
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
    showToastAdmin('Status atualizado com sucesso!', 'success');
  } catch {
    showToastAdmin('Erro ao atualizar status.', 'error');
  } finally {
    showLoading(false);
  }
});

/* -----------------------------------------------
   Utilidades
----------------------------------------------- */
function showLoading(visible) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !visible);
}

function statusClass(status) {
  const map = {
    'AGUARDANDO CONFIRMAÇÃO': 'pending',
    'CONFIRMADO': 'confirmed',
    'REJEITADO':  'rejected',
    'CANCELADO':  'cancelled',
    'CONCLUÍDO':  'done',
  };
  return map[status] || 'pending';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(val) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showToastAdmin(msg, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3200);
}
