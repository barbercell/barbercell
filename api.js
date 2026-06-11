/**
 * api.js — Comunicação com o Google Apps Script
 *
 * CONFIGURE: substitua GAS_URL pela URL do seu Web App publicado.
 */

const CONFIG = {
  // URL do Google Apps Script (Web App) — preencher após publicar
  GAS_URL: 'https://script.google.com/macros/s/AKfycbweLfAzT8rk_6pOJpe3bRoIOv_Uae5OwCzTOk1ZT0g60H6zK_JT0pJ_Edaf2nVwt314/exec',

  // Horários por dia da semana (0=dom, 1=seg ... 6=sáb)
  // Segunda (1) = fechado → não aparece no calendário (BLOCKED_WEEKDAYS)
  SLOTS_BY_DOW: {
    0: ['10:00','11:00','12:00','13:00','14:00'],                              // domingo
    2: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],              // terça
    3: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],              // quarta
    4: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],              // quinta
    5: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],              // sexta
    6: ['15:00','16:00','17:00','18:00','19:00','20:00','21:00'],              // sábado
  },

  // Serviços oferecidos
  SERVICES: [
    { id: 1, name: 'Corte Masculino',  price: 35.00, duration: '30 min' },
    { id: 2, name: 'Barba',            price: 25.00, duration: '20 min' },
    { id: 3, name: 'Corte + Barba',    price: 55.00, duration: '50 min' },
    { id: 4, name: 'Sobrancelha',      price: 15.00, duration: '15 min' },
    { id: 5, name: 'Hidratação',       price: 30.00, duration: '25 min' },
    { id: 6, name: 'Relaxamento',      price: 45.00, duration: '40 min' },
  ],

  // Dias bloqueados (formato YYYY-MM-DD)
  BLOCKED_DATES: [],

  // Segunda-feira (1) = fechado
  BLOCKED_WEEKDAYS: [1],
};

/* -----------------------------------------------
   Camada de API
----------------------------------------------- */
const API = {

  /**
   * Verifica o tipo do número:
   * - { type: 'admin' }               → telefone do admin
   * - { type: 'returning', nome }     → cliente já cadastrado
   * - { type: 'new' }                 → número não cadastrado
   */
  async checkPhone(phone) {
    const res = await this._get({ action: 'checkPhone', phone });
    return res.data || { type: 'new' };
  },

  /**
   * Registra novo cliente (telefone + nome).
   */
  async registerClient(phone, nome) {
    const res = await this._post({ action: 'registerClient', phone, nome });
    if (!res.success) throw new Error(res.message || 'Erro ao cadastrar');
    return res.data;
  },

  /**
   * Valida login do admin (telefone + senha).
   */
  async adminLogin(phone, password) {
    const res = await this._post({ action: 'adminLogin', phone, password });
    return res;
  },

  /** Retorna configurações (chave pix, etc.) */
  async getConfig() {
    try {
      const res = await this._get({ action: 'getConfig' });
      return res.data || {};
    } catch {
      return {};
    }
  },

  /** Retorna horários disponíveis para uma data */
  async getAvailableSlots(date) {
    const dow     = new Date(date + 'T12:00:00').getDay();
    const fallback = CONFIG.SLOTS_BY_DOW[dow] || [];
    try {
      const res = await this._get({ action: 'getSlots', date });
      return res.data || fallback;
    } catch {
      return fallback;
    }
  },

  /** Cria um novo agendamento */
  async createBooking(payload) {
    const res = await this._post({ action: 'createBooking', ...payload });
    if (!res.success) throw new Error(res.message || 'Erro ao criar agendamento');
    return res.data;
  },

  /** Consulta agendamentos por WhatsApp ou ID */
  async consultarAgendamento(query) {
    const res = await this._get({ action: 'consultar', query });
    if (!res.success) throw new Error(res.message || 'Nenhum resultado');
    return res.data;
  },

  /** Lista todos os agendamentos (admin) */
  async listBookings(password) {
    const res = await this._get({ action: 'listBookings', password });
    if (!res.success) throw new Error(res.message || 'Acesso negado');
    return res.data || [];
  },

  /** Atualiza o status de um agendamento (admin) */
  async updateStatus(id, status, password) {
    const res = await this._post({ action: 'updateStatus', id, status, password });
    if (!res.success) throw new Error(res.message || 'Erro ao atualizar');
    return res.data;
  },

  /* --- helper interno: JSONP (sem restrição de CORS, funciona de qualquer origin) --- */

  _jsonp(params) {
    return new Promise((resolve, reject) => {
      const cbName = '_gcb' + Date.now() + Math.random().toString(36).slice(2, 6);
      const script = document.createElement('script');
      const timer  = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };

      const url = new URL(CONFIG.GAS_URL);
      url.searchParams.set('callback', cbName);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });

      script.src = url.toString();
      script.onerror = () => { cleanup(); reject(new Error('Erro de rede')); };
      document.head.appendChild(script);
    });
  },

  async _post(body)  { return this._jsonp(body); },
  async _get(params) { return this._jsonp(params); },
};
