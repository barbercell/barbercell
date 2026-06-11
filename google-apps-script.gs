/**
 * BarberCell — Google Apps Script (Backend)
 *
 * INSTRUÇÕES DE CONFIGURAÇÃO:
 * 1. Abra Google Sheets e crie uma nova planilha
 * 2. Vá em Extensões → Apps Script e cole este código
 * 3. Execute initSheet() uma vez para criar as abas e configurações iniciais
 * 4. Publique como Web App:
 *    - Executar como: "Eu"
 *    - Acesso: "Qualquer pessoa"
 * 5. Copie a URL e cole em js/api.js (CONFIG.GAS_URL)
 *
 * CONFIGURAÇÕES (editar na aba "Configurações" da planilha):
 *   telefoneBarbearia → número do admin (somente dígitos, com DDI: 5511999999999)
 *   senhaAdmin        → senha para acessar o painel
 *   chavePix          → chave Pix para recebimento
 *   nomeRecebedor     → nome exibido no pagamento Pix
 */

const SHEET_NAME_BOOKINGS = 'Agendamentos';
const SHEET_NAME_CONFIG   = 'Configurações';
const SHEET_NAME_CLIENTS  = 'Cadastros';

const CLIENT_HEADERS = ['Telefone','Nome','DataCadastro'];

// Horários por dia da semana (0=dom, 1=seg fechado, 2=ter ... 6=sáb)
const SLOTS_BY_DOW = {
  0: ['10:00','11:00','12:00','13:00','14:00'],
  2: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],
  3: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],
  4: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],
  5: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],
  6: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],
};

const BOOKING_HEADERS = [
  'ID','DataCadastro','Nome','Whatsapp','Email',
  'Servico','Valor','DataAgendada','Horario','Status'
];

/* -----------------------------------------------
   INICIALIZAR PLANILHA (executar manualmente 1x)
----------------------------------------------- */
function initSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Aba Agendamentos
  let bs = ss.getSheetByName(SHEET_NAME_BOOKINGS);
  if (!bs) {
    bs = ss.insertSheet(SHEET_NAME_BOOKINGS);
    bs.appendRow(BOOKING_HEADERS);
    bs.getRange(1,1,1,BOOKING_HEADERS.length)
      .setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#C9A84C');
    bs.setFrozenRows(1);
  }

  // Aba Configurações
  let cs = ss.getSheetByName(SHEET_NAME_CONFIG);
  if (!cs) {
    cs = ss.insertSheet(SHEET_NAME_CONFIG);
    cs.appendRow(['Chave','Valor']);
    cs.appendRow(['telefoneBarbearia', '5521985900023']); // número da barbearia
    cs.appendRow(['senhaAdmin',        'barber2024']);     // ← defina sua senha aqui
    cs.appendRow(['chavePix',          '00.000.000/0001-00']);
    cs.appendRow(['nomeRecebedor',     'BarberCell Barbearia']);
    cs.getRange(1,1,1,2)
      .setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#C9A84C');
    cs.setFrozenRows(1);
  }

  // Aba Cadastros
  let cls = ss.getSheetByName(SHEET_NAME_CLIENTS);
  if (!cls) {
    cls = ss.insertSheet(SHEET_NAME_CLIENTS);
    cls.appendRow(CLIENT_HEADERS);
    cls.getRange(1,1,1,CLIENT_HEADERS.length)
      .setFontWeight('bold').setBackground('#0d1c32').setFontColor('#5B9BD5');
    cls.setFrozenRows(1);
  }

  return 'Planilha inicializada com sucesso!';
}

/* -----------------------------------------------
   ROTEADOR GET (ping / fallback)
----------------------------------------------- */
function doGet(e) {
  // Redireciona GET para o mesmo handler do POST
  // (GET é usado apenas como fallback — produção usa POST)
  const p = e.parameter || {};
  return routeAction(p.action || '', p);
}

/* -----------------------------------------------
   ROTEADOR POST — todas as chamadas vêm aqui
   (POST com Content-Type: text/plain não dispara
    CORS preflight no browser)
----------------------------------------------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch { return jsonRes({ success: false, message: 'JSON inválido.' }); }
  return routeAction(body.action || '', body);
}

/* -----------------------------------------------
   ROTEADOR UNIFICADO
----------------------------------------------- */
function routeAction(action, p) {
  try {
    switch (action.trim()) {
      case 'checkPhone':    return jsonRes(checkPhone(p.phone));
      case 'getConfig':     return jsonRes(getConfig());
      case 'getSlots':      return jsonRes(getSlots(p.date));
      case 'consultar':     return jsonRes(consultarAgendamento(p.query));
      case 'listBookings':  return jsonRes(listBookings(p.password));
      case 'adminLogin':    return jsonRes(adminLogin(p));
      case 'registerClient':return jsonRes(registerClient(p));
      case 'createBooking': return jsonRes(createBooking(p));
      case 'updateStatus':  return jsonRes(updateStatus(p));
      default:              return jsonRes({ success: false, message: 'Ação desconhecida.' });
    }
  } catch (err) {
    return jsonRes({ success: false, message: err.toString() });
  }
}

/* -----------------------------------------------
   ACTIONS
----------------------------------------------- */

/**
 * Verifica o tipo do número:
 *   - type: 'admin'             → telefone da barbearia
 *   - type: 'returning', nome   → cliente já cadastrado
 *   - type: 'new'               → número não encontrado
 */
function checkPhone(phone) {
  if (!phone) return { success: false, message: 'Telefone não informado.' };

  const cfg        = getConfigObj();
  const adminPhone = (cfg.telefoneBarbearia || '').replace(/\D/g, '');
  const inputPhone = phone.replace(/\D/g, '');

  // Verifica admin
  if (adminPhone && inputPhone === adminPhone) {
    return { success: true, data: { type: 'admin' } };
  }

  // Verifica cadastro
  const sheet = getSheet(SHEET_NAME_CLIENTS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowPhone = String(data[i][0] || '').replace(/\D/g, '');
    if (rowPhone === inputPhone) {
      return { success: true, data: { type: 'returning', nome: data[i][1] } };
    }
  }

  return { success: true, data: { type: 'new' } };
}

/** Registra novo cliente */
function registerClient(body) {
  const phone = (body.phone || '').replace(/\D/g, '');
  const nome  = (body.nome  || '').trim();

  if (!phone || !nome) return { success: false, message: 'Telefone e nome são obrigatórios.' };

  const sheet = getSheet(SHEET_NAME_CLIENTS);
  sheet.appendRow([phone, nome, new Date().toISOString()]);

  return { success: true, data: { phone, nome } };
}

/**
 * Valida o login do admin (telefone + senha).
 */
function adminLogin(body) {
  const cfg        = getConfigObj();
  const adminPhone = (cfg.telefoneBarbearia || '').replace(/\D/g, '');
  const senhaAdmin = (cfg.senhaAdmin        || '').trim();
  const inputPhone = (body.phone    || '').replace(/\D/g, '');
  const inputPwd   = (body.password || '').trim();

  if (!adminPhone || !senhaAdmin) {
    return { success: false, message: 'Configuração de admin incompleta na planilha.' };
  }

  if (inputPhone !== adminPhone) {
    return { success: false, message: 'Telefone não autorizado.' };
  }

  if (inputPwd !== senhaAdmin) {
    return { success: false, message: 'Senha incorreta.' };
  }

  return { success: true };
}

/** Retorna configurações públicas (sem senhaAdmin) */
function getConfig() {
  const cfg  = getConfigObj();
  const safe = { ...cfg };
  delete safe.senhaAdmin;
  return { success: true, data: safe };
}

/** Retorna horários disponíveis para uma data */
function getSlots(date) {
  if (!date) return { success: false, message: 'Data não informada.' };

  // Determina o dia da semana (0=dom … 6=sáb) a partir da data YYYY-MM-DD
  const parts  = date.split('-');
  const dow    = new Date(
    parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])
  ).getDay();

  const allSlots = SLOTS_BY_DOW[dow];
  if (!allSlots || allSlots.length === 0) {
    return { success: true, data: [] }; // fechado neste dia
  }

  const sheet    = getSheet(SHEET_NAME_BOOKINGS);
  const data     = sheet.getDataRange().getValues();
  const occupied = new Set();

  for (let i = 1; i < data.length; i++) {
    const row    = rowToObj(data[i]);
    const rowDt  = normalizeDate(row.DataAgendada);
    const status = (row.Status || '').toUpperCase();
    if (rowDt === date && status !== 'REJEITADO' && status !== 'CANCELADO') {
      occupied.add(row.Horario);
    }
  }

  return { success: true, data: allSlots.filter(s => !occupied.has(s)) };
}

/** Cria novo agendamento */
function createBooking(body) {
  const sheet = getSheet(SHEET_NAME_BOOKINGS);
  const id    = generateId(sheet);
  const now   = new Date().toISOString();

  sheet.appendRow([
    id, now,
    body.nome         || '',
    body.whatsapp     || '',
    body.email        || '',
    body.servico      || '',
    body.valor        || '',
    body.dataAgendada || '',
    body.horario      || '',
    'AGUARDANDO CONFIRMAÇÃO'
  ]);

  return {
    success: true,
    data: {
      id,
      nome:         body.nome,
      servico:      body.servico,
      dataAgendada: body.dataAgendada,
      horario:      body.horario,
      status:       'AGUARDANDO CONFIRMAÇÃO'
    }
  };
}

/** Consulta agendamento por WhatsApp ou ID */
function consultarAgendamento(query) {
  if (!query) return { success: false, message: 'Informe o WhatsApp ou código.' };

  const sheet   = getSheet(SHEET_NAME_BOOKINGS);
  const data    = sheet.getDataRange().getValues();
  const q       = query.replace(/\D/g, '') || '';
  const qUpper  = query.toUpperCase();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = rowToObj(data[i]);
    const wa  = (row.Whatsapp || '').replace(/\D/g, '');
    const id  = (row.ID || '').toUpperCase();
    if ((q && wa === q) || id === qUpper) {
      results.push({
        id:           row.ID,
        nome:         row.Nome,
        whatsapp:     row.Whatsapp,
        servico:      row.Servico,
        valor:        row.Valor,
        dataAgendada: normalizeDate(row.DataAgendada),
        horario:      row.Horario,
        status:       row.Status,
      });
    }
  }

  if (!results.length) return { success: false, message: 'Nenhum agendamento encontrado.' };
  return { success: true, data: results };
}

/** Lista todos os agendamentos (admin) */
function listBookings(password) {
  const cfg = getConfigObj();
  if (password !== (cfg.senhaAdmin || '').trim()) {
    return { success: false, message: 'Senha incorreta.' };
  }

  const sheet  = getSheet(SHEET_NAME_BOOKINGS);
  const data   = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const row = rowToObj(data[i]);
    if (!row.ID) continue;
    result.push({
      id:           row.ID,
      dataCadastro: row.DataCadastro,
      nome:         row.Nome,
      whatsapp:     row.Whatsapp,
      email:        row.Email,
      servico:      row.Servico,
      valor:        row.Valor,
      dataAgendada: normalizeDate(row.DataAgendada),
      horario:      row.Horario,
      status:       row.Status,
    });
  }

  result.sort((a, b) => {
    const da = new Date(a.dataAgendada || '1970-01-01');
    const db = new Date(b.dataAgendada || '1970-01-01');
    return db - da;
  });

  return { success: true, data: result };
}

/** Atualiza status de um agendamento */
function updateStatus(body) {
  const cfg = getConfigObj();
  if ((body.password || '') !== (cfg.senhaAdmin || '').trim()) {
    return { success: false, message: 'Senha incorreta.' };
  }

  const { id, status } = body;
  if (!id || !status) return { success: false, message: 'ID e status são obrigatórios.' };

  const allowed = ['CONFIRMADO','REJEITADO','CANCELADO','CONCLUÍDO'];
  if (!allowed.includes(status)) return { success: false, message: 'Status inválido.' };

  const sheet     = getSheet(SHEET_NAME_BOOKINGS);
  const data      = sheet.getDataRange().getValues();
  const statusCol = BOOKING_HEADERS.indexOf('Status') + 1;
  const idCol     = BOOKING_HEADERS.indexOf('ID') + 1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol - 1]) === String(id)) {
      sheet.getRange(i + 1, statusCol).setValue(status);
      return { success: true, data: { id, status } };
    }
  }

  return { success: false, message: 'Agendamento não encontrado.' };
}

/* -----------------------------------------------
   HELPERS
----------------------------------------------- */

function getConfigObj() {
  const sheet = getSheet(SHEET_NAME_CONFIG);
  const data  = sheet.getDataRange().getValues();
  const cfg   = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) cfg[data[i][0]] = String(data[i][1] || '');
  }
  return cfg;
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Aba "${name}" não encontrada. Execute initSheet() primeiro.`);
  return sheet;
}

function rowToObj(row) {
  const obj = {};
  BOOKING_HEADERS.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function generateId(sheet) {
  return 'AGD-' + String(sheet.getLastRow()).padStart(4, '0');
}

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function jsonRes(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
