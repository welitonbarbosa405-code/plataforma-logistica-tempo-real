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
const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');

if (!usuarioLogado) {
    window.location.href = '/';
}

function formatarDataHoraLogin(isoString) {
    if (!isoString) return '--';
    const data = new Date(isoString);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR')}`;
}

function atualizarCabecalhoUsuario() {
    const perfil = (usuarioLogado?.perfil || 'visitante').toLowerCase();
    const perfilMap = {
        'administrador': 'ADMINISTRADOR',
        'supervisor': 'SUPERVISOR',
        'porteiro': 'PORTEIRO',
        'visitante': 'VISITANTE'
    };
    const perfilLabel = perfilMap[perfil] || perfil.toUpperCase();
    const nomeLabel   = usuarioLogado?.nome || usuarioLogado?.email || '--';

    // Rodapé
    const footerEmail  = document.getElementById('footerUsuarioEmail');
    const footerPerfil = document.getElementById('footerUsuarioPerfil');
    if (footerEmail)  footerEmail.textContent  = usuarioLogado?.email || '--';
    if (footerPerfil) footerPerfil.textContent = perfilLabel;

    // Sidebar — avatar e nome
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarRole = document.getElementById('sidebarUserRole');
    if (sidebarName) sidebarName.textContent = nomeLabel;
    if (sidebarRole) sidebarRole.textContent = perfilLabel;

    // Topbar — pill de usuário
    const headerPill = document.getElementById('headerUserPill');
    if (headerPill) headerPill.textContent = nomeLabel;

    // Mostrar botão de Usuários apenas para administradores
    const btnUsuarios = document.getElementById('btnUsuarios');
    if (btnUsuarios) {
        btnUsuarios.style.display = perfil === 'administrador' ? 'flex' : 'none';
    }
}

// Atualizar data e hora no rodapé
function atualizarDataHoraRodape() {
    const dayNames = [
        'Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira',
        'Quinta-Feira', 'Sexta-Feira', 'Sábado'
    ];
    
    const now = new Date();
    const dayName = dayNames[now.getDay()];
    const date = now.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
    });
    const time = now.toLocaleTimeString('pt-BR');
    const year = now.getFullYear();
    
    const footerDay = document.getElementById('footerDay');
    const footerDate = document.getElementById('footerDate');
    const footerTime = document.getElementById('footerTime');
    const footerYear = document.getElementById('footerYear');
    
    if (footerDay) footerDay.textContent = dayName;
    if (footerDate) footerDate.textContent = date;
    if (footerTime) footerTime.textContent = time;
    if (footerYear) footerYear.textContent = `© ${year}`;
}

// Atualizar data/hora a cada segundo
setInterval(atualizarDataHoraRodape, 1000);
atualizarDataHoraRodape();

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('usuarioLogado');
        window.location.href = '/';
    });
}

// ========== FUNÇÕES DE ABA ==========
function toggleFormPanel(name) {
    const panel = document.getElementById('formPanel' + name.charAt(0).toUpperCase() + name.slice(1));
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // focar no primeiro input ao abrir
        const firstInput = panel.querySelector('input, select');
        if (firstInput) setTimeout(() => firstInput.focus(), 50);
    }
}

function openTab(tabName, eventElement) {
    const tabs = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    // Atualizar botões no cabeçalho
    const navButtons = document.querySelectorAll('.nav-btn--tab');
    navButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Ativar a aba selecionada
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Ativar o botão correspondente no cabeçalho
    if (eventElement) {
        eventElement.classList.add('active');
    } else {
        // Se não houver eventElement, encontrar o botão pelo texto
        navButtons.forEach(btn => {
            if ((tabName === 'cadastro' && btn.textContent.includes('Cadastro')) ||
                (tabName === 'entrada' && btn.textContent.includes('Controle')) ||
                (tabName === 'janela' && btn.textContent.includes('Janela')) ||
                (tabName === 'dashboard' && btn.textContent.includes('Dashboard')) ||
                (tabName === 'usuarios' && btn.textContent.includes('Usuários'))) {
                btn.classList.add('active');
            }
        });
    }
    
    // Carregar dashboard quando a aba for aberta
    if (tabName === 'dashboard') {
        carregarDashboard();
    }
    
    // Carregar transportadoras para filtro quando a aba Janela for aberta
    if (tabName === 'janela') {
        carregarTransportadorasFiltro();
        carregarJanelas();
    }
    
    // Carregar usuários quando a aba for aberta
    if (tabName === 'usuarios') {
        carregarUsuarios();
    }

    if (tabName === 'cadastro') {
        carregarCadastros();
    } else if (tabName === 'entrada') {
        carregarEntradas();
    }
}

// ========== FUNÇÕES DE MENSAGEM ==========
function mostrarMensagem(texto, tipo = 'success') {
    const mensagem = document.getElementById('mensagem');
    mensagem.textContent = texto;
    mensagem.className = `mensagem ${tipo}`;
    setTimeout(() => {
        mensagem.style.display = 'none';
    }, 3000);
}

// ========== FUNÇÕES DE CADASTRO ==========
document.getElementById('formCadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        cpf: document.getElementById('cpf').value.replace(/\D/g, ''),
        nome: document.getElementById('nome').value,
        telefone: document.getElementById('telefone').value.replace(/\D/g, ''),
        placa: document.getElementById('placaCadastro').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        integracao: document.getElementById('integracao').value,
        empresa: document.getElementById('empresa').value,
        transportadora: document.getElementById('transportadora').value
    };

    try {
        const response = await fetch(`${API_URL}/cadastros`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Cadastro realizado com sucesso!', 'success');
            limparFormCadastro();
            toggleFormPanel('cadastro');
            carregarCadastros();
        } else {
            mostrarMensagem(data.error || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
});

async function carregarCadastros() {
    try {
        const response = await fetch(`${API_URL}/cadastros`);
        const cadastros = await response.json();
        
        const tbody = document.getElementById('tbodyCadastros');
        tbody.innerHTML = '';

        cadastros.forEach(cadastro => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatarCPF(cadastro.cpf)}</td>
                <td>${cadastro.nome}</td>
                <td>${formatarTelefone(cadastro.telefone)}</td>
                <td><strong>${cadastro.placa || '-'}</strong></td>
                <td>${cadastro.integracao || '-'}</td>
                <td>${cadastro.empresa || '-'}</td>
                <td>${cadastro.transportadora || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="editarCadastro('${cadastro.cpf}')">✏️ Editar</button>
                        <button class="btn btn-danger" onclick="deletarCadastro('${cadastro.cpf}')">🗑️ Excluir</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar cadastros:', error);
        mostrarMensagem('Erro ao carregar cadastros', 'error');
    }
}

async function editarCadastro(cpf) {
    try {
        const response = await fetch(`${API_URL}/cadastros/${cpf}`);
        const cadastro = await response.json();

        const panel = document.getElementById('formPanelCadastro');
        if (panel && panel.style.display === 'none') toggleFormPanel('cadastro');

        document.getElementById('cpf').value = formatarCPF(cadastro.cpf);
        document.getElementById('cpf').disabled = true;
        document.getElementById('nome').value = cadastro.nome;
        document.getElementById('telefone').value = formatarTelefone(cadastro.telefone);
        document.getElementById('placaCadastro').value = cadastro.placa || '';
        document.getElementById('integracao').value = cadastro.integracao || '';
        document.getElementById('empresa').value = cadastro.empresa || '';
        document.getElementById('transportadora').value = cadastro.transportadora || '';

        // Alterar o botão de submit para atualizar
        const form = document.getElementById('formCadastro');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = '✅ Atualizar';
        submitBtn.onclick = async (e) => {
            e.preventDefault();
            await atualizarCadastro(cpf);
        };

        // Scroll para o formulário
        document.getElementById('cadastro').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao carregar cadastro:', error);
        mostrarMensagem('Erro ao carregar cadastro', 'error');
    }
}

async function atualizarCadastro(cpf) {
    const formData = {
        nome: document.getElementById('nome').value,
        telefone: document.getElementById('telefone').value.replace(/\D/g, ''),
        placa: document.getElementById('placaCadastro').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        integracao: document.getElementById('integracao').value,
        empresa: document.getElementById('empresa').value,
        transportadora: document.getElementById('transportadora').value
    };

    try {
        const response = await fetch(`${API_URL}/cadastros/${cpf}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Cadastro atualizado com sucesso!', 'success');
            limparFormCadastro();
            carregarCadastros();
        } else {
            mostrarMensagem(data.error || 'Erro ao atualizar', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

async function deletarCadastro(cpf) {
    if (!confirm('Tem certeza que deseja excluir este cadastro?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cadastros/${cpf}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Cadastro excluído com sucesso!', 'success');
            carregarCadastros();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

function limparFormCadastro() {
    document.getElementById('formCadastro').reset();
    document.getElementById('cpf').disabled = false;
    const submitBtn = document.querySelector('#formCadastro button[type="submit"]');
    submitBtn.textContent = 'Cadastrar';
    submitBtn.onclick = null;
}

function filtrarCadastros() {
    const filtro = document.getElementById('searchCadastro').value.toLowerCase();
    const linhas = document.querySelectorAll('#tbodyCadastros tr');
    
    linhas.forEach(linha => {
        const texto = linha.textContent.toLowerCase();
        linha.style.display = texto.includes(filtro) ? '' : 'none';
    });
}

// ========== FUNÇÕES DE ENTRADA/SAÍDA ==========
document.getElementById('formEntrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        data: new Date().toISOString().split('T')[0],
        tipo: document.getElementById('tipo').value,
        cpf: document.getElementById('cpfEntrada').value.replace(/\D/g, ''),
        nome: document.getElementById('nomeEntrada').value,
        telefone: document.getElementById('telefoneEntrada').value.replace(/\D/g, ''),
        integracao: document.getElementById('integracaoEntrada').value,
        placa: document.getElementById('placa').value.toUpperCase(),
        transportadora: document.getElementById('transportadoraEntrada').value,
        numero_coleta: document.getElementById('numeroColeta').value,
        empresa: document.getElementById('empresaEntrada').value,
        solicitante: document.getElementById('solicitante').value,
        vigilante: document.getElementById('vigilante').value
    };

    try {
        const response = await fetch(`${API_URL}/entradas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Entrada registrada com sucesso!', 'success');
            limparFormEntrada();
            toggleFormPanel('entrada');
            carregarEntradas();

            // Mostrar modal para imprimir ticket
            mostrarModalImprimirTicket(data.id, formData.nome);
        } else {
            mostrarMensagem(data.error || 'Erro ao registrar entrada', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
});

// ========== FUNÇÕES DE IMPRESSÃO DE TICKET ==========
function mostrarModalImprimirTicket(entradaId, nomeMotorista) {
    // Criar modal dinamicamente se não existir
    let modal = document.getElementById('modalImprimirTicket');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalImprimirTicket';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <span class="close-modal" onclick="fecharModalImprimirTicket()">&times;</span>
                <div style="padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">🎫</div>
                    <h2 style="color: #2E3440; margin-bottom: 10px;">Entrada Registrada!</h2>
                    <p id="ticketNomeMotorista" style="font-size: 16px; color: #4C566A; margin-bottom: 20px;"></p>
                    <p style="font-size: 14px; color: #666; margin-bottom: 25px;">Deseja imprimir o ticket de entrada?</p>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button onclick="imprimirTicket()" class="btn btn-primary" style="display: flex; align-items: center; gap: 8px; padding: 12px 25px; font-size: 15px;">
                            🖨️ Imprimir Ticket
                        </button>
                        <button onclick="fecharModalImprimirTicket()" class="btn btn-secondary" style="padding: 12px 25px; font-size: 15px;">
                            Não, obrigado
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Guardar o ID da entrada para usar na impressão
    modal.dataset.entradaId = entradaId;
    
    // Atualizar nome do motorista no modal
    document.getElementById('ticketNomeMotorista').textContent = `Motorista: ${nomeMotorista}`;
    
    // Mostrar modal
    modal.style.display = 'block';
}

function fecharModalImprimirTicket() {
    const modal = document.getElementById('modalImprimirTicket');
    if (modal) {
        modal.style.display = 'none';
    }
}

function imprimirTicket() {
    const modal = document.getElementById('modalImprimirTicket');
    const entradaId = modal.dataset.entradaId;
    
    if (entradaId) {
        // Fazer download do documento Word
        window.open(`${API_URL}/entradas/${entradaId}/ticket`, '_blank');
        mostrarMensagem('Ticket PDF gerado com sucesso! O download iniciará automaticamente.', 'success');
    }
    
    fecharModalImprimirTicket();
}

// Adicionar também um botão na tabela para imprimir ticket de entradas já existentes
function imprimirTicketExistente(entradaId) {
    window.open(`${API_URL}/entradas/${entradaId}/ticket`, '_blank');
    mostrarMensagem('Gerando ticket...', 'success');
}

async function buscarCadastroPorCPF() {
    const cpfInput = document.getElementById('cpfEntrada');
    const cpf = cpfInput.value.replace(/\D/g, '');
    const statusCPF = document.getElementById('statusCPF');
    const btnCadastrarRapido = document.getElementById('btnCadastrarRapido');
    
    // Limpar status anterior
    statusCPF.textContent = '';
    statusCPF.style.color = '';
    btnCadastrarRapido.style.display = 'none';
    
    if (cpf.length < 11) {
        if (cpf.length > 0) {
            statusCPF.textContent = '⚠️ CPF incompleto';
            statusCPF.style.color = '#ED1C24';
        }
        return;
    }

    try {
        const response = await fetch(`${API_URL}/cadastros/${cpf}`);
        
        if (response.ok) {
            // Cadastro encontrado - preencher campos
            const cadastro = await response.json();
            document.getElementById('nomeEntrada').value = cadastro.nome;
            document.getElementById('telefoneEntrada').value = formatarTelefone(cadastro.telefone);
            document.getElementById('placa').value = cadastro.placa || '';
            document.getElementById('integracaoEntrada').value = cadastro.integracao || '';
            document.getElementById('empresaEntrada').value = cadastro.empresa || '';
            document.getElementById('transportadoraEntrada').value = cadastro.transportadora || '';
            
            // Mostrar status de sucesso
            statusCPF.textContent = '✅ Motorista encontrado! Dados preenchidos automaticamente.';
            statusCPF.style.color = '#D0B580';
            
            // Esconder botão de cadastrar
            btnCadastrarRapido.style.display = 'none';
            
        } else if (response.status === 404) {
            // Cadastro não encontrado - mostrar opção de cadastrar
            statusCPF.textContent = '⚠️ Motorista não cadastrado. Clique em "Cadastrar" para criar o cadastro.';
            statusCPF.style.color = '#ED1C24';
            
            // Mostrar botão de cadastrar
            btnCadastrarRapido.style.display = 'block';
            
            // Limpar campos (exceto CPF)
            document.getElementById('nomeEntrada').value = '';
            document.getElementById('telefoneEntrada').value = '';
            document.getElementById('placa').value = '';
            document.getElementById('integracaoEntrada').value = '';
            document.getElementById('empresaEntrada').value = '';
            document.getElementById('transportadoraEntrada').value = '';
        }
    } catch (error) {
        console.error('Erro ao buscar cadastro:', error);
        statusCPF.textContent = '❌ Erro ao buscar cadastro. Tente novamente.';
        statusCPF.style.color = '#ED1C24';
    }
}

function abrirModalCadastroRapido() {
    const cpf = document.getElementById('cpfEntrada').value.replace(/\D/g, '');
    if (cpf.length < 11) {
        mostrarMensagem('CPF inválido. Digite um CPF completo.', 'error');
        return;
    }
    
    // Preencher CPF no modal (readonly)
    document.getElementById('cpfRapido').value = formatarCPF(cpf);
    
    // Preencher campos que já foram digitados no formulário de entrada
    document.getElementById('nomeRapido').value = document.getElementById('nomeEntrada').value;
    document.getElementById('telefoneRapido').value = document.getElementById('telefoneEntrada').value;
    document.getElementById('placaRapido').value = document.getElementById('placa').value;
    document.getElementById('integracaoRapido').value = document.getElementById('integracaoEntrada').value;
    document.getElementById('empresaRapido').value = document.getElementById('empresaEntrada').value;
    document.getElementById('transportadoraRapido').value = document.getElementById('transportadoraEntrada').value;
    
    // Mostrar modal
    document.getElementById('modalCadastroRapido').style.display = 'block';
}

function fecharModalCadastroRapido() {
    document.getElementById('modalCadastroRapido').style.display = 'none';
    document.getElementById('formCadastroRapido').reset();
}

// ========== MODAL DE AUTORIZAÇÃO ==========
let _autorizarId = null;

async function abrirModalAutorizar(id) {
    _autorizarId = id;
    try {
        const res = await fetch(`${API_URL}/entradas/${id}`);
        const entrada = await res.json();
        document.getElementById('modalAutorizarInfo').textContent =
            `Ticket #${id} — ${entrada.nome || ''} | Placa: ${entrada.placa || '-'} | ${entrada.tipo || '-'}`;
    } catch (_) {
        document.getElementById('modalAutorizarInfo').textContent = `Ticket #${id}`;
    }
    document.getElementById('autorizarDoca').value = '';
    document.getElementById('autorizarObs').value = '';
    document.getElementById('autorizarResponsavel').value = usuarioLogado?.nome || '';
    document.getElementById('modalAutorizar').style.display = 'flex';
}

function fecharModalAutorizar() {
    document.getElementById('modalAutorizar').style.display = 'none';
    _autorizarId = null;
}

async function confirmarAutorizacao(status) {
    if (!_autorizarId) return;
    const doca        = document.getElementById('autorizarDoca').value.trim();
    const observacao  = document.getElementById('autorizarObs').value.trim();
    const responsavel = document.getElementById('autorizarResponsavel').value.trim();

    try {
        const res = await fetch(`${API_URL}/entradas/${_autorizarId}/autorizar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, doca, observacao, autorizado_por: responsavel })
        });
        if (res.ok) {
            mostrarMensagem(status === 'autorizado' ? '✅ Entrada autorizada!' : '❌ Entrada recusada.', status === 'autorizado' ? 'success' : 'error');
            fecharModalAutorizar();
            carregarEntradas();
        } else {
            const data = await res.json();
            mostrarMensagem(data.error || 'Erro ao processar', 'error');
        }
    } catch (e) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
    }
}

// Cadastro rápido
document.getElementById('formCadastroRapido').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        cpf: document.getElementById('cpfRapido').value.replace(/\D/g, ''),
        nome: document.getElementById('nomeRapido').value,
        telefone: document.getElementById('telefoneRapido').value.replace(/\D/g, ''),
        placa: document.getElementById('placaRapido').value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        integracao: document.getElementById('integracaoRapido').value,
        empresa: document.getElementById('empresaRapido').value,
        transportadora: document.getElementById('transportadoraRapido').value
    };

    try {
        const response = await fetch(`${API_URL}/cadastros`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Motorista cadastrado com sucesso!', 'success');
            fecharModalCadastroRapido();
            
            // Buscar novamente para preencher o formulário de entrada
            await buscarCadastroPorCPF();
        } else {
            mostrarMensagem(data.error || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
});

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modalCadastro = document.getElementById('modalCadastroRapido');
    const modalTicket = document.getElementById('modalImprimirTicket');
    
    if (event.target == modalCadastro) {
        fecharModalCadastroRapido();
    }
    if (event.target == modalTicket) {
        fecharModalImprimirTicket();
    }
}

async function carregarEntradas() {
    try {
        const response = await fetch(`${API_URL}/entradas`);
        const entradas = await response.json();
        
        const tbody = document.getElementById('tbodyEntradas');
        tbody.innerHTML = '';

        entradas.forEach(entrada => {
            const tr = document.createElement('tr');

            // Badge de autorização
            const autStatus = entrada.status || 'aguardando';
            const autBadge = {
                aguardando: `<span class="status-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);font-weight:700;">⏳ Aguardando</span>`,
                autorizado: `<span class="status-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);font-weight:700;">✅ Autorizado</span>`,
                recusado:   `<span class="status-badge" style="background:rgba(204,0,0,0.15);color:#f87171;border:1px solid rgba(204,0,0,0.3);font-weight:700;">❌ Recusado</span>`,
            }[autStatus] || '';

            tr.innerHTML = `
                <td>${entrada.id}</td>
                <td>${formatarData(entrada.data)}</td>
                <td>${entrada.tipo || '-'}</td>
                <td>${formatarCPF(entrada.cpf)}</td>
                <td>${entrada.nome}</td>
                <td>${entrada.placa || '-'}</td>
                <td>${entrada.transportadora || '-'}</td>
                <td>${entrada.numero_coleta || '-'}</td>
                <td>${entrada.empresa || '-'}</td>
                <td>
                    <span class="status-badge status-entrada">
                        ${formatarDataHora(entrada.data_entrada, entrada.hora_entrada)}
                    </span>
                </td>
                <td>
                    ${entrada.data_saida ?
                        `<span class="status-badge status-saida">${formatarDataHora(entrada.data_saida, entrada.hora_saida)}</span>` :
                        autBadge
                    }
                </td>
                <td>
                    ${calcularTempoPermanencia(entrada.data_entrada, entrada.hora_entrada, entrada.data_saida, entrada.hora_saida)}
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-info" onclick="imprimirTicketExistente(${entrada.id})" title="Imprimir Ticket">🖨️</button>
                        ${!entrada.data_saida && autStatus === 'autorizado' ?
                            `<button class="btn btn-success" onclick="registrarSaida(${entrada.id})">Registrar Saída</button>` : ''
                        }
                        ${!entrada.data_saida && autStatus !== 'autorizado' ?
                            `<button class="btn" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#10b981;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:0.8rem;" onclick="abrirModalAutorizar(${entrada.id})">🔓 Autorizar</button>` : ''
                        }
                        <button class="btn btn-warning" onclick="editarEntrada(${entrada.id})">Editar</button>
                        <button class="btn btn-danger" onclick="deletarEntrada(${entrada.id})">Excluir</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Atualizar tempos em andamento a cada minuto
        setTimeout(() => {
            const emAndamento = entradas.filter(e => e.data_entrada && !e.data_saida);
            if (emAndamento.length > 0) {
                carregarEntradas();
            }
        }, 60000); // Atualizar a cada 1 minuto
    } catch (error) {
        console.error('Erro ao carregar entradas:', error);
        mostrarMensagem('Erro ao carregar entradas', 'error');
    }
}

async function registrarSaida(id) {
    if (!confirm('Deseja registrar a saída agora?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/entradas/${id}/saida`, {
            method: 'PUT'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Saída registrada com sucesso!', 'success');
            carregarEntradas();
        } else {
            mostrarMensagem(data.error || 'Erro ao registrar saída', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

async function editarEntrada(id) {
    try {
        const response = await fetch(`${API_URL}/entradas/${id}`);
        const entrada = await response.json();

        // Abrir painel se fechado e preencher formulário
        const panelE = document.getElementById('formPanelEntrada');
        if (panelE && panelE.style.display === 'none') toggleFormPanel('entrada');

        document.getElementById('cpfEntrada').value = formatarCPF(entrada.cpf);
        document.getElementById('nomeEntrada').value = entrada.nome;
        document.getElementById('telefoneEntrada').value = formatarTelefone(entrada.telefone);
        document.getElementById('integracaoEntrada').value = entrada.integracao || '';
        document.getElementById('placa').value = entrada.placa || '';
        document.getElementById('transportadoraEntrada').value = entrada.transportadora || '';
        document.getElementById('numeroColeta').value = entrada.numero_coleta || '';
        document.getElementById('empresaEntrada').value = entrada.empresa || '';
        document.getElementById('tipo').value = entrada.tipo || '';
        document.getElementById('solicitante').value = entrada.solicitante || '';
        document.getElementById('vigilante').value = entrada.vigilante || '';

        // Alterar o botão de submit para atualizar
        const form = document.getElementById('formEntrada');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Atualizar Entrada';
        submitBtn.onclick = async (e) => {
            e.preventDefault();
            await atualizarEntrada(id);
        };

        // Scroll para o formulário
        document.getElementById('entrada').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Erro ao carregar entrada:', error);
        mostrarMensagem('Erro ao carregar entrada', 'error');
    }
}

async function atualizarEntrada(id) {
    const formData = {
        data: new Date().toISOString().split('T')[0],
        tipo: document.getElementById('tipo').value,
        cpf: document.getElementById('cpfEntrada').value.replace(/\D/g, ''),
        nome: document.getElementById('nomeEntrada').value,
        telefone: document.getElementById('telefoneEntrada').value.replace(/\D/g, ''),
        integracao: document.getElementById('integracaoEntrada').value,
        placa: document.getElementById('placa').value.toUpperCase(),
        transportadora: document.getElementById('transportadoraEntrada').value,
        numero_coleta: document.getElementById('numeroColeta').value,
        empresa: document.getElementById('empresaEntrada').value,
        solicitante: document.getElementById('solicitante').value,
        vigilante: document.getElementById('vigilante').value
    };

    try {
        const response = await fetch(`${API_URL}/entradas/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Entrada atualizada com sucesso!', 'success');
            limparFormEntrada();
            carregarEntradas();
        } else {
            mostrarMensagem(data.error || 'Erro ao atualizar', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

async function deletarEntrada(id) {
    if (!confirm('Tem certeza que deseja excluir esta entrada?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/entradas/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Entrada excluída com sucesso!', 'success');
            carregarEntradas();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

function limparFormEntrada() {
    document.getElementById('formEntrada').reset();
    const submitBtn = document.querySelector('#formEntrada button[type="submit"]');
    submitBtn.textContent = 'Registrar Entrada';
    submitBtn.onclick = null;
    
    // Limpar status e botão de cadastrar
    document.getElementById('statusCPF').textContent = '';
    document.getElementById('statusCPF').style.color = '';
    document.getElementById('btnCadastrarRapido').style.display = 'none';
}

function filtrarEntradas() {
    const filtro = document.getElementById('searchEntrada').value.toLowerCase();
    const linhas = document.querySelectorAll('#tbodyEntradas tr');
    
    linhas.forEach(linha => {
        const texto = linha.textContent.toLowerCase();
        linha.style.display = texto.includes(filtro) ? '' : 'none';
    });
}

// ========== FUNÇÕES AUXILIARES ==========
function formatarCPF(cpf) {
    if (!cpf) return '';
    const cpfLimpo = cpf.replace(/\D/g, '');
    return cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarTelefone(telefone) {
    if (!telefone) return '';
    const telLimpo = telefone.replace(/\D/g, '');
    if (telLimpo.length === 11) {
        return telLimpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (telLimpo.length === 10) {
        return telLimpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return telefone;
}

// Formatar data no formato brasileiro DD/MM/YYYY
function formatarData(data) {
    if (!data) return '-';
    // Se já estiver no formato correto, retornar
    if (data.includes('/')) return data;
    // Converter de YYYY-MM-DD para DD/MM/YYYY
    const partes = data.split('T')[0].split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return data;
}

// Formatar data e hora no formato brasileiro DD/MM/YYYY HH:MM
function formatarDataHora(data, hora) {
    if (!data) return '-';
    const dataFormatada = formatarData(data);
    if (hora) {
        // Formatar hora para HH:MM (remover segundos se houver)
        const horaFormatada = hora.length > 5 ? hora.substring(0, 5) : hora;
        return `${dataFormatada} ${horaFormatada}`;
    }
    return dataFormatada;
}

// Calcular tempo de permanência entre entrada e saída
function calcularTempoPermanencia(dataEntrada, horaEntrada, dataSaida, horaSaida) {
    if (!dataEntrada || !horaEntrada) return '-';
    
    if (!dataSaida || !horaSaida) {
        // Calcular tempo desde a entrada até agora
        const entrada = new Date(`${dataEntrada}T${horaEntrada}`);
        const agora = new Date();
        const diffMs = agora - entrada;
        
        if (diffMs < 0) return '-';
        
        const diffMinutos = Math.floor(diffMs / 60000);
        const horas = Math.floor(diffMinutos / 60);
        const minutos = diffMinutos % 60;
        
        if (horas > 0) {
            return `<span class="tempo-badge tempo-em-andamento">${horas}h ${minutos}min</span>`;
        }
        return `<span class="tempo-badge tempo-em-andamento">${minutos}min</span>`;
    }
    
    // Calcular tempo entre entrada e saída
    const entrada = new Date(`${dataEntrada}T${horaEntrada}`);
    const saida = new Date(`${dataSaida}T${horaSaida}`);
    const diffMs = saida - entrada;
    
    if (diffMs < 0) return '-';
    
    const diffMinutos = Math.floor(diffMs / 60000);
    const horas = Math.floor(diffMinutos / 60);
    const minutos = diffMinutos % 60;
    
    // Classificar por duração para cores diferentes
    let classe = 'tempo-normal';
    if (diffMinutos < 15) {
        classe = 'tempo-rapido';
    } else if (diffMinutos > 120) {
        classe = 'tempo-longo';
    }
    
    if (horas > 0) {
        return `<span class="tempo-badge ${classe}">${horas}h ${minutos}min</span>`;
    }
    return `<span class="tempo-badge ${classe}">${minutos}min</span>`;
}

// Atualizar estatísticas
async function atualizarEstatisticas() {
    try {
        const [cadastrosRes, entradasRes] = await Promise.all([
            fetch('/api/cadastros'),
            fetch('/api/entradas')
        ]);
        
        const cadastros = await cadastrosRes.json();
        const entradas = await entradasRes.json();
        
        const hoje = new Date().toISOString().split('T')[0];
        const entradasHoje = entradas.filter(e => e.data_entrada && e.data_entrada.startsWith(hoje));
        const aguardandoSaida = entradas.filter(e => e.data_entrada && !e.data_saida);
        
        const statTotal = document.getElementById('statTotalCadastros');
        const statHoje = document.getElementById('statEntradasHoje');
        const statAguardando = document.getElementById('statAguardandoSaida');
        
        if (statTotal) {
            statTotal.textContent = cadastros.length || 0;
            statTotal.style.animation = 'pulse 0.5s ease';
        }
        if (statHoje) {
            statHoje.textContent = entradasHoje.length || 0;
            statHoje.style.animation = 'pulse 0.5s ease';
        }
        if (statAguardando) {
            statAguardando.textContent = aguardandoSaida.length || 0;
            statAguardando.style.animation = 'pulse 0.5s ease';
        }
    } catch (error) {
        console.error('Erro ao atualizar estatísticas:', error);
    }
}

// ========== FUNÇÕES DE JANELA ==========
let todasJanelas = []; // Armazenar todas as janelas para filtros

function formatarHora(horario) {
    if (!horario) return '-';
    // Se já estiver formatado, retornar
    if (horario.includes(':')) {
        const partes = horario.split(':');
        return `${partes[0]}:${partes[1]}`; // HH:MM
    }
    return horario;
}

// Validar horário em intervalos de 30 minutos
function validarHorario(horario) {
    if (!horario) return false;
    const partes = horario.split(':');
    if (partes.length !== 2) return false;
    const minutos = parseInt(partes[1]);
    return minutos === 0 || minutos === 30;
}

// Formulário de janela
document.getElementById('formJanela').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const horario = document.getElementById('horario').value;
    
    // Validar horário em intervalos de 30 minutos
    if (!validarHorario(horario)) {
        mostrarMensagem('O horário deve ser em intervalos de 30 minutos (ex: 08:00, 08:30, 09:00)', 'error');
        return;
    }
    
    const formData = {
        filial: document.getElementById('filial').value,
        transportadora: document.getElementById('transportadoraJanela').value,
        dia_semana: document.getElementById('diaSemana').value,
        horario: horario,
        tipo: document.getElementById('tipoJanela').value
    };

    try {
        const janelaId = document.getElementById('formJanela').dataset.editId;
        const url = janelaId ? `${API_URL}/janela/${janelaId}` : `${API_URL}/janela`;
        const method = janelaId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(janelaId ? 'Janela atualizada com sucesso!' : 'Janela cadastrada com sucesso!', 'success');
            limparFormJanela();
            toggleFormPanel('janela');
            carregarJanelas();
        } else {
            mostrarMensagem(data.error || 'Erro ao cadastrar janela', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
});

async function editarJanela(id) {
    try {
        const response = await fetch(`${API_URL}/janela/${id}`);
        const janela = await response.json();
        
        if (response.ok) {
            const panelJ = document.getElementById('formPanelJanela');
            if (panelJ && panelJ.style.display === 'none') toggleFormPanel('janela');

            document.getElementById('filial').value = janela.filial || '';
            document.getElementById('transportadoraJanela').value = janela.transportadora || '';
            document.getElementById('diaSemana').value = janela.dia_semana || '';
            document.getElementById('horario').value = janela.horario || '';
            document.getElementById('tipoJanela').value = janela.tipo || 'Coleta';

            document.getElementById('formJanela').dataset.editId = id;

            const submitBtn = document.querySelector('#formJanela button[type="submit"]');
            submitBtn.textContent = '✅ Atualizar';
        }
    } catch (error) {
        console.error('Erro ao carregar janela:', error);
        mostrarMensagem('Erro ao carregar janela', 'error');
    }
}

async function deletarJanela(id) {
    if (!confirm('Deseja realmente excluir esta janela?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/janela/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem('Janela excluída com sucesso!', 'success');
            carregarJanelas();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir janela', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

function limparFormJanela() {
    document.getElementById('formJanela').reset();
    delete document.getElementById('formJanela').dataset.editId;
    const submitBtn = document.querySelector('#formJanela button[type="submit"]');
    submitBtn.textContent = '✅ Cadastrar';
}

async function carregarJanelas() {
    try {
        const response = await fetch(`${API_URL}/janela`);
        todasJanelas = await response.json();
        
        const tbody = document.getElementById('tbodyJanelas');
        tbody.innerHTML = '';
        
        todasJanelas.forEach(janela => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${janela.id}</td>
                <td>${janela.filial || '-'}</td>
                <td>${janela.transportadora || '-'}</td>
                <td>${janela.dia_semana || '-'}</td>
                <td>${formatarHora(janela.horario)}</td>
                <td>${janela.tipo || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="editarJanela(${janela.id})">Editar</button>
                        <button class="btn btn-danger" onclick="deletarJanela(${janela.id})">Excluir</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        aplicarFiltrosJanela();
    } catch (error) {
        console.error('Erro ao carregar janelas:', error);
        mostrarMensagem('Erro ao carregar janelas', 'error');
    }
}

function filtrarJanelas() {
    aplicarFiltrosJanela();
}

function aplicarFiltrosJanela() {
    const filtroTransportadora = document.getElementById('filtroTransportadora')?.value || '';
    const filtroDiaSemana = document.getElementById('filtroDiaSemana')?.value || '';
    const filtroTipo = document.getElementById('filtroTipoJanela')?.value || '';
    const searchTerm = document.getElementById('searchJanela')?.value.toLowerCase() || '';
    
    const rows = document.querySelectorAll('#tbodyJanelas tr');
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;
        
        const transportadora = cells[2].textContent.trim();
        const diaSemana = cells[3].textContent.trim();
        const tipo = cells[5].textContent.trim();
        const text = row.textContent.toLowerCase();
        
        const matchTransportadora = !filtroTransportadora || transportadora === filtroTransportadora;
        const matchDiaSemana = !filtroDiaSemana || diaSemana === filtroDiaSemana;
        const matchTipo = !filtroTipo || tipo === filtroTipo;
        const matchSearch = !searchTerm || text.includes(searchTerm);
        
        row.style.display = (matchTransportadora && matchDiaSemana && matchTipo && matchSearch) ? '' : 'none';
    });
}

function limparFiltrosJanela() {
    document.getElementById('filtroTransportadora').value = '';
    document.getElementById('filtroDiaSemana').value = '';
    document.getElementById('filtroTipoJanela').value = '';
    document.getElementById('searchJanela').value = '';
    aplicarFiltrosJanela();
}

async function carregarTransportadorasFiltro() {
    try {
        const response = await fetch(`${API_URL}/janela`);
        const janelas = await response.json();
        
        const select = document.getElementById('filtroTransportadora');
        if (!select) return;
        
        // Limpar opções existentes (exceto "Todas")
        select.innerHTML = '<option value="">Todas</option>';
        
        // Obter transportadoras únicas
        const transportadoras = [...new Set(janelas.map(j => j.transportadora).filter(t => t))].sort();
        
        transportadoras.forEach(transportadora => {
            const option = document.createElement('option');
            option.value = transportadora;
            option.textContent = transportadora;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar transportadoras:', error);
    }
}

// ========== DASHBOARD ==========
let charts = {}; // Armazenar instâncias dos gráficos

async function carregarDashboard() {
    try {
        await Promise.all([
            carregarMetricasDashboard(),
            carregarGraficoEntradasHorario(),
            carregarGraficoEntradasTransportadora(),
            carregarGraficoEntradasDiaSemana(),
            carregarGraficoTempoPermanencia(),
            carregarEstatisticasTransportadora()
        ]);
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        mostrarMensagem('Erro ao carregar dados do dashboard', 'error');
    }
}

async function carregarMetricasDashboard() {
    try {
        const response = await fetch(`${API_URL}/dashboard/metrics`);
        const data = await response.json();
        
        document.getElementById('metricTotalEntradas').textContent = data.total_entradas || 0;
        document.getElementById('metricTempoMedio').textContent = `${data.tempo_medio_permanencia || 0} min`;
        document.getElementById('metricTotalTransportadoras').textContent = data.total_transportadoras || 0;
        document.getElementById('metricJanelasCadastradas').textContent = data.total_janelas || 0;
    } catch (error) {
        console.error('Erro ao carregar métricas:', error);
    }
}

async function carregarGraficoEntradasHorario() {
    try {
        const response = await fetch(`${API_URL}/dashboard/entradas-horario`);
        const data = await response.json();
        
        const ctx = document.getElementById('chartEntradasHorario');
        if (!ctx) return;
        
        // Destruir gráfico anterior se existir
        if (charts.entradasHorario) {
            charts.entradasHorario.destroy();
        }
        
        charts.entradasHorario = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.horas || [],
                datasets: [{
                    label: 'Entradas',
                    data: data.quantidades || [],
                    borderColor: '#CC0000',
                    backgroundColor: 'rgba(204, 0, 0, 0.12)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#CC0000',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico de horários:', error);
    }
}

async function carregarGraficoEntradasTransportadora() {
    try {
        const response = await fetch(`${API_URL}/dashboard/entradas-transportadora`);
        const data = await response.json();
        
        const ctx = document.getElementById('chartEntradasTransportadora');
        if (!ctx) return;
        
        if (charts.entradasTransportadora) {
            charts.entradasTransportadora.destroy();
        }
        
        charts.entradasTransportadora = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.transportadoras || [],
                datasets: [{
                    label: 'Entradas',
                    data: data.quantidades || [],
                    backgroundColor: 'rgba(204,0,0,0.75)',
                    borderColor: '#CC0000',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico de transportadoras:', error);
    }
}

async function carregarGraficoEntradasDiaSemana() {
    try {
        const response = await fetch(`${API_URL}/dashboard/entradas-dia-semana`);
        const data = await response.json();
        
        const ctx = document.getElementById('chartEntradasDiaSemana');
        if (!ctx) return;
        
        if (charts.entradasDiaSemana) {
            charts.entradasDiaSemana.destroy();
        }
        
        charts.entradasDiaSemana = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.dias || [],
                datasets: [{
                    label: 'Entradas',
                    data: data.quantidades || [],
                    backgroundColor: 'rgba(204,0,0,0.75)',
                    borderColor: '#CC0000',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: { color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, color: 'rgba(240,236,232,0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico de dias da semana:', error);
    }
}

async function carregarGraficoTempoPermanencia() {
    try {
        const response = await fetch(`${API_URL}/dashboard/tempo-permanencia`);
        const data = await response.json();
        
        const ctx = document.getElementById('chartTempoPermanencia');
        if (!ctx) return;
        
        if (charts.tempoPermanencia) {
            charts.tempoPermanencia.destroy();
        }
        
        const cores = ['#CC0000', '#3b82f6', '#10b981'];

        charts.tempoPermanencia = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.categorias || [],
                datasets: [{
                    data: data.quantidades || [],
                    backgroundColor: cores,
                    borderColor: '#1e1210',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(240,236,232,0.75)',
                            font: { size: 12 },
                            padding: 16
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico de tempo de permanência:', error);
    }
}

async function carregarEstatisticasTransportadora() {
    try {
        const response = await fetch(`${API_URL}/dashboard/estatisticas-transportadora`);
        const estatisticas = await response.json();
        
        const tbody = document.getElementById('tbodyEstatisticasTransportadora');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (estatisticas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px;">Nenhuma estatística disponível</td></tr>';
            return;
        }
        
        estatisticas.forEach(stat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${stat.transportadora}</strong></td>
                <td>${stat.total_entradas}</td>
                <td>${stat.tempo_medio} min</td>
                <td>${stat.entradas_hoje}</td>
                <td>${stat.janelas_cadastradas}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar estatísticas por transportadora:', error);
    }
}

// ========== FUNÇÕES DE USUÁRIOS ==========
document.getElementById('formUsuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        nome: document.getElementById('nomeUsuario').value,
        email: document.getElementById('emailUsuario').value,
        senha: document.getElementById('senhaUsuario').value,
        perfil: document.getElementById('perfilUsuario').value,
        // Coletar permissões
        perm_cadastro_criar: document.getElementById('perm_cadastro_criar').checked,
        perm_cadastro_editar: document.getElementById('perm_cadastro_editar').checked,
        perm_cadastro_excluir: document.getElementById('perm_cadastro_excluir').checked,
        perm_entrada_criar: document.getElementById('perm_entrada_criar').checked,
        perm_entrada_editar: document.getElementById('perm_entrada_editar').checked,
        perm_entrada_excluir: document.getElementById('perm_entrada_excluir').checked,
        perm_entrada_registrar_saida: document.getElementById('perm_entrada_registrar_saida').checked,
        perm_janela_criar: document.getElementById('perm_janela_criar').checked,
        perm_janela_editar: document.getElementById('perm_janela_editar').checked,
        perm_janela_excluir: document.getElementById('perm_janela_excluir').checked,
        perm_dashboard_visualizar: document.getElementById('perm_dashboard_visualizar').checked,
        perm_usuarios_gerenciar: document.getElementById('perm_usuarios_gerenciar').checked
    };
    
    // Validar senha apenas se estiver preenchida (para novos usuários ou quando quiser alterar)
    const usuarioId = document.getElementById('formUsuario').dataset.editId;
    if (!usuarioId && !formData.senha) {
        mostrarMensagem('Senha é obrigatória para novos usuários', 'error');
        return;
    }
    
    // Validar senha mínima se fornecida
    if (formData.senha && formData.senha.length < 6) {
        mostrarMensagem('A senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    
    try {
        const url = usuarioId ? `${API_URL}/usuarios/${usuarioId}` : `${API_URL}/usuarios`;
        const method = usuarioId ? 'PUT' : 'POST';
        
        // Se estiver editando e não forneceu senha, remover do objeto
        if (usuarioId && !formData.senha) {
            delete formData.senha;
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarMensagem(usuarioId ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!', 'success');
            limparFormUsuario();
            carregarUsuarios();
        } else {
            mostrarMensagem(data.error || 'Erro ao salvar usuário', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
});

async function carregarUsuarios() {
    try {
        const response = await fetch(`${API_URL}/usuarios`);
        const usuarios = await response.json();
        
        const tbody = document.getElementById('tbodyUsuarios');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px;">Nenhum usuário cadastrado</td></tr>';
            return;
        }
        
        usuarios.forEach(usuario => {
            const tr = document.createElement('tr');
            const perfilBadge = getPerfilBadge(usuario.perfil);
            const dataCriacao = formatarData(usuario.criado_em) || '-';
            
            tr.innerHTML = `
                <td>${usuario.id}</td>
                <td>${usuario.nome}</td>
                <td>${usuario.email}</td>
                <td>${perfilBadge}</td>
                <td>${dataCriacao}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="editarUsuario(${usuario.id})">Editar</button>
                        <button class="btn btn-danger" onclick="deletarUsuario(${usuario.id})">Excluir</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        mostrarMensagem('Erro ao carregar usuários', 'error');
    }
}

function getPerfilBadge(perfil) {
    const badges = {
        'administrador': '<span class="status-badge" style="background: #ED1C24; color: white; font-weight: 700;">ADMINISTRADOR</span>',
        'supervisor': '<span class="status-badge" style="background: #D0B580; color: #2E3440; font-weight: 700;">SUPERVISOR</span>',
        'porteiro': '<span class="status-badge" style="background: #2E3440; color: white; font-weight: 700;">PORTEIRO</span>'
    };
    return badges[perfil?.toLowerCase()] || perfil || '-';
}

async function editarUsuario(id) {
    try {
        const response = await fetch(`${API_URL}/usuarios/${id}`);
        const usuario = await response.json();
        
        if (response.ok) {
            document.getElementById('nomeUsuario').value = usuario.nome || '';
            document.getElementById('emailUsuario').value = usuario.email || '';
            document.getElementById('senhaUsuario').value = '';
            document.getElementById('senhaUsuario').required = false;
            document.getElementById('senhaUsuario').placeholder = 'Deixe em branco para manter a atual';
            document.getElementById('perfilUsuario').value = usuario.perfil || 'porteiro';
            
            // Carregar permissões
            document.getElementById('perm_cadastro_criar').checked = usuario.perm_cadastro_criar || false;
            document.getElementById('perm_cadastro_editar').checked = usuario.perm_cadastro_editar || false;
            document.getElementById('perm_cadastro_excluir').checked = usuario.perm_cadastro_excluir || false;
            document.getElementById('perm_entrada_criar').checked = usuario.perm_entrada_criar || false;
            document.getElementById('perm_entrada_editar').checked = usuario.perm_entrada_editar || false;
            document.getElementById('perm_entrada_excluir').checked = usuario.perm_entrada_excluir || false;
            document.getElementById('perm_entrada_registrar_saida').checked = usuario.perm_entrada_registrar_saida || false;
            document.getElementById('perm_janela_criar').checked = usuario.perm_janela_criar || false;
            document.getElementById('perm_janela_editar').checked = usuario.perm_janela_editar || false;
            document.getElementById('perm_janela_excluir').checked = usuario.perm_janela_excluir || false;
            document.getElementById('perm_dashboard_visualizar').checked = usuario.perm_dashboard_visualizar || false;
            document.getElementById('perm_usuarios_gerenciar').checked = usuario.perm_usuarios_gerenciar || false;
            
            // Ocultar asterisco de obrigatório na senha
            const senhaObrigatoria = document.getElementById('senhaObrigatoria');
            if (senhaObrigatoria) {
                senhaObrigatoria.style.display = 'none';
            }
            
            document.getElementById('formUsuario').dataset.editId = id;
            
            const submitBtn = document.querySelector('#formUsuario button[type="submit"]');
            submitBtn.textContent = '✅ Atualizar';
            
            document.getElementById('usuarios').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Erro ao carregar usuário:', error);
        mostrarMensagem('Erro ao carregar usuário', 'error');
    }
}

async function deletarUsuario(id) {
    if (!confirm('Deseja realmente excluir este usuário?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/usuarios/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            mostrarMensagem('Usuário excluído com sucesso!', 'success');
            carregarUsuarios();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir usuário', 'error');
        }
    } catch (error) {
        mostrarMensagem('Erro ao conectar com o servidor', 'error');
        console.error('Erro:', error);
    }
}

function limparFormUsuario() {
    const form = document.getElementById('formUsuario');
    if (!form) return;
    
    form.reset();
    delete form.dataset.editId;
    const senhaInput = document.getElementById('senhaUsuario');
    if (senhaInput) {
        senhaInput.required = true;
        senhaInput.placeholder = 'Digite a senha';
    }
    const senhaObrigatoria = document.getElementById('senhaObrigatoria');
    if (senhaObrigatoria) {
        senhaObrigatoria.style.display = 'inline';
    }
    const submitBtn = document.querySelector('#formUsuario button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = '✅ Salvar';
    }
    
    // Aplicar permissões padrão do perfil selecionado
    aplicarPermissoesPadrao();
}

function aplicarPermissoesPadrao() {
    const perfil = document.getElementById('perfilUsuario')?.value || 'porteiro';
    
    // Definir permissões padrão baseadas no perfil
    const permissoesPadrao = {
        'porteiro': {
            perm_cadastro_criar: true,
            perm_cadastro_editar: false,
            perm_cadastro_excluir: false,
            perm_entrada_criar: true,
            perm_entrada_editar: false,
            perm_entrada_excluir: false,
            perm_entrada_registrar_saida: true,
            perm_janela_criar: false,
            perm_janela_editar: false,
            perm_janela_excluir: false,
            perm_dashboard_visualizar: true,
            perm_usuarios_gerenciar: false
        },
        'supervisor': {
            perm_cadastro_criar: true,
            perm_cadastro_editar: true,
            perm_cadastro_excluir: false,
            perm_entrada_criar: true,
            perm_entrada_editar: true,
            perm_entrada_excluir: false,
            perm_entrada_registrar_saida: true,
            perm_janela_criar: true,
            perm_janela_editar: true,
            perm_janela_excluir: false,
            perm_dashboard_visualizar: true,
            perm_usuarios_gerenciar: false
        },
        'administrador': {
            perm_cadastro_criar: true,
            perm_cadastro_editar: true,
            perm_cadastro_excluir: true,
            perm_entrada_criar: true,
            perm_entrada_editar: true,
            perm_entrada_excluir: true,
            perm_entrada_registrar_saida: true,
            perm_janela_criar: true,
            perm_janela_editar: true,
            perm_janela_excluir: true,
            perm_dashboard_visualizar: true,
            perm_usuarios_gerenciar: true
        }
    };
    
    const permissoes = permissoesPadrao[perfil] || permissoesPadrao['porteiro'];
    
    // Aplicar permissões aos checkboxes
    for (const [key, value] of Object.entries(permissoes)) {
        const checkbox = document.getElementById(key);
        if (checkbox) {
            checkbox.checked = value;
        }
    }
}

function marcarTodasPermissoes() {
    const checkboxes = document.querySelectorAll('#formUsuario input[type="checkbox"][id^="perm_"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
}

function desmarcarTodasPermissoes() {
    const checkboxes = document.querySelectorAll('#formUsuario input[type="checkbox"][id^="perm_"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}

function filtrarUsuarios() {
    const searchTerm = document.getElementById('searchUsuario')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#tbodyUsuarios tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Carregar dados ao iniciar
document.addEventListener('DOMContentLoaded', () => {
    atualizarCabecalhoUsuario();
    atualizarDataHoraRodape();
    carregarCadastros();
    carregarEntradas();
    carregarJanelas();
    atualizarEstatisticas();
    
    // Aplicar permissões padrão ao carregar formulário de usuário
    const perfilSelect = document.getElementById('perfilUsuario');
    if (perfilSelect) {
        aplicarPermissoesPadrao();
    }
});

