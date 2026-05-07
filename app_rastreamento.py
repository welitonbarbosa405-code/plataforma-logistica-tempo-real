"""
app_rastreamento.py
Servidor leve para rastreamento GPS — Railway.app
Recebe GPS do motorista e serve para o colaborador ver
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__, static_folder='static_rastreamento', static_url_path='')
CORS(app)

DB_PATH = os.environ.get('DB_PATH', 'rastreamento.db')

# ========== BANCO DE DADOS ==========
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    conn.row_factory = sqlite3.Row

    # Tabela de ônibus (sincronizada da rede interna)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS onibus (
            id INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            placa TEXT NOT NULL,
            horario_saida TEXT,
            horario_saida_volta TEXT,
            ponto_origem TEXT,
            capacidade INTEGER DEFAULT 40,
            ativo INTEGER DEFAULT 1
        )
    ''')

    # Tabela de colaboradores (só matrícula + vínculo com ônibus)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS colaboradores (
            id INTEGER PRIMARY KEY,
            matricula TEXT UNIQUE NOT NULL,
            nome TEXT NOT NULL,
            turno TEXT DEFAULT 'Manhã',
            onibus_id INTEGER,
            ordem_embarque INTEGER,
            horario_estimado TEXT
        )
    ''')

    # Tabela de rastreamento GPS (atualizada em tempo real)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rastreamento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            onibus_id INTEGER NOT NULL UNIQUE,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            velocidade REAL DEFAULT 0,
            precisao REAL DEFAULT 0,
            em_rota INTEGER DEFAULT 1,
            atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # Tabela de viagens ativas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS viagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            onibus_id INTEGER NOT NULL,
            motorista_matricula TEXT NOT NULL,
            sentido TEXT DEFAULT 'ida',
            iniciada_em TEXT DEFAULT (datetime('now', 'localtime')),
            encerrada_em TEXT,
            ativa INTEGER DEFAULT 1
        )
    ''')

    conn.commit()
    conn.close()
    print('Banco de rastreamento inicializado!')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ========== SINCRONIZAÇÃO (chamada pela rede interna) ==========

@app.route('/api/sync', methods=['POST'])
def sincronizar():
    """
    Recebe dados da rede interna Kuhn e atualiza o banco de rastreamento.
    Chamado automaticamente pelo app.py interno a cada login ou alteração.
    """
    try:
        data = request.get_json()
        token = request.headers.get('X-Sync-Token', '')

        # Token de segurança — altere para um valor secreto
        SYNC_TOKEN = os.environ.get('SYNC_TOKEN', 'kuhn-bus-sync-2025')
        if token != SYNC_TOKEN:
            return jsonify({'error': 'Token inválido'}), 401

        # Garantir que o banco está inicializado
        init_db()

        conn = get_db()
        cursor = conn.cursor()

        # Sincronizar ônibus
        onibus_list = data.get('onibus', [])
        for bus in onibus_list:
            cursor.execute('''
                INSERT OR REPLACE INTO onibus (id, nome, placa, horario_saida, horario_saida_volta, ponto_origem, capacidade, ativo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (bus['id'], bus['nome'], bus['placa'],
                  bus.get('horario_saida', ''), bus.get('horario_saida_volta', '17:30'),
                  bus.get('ponto_origem', ''), bus.get('capacidade', 40), bus.get('ativo', 1)))

        # Sincronizar colaboradores
        colabs = data.get('colaboradores', [])
        for c in colabs:
            cursor.execute('''
                INSERT OR REPLACE INTO colaboradores (id, matricula, nome, turno, onibus_id, ordem_embarque, horario_estimado)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (c['id'], c['matricula'], c['nome'], c.get('turno', 'Manhã'),
                  c.get('onibus_id'), c.get('ordem_embarque'), c.get('horario_estimado')))

        conn.commit()
        conn.close()

        print(f'[SYNC OK] {len(onibus_list)} onibus, {len(colabs)} colaboradores')
        return jsonify({
            'message': 'Sincronizacao realizada com sucesso',
            'onibus': len(onibus_list),
            'colaboradores': len(colabs)
        }), 200

    except Exception as e:
        import traceback
        print(f'[SYNC ERRO] {str(e)}')
        print(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


# ========== LOGIN MOTORISTA ==========

@app.route('/api/motorista/login', methods=['POST'])
def motorista_login():
    try:
        data = request.get_json()
        matricula = data.get('matricula', '').strip()
        if not matricula:
            return jsonify({'error': 'Matrícula obrigatória'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.*, o.nome as onibus_nome, o.placa, o.horario_saida,
                   o.horario_saida_volta, o.ponto_origem, o.capacidade
            FROM colaboradores c
            LEFT JOIN onibus o ON o.id = c.onibus_id
            WHERE c.matricula = ?
        ''', (matricula,))
        colab = cursor.fetchone()

        # Verificar se é motorista (tem ônibus vinculado)
        if not colab:
            return jsonify({'error': 'Matrícula não encontrada'}), 404

        if not colab['onibus_id']:
            return jsonify({'error': 'Você não está vinculado a nenhuma linha'}), 400

        conn.close()
        return jsonify(dict(colab)), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== LOGIN COLABORADOR ==========

@app.route('/api/colaborador/login', methods=['POST'])
def colaborador_login():
    try:
        data = request.get_json()
        matricula = data.get('matricula', '').strip()
        if not matricula:
            return jsonify({'error': 'Matrícula obrigatória'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.*, o.nome as onibus_nome, o.placa, o.horario_saida,
                   o.horario_saida_volta, o.ponto_origem, o.capacidade
            FROM colaboradores c
            LEFT JOIN onibus o ON o.id = c.onibus_id
            WHERE c.matricula = ?
        ''', (matricula,))
        colab = cursor.fetchone()
        conn.close()

        if not colab:
            return jsonify({'error': 'Matrícula não encontrada'}), 404

        return jsonify(dict(colab)), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== GPS — MOTORISTA ENVIA POSIÇÃO ==========

@app.route('/api/gps', methods=['POST'])
def receber_gps():
    try:
        data = request.get_json()
        onibus_id = data.get('onibus_id')
        lat = data.get('lat')
        lng = data.get('lng')

        if not all([onibus_id, lat, lng]):
            return jsonify({'error': 'Dados incompletos'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO rastreamento (onibus_id, lat, lng, velocidade, precisao, em_rota, atualizado_em)
            VALUES (?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
            ON CONFLICT(onibus_id) DO UPDATE SET
                lat=excluded.lat,
                lng=excluded.lng,
                velocidade=excluded.velocidade,
                precisao=excluded.precisao,
                em_rota=1,
                atualizado_em=datetime('now', 'localtime')
        ''', (onibus_id, lat, lng,
              data.get('velocidade', 0), data.get('precisao', 0)))
        conn.commit()
        conn.close()
        return jsonify({'ok': True}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== GPS — COLABORADOR BUSCA POSIÇÃO ==========

@app.route('/api/gps/<int:onibus_id>', methods=['GET'])
def get_gps(onibus_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rastreamento WHERE onibus_id=?', (onibus_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({'ativo': False}), 200

        dados = dict(row)
        # Verificar se atualizado há menos de 60 segundos
        try:
            atualizado = datetime.strptime(dados['atualizado_em'], '%Y-%m-%d %H:%M:%S')
            diff = (datetime.now() - atualizado).total_seconds()
            dados['ativo'] = diff < 60
            dados['segundos_atras'] = int(diff)
        except:
            dados['ativo'] = True
            dados['segundos_atras'] = 0

        return jsonify(dados), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== INICIAR / ENCERRAR VIAGEM ==========

@app.route('/api/viagem/iniciar', methods=['POST'])
def iniciar_viagem():
    try:
        data = request.get_json()
        onibus_id = data.get('onibus_id')
        matricula = data.get('matricula')
        sentido = data.get('sentido', 'ida')

        conn = get_db()
        cursor = conn.cursor()

        # Encerrar viagem anterior se houver
        cursor.execute('''
            UPDATE viagens SET ativa=0, encerrada_em=datetime('now','localtime')
            WHERE onibus_id=? AND ativa=1
        ''', (onibus_id,))

        # Criar nova viagem
        cursor.execute('''
            INSERT INTO viagens (onibus_id, motorista_matricula, sentido)
            VALUES (?, ?, ?)
        ''', (onibus_id, matricula, sentido))

        # Limpar rastreamento anterior
        cursor.execute('DELETE FROM rastreamento WHERE onibus_id=?', (onibus_id,))

        conn.commit()
        viagem_id = cursor.lastrowid
        conn.close()

        return jsonify({'message': 'Viagem iniciada', 'viagem_id': viagem_id}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/viagem/encerrar', methods=['POST'])
def encerrar_viagem():
    try:
        data = request.get_json()
        onibus_id = data.get('onibus_id')

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE viagens SET ativa=0, encerrada_em=datetime('now','localtime')
            WHERE onibus_id=? AND ativa=1
        ''', (onibus_id,))
        cursor.execute('DELETE FROM rastreamento WHERE onibus_id=?', (onibus_id,))
        conn.commit()
        conn.close()

        return jsonify({'message': 'Viagem encerrada'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/viagem/ativa/<int:onibus_id>', methods=['GET'])
def viagem_ativa(onibus_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT v.*, o.nome as onibus_nome, o.placa
            FROM viagens v
            JOIN onibus o ON o.id = v.onibus_id
            WHERE v.onibus_id=? AND v.ativa=1
        ''', (onibus_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return jsonify({'ativa': False}), 200
        dados = dict(row)
        dados['ativa'] = True
        return jsonify(dados), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== PÁGINAS ==========

@app.route('/')
def index():
    return jsonify({'status': 'Kuhn Bus — Rastreamento Online', 'versao': '1.0'})

@app.route('/motorista')
def motorista_page():
    return send_from_directory('static_rastreamento', 'motorista.html')

@app.route('/colaborador')
def colaborador_page():
    return send_from_directory('static_rastreamento', 'colaborador.html')

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})


# Inicializar banco ao carregar (Gunicorn não passa pelo __main__)
try:
    init_db()
    print('Banco de rastreamento inicializado!')
except Exception as e:
    print(f'Erro ao inicializar banco: {e}')

if __name__ == '__main__':
    pass  # init_db já foi chamado acima
    port = int(os.environ.get('PORT', 5000))
    print(f'Servidor de rastreamento rodando na porta {port}')
    app.run(host='0.0.0.0', port=port, debug=False)