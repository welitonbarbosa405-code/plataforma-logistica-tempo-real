import sqlite3

DB_PATH = r"C:\Users\kmbwba\Desktop\17 -Projeto Portaria\backend\portaria.db"

conn   = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("DELETE FROM colaboradores")
cursor.execute("DELETE FROM sqlite_sequence WHERE name='colaboradores'")

conn.commit()
conn.close()

print("✅ Tabela colaboradores limpa com sucesso!")