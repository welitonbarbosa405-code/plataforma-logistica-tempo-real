import os
import sqlite3
from datetime import datetime
from flask import Flask, jsonify, request, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

SYNC_TOKEN = os.environ.get('RAILWAY_PORTARIA_TOKEN', 'kuhn-portaria-sync-2026')
DB_PATH    = os.environ.get('DB_PATH', 'portaria_motorista.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS entradas (
            id INTEGER PRIMARY KEY,
            nome TEXT, cpf TEXT, placa TEXT,
            transportadora TEXT, tipo TEXT, empresa TEXT,
            data_entrada TEXT, hora_entrada TEXT,
            status TEXT DEFAULT 'aguardando',
            doca TEXT,
            observacao_autorizacao TEXT,
            autorizado_por TEXT,
            autorizado_em TEXT,
            atualizado_em TEXT DEFAULT (datetime('now'))
        )
    ''')
    conn.commit()
    conn.close()


# ──────────────────────────────────────────
# SYNC — recebe dados do sistema local
# ──────────────────────────────────────────
@app.route('/api/sync/portaria', methods=['POST'])
def sync_portaria():
    if request.headers.get('X-Sync-Token', '') != SYNC_TOKEN:
        return jsonify({'error': 'Token inválido'}), 401
    data = request.get_json()
    if not data or not data.get('id'):
        return jsonify({'error': 'Dados inválidos'}), 400
    conn = get_db()
    conn.execute('''
        INSERT INTO entradas
            (id, nome, cpf, placa, transportadora, tipo, empresa,
             data_entrada, hora_entrada, status, doca,
             observacao_autorizacao, autorizado_por, autorizado_em, atualizado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            status=excluded.status,
            doca=excluded.doca,
            observacao_autorizacao=excluded.observacao_autorizacao,
            autorizado_por=excluded.autorizado_por,
            autorizado_em=excluded.autorizado_em,
            atualizado_em=datetime('now')
    ''', (
        data['id'], data.get('nome'), data.get('cpf'), data.get('placa'),
        data.get('transportadora'), data.get('tipo'), data.get('empresa'),
        data.get('data_entrada'), data.get('hora_entrada'),
        data.get('status', 'aguardando'), data.get('doca'),
        data.get('observacao_autorizacao'), data.get('autorizado_por'),
        data.get('autorizado_em')
    ))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Sincronizado com sucesso'}), 200


# ──────────────────────────────────────────
# API — status para o motorista
# ──────────────────────────────────────────
@app.route('/api/acesso/<int:ticket_id>')
def acesso_status(ticket_id):
    conn = get_db()
    row  = conn.execute('SELECT * FROM entradas WHERE id=?', (ticket_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Ticket não encontrado'}), 404
    return jsonify(dict(row)), 200


# ──────────────────────────────────────────
# PÁGINA DO MOTORISTA
# ──────────────────────────────────────────
@app.route('/acesso')
@app.route('/')
def acesso_page():
    return render_template_string(HTML_MOTORISTA)


HTML_MOTORISTA = '''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kuhn — Acompanhamento de Entrada</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: #0d0907;
    color: #f0ece8;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  header {
    width: 100%;
    background: linear-gradient(90deg, #CC0000, #990000);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header h1 { font-size: 1rem; font-weight: 700; letter-spacing: .03em; }
  header span { font-size: 0.78rem; opacity: .75; }
  .container { width: 100%; max-width: 480px; padding: 28px 20px; flex: 1; }

  /* ── TELA DE BUSCA ── */
  .search-card {
    background: #1e1210;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 32px 24px;
    text-align: center;
  }
  .search-card h2 { font-size: 1.2rem; margin-bottom: 8px; }
  .search-card p  { font-size: 0.85rem; color: rgba(255,255,255,0.45); margin-bottom: 24px; }
  .input-ticket {
    width: 100%;
    padding: 16px;
    background: #0d0907;
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #f0ece8;
    font-size: 1.8rem;
    font-weight: 700;
    text-align: center;
    letter-spacing: .1em;
    outline: none;
    transition: border-color .2s;
  }
  .input-ticket:focus { border-color: #CC0000; }
  .btn-buscar {
    width: 100%;
    margin-top: 16px;
    padding: 15px;
    background: #CC0000;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: background .2s;
  }
  .btn-buscar:hover { background: #990000; }
  .btn-buscar:disabled { background: rgba(204,0,0,0.4); cursor: not-allowed; }

  /* ── TELA DE STATUS ── */
  .status-card {
    background: #1e1210;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 28px 22px;
    display: none;
  }
  .ticket-num {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 4px;
  }
  .ticket-nome { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; }
  .status-badge-big {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 20px;
    border-radius: 12px;
    font-size: 1.4rem;
    font-weight: 800;
    margin-bottom: 22px;
    border: 2px solid;
  }
  .badge-aguardando { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.4); color: #f59e0b; }
  .badge-autorizado  { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.4); color: #10b981; }
  .badge-recusado    { background: rgba(204,0,0,0.1);    border-color: rgba(204,0,0,0.4);    color: #f87171; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .info-item label { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing:.05em; display:block; margin-bottom:3px; }
  .info-item span  { font-size: 0.95rem; font-weight: 600; }
  .detail-box {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .detail-box label { font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing:.05em; display:block; margin-bottom:6px; }
  .detail-box p { font-size: 0.95rem; font-weight: 600; }
  .doca-highlight {
    background: rgba(16,185,129,0.1);
    border-color: rgba(16,185,129,0.3);
    color: #10b981;
  }
  .doca-highlight p { font-size: 1.4rem; font-weight: 800; }
  .refresh-info { text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 16px; }
  .btn-voltar {
    width: 100%;
    margin-top: 14px;
    padding: 12px;
    background: transparent;
    color: rgba(255,255,255,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .error-msg { color: #f87171; font-size: 0.85rem; margin-top: 10px; text-align: center; }
  footer { padding: 16px; font-size: 0.7rem; color: rgba(255,255,255,0.2); text-align: center; }
</style>
</head>
<body>
<header>
  <div>
    <h1>KUHN BRASIL — PORTARIA</h1>
    <span>Acompanhamento de Entrada</span>
  </div>
</header>

<div class="container">

  <!-- TELA BUSCA -->
  <div class="search-card" id="telaLogin">
    <h2>🎫 Acompanhe sua entrada</h2>
    <p>Digite o número do ticket que você recebeu na portaria</p>
    <input type="number" id="inputTicket" class="input-ticket" placeholder="000" min="1"
           onkeydown="if(event.key==='Enter') buscarTicket()">
    <button class="btn-buscar" onclick="buscarTicket()" id="btnBuscar">Consultar</button>
    <p class="error-msg" id="erroMsg"></p>
  </div>

  <!-- TELA STATUS -->
  <div class="status-card" id="telaStatus">
    <p class="ticket-num" id="stTicketNum"></p>
    <p class="ticket-nome" id="stNome"></p>

    <div class="status-badge-big" id="stBadge"></div>

    <div class="info-grid">
      <div class="info-item"><label>Placa</label><span id="stPlaca">-</span></div>
      <div class="info-item"><label>Tipo</label><span id="stTipo">-</span></div>
      <div class="info-item"><label>Transportadora</label><span id="stTransp">-</span></div>
      <div class="info-item"><label>Entrada</label><span id="stEntrada">-</span></div>
    </div>

    <div class="detail-box doca-highlight" id="stDocaBox" style="display:none;">
      <label>📍 Local / Doca</label>
      <p id="stDoca">-</p>
    </div>

    <div class="detail-box" id="stObsBox" style="display:none;">
      <label>📝 Observação</label>
      <p id="stObs">-</p>
    </div>

    <div class="detail-box" id="stAutBox" style="display:none;">
      <label>✅ Autorizado por</label>
      <p id="stAut">-</p>
    </div>

    <p class="refresh-info" id="refreshInfo">Atualizando automaticamente...</p>
    <button class="btn-voltar" onclick="voltar()">← Consultar outro ticket</button>
  </div>

</div>
<footer>Sistema Kuhn Brasil — Dev: Weliton Barbosa</footer>

<script>
let ticketAtual = null;
let intervalId  = null;

async function buscarTicket() {
  const num = document.getElementById('inputTicket').value.trim();
  if (!num) return;
  document.getElementById('erroMsg').textContent = '';
  document.getElementById('btnBuscar').disabled = true;
  document.getElementById('btnBuscar').textContent = 'Consultando...';
  try {
    const res  = await fetch(`/api/acesso/${num}`);
    if (!res.ok) {
      const err = await res.json();
      document.getElementById('erroMsg').textContent = err.error || 'Ticket não encontrado';
      return;
    }
    const data = await res.json();
    ticketAtual = num;
    mostrarStatus(data);
    document.getElementById('telaLogin').style.display  = 'none';
    document.getElementById('telaStatus').style.display = 'block';
    iniciarPolling();
  } catch(e) {
    document.getElementById('erroMsg').textContent = 'Erro de conexão. Tente novamente.';
  } finally {
    document.getElementById('btnBuscar').disabled = false;
    document.getElementById('btnBuscar').textContent = 'Consultar';
  }
}

function mostrarStatus(d) {
  document.getElementById('stTicketNum').textContent = `Ticket #${d.id}`;
  document.getElementById('stNome').textContent      = d.nome || '-';
  document.getElementById('stPlaca').textContent     = d.placa || '-';
  document.getElementById('stTipo').textContent      = d.tipo || '-';
  document.getElementById('stTransp').textContent    = d.transportadora || '-';
  document.getElementById('stEntrada').textContent   = d.hora_entrada || '-';

  const badge = document.getElementById('stBadge');
  badge.className = 'status-badge-big';
  if (d.status === 'autorizado') {
    badge.classList.add('badge-autorizado');
    badge.innerHTML = '✅ AUTORIZADO — PODE PROSSEGUIR';
  } else if (d.status === 'recusado') {
    badge.classList.add('badge-recusado');
    badge.innerHTML = '❌ ACESSO RECUSADO — PROCURE A PORTARIA';
  } else {
    badge.classList.add('badge-aguardando');
    badge.innerHTML = '⏳ AGUARDANDO AUTORIZAÇÃO...';
  }

  const docaBox = document.getElementById('stDocaBox');
  if (d.doca) {
    docaBox.style.display = 'block';
    document.getElementById('stDoca').textContent = d.doca;
  } else { docaBox.style.display = 'none'; }

  const obsBox = document.getElementById('stObsBox');
  if (d.observacao_autorizacao) {
    obsBox.style.display = 'block';
    document.getElementById('stObs').textContent = d.observacao_autorizacao;
  } else { obsBox.style.display = 'none'; }

  const autBox = document.getElementById('stAutBox');
  if (d.autorizado_por) {
    autBox.style.display = 'block';
    document.getElementById('stAut').textContent = `${d.autorizado_por}${d.autorizado_em ? ' — ' + d.autorizado_em : ''}`;
  } else { autBox.style.display = 'none'; }
}

function iniciarPolling() {
  if (intervalId) clearInterval(intervalId);
  let seg = 10;
  const info = document.getElementById('refreshInfo');
  const atualizar = async () => {
    try {
      const res  = await fetch(`/api/acesso/${ticketAtual}`);
      if (res.ok) mostrarStatus(await res.json());
    } catch(_) {}
    seg = 10;
  };
  intervalId = setInterval(() => {
    seg--;
    info.textContent = `Atualizando em ${seg}s...`;
    if (seg <= 0) atualizar();
  }, 1000);
}

function voltar() {
  if (intervalId) clearInterval(intervalId);
  ticketAtual = null;
  document.getElementById('telaStatus').style.display = 'none';
  document.getElementById('telaLogin').style.display  = 'block';
  document.getElementById('inputTicket').value = '';
  document.getElementById('erroMsg').textContent = '';
}
</script>
</body>
</html>
'''

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
