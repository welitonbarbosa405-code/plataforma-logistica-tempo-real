import pandas as pd
import sqlite3
from datetime import datetime

# ─── CAMINHOS ───────────────────────────────────────────────────────────────
EXCEL_PATH = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\tabela_colaboradores.xlsx"
DB_PATH    = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\backend\portaria.db"
ABA        = "funcionarios"
# ────────────────────────────────────────────────────────────────────────────

def tratar_turno(x):
    """Banco só aceita 'Manhã', 'Tarde' ou 'Noite'. Padrão: 'Manhã' p/ editar no app."""
    val = str(x).strip() if pd.notna(x) else ""
    if val in ["Manhã", "Tarde", "Noite"]:
        return val
    return "Manhã"

def tratar_texto(x):
    """Campos de texto opcionais: vazio vira None (NULL no banco)."""
    if pd.isna(x):
        return None
    val = str(x).strip()
    return val if val not in ["", "nan"] else None

def importar_colaboradores():
    # 1. Lê a aba correta do Excel
    print("📂 Lendo aba 'funcionarios' do Excel...")
    df = pd.read_excel(EXCEL_PATH, sheet_name=ABA)

    # 2. Normaliza colunas
    df.columns = [col.strip().lower() for col in df.columns]

    colunas_esperadas = ["nome", "matricula", "cpf", "telefone", "turno", "setor", "ativo"]
    for col in colunas_esperadas:
        if col not in df.columns:
            df[col] = None

    # 3. Preenche valores padrão
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    df["ativo"]               = df["ativo"].apply(lambda x: int(x) if pd.notna(x) and str(x).strip() != "" else 1)
    df["is_motorista"]        = 0
    df["onibus_motorista_id"] = None
    df["criado_em"]           = agora
    df["atualizado_em"]       = agora

    # 4. Campos opcionais: vazio vira NULL (evita conflito UNIQUE em cpf, matricula, etc.)
    for col in ["matricula", "cpf", "telefone", "setor"]:
        df[col] = df[col].apply(tratar_texto)

    # nome: obrigatório, mantém string
    df["nome"] = df["nome"].apply(lambda x: str(x).strip() if pd.notna(x) else "")

    # turno: respeita CHECK constraint
    df["turno"] = df["turno"].apply(tratar_turno)

    # 5. Conecta ao banco e insere
    print("🔌 Conectando ao banco de dados...")
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    inseridos = 0
    erros     = 0

    for _, row in df.iterrows():
        try:
            cursor.execute("""
                INSERT INTO colaboradores 
                    (nome, matricula, cpf, telefone, turno, setor, ativo,
                     criado_em, atualizado_em, is_motorista, onibus_motorista_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row["nome"],
                row["matricula"],
                row["cpf"],
                row["telefone"],
                row["turno"],
                row["setor"],
                row["ativo"],
                row["criado_em"],
                row["atualizado_em"],
                row["is_motorista"],
                row["onibus_motorista_id"],
            ))
            inseridos += 1
        except Exception as e:
            print(f"  ⚠️  Erro na linha '{row.get('nome', '?')}': {e}")
            erros += 1

    conn.commit()
    conn.close()

    # 6. Resumo
    print("\n✅ Importação de colaboradores concluída!")
    print(f"   Registros inseridos : {inseridos}")
    print(f"   Erros               : {erros}")
    print(f"   Total no Excel      : {len(df)}")
    print("\n▶️  Agora rode o script: 2_importar_enderecos.py")

if __name__ == "__main__":
    importar_colaboradores()