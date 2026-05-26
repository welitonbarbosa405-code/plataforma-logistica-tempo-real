// Detectar automaticamente a URL da API baseada no hostname atual
function getApiUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port || '3000';
    
    // Se estiver em localhost, usar localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:${port}/api`;
    }
    
    // Caso contrário, usar o hostname atual (IP da rede ou domínio)
    return `http://${hostname}:${port}/api`;
}

const API_URL = getApiUrl();

const dayNames = [
    'Domingo',
    'Segunda-Feira',
    'Terça-Feira',
    'Quarta-Feira',
    'Quinta-Feira',
    'Sexta-Feira',
    'Sábado'
];

const loginForm = document.getElementById('loginForm');
const loginAlert = document.getElementById('loginAlert');
const statusDay = document.getElementById('statusDay');
const statusDate = document.getElementById('statusDate');
const statusTime = document.getElementById('statusTime');
const statusYear = document.getElementById('statusYear');

function updateClock() {
    const now = new Date();
    const dayName = dayNames[now.getDay()];
    const date = now.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
    });
    const time = now.toLocaleTimeString('pt-BR');

    if (statusDay) statusDay.textContent = dayName;
    if (statusDate) statusDate.textContent = date;
    if (statusTime) statusTime.textContent = time;
    if (statusYear) statusYear.textContent = `© ${now.getFullYear()}`;
}

setInterval(updateClock, 1000);
updateClock();

function showAlert(message) {
    if (!loginAlert) return;
    loginAlert.textContent = message;
    loginAlert.classList.add('show');
}

function clearAlert() {
    if (!loginAlert) return;
    loginAlert.textContent = '';
    loginAlert.classList.remove('show');
}

function normalizarNome(email) {
    if (!email.includes('@')) return email;
    const nome = email.split('@')[0].replace(/[._]/g, ' ');
    return nome
        .split(' ')
        .filter(Boolean)
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(' ');
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert();

    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value.trim();

    if (!email || !senha) {
        showAlert('Preencha todos os campos para continuar.');
        return;
    }

    if (!email.includes('@')) {
        showAlert('Digite um e-mail válido.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, senha })
        });

        const data = await response.json();

        if (response.ok) {
            // Salvar usuário no localStorage
            const usuario = {
                ...data.usuario,
                logadoEm: new Date().toISOString()
            };
            localStorage.setItem('usuarioLogado', JSON.stringify(usuario));
            window.location.href = '/app';
        } else {
            showAlert(data.error || 'Erro ao fazer login. Verifique suas credenciais.');
        }
    } catch (error) {
        console.error('Erro:', error);
        showAlert('Erro ao conectar com o servidor. Tente novamente.');
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
        loginForm?.requestSubmit();
    }
});

