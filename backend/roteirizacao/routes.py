import math
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory

from database import get_db, sync_automatico

roteirizacao_bp = Blueprint('roteirizacao', __name__)

FRONTEND_DIR = (Path(__file__).resolve().parent.parent.parent / 'frontend').resolve()

API_KEY = 'AIzaSyAK5tNlfXqF1bin7urWetpudnIj7lKzl-0'


# ========== HELPERS ==========

def geocodificar_endereco(logradouro, numero, bairro, cidade, estado, cep):
    import urllib.parse, json, ssl, urllib.request
    partes = [p for p in [logradouro, str(numero) if numero else None, bairro, cidade, estado, cep] if p]
    endereco_str = ', '.join(partes)
    try:
        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={urllib.parse.quote(endereco_str)}&key={API_KEY}"
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(url, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())
        if data['status'] == 'OK':
            loc = data['results'][0]['geometry']['location']
            return loc['lat'], loc['lng']
    except Exception as e:
        print(f'[GEOCODE] Erro: {e}')
    return None, None


def distancia_km(lat1, lng1, lat2, lng2):
    R    = 6371
    dlat = (lat2 - lat1) * math.pi / 180
    dlng = (lng2 - lng1) * math.pi / 180
    a    = (math.sin(dlat/2)**2
            + math.cos(lat1*math.pi/180) * math.cos(lat2*math.pi/180) * math.sin(dlng/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def sugerir_tipo_veiculo(quantidade):
    if quantidade <= 4:
        return {'tipo': 'Carro',        'capacidade': 4,  'icon': '🚗'}
    elif quantidade <= 15:
        return {'tipo': 'Van',          'capacidade': 15, 'icon': '🚐'}
    elif quantidade <= 28:
        return {'tipo': 'Micro-ônibus', 'capacidade': 28, 'icon': '🚐'}
    return {'tipo': 'Ônibus', 'capacidade': 46, 'icon': '🚌'}


def otimizar_rota_google(pontos, api_key):
    import urllib.request, urllib.parse, json, ssl
    KUHN_LAT = -28.23328
    KUHN_LNG = -52.397115
    validos   = [p for p in pontos if p.get('latitude') and p.get('longitude')]
    invalidos = [p for p in pontos if not p.get('latitude') or not p.get('longitude')]
    if not validos:
        return pontos, 0, 0
    CHUNK  = 23
    chunks = [validos[i:i+CHUNK] for i in range(0, len(validos), CHUNK)]
    rota_final, total_dist, total_dur = [], 0, 0
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode    = ssl.CERT_NONE
    for chunk in chunks:
        chunk.sort(key=lambda p: distancia_km(p['latitude'], p['longitude'], KUHN_LAT, KUHN_LNG), reverse=True)
        origem  = f"{chunk[0]['latitude']},{chunk[0]['longitude']}"
        destino = f"{KUHN_LAT},{KUHN_LNG}"
        if len(chunk) == 1:
            rota_final.extend(chunk)
            d = distancia_km(chunk[0]['latitude'], chunk[0]['longitude'], KUHN_LAT, KUHN_LNG)
            total_dist += d * 2
            total_dur  += int((d / 40) * 60)
            continue
        waypoints = '|'.join(f"{p['latitude']},{p['longitude']}" for p in chunk[1:])
        params = {
            'origin': origem, 'destination': destino,
            'waypoints': f'optimize:true|{waypoints}',
            'key': api_key, 'language': 'pt-BR', 'region': 'BR'
        }
        url = 'https://maps.googleapis.com/maps/api/directions/json?' + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=15, context=ctx) as resp:
                data = json.loads(resp.read())
            if data['status'] == 'OK':
                route = data['routes'][0]
                order = route['waypoint_order']
                rota_final.extend([chunk[0]] + [chunk[1:][i] for i in order])
                for leg in route['legs']:
                    total_dist += leg['distance']['value'] / 1000
                    total_dur  += leg['duration']['value'] // 60
            else:
                chunk.sort(key=lambda p: distancia_km(p['latitude'], p['longitude'], KUHN_LAT, KUHN_LNG), reverse=True)
                rota_final.extend(chunk)
                d = sum(distancia_km(p['latitude'], p['longitude'], KUHN_LAT, KUHN_LNG) for p in chunk)
                total_dist += d * 0.5
                total_dur  += int((d / 40) * 60)
        except Exception as e:
            print(f'[DIRECTIONS] Erro: {e}')
            chunk.sort(key=lambda p: distancia_km(p['latitude'], p['longitude'], KUHN_LAT, KUHN_LNG), reverse=True)
            rota_final.extend(chunk)
    return rota_final + invalidos, round(total_dist, 1), total_dur


def vizinho_mais_proximo(pontos, origem_lat, origem_lng):
    if not pontos:
        return []
    KUHN_LAT = -28.23328
    KUHN_LNG = -52.397115
    validos   = [p for p in pontos if p.get('latitude') and p.get('longitude')]
    invalidos = [p for p in pontos if not p.get('latitude') or not p.get('longitude')]
    validos.sort(key=lambda p: distancia_km(p['latitude'], p['longitude'], KUHN_LAT, KUHN_LNG), reverse=True)
    return validos + invalidos


def roteirizar_por_bairro(colaboradores, capacidade_max):
    bairros = {}
    for c in colaboradores:
        b = (c.get('bairro') or 'SEM_BAIRRO').upper().strip()
        bairros.setdefault(b, []).append(c)

    def centroide(pessoas):
        lats = [p['latitude']  for p in pessoas if p.get('latitude')]
        lngs = [p['longitude'] for p in pessoas if p.get('longitude')]
        if not lats:
            return (-28.2576, -52.4089)
        return (sum(lats)/len(lats), sum(lngs)/len(lngs))

    blocos = []
    for nome_b, pessoas in bairros.items():
        lat, lng = centroide(pessoas)
        blocos.append({'bairro': nome_b, 'pessoas': pessoas, 'lat': lat, 'lng': lng, 'qtd': len(pessoas)})
    blocos.sort(key=lambda b: b['qtd'], reverse=True)

    grupos_finais, usados = [], set()
    for i, bloco in enumerate(blocos):
        if i in usados:
            continue
        grupo = list(bloco['pessoas'])
        usados.add(i)
        if len(grupo) > capacidade_max:
            n   = math.ceil(len(grupo) / capacidade_max)
            tam = math.ceil(len(grupo) / n)
            for k in range(0, len(grupo), tam):
                sub = grupo[k:k+tam]
                if sub:
                    grupos_finais.append(sub)
            continue
        while len(grupo) < capacidade_max * 0.80:
            melhor_j, melhor_d = None, float('inf')
            for j, viz in enumerate(blocos):
                if j in usados or len(grupo) + viz['qtd'] > capacidade_max:
                    continue
                d = distancia_km(bloco['lat'], bloco['lng'], viz['lat'], viz['lng'])
                if d < melhor_d and d <= 8.0:
                    melhor_d, melhor_j = d, j
            if melhor_j is None:
                break
            grupo.extend(blocos[melhor_j]['pessoas'])
            usados.add(melhor_j)
        grupos_finais.append(grupo)

    sobras = [b['pessoas'] for i, b in enumerate(blocos) if i not in usados]
    grandes = [g for g in grupos_finais if len(g) >= 10]
    minimos = [g for g in grupos_finais if len(g) < 10] + [s for s in sobras if len(s) < 10]
    sobras_n = [s for s in sobras if len(s) >= 10]

    for mini in minimos:
        lats = [p['latitude']  for p in mini if p.get('latitude')]
        lngs = [p['longitude'] for p in mini if p.get('longitude')]
        if not lats:
            grandes.append(mini)
            continue
        lat_m, lng_m = sum(lats)/len(lats), sum(lngs)/len(lngs)
        melhor, melhor_d = None, float('inf')
        for g in grandes:
            if len(g) + len(mini) > capacidade_max:
                continue
            glats = [p['latitude']  for p in g if p.get('latitude')]
            glngs = [p['longitude'] for p in g if p.get('longitude')]
            if not glats:
                continue
            d = distancia_km(lat_m, lng_m, sum(glats)/len(glats), sum(glngs)/len(glngs))
            if d < melhor_d:
                melhor_d, melhor = d, g
        if melhor is not None:
            melhor.extend(mini)
        else:
            grandes.append(mini)

    return grandes + sobras_n


# ========== ÔNIBUS ==========

@roteirizacao_bp.route('/api/rota/onibus', methods=['GET'])
def rota_listar_onibus():
    try:
        conn = get_db()
        rows = conn.execute('SELECT * FROM onibus ORDER BY nome').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/check', methods=['GET'])
def rota_check_onibus():
    placa = request.args.get('placa', '').upper()
    try:
        conn  = get_db()
        existe = conn.execute('SELECT id FROM onibus WHERE placa=?', (placa,)).fetchone() is not None
        conn.close()
        return jsonify({'existe': existe}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/todos-bairros', methods=['GET'])
def rota_todos_bairros():
    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM onibus WHERE ativo=1 ORDER BY nome')
        onibus = [dict(r) for r in cursor.fetchall()]
        for bus in onibus:
            bus['bairros']     = [r['bairro'] for r in cursor.execute(
                'SELECT bairro FROM onibus_bairros WHERE onibus_id=? ORDER BY bairro', (bus['id'],)
            ).fetchall()]
            bus['passageiros'] = cursor.execute(
                'SELECT COUNT(*) FROM rotas WHERE onibus_id=? AND ativo=1', (bus['id'],)
            ).fetchone()[0]
        conn.close()
        return jsonify(onibus), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/<int:id>', methods=['GET'])
def rota_buscar_onibus(id):
    try:
        conn = get_db()
        row  = conn.execute('SELECT * FROM onibus WHERE id=?', (id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Ônibus não encontrado'}), 404
        return jsonify(dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus', methods=['POST'])
def rota_criar_onibus():
    try:
        data          = request.get_json()
        nome          = data.get('nome', '').strip()
        placa         = data.get('placa', '').upper().strip()
        capacidade    = data.get('capacidade')
        ponto_origem  = data.get('ponto_origem', '').strip()
        horario_saida = data.get('horario_saida', '')
        if not all([nome, placa, capacidade, ponto_origem, horario_saida]):
            return jsonify({'error': 'Todos os campos são obrigatórios'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute('SELECT id FROM onibus WHERE placa=?', (placa,)).fetchone():
            conn.close()
            return jsonify({'error': 'Placa já cadastrada!'}), 400
        cep_origem         = data.get('cep_origem', '').strip() or None
        horario_saida_volta = data.get('horario_saida_volta', '17:30').strip() or '17:30'
        tipo_veiculo        = data.get('tipo_veiculo', 'Ônibus')
        cursor.execute('''
            INSERT INTO onibus (nome,placa,tipo_veiculo,capacidade,ponto_origem,cep_origem,horario_saida,horario_saida_volta)
            VALUES (?,?,?,?,?,?,?,?)
        ''', (nome, placa, tipo_veiculo, int(capacidade), ponto_origem, cep_origem, horario_saida, horario_saida_volta))
        bus_id = cursor.lastrowid
        orig_lat, orig_lng = geocodificar_endereco(ponto_origem, None, None, 'Passo Fundo', 'RS', cep_origem)
        if orig_lat:
            cursor.execute('UPDATE onibus SET origem_lat=?, origem_lng=? WHERE id=?', (orig_lat, orig_lng, bus_id))
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({'message': 'Ônibus cadastrado com sucesso', 'id': bus_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Placa já cadastrada!'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/<int:id>', methods=['PUT'])
def rota_atualizar_onibus(id):
    try:
        data  = request.get_json()
        placa = data.get('placa', '').upper().strip()
        conn   = get_db()
        cursor = conn.cursor()
        if cursor.execute('SELECT id FROM onibus WHERE placa=? AND id!=?', (placa, id)).fetchone():
            conn.close()
            return jsonify({'error': 'Placa já cadastrada em outro ônibus!'}), 400
        cursor.execute('''
            UPDATE onibus SET nome=?,placa=?,tipo_veiculo=?,capacidade=?,ponto_origem=?,cep_origem=?,
            horario_saida=?,horario_saida_volta=?,atualizado_em=datetime('now','localtime') WHERE id=?
        ''', (data.get('nome'), placa, data.get('tipo_veiculo', 'Ônibus'), data.get('capacidade'),
              data.get('ponto_origem'), data.get('cep_origem') or None,
              data.get('horario_saida'), data.get('horario_saida_volta', '17:30') or '17:30', id))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Ônibus não encontrado'}), 404
        ponto_origem = data.get('ponto_origem', '').strip()
        cep_origem   = data.get('cep_origem') or None
        if ponto_origem:
            orig_lat, orig_lng = geocodificar_endereco(ponto_origem, None, None, 'Passo Fundo', 'RS', cep_origem)
            if orig_lat:
                cursor.execute('UPDATE onibus SET origem_lat=?, origem_lng=? WHERE id=?', (orig_lat, orig_lng, id))
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({'message': 'Ônibus atualizado com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/<int:id>', methods=['DELETE'])
def rota_deletar_onibus(id):
    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rotas WHERE onibus_id=?', (id,))
        cursor.execute('DELETE FROM onibus WHERE id=?', (id,))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Ônibus não encontrado'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Ônibus excluído com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== BAIRROS ==========

@roteirizacao_bp.route('/api/rota/onibus/<int:id>/bairros', methods=['GET'])
def rota_listar_bairros(id):
    try:
        conn = get_db()
        rows = conn.execute('SELECT * FROM onibus_bairros WHERE onibus_id=? ORDER BY bairro', (id,)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/onibus/<int:id>/bairros', methods=['POST'])
def rota_salvar_bairros(id):
    try:
        data   = request.get_json()
        bairros = data.get('bairros', [])
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM onibus_bairros WHERE onibus_id=?', (id,))
        for b in bairros:
            b = b.strip()
            if b:
                cursor.execute('INSERT INTO onibus_bairros (onibus_id, bairro) VALUES (?,?)', (id, b))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Bairros salvos com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== COLABORADORES ==========

@roteirizacao_bp.route('/api/rota/colaboradores', methods=['GET'])
def rota_listar_colaboradores():
    try:
        conn = get_db()
        rows = conn.execute('''
            SELECT c.id, c.nome, c.matricula, c.turno, c.setor,
                   c.is_motorista, c.onibus_motorista_id,
                   e.logradouro, e.numero, e.complemento, e.bairro,
                   e.cidade, e.estado, e.cep, e.latitude, e.longitude
            FROM colaboradores c
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.ativo = 1
            ORDER BY c.nome
        ''').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/colaboradores/check', methods=['GET'])
def rota_check_colaborador():
    matricula = request.args.get('matricula', '').strip()
    cpf       = request.args.get('cpf', '').strip()
    try:
        conn = get_db()
        if matricula:
            existe = conn.execute('SELECT id FROM colaboradores WHERE matricula=?', (matricula,)).fetchone() is not None
        elif cpf:
            existe = conn.execute('SELECT id FROM colaboradores WHERE cpf=?', (cpf,)).fetchone() is not None
        else:
            existe = False
        conn.close()
        return jsonify({'existe': existe}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/colaboradores/<int:id>', methods=['GET'])
def rota_buscar_colaborador(id):
    try:
        conn = get_db()
        row  = conn.execute('''
            SELECT c.*, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.estado, e.cep
            FROM colaboradores c
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.id=?
        ''', (id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Colaborador não encontrado'}), 404
        return jsonify(dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/colaboradores', methods=['POST'])
def rota_criar_colaborador():
    try:
        data      = request.get_json()
        nome      = data.get('nome', '').strip()
        if not nome:
            return jsonify({'error': 'Nome é obrigatório'}), 400
        matricula = data.get('matricula', '').strip() or None
        cpf       = (data.get('cpf', '').replace('.', '').replace('-', '')) or None
        conn   = get_db()
        cursor = conn.cursor()
        if matricula and cursor.execute('SELECT id FROM colaboradores WHERE matricula=?', (matricula,)).fetchone():
            conn.close()
            return jsonify({'error': 'Matrícula já cadastrada!'}), 400
        if cpf and cursor.execute('SELECT id FROM colaboradores WHERE cpf=?', (cpf,)).fetchone():
            conn.close()
            return jsonify({'error': 'CPF já cadastrado!'}), 400
        cursor.execute('''
            INSERT INTO colaboradores (nome,matricula,cpf,telefone,turno,setor,is_motorista,onibus_motorista_id)
            VALUES (?,?,?,?,?,?,?,?)
        ''', (nome, matricula, cpf, data.get('telefone') or None,
              data.get('turno', 'Manhã'), data.get('setor') or None,
              1 if data.get('is_motorista') else 0, data.get('onibus_motorista_id') or None))
        colab_id  = cursor.lastrowid
        logradouro = data.get('logradouro', '').strip()
        bairro     = data.get('bairro', '').strip()
        if logradouro and bairro:
            lat, lng = geocodificar_endereco(
                logradouro, data.get('numero') or None, bairro,
                data.get('cidade', 'Passo Fundo') or 'Passo Fundo',
                'RS', data.get('cep') or None
            )
            cursor.execute('''
                INSERT INTO colaborador_enderecos
                (colaborador_id,logradouro,numero,complemento,bairro,cidade,estado,cep,latitude,longitude)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            ''', (colab_id, logradouro, data.get('numero') or None, data.get('complemento') or None,
                  bairro, data.get('cidade', 'Passo Fundo') or 'Passo Fundo',
                  'RS', data.get('cep') or None, lat, lng))
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({'message': 'Colaborador cadastrado com sucesso', 'id': colab_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Matrícula ou CPF já cadastrado!'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/colaboradores/<int:id>', methods=['PUT'])
def rota_atualizar_colaborador(id):
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE colaboradores SET nome=?,matricula=?,turno=?,setor=?,
            is_motorista=?,onibus_motorista_id=?,
            atualizado_em=datetime('now','localtime') WHERE id=?
        ''', (data.get('nome'), data.get('matricula') or None,
              data.get('turno', 'Manhã'), data.get('setor') or None,
              1 if data.get('is_motorista') else 0,
              data.get('onibus_motorista_id') or None, id))
        logradouro = data.get('logradouro', '').strip()
        bairro     = data.get('bairro', '').strip()
        end_row    = cursor.execute('SELECT id FROM colaborador_enderecos WHERE colaborador_id=?', (id,)).fetchone()
        if end_row:
            lat, lng = geocodificar_endereco(
                logradouro, data.get('numero') or None, bairro,
                data.get('cidade', 'Passo Fundo') or 'Passo Fundo',
                'RS', data.get('cep') or None
            )
            cursor.execute('''
                UPDATE colaborador_enderecos SET logradouro=?,numero=?,bairro=?,cidade=?,latitude=?,longitude=?
                WHERE colaborador_id=?
            ''', (logradouro, data.get('numero') or None, bairro,
                  data.get('cidade', 'Passo Fundo') or 'Passo Fundo', lat, lng, id))
        elif logradouro and bairro:
            lat, lng = geocodificar_endereco(
                logradouro, data.get('numero') or None, bairro,
                data.get('cidade', 'Passo Fundo') or 'Passo Fundo',
                'RS', data.get('cep') or None
            )
            cursor.execute('''
                INSERT INTO colaborador_enderecos (colaborador_id,logradouro,numero,bairro,cidade,estado,latitude,longitude)
                VALUES (?,?,?,?,?,?,?,?)
            ''', (id, logradouro, data.get('numero') or None, bairro,
                  data.get('cidade', 'Passo Fundo') or 'Passo Fundo', 'RS', lat, lng))
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({'message': 'Colaborador atualizado com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/colaboradores/<int:id>', methods=['DELETE'])
def rota_deletar_colaborador(id):
    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rotas WHERE colaborador_id=?', (id,))
        cursor.execute('DELETE FROM colaborador_enderecos WHERE colaborador_id=?', (id,))
        cursor.execute('DELETE FROM colaboradores WHERE id=?', (id,))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'error': 'Colaborador não encontrado'}), 404
        conn.commit()
        conn.close()
        return jsonify({'message': 'Colaborador excluído com sucesso'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== ROTAS / ALOCAÇÃO ==========

@roteirizacao_bp.route('/api/rota/rotas', methods=['GET'])
def rota_listar_rotas():
    try:
        conn = get_db()
        rows = conn.execute('SELECT * FROM rotas ORDER BY onibus_id, ordem_embarque').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/rotas/alocar', methods=['POST'])
def rota_alocar():
    try:
        data           = request.get_json()
        colaborador_id = data.get('colaborador_id')
        onibus_id      = data.get('onibus_id')
        ordem_embarque = data.get('ordem_embarque') or None
        if not colaborador_id:
            return jsonify({'error': 'colaborador_id é obrigatório'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rotas WHERE colaborador_id=?', (colaborador_id,))
        if onibus_id:
            bus = cursor.execute('SELECT capacidade FROM onibus WHERE id=?', (onibus_id,)).fetchone()
            if not bus:
                conn.close()
                return jsonify({'error': 'Ônibus não encontrado'}), 404
            ocupados = cursor.execute('SELECT COUNT(*) FROM rotas WHERE onibus_id=? AND ativo=1', (onibus_id,)).fetchone()[0]
            if ocupados >= bus['capacidade']:
                conn.close()
                return jsonify({'error': f'Ônibus lotado! Capacidade máxima: {bus["capacidade"]}'}), 400
            cursor.execute(
                'INSERT INTO rotas (onibus_id,colaborador_id,ordem_embarque,ativo) VALUES (?,?,?,1)',
                (onibus_id, colaborador_id, ordem_embarque)
            )
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({'message': 'Colaborador alocado com sucesso' if onibus_id else 'Colaborador desalocado'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== DESTINO ==========

@roteirizacao_bp.route('/api/rota/destino', methods=['GET'])
def rota_destino():
    try:
        conn = get_db()
        row  = conn.execute('SELECT * FROM destinos WHERE principal=1 LIMIT 1').fetchone()
        conn.close()
        if not row:
            return jsonify({'nome':'Kuhn Brasil','logradouro':'R. Arnô Pini','numero':'1380',
                            'bairro':'Invernadinha','cidade':'Passo Fundo','estado':'RS','cep':'99050-130'}), 200
        return jsonify(dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== RASTREAMENTO GPS ==========

@roteirizacao_bp.route('/api/rota/rastreamento', methods=['POST'])
def salvar_rastreamento():
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rastreamento_onibus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                onibus_id INTEGER NOT NULL,
                lat REAL NOT NULL, lng REAL NOT NULL,
                velocidade REAL DEFAULT 0, precisao REAL,
                atualizado_em TEXT DEFAULT (datetime('now','localtime'))
            )
        ''')
        cursor.execute('DELETE FROM rastreamento_onibus WHERE onibus_id=?', (data['onibus_id'],))
        cursor.execute(
            'INSERT INTO rastreamento_onibus (onibus_id, lat, lng, velocidade, precisao) VALUES (?,?,?,?,?)',
            (data['onibus_id'], data['lat'], data['lng'], data.get('velocidade', 0), data.get('precisao', 0))
        )
        conn.commit()
        conn.close()
        return jsonify({'message': 'OK'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/rastreamento/<int:onibus_id>', methods=['GET'])
def get_rastreamento(onibus_id):
    try:
        conn = get_db()
        try:
            row = conn.execute('SELECT * FROM rastreamento_onibus WHERE onibus_id=?', (onibus_id,)).fetchone()
        except Exception:
            row = None
        conn.close()
        if not row:
            return jsonify({'ativo': False}), 200
        dados = dict(row)
        dados['ativo'] = True
        return jsonify(dados), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/rastreamento', methods=['GET'])
def get_todos_rastreamentos():
    try:
        conn = get_db()
        try:
            rows = conn.execute('''
                SELECT r.*, o.nome, o.placa
                FROM rastreamento_onibus r
                JOIN onibus o ON o.id = r.onibus_id
            ''').fetchall()
            rows = [dict(r) for r in rows]
        except Exception:
            rows = []
        conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== CHECK-IN ==========

@roteirizacao_bp.route('/api/rota/checkin', methods=['POST'])
def registrar_checkin():
    try:
        data   = request.get_json()
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS checkin_embarque (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                colaborador_id INTEGER NOT NULL,
                onibus_id INTEGER NOT NULL,
                data_embarque TEXT NOT NULL,
                horario_estimado TEXT,
                horario_real TEXT DEFAULT (time('now','localtime')),
                sentido TEXT DEFAULT 'ida',
                embarcou INTEGER DEFAULT 1,
                criado_em TEXT DEFAULT (datetime('now','localtime'))
            )
        ''')
        data_hoje    = datetime.now().strftime('%Y-%m-%d')
        horario_real = datetime.now().strftime('%H:%M')
        existente    = cursor.execute('''
            SELECT id FROM checkin_embarque
            WHERE colaborador_id=? AND onibus_id=? AND data_embarque=? AND sentido=?
        ''', (data['colaborador_id'], data['onibus_id'], data_hoje, data.get('sentido', 'ida'))).fetchone()
        if existente:
            cursor.execute(
                'UPDATE checkin_embarque SET embarcou=?, horario_real=? WHERE id=?',
                (data.get('embarcou', 1), horario_real, existente['id'])
            )
        else:
            cursor.execute('''
                INSERT INTO checkin_embarque
                (colaborador_id, onibus_id, data_embarque, horario_estimado, horario_real, sentido, embarcou)
                VALUES (?,?,?,?,?,?,?)
            ''', (data['colaborador_id'], data['onibus_id'], data_hoje,
                  data.get('horario_estimado', ''), horario_real,
                  data.get('sentido', 'ida'), data.get('embarcou', 1)))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Check-in registrado', 'horario': horario_real}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/checkin/<int:onibus_id>', methods=['GET'])
def get_checkins(onibus_id):
    try:
        data_hoje = datetime.now().strftime('%Y-%m-%d')
        sentido   = request.args.get('sentido', 'ida')
        conn      = get_db()
        try:
            rows = conn.execute('''
                SELECT c.*, col.nome, col.matricula
                FROM checkin_embarque c
                JOIN colaboradores col ON col.id = c.colaborador_id
                WHERE c.onibus_id=? AND c.data_embarque=? AND c.sentido=?
            ''', (onibus_id, data_hoje, sentido)).fetchall()
            rows = [dict(r) for r in rows]
        except Exception:
            rows = []
        conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== APP COLABORADOR ==========

@roteirizacao_bp.route('/api/rota/colaborador/login', methods=['POST'])
def colaborador_login():
    try:
        data      = request.get_json()
        matricula = data.get('matricula', '').strip()
        if not matricula:
            return jsonify({'error': 'Matrícula obrigatória'}), 400
        conn  = get_db()
        colab = conn.execute('SELECT * FROM colaboradores WHERE matricula=? AND ativo=1', (matricula,)).fetchone()
        if not colab:
            conn.close()
            return jsonify({'error': 'Matrícula não encontrada'}), 404
        colab   = dict(colab)
        rota    = conn.execute('''
            SELECT r.*, o.nome as onibus_nome, o.placa, o.horario_saida, o.horario_saida_volta,
                   o.ponto_origem, r.ordem_embarque, r.horario_embarque_estimado
            FROM rotas r
            JOIN onibus o ON o.id = r.onibus_id
            WHERE r.colaborador_id=? AND r.ativo=1
        ''', (colab['id'],)).fetchone()
        endereco = conn.execute(
            'SELECT * FROM colaborador_enderecos WHERE colaborador_id=?', (colab['id'],)
        ).fetchone()
        conn.close()
        return jsonify({
            'colaborador': colab,
            'rota':     dict(rota)     if rota     else None,
            'endereco': dict(endereco) if endereco else None
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ========== ROTEIRIZAÇÃO AUTOMÁTICA ==========

@roteirizacao_bp.route('/api/rota/roteirizar', methods=['POST'])
def roteirizar_automatico():
    try:
        data          = request.get_json() or {}
        turno         = data.get('turno', 'Manhã')
        capacidade_ref = data.get('capacidade_veiculo', 46)
        usar_google   = data.get('usar_google', True)

        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.id, c.nome, c.matricula, c.turno, c.setor,
                   e.logradouro, e.numero, e.bairro, e.cidade, e.cep,
                   e.latitude, e.longitude
            FROM colaboradores c
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.ativo = 1 AND c.is_motorista = 0 AND c.turno = ?
              AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
        ''', (turno,))
        colaboradores = [dict(r) for r in cursor.fetchall()]
        sem_coords    = cursor.execute('''
            SELECT COUNT(*) FROM colaboradores c
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.ativo = 1 AND c.is_motorista = 0 AND c.turno = ?
              AND (e.latitude IS NULL OR e.longitude IS NULL)
        ''', (turno,)).fetchone()[0]
        conn.close()

        if not colaboradores:
            return jsonify({'error': f'Nenhum colaborador geocodificado no turno {turno}',
                            'sem_coords': sem_coords}), 400

        total      = len(colaboradores)
        grupos_raw = roteirizar_por_bairro(colaboradores, capacidade_ref)
        grupos     = []

        for i, grupo in enumerate(grupos_raw):
            if not grupo:
                continue
            qtd        = len(grupo)
            sugestao   = sugerir_tipo_veiculo(qtd)
            lat_centro = sum(p['latitude']  for p in grupo) / qtd
            lng_centro = sum(p['longitude'] for p in grupo) / qtd

            if usar_google:
                grupo_ord, dist_km, dur_min = otimizar_rota_google(grupo, API_KEY)
            else:
                grupo_ord = vizinho_mais_proximo(grupo, lat_centro, lng_centro)
                segs      = [distancia_km(grupo_ord[j]['latitude'], grupo_ord[j]['longitude'],
                                          grupo_ord[j+1]['latitude'], grupo_ord[j+1]['longitude'])
                             for j in range(len(grupo_ord)-1)
                             if grupo_ord[j].get('latitude') and grupo_ord[j+1].get('latitude')]
                dist_km = round(sum(segs) * 2, 1)
                dur_min = int((dist_km / 40) * 60)

            grupos.append({
                'grupo_id':      i + 1,
                'quantidade':    qtd,
                'centroide':     {'lat': lat_centro, 'lng': lng_centro},
                'sugestao':      sugestao,
                'distancia_km':  dist_km,
                'duracao_min':   dur_min,
                'colaboradores': [{
                    'id': c['id'], 'nome': c['nome'], 'matricula': c['matricula'],
                    'bairro': c['bairro'], 'logradouro': c['logradouro'],
                    'numero': c['numero'], 'cidade': c['cidade'],
                    'lat': c['latitude'], 'lng': c['longitude'], 'ordem': j + 1
                } for j, c in enumerate(grupo_ord)]
            })

        grupos.sort(key=lambda g: g['quantidade'], reverse=True)
        for i, g in enumerate(grupos):
            g['grupo_id'] = i + 1

        return jsonify({
            'turno': turno, 'total': total, 'k': len(grupos),
            'sem_coords': sem_coords, 'grupos': grupos,
            'resumo': {
                'total_colaboradores': total, 'total_grupos': len(grupos),
                'onibus_sugeridos':  sum(1 for g in grupos if g['sugestao']['tipo'] == 'Ônibus'),
                'micro_sugeridos':   sum(1 for g in grupos if g['sugestao']['tipo'] == 'Micro-ônibus'),
                'vans_sugeridas':    sum(1 for g in grupos if g['sugestao']['tipo'] == 'Van'),
                'carros_sugeridos':  sum(1 for g in grupos if g['sugestao']['tipo'] == 'Carro'),
                'total_km':  round(sum(g['distancia_km'] for g in grupos), 1),
                'total_min': sum(g['duracao_min'] for g in grupos),
            }
        }), 200
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/rota/roteirizar/aplicar', methods=['POST'])
def aplicar_roteirizacao():
    try:
        data          = request.get_json() or {}
        grupos        = data.get('grupos', [])
        turno         = data.get('turno', 'Manhã')
        horario_saida = data.get('horario_saida', '06:30')
        horario_volta = data.get('horario_volta', '17:30')
        ponto_origem  = data.get('ponto_origem', 'Passo Fundo - RS')
        if not grupos:
            return jsonify({'error': 'Nenhum grupo fornecido'}), 400
        conn   = get_db()
        cursor = conn.cursor()
        onibus_criados = colaboradores_alocados = 0
        for grupo in grupos:
            sugestao  = grupo.get('sugestao', {})
            tipo      = sugestao.get('tipo', 'Ônibus')
            cap       = sugestao.get('capacidade', 46)
            grupo_id  = grupo.get('grupo_id', 1)
            colabs    = grupo.get('colaboradores', [])
            nome_linha = f"Linha Auto {grupo_id:02d} — {turno}"
            placa      = f"AUTO-{grupo_id:03d}"
            bus_row    = cursor.execute('SELECT id FROM onibus WHERE placa=?', (placa,)).fetchone()
            if bus_row:
                bus_id = bus_row['id']
                cursor.execute('''
                    UPDATE onibus SET nome=?,tipo_veiculo=?,capacidade=?,
                    horario_saida=?,horario_saida_volta=?,atualizado_em=datetime('now','localtime')
                    WHERE id=?
                ''', (nome_linha, tipo, cap, horario_saida, horario_volta, bus_id))
            else:
                cursor.execute('''
                    INSERT INTO onibus (nome,placa,tipo_veiculo,capacidade,ponto_origem,horario_saida,horario_saida_volta)
                    VALUES (?,?,?,?,?,?,?)
                ''', (nome_linha, placa, tipo, cap, ponto_origem, horario_saida, horario_volta))
                bus_id = cursor.lastrowid
                onibus_criados += 1
            for colab in colabs:
                colab_id = colab.get('id')
                ordem    = colab.get('ordem', 1)
                if not colab_id:
                    continue
                cursor.execute('DELETE FROM rotas WHERE colaborador_id=?', (colab_id,))
                cursor.execute(
                    'INSERT INTO rotas (onibus_id,colaborador_id,ordem_embarque,ativo) VALUES (?,?,?,1)',
                    (bus_id, colab_id, ordem)
                )
                colaboradores_alocados += 1
        conn.commit()
        conn.close()
        sync_automatico()
        return jsonify({
            'message': 'Roteirização aplicada com sucesso!',
            'onibus_criados': onibus_criados,
            'colaboradores_alocados': colaboradores_alocados,
            'grupos_processados': len(grupos)
        }), 200
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ========== SYNC ==========

@roteirizacao_bp.route('/api/sync/gerar', methods=['GET'])
def gerar_dados_sync():
    try:
        conn   = get_db()
        cursor = conn.cursor()
        onibus = [dict(r) for r in cursor.execute('SELECT * FROM onibus WHERE ativo=1').fetchall()]
        colaboradores = [dict(r) for r in cursor.execute('''
            SELECT c.id, c.nome, COALESCE(c.matricula, CAST(c.id AS TEXT)) as matricula,
                   c.turno, c.is_motorista, c.onibus_motorista_id,
                   r.onibus_id, r.ordem_embarque, r.horario_embarque_estimado,
                   e.logradouro, e.numero, e.bairro, e.cep, e.cidade
            FROM colaboradores c
            LEFT JOIN rotas r ON r.colaborador_id = c.id AND r.ativo = 1
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.ativo = 1
        ''').fetchall()]
        conn.close()
        return jsonify({'onibus': onibus, 'colaboradores': colaboradores,
                        'gerado_em': datetime.now().isoformat()}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@roteirizacao_bp.route('/api/sync/enviar', methods=['GET', 'POST'])
def enviar_sync():
    import urllib.request, json as json_lib, os
    try:
        URL_RASTREAMENTO = os.environ.get('URL_RASTREAMENTO', 'https://web-production-78823.up.railway.app')
        SYNC_TOKEN       = os.environ.get('SYNC_TOKEN', 'kuhn-bus-sync-2025')
        conn   = get_db()
        cursor = conn.cursor()
        onibus = [dict(r) for r in cursor.execute('SELECT * FROM onibus WHERE ativo=1').fetchall()]
        colaboradores = [dict(r) for r in cursor.execute('''
            SELECT c.id, c.nome, COALESCE(c.matricula, CAST(c.id AS TEXT)) as matricula,
                   c.turno, c.is_motorista, c.onibus_motorista_id,
                   r.onibus_id, r.ordem_embarque, r.horario_embarque_estimado,
                   e.logradouro, e.numero, e.bairro, e.cep, e.cidade
            FROM colaboradores c
            LEFT JOIN rotas r ON r.colaborador_id = c.id AND r.ativo = 1
            LEFT JOIN colaborador_enderecos e ON e.colaborador_id = c.id
            WHERE c.ativo = 1
        ''').fetchall()]
        conn.close()
        payload = json_lib.dumps({'onibus': onibus, 'colaboradores': colaboradores}).encode('utf-8')
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        req = urllib.request.Request(
            f'{URL_RASTREAMENTO}/api/sync', data=payload,
            headers={'Content-Type': 'application/json', 'X-Sync-Token': SYNC_TOKEN},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            resultado = json_lib.loads(resp.read())
        return jsonify({'message': 'Sincronizado com sucesso!', 'resultado': resultado}), 200
    except urllib.error.HTTPError as http_err:
        return jsonify({'error': f'Railway retornou {http_err.code}',
                        'detalhe': http_err.read().decode('utf-8', errors='ignore')}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
