import sys
from pathlib import Path

# Carrega variáveis do .env automaticamente
_env_file = Path(__file__).resolve().parent / '.env'
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        if '=' in _line and not _line.startswith('#'):
            _k, _v = _line.split('=', 1)
            import os as _os
            _os.environ.setdefault(_k.strip(), _v.strip())

# Garante que os módulos irmãos (database, portaria, roteirizacao) sejam encontrados
sys.path.insert(0, str(Path(__file__).resolve().parent))

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from database import init_database, init_roteirizacao
from portaria.routes import portaria_bp
from roteirizacao.routes import roteirizacao_bp

BASE_DIR     = Path(__file__).resolve().parent
FRONTEND_DIR = (BASE_DIR / '..' / 'frontend').resolve()
IMAGES_DIR   = (BASE_DIR / '..' / 'img').resolve()

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='')
CORS(app)

app.register_blueprint(portaria_bp)
app.register_blueprint(roteirizacao_bp)


# ========== PÁGINAS ==========

@app.route('/')
def login_page():
    return send_from_directory(str(FRONTEND_DIR / 'portaria'), 'login.html')


@app.route('/app')
def app_page():
    return send_from_directory(str(FRONTEND_DIR / 'portaria'), 'index.html')


@app.route('/roteirizacao')
def roteirizacao_page():
    return send_from_directory(str(FRONTEND_DIR / 'roteirizacao'), 'index.html')


@app.route('/colaborador')
def colaborador_app():
    return send_from_directory(str(FRONTEND_DIR / 'roteirizacao'), 'colaborador.html')


@app.route('/manifest.json')
def manifest():
    return jsonify({
        "name": "Kuhn Bus — Meu Ônibus",
        "short_name": "KuhnBus",
        "description": "Acompanhe seu ônibus em tempo real",
        "start_url": "/colaborador",
        "display": "standalone",
        "background_color": "#ED1C24",
        "theme_color": "#ED1C24",
        "icons": [
            {"src": "/img/logo_kuhn.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/img/logo_kuhn.png", "sizes": "512x512", "type": "image/png"}
        ]
    })


@app.route('/img/<path:filename>')
def serve_images(filename):
    return send_from_directory(str(IMAGES_DIR), filename)


# ========== MAIN ==========

if __name__ == '__main__':
    init_database()
    init_roteirizacao()
    print('Servidor rodando em http://localhost:3000')
    app.run(host='0.0.0.0', port=3000, debug=True)
