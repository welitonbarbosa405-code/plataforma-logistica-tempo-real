import hashlib
import os
import sqlite3
import threading
import urllib.request
import json as json_lib
import ssl
from datetime import datetime
from io import BytesIO
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from database import get_db

RAILWAY_URL   = os.environ.get('RAILWAY_PORTARIA_URL', '')
RAILWAY_TOKEN = os.environ.get('RAILWAY_PORTARIA_TOKEN', 'kuhn-portaria-sync-2026')


def _sync_railway(entrada: dict):
    if not RAILWAY_URL:
        return
    def _send():
        try:
            payload = json_lib.dumps(entrada).encode('utf-8')
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(
                f'{RAILWAY_URL}/api/sync/portaria',
                data=payload,
                headers={'Content-Type': 'application/json', 'X-Sync-Token': RAILWAY_TOKEN},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=10, context=ctx)
        except Exception as e:
            print(f'[SYNC PORTARIA] Erro: {e}')
    threading.Thread(target=_send, daemon=True).start()

portaria_bp = Blueprint('portaria', __name__)

IMAGES_DIR = (Path(__file__).resolve().parent.parent.parent / 'img').resolve()


# ========== CADASTRO ==========

@portaria_bp.route('/api/cadastros', methods=['GET'])
def listar_cadastros():
    try:
        conn = get_db()
        rows = conn.execute('SELECT * FROM cadastro ORDER BY nome').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/cadastros/<cpf>', methods=['GET'])
def buscar_cadastro(cpf):
    try:
        conn = get_db()
        row  = conn.execute('SELECT * FROM cadastro WHERE cpf = ?', (cpf,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Cadastro não encontrado'}), 404
        return jsonify(dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/cadastros', methods=['POST'])
def criar_cadastro():
    try:
        data = request.get_json()
        cpf  = data.get('cpf')
        nome = data.get('nome')
        if not cpf or not nome:
            return jsonify({'error': 'CPF e Nome são obrigatórios'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute('SELECT cpf FROM cadastro WHERE cpf = ?', (cpf,)).fetchone():
            conn.close()
            return jsonify({'error': 'CPF já cadastrado.'}), 400
        cursor.execute(
            'INSERT INTO cadastro (cpf, nome, telefone, integracao, empresa, transportadora, placa) VALUES (?,?,?,?,?,?,?)',
            (cpf, nome, data.get('telefone'), data.get('integracao'),
             data.get('empresa'), data.get('transportadora'), data.get('placa'))
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Cadastro criado com sucesso', 'cpf': cpf}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/cadastros/<cpf>', methods=['PUT'])
def atualizar_cadastro(cpf):
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE cadastro SET nome=?, telefone=?, integracao=?, empresa=?, transportadora=?, placa=? WHERE cpf=?',
            (data.get('nome'), data.get('telefone'), data.get('integracao'),
             data.get('empresa'), data.get('transportadora'), data.get('placa'), cpf)
        )
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Cadastro não encontrado'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Cadastro atualizado com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/cadastros/<cpf>', methods=['DELETE'])
def deletar_cadastro(cpf):
    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM cadastro WHERE cpf = ?', (cpf,))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Cadastro não encontrado'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Cadastro deletado com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== ENTRADAS ==========

@portaria_bp.route('/api/entradas', methods=['GET'])
def listar_entradas():
    try:
        conn = get_db()
        rows = conn.execute(
            'SELECT * FROM cadastro_entrada ORDER BY data_entrada DESC, hora_entrada DESC'
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas/<int:id>', methods=['GET'])
def buscar_entrada(id):
    try:
        conn = get_db()
        row  = conn.execute('SELECT * FROM cadastro_entrada WHERE id = ?', (id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Entrada não encontrada'}), 404
        return jsonify(dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas', methods=['POST'])
def criar_entrada():
    try:
        data = request.get_json()
        cpf  = data.get('cpf')
        nome = data.get('nome')
        if not cpf or not nome:
            return jsonify({'error': 'CPF e Nome são obrigatórios'}), 400
        agora       = datetime.now()
        data_entrada = data.get('data') or agora.strftime('%Y-%m-%d')
        hora_entrada = agora.strftime('%H:%M')
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO cadastro_entrada
            (data, tipo, cpf, nome, telefone, integracao, placa, transportadora,
             numero_coleta, empresa, solicitante, vigilante, data_entrada, hora_entrada)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (data.get('data'), data.get('tipo'), cpf, nome, data.get('telefone'),
              data.get('integracao'), data.get('placa'), data.get('transportadora'),
              data.get('numero_coleta'), data.get('empresa'), data.get('solicitante'),
              data.get('vigilante'), data_entrada, hora_entrada))
        entrada_id = cursor.lastrowid
        conn.commit()
        conn.close()
        _sync_railway({
            'id': entrada_id, 'nome': nome, 'cpf': data.get('cpf'),
            'placa': data.get('placa'), 'transportadora': data.get('transportadora'),
            'tipo': data.get('tipo'), 'empresa': data.get('empresa'),
            'data_entrada': data_entrada, 'hora_entrada': hora_entrada,
            'status': 'aguardando'
        })
        return jsonify({'message': 'Entrada registrada com sucesso', 'id': entrada_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas/<int:id>/saida', methods=['PUT'])
def registrar_saida(id):
    try:
        agora  = datetime.now()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE cadastro_entrada SET data_saida=?, hora_saida=? WHERE id=?',
            (agora.strftime('%Y-%m-%d'), agora.strftime('%H:%M'), id)
        )
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Entrada não encontrada'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Saída registrada com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas/<int:id>/autorizar', methods=['PUT'])
def autorizar_entrada(id):
    try:
        data         = request.get_json()
        doca         = data.get('doca', '')
        observacao   = data.get('observacao', '')
        autorizado_por = data.get('autorizado_por', '')
        status       = data.get('status', 'autorizado')
        autorizado_em = datetime.now().strftime('%Y-%m-%d %H:%M')

        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE cadastro_entrada SET status=?, doca=?, observacao_autorizacao=?, autorizado_por=?, autorizado_em=? WHERE id=?',
            (status, doca, observacao, autorizado_por, autorizado_em, id)
        )
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Entrada não encontrada'}), 404
        row = conn.execute('SELECT * FROM cadastro_entrada WHERE id=?', (id,)).fetchone()
        conn.commit()
        conn.close()

        entrada = dict(row)
        _sync_railway({
            'id': entrada['id'], 'nome': entrada['nome'], 'cpf': entrada['cpf'],
            'placa': entrada['placa'], 'transportadora': entrada['transportadora'],
            'tipo': entrada['tipo'], 'empresa': entrada['empresa'],
            'data_entrada': entrada['data_entrada'], 'hora_entrada': entrada['hora_entrada'],
            'status': status, 'doca': doca,
            'observacao_autorizacao': observacao,
            'autorizado_por': autorizado_por, 'autorizado_em': autorizado_em
        })
        return jsonify({'message': f'Entrada {status} com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas/<int:id>', methods=['PUT'])
def atualizar_entrada(id):
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE cadastro_entrada SET
            data=?, tipo=?, cpf=?, nome=?, telefone=?, integracao=?, placa=?,
            transportadora=?, numero_coleta=?, empresa=?, solicitante=?, vigilante=?,
            data_entrada=?, hora_entrada=?, data_saida=?, hora_saida=?
            WHERE id=?
        ''', (data.get('data'), data.get('tipo'), data.get('cpf'), data.get('nome'),
              data.get('telefone'), data.get('integracao'), data.get('placa'),
              data.get('transportadora'), data.get('numero_coleta'), data.get('empresa'),
              data.get('solicitante'), data.get('vigilante'), data.get('data_entrada'),
              data.get('hora_entrada'), data.get('data_saida'), data.get('hora_saida'), id))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Entrada não encontrada'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Entrada atualizada com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/entradas/<int:id>', methods=['DELETE'])
def deletar_entrada(id):
    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM cadastro_entrada WHERE id = ?', (id,))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Entrada não encontrada'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Entrada deletada com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== TICKET PDF ==========

@portaria_bp.route('/api/entradas/<int:id>/ticket', methods=['GET'])
def gerar_ticket_entrada(id):
    try:
        from reportlab.pdfgen import canvas as pdf_canvas
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors

        conn  = get_db()
        row   = conn.execute('SELECT * FROM cadastro_entrada WHERE id = ?', (id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Entrada não encontrada'}), 404
        entrada = dict(row)

        try:
            data_fmt = datetime.strptime(entrada.get('data_entrada', ''), '%Y-%m-%d').strftime('%d/%m/%Y')
        except Exception:
            data_fmt = entrada.get('data_entrada') or '-'

        # Número sequencial diário (zera à meia-noite)
        conn2 = get_db()
        seq_row = conn2.execute(
            'SELECT COUNT(*) FROM cadastro_entrada WHERE data_entrada = ? AND id <= ?',
            (entrada.get('data_entrada'), entrada['id'])
        ).fetchone()
        conn2.close()
        num_diario = seq_row[0] if seq_row else 1

        cpf_raw = entrada.get('cpf') or ''
        if len(cpf_raw) == 11:
            cpf_fmt = f'{cpf_raw[:3]}.{cpf_raw[3:6]}.{cpf_raw[6:9]}-{cpf_raw[9:]}'
        else:
            cpf_fmt = cpf_raw

        stream = BytesIO()
        W, H = A4
        c = pdf_canvas.Canvas(stream, pagesize=A4)

        ML = 30
        MR = W - 30
        TW = MR - ML

        CINZA_BORDA  = colors.HexColor('#888888')
        CINZA_CAMPO  = colors.HexColor('#E8E8E8')
        CINZA_LABEL  = colors.HexColor('#555555')
        CINZA_WATER  = colors.HexColor('#C8C8C8')
        PRETO        = colors.black

        def hline(y, x1=ML, x2=MR, lw=0.7):
            c.setStrokeColor(CINZA_BORDA)
            c.setLineWidth(lw)
            c.line(x1, y, x2, y)

        def vline(x, y1, y2, lw=0.7):
            c.setStrokeColor(CINZA_BORDA)
            c.setLineWidth(lw)
            c.line(x, y1, x, y2)

        def box_cinza(x, y, w, h):
            c.setFillColor(CINZA_CAMPO)
            c.setStrokeColor(CINZA_BORDA)
            c.setLineWidth(0.5)
            c.rect(x, y, w, h, fill=1, stroke=0)

        def lbl(txt, x, y, sz=7.5, cor=CINZA_LABEL, align='left'):
            c.setFont('Helvetica', sz)
            c.setFillColor(cor)
            if align == 'center':
                c.drawCentredString(x, y, txt)
            elif align == 'right':
                c.drawRightString(x, y, txt)
            else:
                c.drawString(x, y, txt)

        def val(txt, x, y, sz=12, bold=True, cor=PRETO, align='left'):
            c.setFont('Helvetica-Bold' if bold else 'Helvetica', sz)
            c.setFillColor(cor)
            if align == 'center':
                c.drawCentredString(x, y, txt)
            elif align == 'right':
                c.drawRightString(x, y, txt)
            else:
                c.drawString(x, y, txt)

        # ── BORDA EXTERNA ─────────────────────────────────────────────
        c.setStrokeColor(CINZA_BORDA)
        c.setLineWidth(1.2)
        c.rect(ML - 4, 28, TW + 8, H - 58, fill=0, stroke=1)

        # ── BLOCO DE CABEÇALHO ────────────────────────────────────────
        # Duas caixas lado a lado no canto superior direito
        num_box_top = H - 30
        num_box_bot = H - 110
        num_box_h   = num_box_top - num_box_bot
        col_w_geral = 120   # largura caixa Nº Geral
        col_w_diario = 90   # largura caixa Nº Diário

        box_diario_x = MR - col_w_diario
        box_geral_x  = box_diario_x - col_w_geral

        c.setStrokeColor(CINZA_BORDA)
        c.setLineWidth(0.8)
        # caixa Nº Geral (esquerda)
        c.rect(box_geral_x, num_box_bot, col_w_geral, num_box_h, fill=0, stroke=1)
        # caixa Nº Diário (direita)
        c.rect(box_diario_x, num_box_bot, col_w_diario, num_box_h, fill=0, stroke=1)

        # Labels
        lbl('Nº TICKET GERAL', box_geral_x + 4, num_box_top - 14, sz=7.5)
        lbl('Nº DIÁRIO', box_diario_x + 4, num_box_top - 14, sz=7.5)

        # Números (grandes, centralizados em cada caixa)
        c.setFont('Helvetica-Bold', 30)
        c.setFillColor(PRETO)
        c.drawCentredString(box_geral_x + col_w_geral / 2, num_box_bot + 18, str(entrada['id']))

        c.setFont('Helvetica-Bold', 30)
        c.setFillColor(PRETO)
        c.drawCentredString(box_diario_x + col_w_diario / 2, num_box_bot + 18, str(num_diario))

        # Título TICKET DE ENTRADA
        c.setFont('Helvetica-Bold', 24)
        c.setFillColor(PRETO)
        c.drawString(ML + 2, H - 60, 'TICKET DE ENTRADA')

        # ── TIPO ENTRADA ──────────────────────────────────────────────
        tipo_top = H - 68
        tipo_bot = H - 110
        tipo_h   = tipo_top - tipo_bot
        tipo_end = box_geral_x - 2

        lbl('TIPO ENTRADA', ML + 4, tipo_top - 4, sz=7.5)

        tipo_val_str = (entrada.get('tipo') or 'ENTREGA').upper()
        val(tipo_val_str, ML + 4, tipo_bot + 14, sz=14)

        # caixa cinza ao lado (campo extra manual)
        gray_tipo_x = ML + 100
        box_cinza(gray_tipo_x, tipo_bot + 2, tipo_end - gray_tipo_x - 2, tipo_h - 6)

        hline(tipo_top, lw=0.8)
        hline(tipo_bot, lw=1.0)
        vline(box_geral_x, tipo_bot, H - 30)

        # ── NOME + TELEFONE ───────────────────────────────────────────
        nome_top = tipo_bot
        nome_h   = 42
        nome_bot = nome_top - nome_h
        split_tel = ML + TW * 0.60

        lbl('NOME', ML + 4, nome_top - 11, sz=7.5)
        lbl('TELEFONE', split_tel + 4, nome_top - 11, sz=7.5)

        nome_str = (entrada.get('nome') or '-').upper()
        val(nome_str, ML + 4, nome_top - 28, sz=12)

        tel_str = entrada.get('telefone') or ''
        if tel_str:
            val(tel_str, split_tel + 4, nome_top - 28, sz=12)
        else:
            box_cinza(split_tel, nome_bot + 2, MR - split_tel - 2, nome_h - 6)

        vline(split_tel, nome_bot, nome_top)
        hline(nome_bot)

        # ── CPF + TRANSPORTADORA ──────────────────────────────────────
        cpf_top = nome_bot
        cpf_h   = 42
        cpf_bot = cpf_top - cpf_h
        split_tr = ML + TW * 0.38

        lbl('CPF', ML + 4, cpf_top - 11, sz=7.5)
        lbl('TRANSPORTADORA', split_tr + 4, cpf_top - 11, sz=7.5)

        if cpf_fmt:
            val(cpf_fmt, ML + 4, cpf_top - 28, sz=11)
        else:
            box_cinza(ML, cpf_bot + 2, split_tr - ML - 2, cpf_h - 6)

        transp_str = (entrada.get('transportadora') or '-').upper()
        val(transp_str, split_tr + 4, cpf_top - 28, sz=12)

        vline(split_tr, cpf_bot, cpf_top)
        hline(cpf_bot, lw=1.2)

        # ── PLACA | PLACA 1 | DATA | ENTRADA ─────────────────────────
        pl_top = cpf_bot
        pl_h   = 44
        pl_bot = pl_top - pl_h

        col_pcts = [0.22, 0.22, 0.32, 0.24]
        col_xs = [ML]
        for p in col_pcts[:-1]:
            col_xs.append(col_xs[-1] + TW * p)

        pl_labels = ['PLACA', 'PLACA 1', 'DATA', 'ENTRADA']
        pl_values = [
            (entrada.get('placa') or '').upper(),
            '',
            data_fmt,
            entrada.get('hora_entrada') or '-',
        ]

        for i, (lbl_txt, val_txt, cx) in enumerate(zip(pl_labels, pl_values, col_xs)):
            col_w = TW * col_pcts[i]
            lbl(lbl_txt, cx + 4, pl_top - 12, sz=7.5)
            if val_txt:
                val(val_txt, cx + 4, pl_top - 30, sz=12)
            else:
                box_cinza(cx + 2, pl_bot + 3, col_w - 6, pl_h - 18)

        for sx in col_xs[1:]:
            vline(sx, pl_bot, pl_top)

        hline(pl_top)
        hline(pl_bot, lw=1.0)

        # ── SEÇÃO INFERIOR ────────────────────────────────────────────
        bottom_y = 32
        mid_x    = ML + TW * 0.48

        vline(mid_x, bottom_y, pl_bot)

        # OBSERVAÇÕES
        lbl('OBSERVAÇÕES', ML + 4, pl_bot - 14, sz=7.5)
        y_pauta = pl_bot - 28
        while y_pauta > bottom_y + 8:
            hline(y_pauta, x1=ML, x2=mid_x, lw=0.25)
            y_pauta -= 18

        # Blocos lado direito
        bloco_total = pl_bot - bottom_y
        lib_h  = bloco_total * 0.40
        hor_h  = bloco_total * 0.33
        lib_top_y = pl_bot
        lib_bot_y = lib_top_y - lib_h
        hor_bot_y = lib_bot_y - hor_h

        lbl('LIBERAÇÃO', mid_x + 4, lib_top_y - 14, sz=7.5)
        cx_dir = (mid_x + MR) / 2
        cy_lib = (lib_top_y + lib_bot_y) / 2
        val('NOME E CARIMBO', cx_dir, cy_lib - 6, sz=11, bold=False, cor=CINZA_WATER, align='center')
        hline(lib_bot_y, x1=mid_x, x2=MR)

        lbl('HORARIO SAÍDA DO SETOR', mid_x + 4, lib_bot_y - 14, sz=7.5)
        hline(hor_bot_y, x1=mid_x, x2=MR)

        # ── RODAPÉ ────────────────────────────────────────────────────
        hline(22, lw=0.4)
        lbl('Sistema desenvolvido por Dev: Weliton Barbosa',
            (ML + MR) / 2, 10, sz=6.5, cor=colors.HexColor('#AAAAAA'), align='center')

        c.save()
        stream.seek(0)
        nome_arquivo = f'ticket_{entrada["id"]}_{(entrada["nome"] or "motorista").replace(" ", "_")}.pdf'
        return send_file(stream, as_attachment=True, download_name=nome_arquivo,
                         mimetype='application/pdf')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== AUTENTICAÇÃO ==========

@portaria_bp.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data  = request.get_json()
        email = data.get('email')
        senha = data.get('senha')
        if not email or not senha:
            return jsonify({'error': 'Email e senha são obrigatórios'}), 400
        conn    = get_db()
        usuario = conn.execute('SELECT * FROM usuarios WHERE email = ?', (email,)).fetchone()
        conn.close()
        if not usuario:
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        if usuario['senha_hash'] != hashlib.sha256(senha.encode()).hexdigest():
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        return jsonify({'message': 'Login realizado com sucesso', 'usuario': {
            'id': usuario['id'], 'nome': usuario['nome'],
            'email': usuario['email'], 'perfil': usuario['perfil'],
            'criado_em': usuario['criado_em']
        }}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/auth/verificar', methods=['GET'])
def verificar_sessao():
    return jsonify({'message': 'Sessão válida'}), 200


# ========== JANELA ==========

@portaria_bp.route('/api/janela', methods=['GET'])
def get_janelas():
    try:
        conn  = get_db()
        rows  = conn.execute('SELECT * FROM janela ORDER BY dia_semana, horario, transportadora').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/janela/<int:janela_id>', methods=['GET'])
def get_janela(janela_id):
    try:
        conn = get_db()
        row  = conn.execute('SELECT * FROM janela WHERE id = ?', (janela_id,)).fetchone()
        conn.close()
        if row:
            return jsonify(dict(row)), 200
        return jsonify({'error': 'Janela não encontrada'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/janela', methods=['POST'])
def criar_janela():
    try:
        data           = request.get_json()
        filial         = data.get('filial')
        transportadora = data.get('transportadora')
        dia_semana     = data.get('dia_semana')
        horario        = data.get('horario')
        tipo           = data.get('tipo', 'Coleta')
        if not all([filial, transportadora, dia_semana, horario]):
            return jsonify({'error': 'Filial, Transportadora, Dia da semana e Horário são obrigatórios'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute(
            'SELECT id FROM janela WHERE transportadora=? AND dia_semana=? AND horario=?',
            (transportadora, dia_semana, horario)
        ).fetchone():
            conn.close()
            return jsonify({'error': 'Esta transportadora já possui horário cadastrado neste dia e horário'}), 400
        cursor.execute(
            'INSERT INTO janela (filial,transportadora,dia_semana,horario,tipo) VALUES (?,?,?,?,?)',
            (filial, transportadora, dia_semana, horario, tipo)
        )
        conn.commit()
        janela_id = cursor.lastrowid
        conn.close()
        return jsonify({'message': 'Janela cadastrada com sucesso', 'id': janela_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Esta transportadora já possui horário cadastrado neste dia e horário'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/janela/<int:janela_id>', methods=['PUT'])
def atualizar_janela(janela_id):
    try:
        data           = request.get_json()
        filial         = data.get('filial')
        transportadora = data.get('transportadora')
        dia_semana     = data.get('dia_semana')
        horario        = data.get('horario')
        tipo           = data.get('tipo')
        if not all([filial, transportadora, dia_semana, horario]):
            return jsonify({'error': 'Campos obrigatórios não preenchidos'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute(
            'SELECT id FROM janela WHERE transportadora=? AND dia_semana=? AND horario=? AND id!=?',
            (transportadora, dia_semana, horario, janela_id)
        ).fetchone():
            conn.close()
            return jsonify({'error': 'Esta transportadora já possui horário cadastrado neste dia e horário'}), 400
        cursor.execute(
            'UPDATE janela SET filial=?,transportadora=?,dia_semana=?,horario=?,tipo=? WHERE id=?',
            (filial, transportadora, dia_semana, horario, tipo, janela_id)
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'Janela atualizada com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/janela/<int:janela_id>', methods=['DELETE'])
def deletar_janela(janela_id):
    try:
        conn = get_db()
        conn.execute('DELETE FROM janela WHERE id = ?', (janela_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Janela deletada com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== DASHBOARD ==========

@portaria_bp.route('/api/dashboard/metrics', methods=['GET'])
def dashboard_metrics():
    try:
        conn = get_db()
        total_entradas       = conn.execute('SELECT COUNT(*) FROM cadastro_entrada').fetchone()[0]
        tempo_medio_result   = conn.execute('''
            SELECT AVG((julianday(data_saida||' '||hora_saida)-julianday(data_entrada||' '||hora_entrada))*24*60)
            FROM cadastro_entrada WHERE data_saida IS NOT NULL AND hora_saida IS NOT NULL
        ''').fetchone()[0]
        total_transportadoras = conn.execute('''
            SELECT COUNT(DISTINCT transportadora) FROM cadastro_entrada
            WHERE transportadora IS NOT NULL AND transportadora != ""
        ''').fetchone()[0]
        total_janelas = conn.execute('SELECT COUNT(*) FROM janela').fetchone()[0]
        conn.close()
        return jsonify({
            'total_entradas': total_entradas,
            'tempo_medio_permanencia': int(tempo_medio_result) if tempo_medio_result else 0,
            'total_transportadoras': total_transportadoras,
            'total_janelas': total_janelas
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/dashboard/entradas-horario', methods=['GET'])
def dashboard_entradas_horario():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT CAST(substr(hora_entrada,1,2) AS INTEGER) as hora, COUNT(*) as total
            FROM cadastro_entrada WHERE hora_entrada IS NOT NULL GROUP BY hora ORDER BY hora
        ''').fetchall()
        conn.close()
        return jsonify({'horas': [f"{h:02d}:00" for h, _ in rows], 'quantidades': [t for _, t in rows]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/dashboard/entradas-transportadora', methods=['GET'])
def dashboard_entradas_transportadora():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT transportadora, COUNT(*) as total FROM cadastro_entrada
            WHERE transportadora IS NOT NULL AND transportadora != ""
            GROUP BY transportadora ORDER BY total DESC LIMIT 10
        ''').fetchall()
        conn.close()
        return jsonify({'transportadoras': [r[0] for r in rows], 'quantidades': [r[1] for r in rows]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/dashboard/entradas-dia-semana', methods=['GET'])
def dashboard_entradas_dia_semana():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT strftime('%w', data_entrada) as dia_num, COUNT(*) as total
            FROM cadastro_entrada WHERE data_entrada IS NOT NULL GROUP BY dia_num ORDER BY dia_num
        ''').fetchall()
        conn.close()
        q = [0] * 7
        for dia_num, total in rows:
            q[int(dia_num)] = total
        dias = ['Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado','Domingo']
        return jsonify({'dias': dias, 'quantidades': [q[1],q[2],q[3],q[4],q[5],q[6],q[0]]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/dashboard/tempo-permanencia', methods=['GET'])
def dashboard_tempo_permanencia():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT CASE
                WHEN (julianday(data_saida||' '||hora_saida)-julianday(data_entrada||' '||hora_entrada))*24*60 < 15 THEN 'Rápido (< 15min)'
                WHEN (julianday(data_saida||' '||hora_saida)-julianday(data_entrada||' '||hora_entrada))*24*60 <= 120 THEN 'Normal (15min - 2h)'
                ELSE 'Longo (> 2h)'
            END as categoria, COUNT(*) as total
            FROM cadastro_entrada WHERE data_saida IS NOT NULL AND hora_saida IS NOT NULL GROUP BY categoria
        ''').fetchall()
        conn.close()
        return jsonify({'categorias': [r[0] for r in rows], 'quantidades': [r[1] for r in rows]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/dashboard/estatisticas-transportadora', methods=['GET'])
def dashboard_estatisticas_transportadora():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT e.transportadora, COUNT(DISTINCT e.id) as total_entradas,
                AVG(CASE WHEN e.data_saida IS NOT NULL AND e.hora_saida IS NOT NULL
                    THEN (julianday(e.data_saida||' '||e.hora_saida)-julianday(e.data_entrada||' '||e.hora_entrada))*24*60
                    ELSE NULL END) as tempo_medio,
                SUM(CASE WHEN date(e.data_entrada)=date('now') THEN 1 ELSE 0 END) as entradas_hoje,
                (SELECT COUNT(*) FROM janela j WHERE j.transportadora=e.transportadora) as janelas_cadastradas
            FROM cadastro_entrada e
            WHERE e.transportadora IS NOT NULL AND e.transportadora != ""
            GROUP BY e.transportadora ORDER BY total_entradas DESC
        ''').fetchall()
        conn.close()
        return jsonify([{
            'transportadora': r[0] or 'Não informado',
            'total_entradas': r[1],
            'tempo_medio': int(r[2]) if r[2] else 0,
            'entradas_hoje': r[3],
            'janelas_cadastradas': r[4] or 0
        } for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== USUÁRIOS ==========

_PERM_COLS = [
    'perm_cadastro_criar', 'perm_cadastro_editar', 'perm_cadastro_excluir',
    'perm_entrada_criar', 'perm_entrada_editar', 'perm_entrada_excluir', 'perm_entrada_registrar_saida',
    'perm_janela_criar', 'perm_janela_editar', 'perm_janela_excluir',
    'perm_dashboard_visualizar', 'perm_usuarios_gerenciar'
]


def _row_to_usuario(row):
    u = dict(row)
    for k in u:
        if k.startswith('perm_'):
            u[k] = bool(u[k])
    return u


@portaria_bp.route('/api/usuarios', methods=['GET'])
def listar_usuarios():
    try:
        conn = get_db()
        rows = conn.execute(f'''
            SELECT id,nome,email,perfil,criado_em,{",".join(_PERM_COLS)} FROM usuarios ORDER BY nome
        ''').fetchall()
        conn.close()
        return jsonify([_row_to_usuario(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/usuarios/<int:usuario_id>', methods=['GET'])
def buscar_usuario(usuario_id):
    try:
        conn = get_db()
        row  = conn.execute(f'''
            SELECT id,nome,email,perfil,criado_em,{",".join(_PERM_COLS)} FROM usuarios WHERE id=?
        ''', (usuario_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Usuário não encontrado'}), 404
        return jsonify(_row_to_usuario(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/usuarios', methods=['POST'])
def criar_usuario():
    try:
        data   = request.get_json()
        nome   = data.get('nome')
        email  = data.get('email')
        senha  = data.get('senha')
        perfil = data.get('perfil', 'porteiro')
        if not all([nome, email, senha]):
            return jsonify({'error': 'Nome, Email e Senha são obrigatórios'}), 400
        perfis_validos = ['porteiro', 'supervisor', 'administrador', 'operador', 'visualizador', 'admin']
        if perfil not in perfis_validos:
            return jsonify({'error': 'Perfil inválido'}), 400
        admins = ['administrador', 'admin']
        supvs  = ['administrador', 'supervisor', 'admin']
        perms  = {
            'perm_cadastro_criar':         data.get('perm_cadastro_criar', True),
            'perm_cadastro_editar':        data.get('perm_cadastro_editar', perfil in supvs),
            'perm_cadastro_excluir':       data.get('perm_cadastro_excluir', perfil in admins),
            'perm_entrada_criar':          data.get('perm_entrada_criar', True),
            'perm_entrada_editar':         data.get('perm_entrada_editar', perfil in supvs),
            'perm_entrada_excluir':        data.get('perm_entrada_excluir', perfil in admins),
            'perm_entrada_registrar_saida': data.get('perm_entrada_registrar_saida', True),
            'perm_janela_criar':           data.get('perm_janela_criar', perfil in supvs),
            'perm_janela_editar':          data.get('perm_janela_editar', perfil in supvs),
            'perm_janela_excluir':         data.get('perm_janela_excluir', perfil in admins),
            'perm_dashboard_visualizar':   data.get('perm_dashboard_visualizar', True),
            'perm_usuarios_gerenciar':     data.get('perm_usuarios_gerenciar', perfil in admins),
        }
        senha_hash = hashlib.sha256(senha.encode()).hexdigest()
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute('SELECT id FROM usuarios WHERE email=?', (email,)).fetchone():
            conn.close()
            return jsonify({'error': 'Email já cadastrado'}), 400
        cursor.execute(f'''
            INSERT INTO usuarios (nome,email,senha_hash,perfil,{",".join(_PERM_COLS)})
            VALUES (?,?,?,?,{",".join(["?"]*len(_PERM_COLS))})
        ''', (nome, email, senha_hash, perfil, *[int(perms[c]) for c in _PERM_COLS]))
        conn.commit()
        usuario_id = cursor.lastrowid
        conn.close()
        return jsonify({'message': 'Usuário criado com sucesso', 'id': usuario_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email já cadastrado'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/usuarios/<int:usuario_id>', methods=['PUT'])
def atualizar_usuario(usuario_id):
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        if not cursor.execute('SELECT id FROM usuarios WHERE id=?', (usuario_id,)).fetchone():
            conn.close()
            return jsonify({'error': 'Usuário não encontrado'}), 404
        email = data.get('email')
        if email and cursor.execute('SELECT id FROM usuarios WHERE email=? AND id!=?', (email, usuario_id)).fetchone():
            conn.close()
            return jsonify({'error': 'Email já está em uso por outro usuário'}), 400
        updates, params = [], []
        for field in ['nome', 'email', 'perfil']:
            if data.get(field):
                updates.append(f'{field}=?')
                params.append(data.get(field))
        if data.get('senha'):
            updates.append('senha_hash=?')
            params.append(hashlib.sha256(data['senha'].encode()).hexdigest())
        for campo in _PERM_COLS:
            if campo in data:
                updates.append(f'{campo}=?')
                params.append(int(bool(data[campo])))
        if not updates:
            conn.close()
            return jsonify({'error': 'Nenhum campo para atualizar'}), 400
        params.append(usuario_id)
        cursor.execute(f'UPDATE usuarios SET {",".join(updates)} WHERE id=?', params)
        conn.commit()
        conn.close()
        return jsonify({'message': 'Usuário atualizado com sucesso'}), 200
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email já está em uso'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@portaria_bp.route('/api/usuarios/<int:usuario_id>', methods=['DELETE'])
def deletar_usuario(usuario_id):
    try:
        conn   = get_db()
        cursor = conn.cursor()
        if not cursor.execute('SELECT id FROM usuarios WHERE id=?', (usuario_id,)).fetchone():
            conn.close()
            return jsonify({'error': 'Usuário não encontrado'}), 404
        total_admins  = cursor.execute("SELECT COUNT(*) FROM usuarios WHERE perfil='administrador'").fetchone()[0]
        perfil_usuario = cursor.execute('SELECT perfil FROM usuarios WHERE id=?', (usuario_id,)).fetchone()[0]
        if perfil_usuario == 'administrador' and total_admins <= 1:
            conn.close()
            return jsonify({'error': 'Não é possível deletar o último administrador'}), 400
        cursor.execute('DELETE FROM usuarios WHERE id=?', (usuario_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Usuário deletado com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
