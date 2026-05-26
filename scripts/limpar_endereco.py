import sqlite3

DB_PATH = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\backend\portaria.db"

conn   = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("DELETE FROM colaborador_enderecos")
cursor.execute("DELETE FROM sqlite_sequence WHERE name='colaborador_enderecos'")

conn.commit()
conn.close()

print("✅ Tabela colaborador_enderecos limpa com sucesso!")