import sqlite3
import urllib.request
import json
import time

# ─── CONFIGURAÇÕES ───────────────────────────────────────────────────────────
DB_PATH  = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\backend\portaria.db"
API_KEY  = "AIzaSyAK5tNlfXqF1bin7urWetpudnIj7lKzl-0"
# ─────────────────────────────────────────────────────────────────────────────

def geocodificar(endereco):
    """Chama a Google Maps Geocoding API e retorna (lat, lng) ou (None, None)."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={urllib.parse.quote(endereco)}&key={API_KEY}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        if data['status'] == 'OK':
            loc = data['results'][0]['geometry']['location']
            return loc['lat'], loc['lng']
        else:
            print(f"  ⚠️  Status: {data['status']} — {endereco}")
            return None, None
    except Exception as e:
        print(f"  ❌ Erro na API: {e}")
        return None, None

def main():
    import urllib.parse

    conn   = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Busca endereços sem lat/lng ainda
    cursor.execute('''
        SELECT e.id, e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep,
               c.nome
        FROM colaborador_enderecos e
        JOIN colaboradores c ON c.id = e.colaborador_id
        WHERE e.latitude IS NULL OR e.longitude IS NULL
    ''')
    enderecos = cursor.fetchall()

    total     = len(enderecos)
    sucesso   = 0
    falha     = 0

    print(f"🌍 Iniciando geocodificação de {total} endereços...\n")

    for i, row in enumerate(enderecos, 1):
        # Monta string do endereço
        partes = []
        if row['logradouro']: partes.append(row['logradouro'])
        if row['numero']:     partes.append(row['numero'])
        if row['bairro']:     partes.append(row['bairro'])
        if row['cidade']:     partes.append(row['cidade'])
        if row['estado']:     partes.append(row['estado'])
        if row['cep']:        partes.append(row['cep'])
        endereco_str = ', '.join(partes)

        print(f"[{i}/{total}] {row['nome']} — {endereco_str}")

        lat, lng = geocodificar(endereco_str)

        if lat and lng:
            cursor.execute('''
                UPDATE colaborador_enderecos
                SET latitude = ?, longitude = ?
                WHERE id = ?
            ''', (lat, lng, row['id']))
            conn.commit()
            print(f"         ✅ lat={lat:.6f}, lng={lng:.6f}")
            sucesso += 1
        else:
            falha += 1

        # Aguarda 50ms entre chamadas para não exceder o limite da API
        time.sleep(0.05)

    conn.close()

    print(f"\n{'='*50}")
    print(f"✅ Geocodificação concluída!")
    print(f"   Sucesso  : {sucesso}")
    print(f"   Falha    : {falha}")
    print(f"   Total    : {total}")

if __name__ == "__main__":
    main()