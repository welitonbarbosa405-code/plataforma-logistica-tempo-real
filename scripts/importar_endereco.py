import pandas as pd
import sqlite3

# ─── CAMINHOS ───────────────────────────────────────────────────────────────
EXCEL_PATH = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\tabela_colaboradores.xlsx"
DB_PATH    = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\backend\portaria.db"
ABA        = "endereço"
# ────────────────────────────────────────────────────────────────────────────

def tratar_texto(x):
    """Vazio vira NULL."""
    if pd.isna(x):
        return None
    val = str(x).strip()
    return val if val not in ["", "nan"] else None

def importar_enderecos():
    # 1. Lê a aba correta do Excel
    print("📂 Lendo aba 'endereço' do Excel...")
    df = pd.read_excel(EXCEL_PATH, sheet_name=ABA)

    # 2. Normaliza colunas
    df.columns = [col.strip().lower() for col in df.columns]

    colunas_esperadas = ["nome", "rua", "numero", "complemento", "bairro", "cidade", "estado", "cep"]
    for col in colunas_esperadas:
        if col not in df.columns:
            df[col] = None

    # 3. Limpa todos os campos
    for col in colunas_esperadas:
        df[col] = df[col].apply(tratar_texto)

    # 4. Conecta ao banco
    print("🔌 Conectando ao banco de dados...")
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    inseridos       = 0
    erros           = 0
    nao_encontrados = []

    for _, row in df.iterrows():
        nome = row.get("nome")

        if not nome:
            print(f"  ⚠️  Linha sem nome, pulando...")
            erros += 1
            continue

        # 5. Busca o id do colaborador pelo nome
        cursor.execute("SELECT id FROM colaboradores WHERE nome = ?", (nome,))
        resultado = cursor.fetchone()

        if not resultado:
            print(f"  ⚠️  Colaborador não encontrado no banco: '{nome}'")
            nao_encontrados.append(nome)
            erros += 1
            continue

        colaborador_id = resultado[0]

        try:
            cursor.execute("""
                INSERT INTO colaborador_enderecos
                    (colaborador_id, logradouro, numero, complemento,
                     bairro, cidade, estado, cep, latitude, longitude)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                colaborador_id,
                row["rua"],
                row["numero"],
                row["complemento"],
                row["bairro"],
                row["cidade"],
                row["estado"],
                row["cep"],
                None,
                None,
            ))
            inseridos += 1
        except Exception as e:
            print(f"  ⚠️  Erro ao inserir endereço de '{nome}': {e}")
            erros += 1

    conn.commit()
    conn.close()

    # 6. Resumo
    print("\n✅ Importação de endereços concluída!")
    print(f"   Registros inseridos  : {inseridos}")
    print(f"   Erros                : {erros}")
    print(f"   Total no Excel       : {len(df)}")

    if nao_encontrados:
        print(f"\n⚠️  Colaboradores não encontrados no banco ({len(nao_encontrados)}):")
        for n in nao_encontrados:
            print(f"   - {n}")

if __name__ == "__main__":
    importar_enderecos()