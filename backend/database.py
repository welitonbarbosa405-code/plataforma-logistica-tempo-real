import sqlite3
import os
import threading
from pathlib import Path

DB_PATH = str(Path(__file__).resolve().parent / 'portaria.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def sync_automatico():
    def _sync():
        try:
            import urllib.request, json as json_lib
            URL   = os.environ.get('URL_RASTREAMENTO', 'https://web-production-78823.up.railway.app')
            TOKEN = os.environ.get('SYNC_TOKEN', 'kuhn-bus-sync-2026')
            conn   = get_db()
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM onibus WHERE ativo=1')
            onibus = [dict(r) for r in cursor.fetchall()]
            cursor.execute('''
                SELECT c.id, c.nome,
                       COALESCE(c.matricula, CAST(c.id AS TEXT)) as matricula,
                       c.turno, c.is_motorista, c.onibus_motorista_id,
                       r.onibus_id, r.ordem_embarque, r.horario_embarque_estimado,
                       e.logradouro, e.numero, e.bairro, e.cep, e.cidade
                FROM colaboradores c
                LEFT JOIN rotas r ON r.colaborador_id = c.id AND r.ativo = 1
                LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
                WHERE c.ativo = 1
            ''')
            colaboradores = [dict(r) for r in cursor.fetchall()]
            conn.close()
            payload = json_lib.dumps({'onibus': onibus, 'colaboradores': colaboradores}).encode('utf-8')
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(
                f'{URL}/api/sync', data=payload,
                headers={'Content-Type': 'application/json', 'X-Sync-Token': TOKEN},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=10, context=ctx)
            print(f'[SYNC] OK — {len(onibus)} onibus, {len(colaboradores)} colaboradores')
        except Exception as e:
            print(f'[SYNC] Erro: {e}')
    threading.Thread(target=_sync, daemon=True).start()


def init_database():
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cadastro (
            cpf TEXT PRIMARY KEY,
            nome TEXT NOT NULL,
            telefone TEXT,
            integracao TEXT,
            empresa TEXT,
            transportadora TEXT,
            placa TEXT
        )
    ''')
    try:
        cursor.execute('ALTER TABLE cadastro ADD COLUMN placa TEXT')
    except sqlite3.OperationalError:
        pass
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            perfil TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now')),
            perm_cadastro_criar INTEGER DEFAULT 1,
            perm_cadastro_editar INTEGER DEFAULT 1,
            perm_cadastro_excluir INTEGER DEFAULT 0,
            perm_entrada_criar INTEGER DEFAULT 1,
            perm_entrada_editar INTEGER DEFAULT 1,
            perm_entrada_excluir INTEGER DEFAULT 0,
            perm_entrada_registrar_saida INTEGER DEFAULT 1,
            perm_janela_criar INTEGER DEFAULT 0,
            perm_janela_editar INTEGER DEFAULT 0,
            perm_janela_excluir INTEGER DEFAULT 0,
            perm_dashboard_visualizar INTEGER DEFAULT 1,
            perm_usuarios_gerenciar INTEGER DEFAULT 0
        )
    ''')
    permissoes_colunas = [
        'perm_cadastro_criar', 'perm_cadastro_editar', 'perm_cadastro_excluir',
        'perm_entrada_criar', 'perm_entrada_editar', 'perm_entrada_excluir', 'perm_entrada_registrar_saida',
        'perm_janela_criar', 'perm_janela_editar', 'perm_janela_excluir',
        'perm_dashboard_visualizar', 'perm_usuarios_gerenciar'
    ]
    for coluna in permissoes_colunas:
        try:
            cursor.execute(f'ALTER TABLE usuarios ADD COLUMN {coluna} INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
    cursor.execute('''
        UPDATE usuarios
        SET
            perm_cadastro_criar = CASE WHEN perfil = 'administrador' THEN 1 ELSE 1 END,
            perm_cadastro_editar = CASE WHEN perfil IN ('administrador','supervisor') THEN 1 ELSE 0 END,
            perm_cadastro_excluir = CASE WHEN perfil = 'administrador' THEN 1 ELSE 0 END,
            perm_entrada_criar = 1,
            perm_entrada_editar = CASE WHEN perfil IN ('administrador','supervisor') THEN 1 ELSE 0 END,
            perm_entrada_excluir = CASE WHEN perfil = 'administrador' THEN 1 ELSE 0 END,
            perm_entrada_registrar_saida = 1,
            perm_janela_criar = CASE WHEN perfil IN ('administrador','supervisor') THEN 1 ELSE 0 END,
            perm_janela_editar = CASE WHEN perfil IN ('administrador','supervisor') THEN 1 ELSE 0 END,
            perm_janela_excluir = CASE WHEN perfil = 'administrador' THEN 1 ELSE 0 END,
            perm_dashboard_visualizar = 1,
            perm_usuarios_gerenciar = CASE WHEN perfil = 'administrador' THEN 1 ELSE 0 END
        WHERE perm_cadastro_criar IS NULL
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cadastro_entrada (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT, tipo TEXT, cpf TEXT, nome TEXT, telefone TEXT,
            integracao TEXT, placa TEXT, transportadora TEXT, numero_coleta TEXT,
            empresa TEXT, solicitante TEXT, vigilante TEXT,
            data_entrada TEXT, hora_entrada TEXT, data_saida TEXT, hora_saida TEXT,
            status TEXT DEFAULT 'aguardando',
            doca TEXT,
            observacao_autorizacao TEXT,
            autorizado_por TEXT,
            autorizado_em TEXT,
            FOREIGN KEY (cpf) REFERENCES cadastro(cpf)
        )
    ''')
    for col_def in [
        "status TEXT DEFAULT 'aguardando'",
        'doca TEXT',
        'observacao_autorizacao TEXT',
        'autorizado_por TEXT',
        'autorizado_em TEXT',
    ]:
        try:
            cursor.execute(f'ALTER TABLE cadastro_entrada ADD COLUMN {col_def}')
        except sqlite3.OperationalError:
            pass
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS janela (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filial TEXT NOT NULL,
            transportadora TEXT NOT NULL,
            dia_semana TEXT NOT NULL,
            horario TEXT NOT NULL,
            tipo TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now')),
            UNIQUE(transportadora, dia_semana, horario)
        )
    ''')
    cursor.execute('SELECT id FROM usuarios WHERE email = ?', ('admin@kuhn.com',))
    if not cursor.fetchone():
        import hashlib
        senha_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        cursor.execute(
            'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)',
            ('Administrador', 'admin@kuhn.com', senha_hash, 'administrador')
        )
    conn.commit()
    conn.close()
    print('Banco de dados (portaria) inicializado com sucesso.')


def init_roteirizacao():
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS onibus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome VARCHAR(100) NOT NULL,
            placa VARCHAR(20) NOT NULL UNIQUE,
            tipo_veiculo VARCHAR(20) DEFAULT 'Ônibus',
            capacidade INTEGER NOT NULL DEFAULT 40,
            ponto_origem VARCHAR(255) NOT NULL,
            cep_origem VARCHAR(10),
            horario_saida TEXT NOT NULL,
            horario_saida_volta TEXT DEFAULT '17:30',
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    ''')
    for col in ["cep_origem VARCHAR(10)", "horario_saida_volta TEXT DEFAULT '17:30'",
                "tipo_veiculo VARCHAR(20) DEFAULT 'Ônibus'", 'origem_lat REAL', 'origem_lng REAL']:
        try:
            cursor.execute(f'ALTER TABLE onibus ADD COLUMN {col}')
        except Exception:
            pass
    for col in ['is_motorista INTEGER DEFAULT 0', 'onibus_motorista_id INTEGER']:
        try:
            cursor.execute(f'ALTER TABLE colaboradores ADD COLUMN {col}')
        except Exception:
            pass
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS colaboradores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome VARCHAR(150) NOT NULL,
            matricula VARCHAR(30) UNIQUE,
            cpf VARCHAR(14) UNIQUE,
            telefone VARCHAR(20),
            turno TEXT NOT NULL DEFAULT 'Manhã'
                CHECK(turno IN ('Manhã','Tarde','Noite')),
            setor VARCHAR(100),
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS colaborador_enderecos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            colaborador_id INTEGER NOT NULL,
            logradouro VARCHAR(200) NOT NULL,
            numero VARCHAR(20),
            complemento VARCHAR(100),
            bairro VARCHAR(100) NOT NULL,
            cidade VARCHAR(100) NOT NULL DEFAULT 'Passo Fundo',
            estado CHAR(2) NOT NULL DEFAULT 'RS',
            cep VARCHAR(10),
            latitude REAL,
            longitude REAL,
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rotas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            onibus_id INTEGER NOT NULL,
            colaborador_id INTEGER NOT NULL,
            ordem_embarque INTEGER,
            horario_embarque_estimado TEXT,
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (onibus_id) REFERENCES onibus(id) ON DELETE CASCADE,
            FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS onibus_bairros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            onibus_id INTEGER NOT NULL,
            bairro VARCHAR(100) NOT NULL,
            FOREIGN KEY (onibus_id) REFERENCES onibus(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS destinos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome VARCHAR(150) NOT NULL,
            logradouro VARCHAR(200) NOT NULL,
            numero VARCHAR(20),
            bairro VARCHAR(100),
            cidade VARCHAR(100) DEFAULT 'Passo Fundo',
            estado CHAR(2) DEFAULT 'RS',
            cep VARCHAR(10),
            latitude REAL,
            longitude REAL,
            principal INTEGER DEFAULT 0,
            ativo INTEGER DEFAULT 1
        )
    ''')
    cursor.execute('SELECT id FROM destinos WHERE principal = 1')
    if not cursor.fetchone():
        cursor.execute('''
            INSERT INTO destinos (nome, logradouro, numero, bairro, cidade, estado, principal)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', ('Kuhn Brasil - Sede', 'R. Arnô Pini', '1380', 'Invernadinha', 'Passo Fundo', 'RS', 1))
    conn.commit()
    conn.close()
    print('Tabelas de roteirização inicializadas.')
