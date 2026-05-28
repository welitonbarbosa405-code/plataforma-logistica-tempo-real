// =============================================
// ROTEIRIZAÇÃO DE COLABORADORES — Kuhn Brasil
// roteirizacao.js
// =============================================

function getApiUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port || '3000';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:${port}/api`;
    }
    return `http://${hostname}:${port}/api`;
}


const API_URL = getApiUrl();
const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');

if (!usuarioLogado) {
    window.location.href = '/';
}

// ========== RODAPÉ / CABEÇALHO ==========
function atualizarCabecalhoUsuario() {
    const footerEmail = document.getElementById('footerUsuarioEmail');
    const footerPerfil = document.getElementById('footerUsuarioPerfil');
    const btnUsuarios = document.getElementById('btnUsuarios');

    if (footerEmail) footerEmail.textContent = usuarioLogado?.email || '--';
    if (footerPerfil) {
        const perfilMap = { admin: 'ADMINISTRADOR', operador: 'OPERADOR', visualizador: 'VISUALIZADOR' };
        footerPerfil.textContent = perfilMap[usuarioLogado?.perfil] || (usuarioLogado?.perfil || '').toUpperCase();
    }
    if (btnUsuarios && usuarioLogado?.perfil === 'admin') {
        btnUsuarios.style.display = 'inline-block';
    }
}

function atualizarDataHoraRodape() {
    const dayNames = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
    const now = new Date();
    const el = (id) => document.getElementById(id);
    if (el('footerDay'))  el('footerDay').textContent  = dayNames[now.getDay()];
    if (el('footerDate')) el('footerDate').textContent = now.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
    if (el('footerTime')) el('footerTime').textContent = now.toLocaleTimeString('pt-BR');
    if (el('footerYear')) el('footerYear').textContent = `© ${now.getFullYear()}`;
}

setInterval(atualizarDataHoraRodape, 1000);
atualizarDataHoraRodape();

document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem('usuarioLogado');
    window.location.href = '/';
});

// ========== ABAS ==========
function openTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn--tab').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabName);
    if (tab) tab.classList.add('active');
    if (el) el.classList.add('active');

    if (tabName === 'dashboard')      carregarDashboard();
    if (tabName === 'onibus')         carregarOnibus();
    if (tabName === 'colaboradores')  carregarColaboradores();
    if (tabName === 'rotas')          carregarRotas();
    if (tabName === 'cadastrar')      { carregarSelectsOnibus(); inicializarSeletsEstado(); }
    if (tabName === 'usuarios')       carregarUsuariosRota();
}

// ========== MENSAGEM ==========
function mostrarMensagem(texto, tipo = 'success') {
    const m = document.getElementById('mensagem');
    m.textContent = texto;
    m.className = `mensagem ${tipo}`;
    setTimeout(() => { m.style.display = 'none'; }, 3500);
}

// ========== MODAL ==========
function fecharModal() {
    document.getElementById('modal').style.display = 'none';
    // Parar GPS automaticamente ao fechar o painel do motorista
    const isPainelMotorista = document.getElementById('gpsStatus') !== null;
    if (isPainelMotorista && _gpsWatchId) {
        pararRastreamento();
    }
}
function fecharModalAlocar() { document.getElementById('modalAlocar').style.display = 'none'; }

window.onclick = (e) => {
    if (e.target === document.getElementById('modal')) fecharModal();
    if (e.target === document.getElementById('modalAlocar')) fecharModalAlocar();
};

// ========== FILTRO TABELA GENÉRICO ==========
function filtrarTabelaGenerica(tbodyId, termo) {
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(termo.toLowerCase()) ? '' : 'none';
    });
}

// ========== DASHBOARD ==========
const _dashCharts = {};

const CORES_ONIBUS = ['#ED1C24','#185FA5','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#65a30d'];

async function carregarDashboard() {
    try {
        const [onibusRes, colabsRes, rotasRes] = await Promise.all([
            fetch(`${API_URL}/rota/onibus`),
            fetch(`${API_URL}/rota/colaboradores`),
            fetch(`${API_URL}/rota/rotas`)
        ]);
        const onibus = await onibusRes.json();
        const colabs = await colabsRes.json();
        const rotas  = await rotasRes.json();

        const alocadosIds = rotas.filter(r => r.ativo).map(r => r.colaborador_id);
        // Excluir motoristas das métricas de passageiros
        const colabsPassageiros = colabs.filter(c => !c.is_motorista);
        const semRota = colabsPassageiros.filter(c => !alocadosIds.includes(c.id));

        // Métricas principais
        document.getElementById('metricTotalColabs').textContent = colabsPassageiros.length;
        document.getElementById('metricTotalOnibus').textContent = onibus.length;
        document.getElementById('metricAlocados').textContent    = alocadosIds.filter(id => colabsPassageiros.find(c=>c.id===id)).length;
        document.getElementById('metricSemRota').textContent     = semRota.length;

        // ===== ALERTAS INTELIGENTES =====
        const alertsEl = document.getElementById('dashAlerts');
        alertsEl.innerHTML = '';
        onibus.forEach(bus => {
            const pass = rotas.filter(r => r.onibus_id === bus.id && r.ativo).length;
            const pct  = Math.round((pass / bus.capacidade) * 100);
            if (pct >= 80) {
                const cor = pct >= 100 ? '#ED1C24' : '#f59e0b';
                const icon = pct >= 100 ? '🔴' : '🟡';
                const msg  = pct >= 100 ? 'LOTADO' : 'QUASE LOTADO';
                alertsEl.innerHTML += `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-left:4px solid ${cor};border-radius:8px;font-size:13px;color:#f0ece8;">
                        <span style="font-size:18px;">${icon}</span>
                        <strong>${bus.nome}</strong> — ${msg}: ${pass}/${bus.capacidade} passageiros (${pct}%)
                        <a href="#" onclick="openTab('cadastrar',null)" style="margin-left:auto;color:${cor};font-weight:600;font-size:12px;">Ver ônibus →</a>
                    </div>`;
            }
        });
        const vagasOciosas = onibus.filter(b => {
            const pass = rotas.filter(r => r.onibus_id === b.id && r.ativo).length;
            return (pass / b.capacidade) < 0.5;
        });
        vagasOciosas.forEach(bus => {
            const pass = rotas.filter(r => r.onibus_id === bus.id && r.ativo).length;
            const vagas = bus.capacidade - pass;
            alertsEl.innerHTML += `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-left:4px solid #10b981;border-radius:8px;font-size:13px;color:#f0ece8;">
                    <span style="font-size:18px;">🟢</span>
                    <strong>${bus.nome}</strong> — ${vagas} vagas disponíveis. Pode absorver mais colaboradores!
                </div>`;
        });
        if (semRota.length > 0) {
            alertsEl.innerHTML += `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(204,0,0,0.08);border:1px solid rgba(204,0,0,0.25);border-left:4px solid #CC0000;border-radius:8px;font-size:13px;color:#f0ece8;">
                    <span style="font-size:18px;">⚠️</span>
                    <strong>${semRota.length} colaborador${semRota.length>1?'es':''}</strong> sem ônibus definido.
                    <a href="#" onclick="openTab('colaboradores',null)" style="margin-left:auto;color:#CC0000;font-weight:600;font-size:12px;">Alocar agora →</a>
                </div>`;
        }
        // Avisar sobre motoristas cadastrados
        const motoristas = colabs.filter(c => c.is_motorista);
        if (motoristas.length > 0) {
            alertsEl.innerHTML += `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(24,95,165,0.12);border:1px solid rgba(96,165,250,0.2);border-left:4px solid #60a5fa;border-radius:8px;font-size:13px;color:#f0ece8;">
                    <span style="font-size:18px;">🚌</span>
                    <strong>${motoristas.length} motorista${motoristas.length>1?'s':''}</strong> cadastrado${motoristas.length>1?'s':''}: ${motoristas.map(m=>m.nome.split(' ')[0]).join(', ')}.
                </div>`;
        }

        // ===== GRÁFICO: PIZZA TURNOS =====
        const turnos = { 'Manhã': 0, 'Tarde': 0, 'Noite': 0 };
        colabsPassageiros.forEach(c => { if (turnos[c.turno] !== undefined) turnos[c.turno]++; });
        renderChart('chartTurnos', 'doughnut', {
            labels: Object.keys(turnos),
            datasets: [{
                data: Object.values(turnos),
                backgroundColor: ['#ED1C24','#D0B580','#2E3440'],
                borderColor: '#FFFFFF', borderWidth: 3
            }]
        }, { plugins: { legend: { position: 'bottom' } } });

        // ===== GRÁFICO: OCUPAÇÃO POR LINHA =====
        const nomesOnibus = onibus.map(b => b.nome);
        const pctOcupacao = onibus.map(b => {
            const pass = rotas.filter(r => r.onibus_id === b.id && r.ativo).length;
            return Math.round((pass / b.capacidade) * 100);
        });
        renderChart('chartOcupacao', 'bar', {
            labels: nomesOnibus,
            datasets: [{
                label: 'Ocupação (%)',
                data: pctOcupacao,
                backgroundColor: pctOcupacao.map(p => p >= 80 ? '#ED1C24' : p >= 60 ? '#D0B580' : '#10b981'),
                borderRadius: 6
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
        });

        // ===== GRÁFICO: BAIRROS =====
        const bairroCount = {};
        colabsPassageiros.forEach(c => {
            const b = c.bairro || 'Não informado';
            bairroCount[b] = (bairroCount[b] || 0) + 1;
        });
        const bairrosOrdenados = Object.entries(bairroCount).sort((a,b) => b[1]-a[1]).slice(0,10);
        renderChart('chartBairros', 'bar', {
            labels: bairrosOrdenados.map(b => b[0]),
            datasets: [{
                label: 'Colaboradores',
                data: bairrosOrdenados.map(b => b[1]),
                backgroundColor: '#185FA5', borderRadius: 6
            }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });

        // ===== TABELA RESUMO EXECUTIVO =====
        const tbody = document.getElementById('tbodyResumoExecutivo');
        tbody.innerHTML = '';
        onibus.forEach((bus, i) => {
            const pass = rotas.filter(r => r.onibus_id === bus.id && r.ativo).length;
            const pct  = Math.round((pass / bus.capacidade) * 100);
            const cor  = pct >= 80 ? '#ED1C24' : pct >= 60 ? '#f59e0b' : '#10b981';
            const status = pct >= 80 ? '🔴 Quase lotado' : pct >= 60 ? '🟡 Moderado' : '🟢 Disponível';
            const kmId = `km-resumo-${bus.id}`;
            const tempoId = `tempo-resumo-${bus.id}`;
            tbody.innerHTML += `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                    <td style="padding:10px 12px;font-weight:600;color:#f0ece8;">${bus.nome}</td>
                    <td style="padding:10px 12px;color:rgba(255,255,255,0.5);">${bus.placa}</td>
                    <td style="padding:10px 12px;color:rgba(255,255,255,0.5);">${bus.tipo_veiculo || 'Ônibus'}</td>
                    <td style="padding:10px 12px;text-align:center;font-weight:700;color:#f0ece8;">${pass}</td>
                    <td style="padding:10px 12px;text-align:center;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
                                <div style="width:${pct}%;height:100%;background:${cor};border-radius:3px;"></div>
                            </div>
                            <span style="font-size:12px;font-weight:700;color:${cor};">${pct}%</span>
                        </div>
                    </td>
                    <td style="padding:10px 12px;font-size:12px;color:#f0ece8;">${status}</td>
                    <td style="padding:10px 12px;text-align:center;font-weight:600;color:#f0ece8;">${bus.horario_saida ? bus.horario_saida.substring(0,5) : '--'}</td>
                    <td style="padding:10px 12px;text-align:center;font-weight:600;color:#f0ece8;">${bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '--'}</td>
                    <td style="padding:10px 12px;text-align:center;color:#60a5fa;font-weight:600;" id="${kmId}">—</td>
                    <td style="padding:10px 12px;text-align:center;color:#10b981;font-weight:600;" id="${tempoId}">—</td>
                </tr>`;

            // Calcular km/tempo via Google para cada linha
           // calcularKmLinha(bus, colabs, rotas, kmId, tempoId);
        });

        // ===== CARDS DE OCUPAÇÃO =====
        const grid = document.getElementById('dashboardOnibus');
        grid.innerHTML = '';
        onibus.forEach((bus, i) => {
            const pass = rotas.filter(r => r.onibus_id === bus.id && r.ativo).length;
            const pct  = Math.round((pass / bus.capacidade) * 100);
            const cor  = pct >= 80 ? '#ED1C24' : pct >= 60 ? '#D0B580' : '#10b981';
            grid.innerHTML += `
                <div class="rota-bus-card">
                    <div class="rota-bus-card-header">
                        <span class="rota-bus-nome">🚌 ${bus.nome}</span>
                        <span class="rota-bus-placa">${bus.placa}</span>
                    </div>
                    <div class="rota-bus-meta">📍 ${bus.ponto_origem}</div>
                    <div class="rota-bus-meta">🌅 IDA: <strong>${bus.horario_saida ? bus.horario_saida.substring(0,5) : '--'}</strong> &nbsp; 🌆 VOLTA: <strong>${bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '--'}</strong></div>
                    <div class="rota-cap-bar-wrap">
                        <div class="rota-cap-bar">
                            <div class="rota-cap-fill" style="width:${pct}%;background:${cor}"></div>
                        </div>
                        <span class="rota-cap-txt">${pass}/${bus.capacidade} (${pct}%)</span>
                    </div>
                </div>`;
        });

        // ===== ALERTA SEM ÔNIBUS =====
        const alerta = document.getElementById('alertaSemOnibus');
        const lista  = document.getElementById('listaSemOnibus');
        // Filtrar motoristas do alerta de sem ônibus
        const semRotaSemMotoristas = semRota.filter(c => !c.is_motorista);
        if (semRotaSemMotoristas.length > 0) {
            alerta.style.display = 'block';
            lista.innerHTML = semRotaSemMotoristas.map(c => `
                <div class="alerta-item">
                    <span>👤 <strong>${c.nome}</strong> — ${c.logradouro || ''}, ${c.bairro || ''}</span>
                    <button class="btn btn-warning" onclick="abrirModalAlocar(${c.id}, '${c.nome.replace(/'/g,"\'")}')">🚌 Alocar</button>
                </div>`).join('');
        } else {
            alerta.style.display = 'none';
        }

        // ===== MAPA GERAL + HEATMAP =====
        setTimeout(() => {
            renderMapaGeral(onibus, colabs, rotas);
            renderHeatmap(colabs);
        }, 500);

    } catch(e) {
        console.error(e);
        mostrarMensagem('Erro ao carregar dashboard', 'error');
    }
}

function renderChart(id, type, data, options = {}) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (_dashCharts[id]) _dashCharts[id].destroy();
    _dashCharts[id] = new Chart(ctx, {
        type,
        data,
        options: { responsive: true, maintainAspectRatio: false, ...options }
    });
}

async function calcularKmLinha(bus, colabs, rotas, kmId, tempoId) {
    // DESABILITADO — consome API do Google
}


function renderMapaGeral(onibus, colabs, rotas) {
    const mapEl = document.getElementById('dashMapaGeral');
    if (!mapEl || typeof google === 'undefined') return;

    const mapa = new google.maps.Map(mapEl, {
        center: { lat: -28.2576, lng: -52.4089 },
        zoom: 12,
        mapTypeId: 'roadmap',
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
        mapTypeControl: false, streetViewControl: false
    });

    const legenda = document.getElementById('dashMapaLegenda');
    legenda.innerHTML = '';

    onibus.forEach((bus, i) => {
        const cor = CORES_ONIBUS[i % CORES_ONIBUS.length];
        const passageiros = rotas
            .filter(r => r.onibus_id === bus.id && r.ativo)
            .map(r => colabs.find(c => c.id === r.colaborador_id))
            .filter(Boolean);

        legenda.innerHTML += `<span style="display:flex;align-items:center;gap:4px;font-size:12px;">
            <span style="width:14px;height:14px;border-radius:50%;background:${cor};display:inline-block;"></span>
            ${bus.nome}
        </span>`;

        if (passageiros.length === 0) return;

        // Marcador da garagem — usa coords salvas no banco, sem chamar API
        if (bus.origem_lat && bus.origem_lng) {
            new google.maps.Marker({
                position: { lat: bus.origem_lat, lng: bus.origem_lng }, map: mapa,
                title: `Garagem — ${bus.nome}`,
                icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: cor, fillOpacity: 1, strokeColor: '#FFF', strokeWeight: 2, scale: 12 },
                label: { text: 'G', color: 'white', fontSize: '9px', fontWeight: 'bold' }
            });
        }

        // Marcadores dos colaboradores

       passageiros.forEach((c, j) => {
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn('Colaborador sem coordenadas válidas:', c.nome, c.latitude, c.longitude);
        return;
    }

    new google.maps.Marker({
        position: { lat, lng },
        map: mapa,
        title: c.nome,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: cor,
            fillOpacity: 0.7,
            strokeColor: '#FFF',
            strokeWeight: 1,
            scale: 8
        },
        label: {
            text: String(j + 1),
            color: 'white',
            fontSize: '8px',
            fontWeight: 'bold'
        }
    });
});
    });

    // Marcador Kuhn Brasil — fora do forEach, aparece uma única vez
    new google.maps.Marker({
        position: coordsKuhn(), map: mapa,
        title: 'Kuhn Brasil',
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#2E3440', fillOpacity: 1, strokeColor: '#ED1C24', strokeWeight: 3, scale: 14 },
        label: { text: 'K', color: 'white', fontSize: '10px', fontWeight: 'bold' }
    });
}

function renderHeatmap(colabs) {
    const mapEl = document.getElementById('dashHeatmap');
    if (!mapEl || typeof google === 'undefined') return;

    const mapa = new google.maps.Map(mapEl, {
        center: { lat: -28.2576, lng: -52.4089 },
        zoom: 12, mapTypeId: 'roadmap',
        mapTypeControl: false, streetViewControl: false
    });

    const pontos = colabs
        .filter(c => c.latitude && c.longitude)
        .map(c => new google.maps.LatLng(c.latitude, c.longitude));

    if (pontos.length === 0) return;
    if (google.maps.visualization && google.maps.visualization.HeatmapLayer) {
        new google.maps.visualization.HeatmapLayer({
            data: pontos, map: mapa,
            radius: 30,
            gradient: ['rgba(0,0,0,0)','rgba(237,28,36,0.4)','rgba(237,28,36,0.8)','rgba(237,28,36,1)']
        });
    } else {
        pontos.forEach(p => {
            new google.maps.Circle({
                center: p, map: mapa,
                radius: 200,
                fillColor: '#ED1C24', fillOpacity: 0.25,
                strokeColor: '#ED1C24', strokeWeight: 0
            });
        });
    }
}

// ===== EXPORTAR RESUMO PDF =====
function exportarResumoPDF() {
    window.print();
}

// ===== EXPORTAR RESUMO EXCEL =====
function exportarResumoExcel() {
    const rows = document.querySelectorAll('#tbodyResumoExecutivo tr');
    let csv = 'Linha,Placa,Passageiros,Ocupação,Status,Horário IDA,Horário VOLTA,Km/dia,Tempo\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const vals = Array.from(cells).map((td, i) => {
            if (i === 3) return td.querySelector('span:last-child')?.textContent || '';
            return td.textContent.trim().replace(/,/g, ';');
        });
        csv += vals.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumo-rotas-${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarMensagem('✅ Relatório exportado com sucesso!');
}

// ========== ÔNIBUS ==========
async function carregarOnibus() {
    try {
        const [onibusRes, rotasRes, bairrosRes] = await Promise.all([
            fetch(`${API_URL}/rota/onibus`),
            fetch(`${API_URL}/rota/rotas`),
            fetch(`${API_URL}/rota/onibus/todos-bairros`)
        ]);
        const onibus  = await onibusRes.json();
        const rotas   = await rotasRes.json();
        const onibusBairros = bairrosRes.ok ? await bairrosRes.json() : [];

        let totalVagas = 0, totalOcupadas = 0;
        const tbody = document.getElementById('tbodyOnibus');
        tbody.innerHTML = '';

        onibus.forEach(bus => {
            const passageiros = rotas.filter(r => r.onibus_id === bus.id && r.ativo).length;
            const pct = Math.round((passageiros / bus.capacidade) * 100);
            const corBarra = pct >= 90 ? '#ED1C24' : pct >= 70 ? '#D0B580' : '#10b981';
            totalVagas    += bus.capacidade;
            totalOcupadas += passageiros;

            // Buscar bairros deste ônibus
            const busData = onibusBairros.find(b => b.id === bus.id);
            const bairros = busData?.bairros || [];
            const bairrosTags = bairros.length > 0
                ? bairros.map(b => `<span class="bairro-tag-mini">${b}</span>`).join('')
                : '<span style="color:#999;font-size:11px;">— sem bairros cadastrados —</span>';

            const statusBadge = bus.ativo
                ? '<span class="status-badge status-entrada">Ativo</span>'
                : '<span class="status-badge status-saida">Inativo</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${bus.nome}</strong></td>
                <td>${bus.placa}</td>
<td>${bus.tipo_veiculo || 'Ônibus'}</td>
<td>${bus.capacidade}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="flex:1;height:8px;background:#E8E8E8;border-radius:4px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:${corBarra};border-radius:4px;"></div>
                        </div>
                        <span style="font-size:0.8em;white-space:nowrap;">${passageiros}/${bus.capacidade}</span>
                    </div>
                </td>
                <td style="max-width:220px;">
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">${bairrosTags}</div>
                </td>
                <td>${bus.ponto_origem}</td>
                <td>${bus.horario_saida ? bus.horario_saida.substring(0,5) : '--'}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="editarOnibus(${bus.id})">✏️ Editar</button>
                        <button class="btn btn-success" onclick="abrirPainelMotorista(${bus.id})" title="Painel do Motorista">📍 GPS</button>
                        <button class="btn btn-danger" onclick="deletarOnibus(${bus.id})">🗑️ Excluir</button>
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });

        document.getElementById('statTotalOnibus').textContent   = onibus.length;
        document.getElementById('statTotalVagas').textContent    = totalVagas;
        document.getElementById('statVagasOcupadas').textContent = totalOcupadas;
        document.getElementById('statVagasLivres').textContent   = totalVagas - totalOcupadas;
    } catch(e) {
        console.error(e);
        mostrarMensagem('Erro ao carregar ônibus', 'error');
    }
}

async function editarOnibus(id) {
    try {
        const res = await fetch(`${API_URL}/rota/onibus/${id}`);
        const bus = await res.json();
        document.getElementById('modalBody').innerHTML = `
            <h2 style="color:#2E3440;margin-bottom:20px;">✏️ Editar Ônibus</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label>Nome da Linha</label>
                    <input type="text" id="editBusNome" value="${bus.nome}" style="width:100%;padding:10px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Placa</label>
                    <input type="text" id="editBusPlaca" value="${bus.placa}" style="width:100%;padding:10px;border:1px solid #D0B580;border-radius:6px;text-transform:uppercase;"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                <div class="form-group"><label>Capacidade</label>
                    <input type="number" id="editBusCap" value="${bus.capacidade}" min="1" style="width:100%;padding:10px;border:1px solid #D0B580;border-radius:6px;"></div>

                <div class="form-group"><label>Tipo de Veículo</label>
    <select id="editBusTipo" style="width:100%;padding:10px;border:1px solid #D0B580;border-radius:6px;">
        <option value="Ônibus" ${bus.tipo_veiculo==='Ônibus'?'selected':''}>🚌 Ônibus</option>
        <option value="Micro-ônibus" ${bus.tipo_veiculo==='Micro-ônibus'?'selected':''}>🚐 Micro-ônibus</option>
        <option value="Van" ${bus.tipo_veiculo==='Van'?'selected':''}>🚐 Van</option>
        <option value="Carro" ${bus.tipo_veiculo==='Carro'?'selected':''}>🚗 Carro</option>
    </select></div>
</div>
<div style="background:#F8F8F8;border:1px solid #E8E8E8;border-radius:10px;padding:14px;margin-top:10px;">
    <div style="font-weight:700;color:#2E3440;font-size:13px;margin-bottom:10px;">📍 Endereço da Garagem</div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
        <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:12px;">Logradouro *</label>
            <input type="text" id="editBusOrigem" value="${bus.ponto_origem}"
                placeholder="Ex: Rua Morom, 1200 - Bairro"
                style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:12px;">CEP</label>
            <input type="text" id="editBusCep" value="${bus.cep_origem || ''}"
                placeholder="99000-000"
                style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;">
        </div>
    </div>
    <small style="color:#666;font-size:11px;">O sistema geocodifica automaticamente ao salvar.</small>
</div>

            <!-- Bairros Atendidos -->
            <div class="form-group" style="margin-top:16px;padding-top:16px;border-top:1px solid #E8E8E8;">
                <label style="font-weight:700;color:#2E3440;">🏘️ Bairros Atendidos por esta Linha</label>

                <!-- Estado + Cidade -->
                <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin:10px 0;">
                    <div>
                        <label style="font-size:12px;">1️⃣ Estado</label>
                        <select id="editBusEstado" onchange="onEstadoChange('editBus')"
                            style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;font-size:0.9em;">
                            <option value="">Selecione...</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:12px;">2️⃣ Cidade</label>
                        <select id="editBusCidadeSelect" onchange="onCidadeChange('editBus')"
                            style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;font-size:0.9em;" disabled>
                            <option value="">Selecione o estado primeiro...</option>
                        </select>
                    </div>
                </div>

                <!-- Campo bairro com autocomplete -->
                <label style="font-size:12px;">3️⃣ Adicionar Bairros</label>
                <div style="display:flex;gap:8px;margin-bottom:8px;position:relative;">
                    <div style="flex:1;position:relative;">
                        <input type="text" id="editBusBairroInput"
                            placeholder="Selecione a cidade primeiro..."
                            style="width:100%;padding:8px 12px;border:1px solid #D0B580;border-radius:6px;font-size:0.9em;"
                            autocomplete="off"
                            oninput="onBairroInput('editBus')"
                            disabled>
                        <div id="editBusBairroDropdown" class="bairro-autocomplete-dropdown" style="display:none;"></div>
                    </div>
                    <button type="button" class="btn btn-secondary" onclick="adicionarBairroEdit()" style="white-space:nowrap;font-size:12px;">+ Adicionar</button>
                </div>

                <!-- Tags dos bairros -->
                <div id="editBusBairrosTags" class="bairros-tags-container" style="min-height:36px;"></div>
                <small style="color:#4A4A4A;">Clique no × para remover um bairro.</small>
            </div>

            <div class="form-actions" style="margin-top:20px;">
                <button class="btn btn-primary" onclick="salvarEdicaoOnibus(${id})">✅ Salvar</button>
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
            </div>`;

        // Carregar bairros e inicializar estados
        await carregarBairrosOnibus(id);
        inicializarSelectsEstadoEdit();
        document.getElementById('modal').style.display = 'block';

    } catch(e) {
        mostrarMensagem('Erro ao carregar ônibus', 'error');
    }
}

async function salvarEdicaoOnibus(id) {
    const dados = {
        nome: document.getElementById('editBusNome').value,
        placa: document.getElementById('editBusPlaca').value.toUpperCase(),
        tipo_veiculo: document.getElementById('editBusTipo')?.value || 'Ônibus',
        capacidade: parseInt(document.getElementById('editBusCap').value),
        ponto_origem: document.getElementById('editBusOrigem').value,
        cep_origem: document.getElementById('editBusCep')?.value || '',
        horario_saida: document.getElementById('editBusHorario')?.value || '17:30',
        horario_saida_volta: document.getElementById('editBusHorarioVolta')?.value || '17:30'
    };
    try {
        const res = await fetch(`${API_URL}/rota/onibus/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const data = await res.json();
        if (res.ok) {
            // Salvar bairros do modal de edição
            await salvarBairrosOnibus(id);
            mostrarMensagem('Ônibus atualizado com sucesso!');
            fecharModal();
            carregarOnibus();
        } else {
            mostrarMensagem(data.error || 'Erro ao atualizar', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
}

// ===== FUNÇÕES DO MODAL DE EDIÇÃO DE BAIRROS =====

function inicializarSelectsEstadoEdit() {
    const sel = document.getElementById('editBusEstado');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o estado...</option>' +
        ESTADOS_BR.map(e => `<option value="${e.uf}" ${e.uf==='RS'?'selected':''}>${e.uf} — ${e.nome}</option>`).join('');
    // Auto-carregar RS
    onEstadoChange('editBus');
}

function adicionarBairroEdit() {
    const input = document.getElementById('editBusBairroInput');
    if (!input) return;
    const valor = input.value.trim();
    if (!valor) return;
    const novos = valor.split(',').map(b => b.trim()).filter(Boolean);
    novos.forEach(b => {
        if (!window._busBairros.includes(b)) window._busBairros.push(b);
    });
    input.value = '';
    const dropdown = document.getElementById('editBusBairroDropdown');
    if (dropdown) dropdown.style.display = 'none';
    renderBairrosTagsEdit();
}

function removerBairroEdit(bairro) {
    window._busBairros = window._busBairros.filter(b => b !== bairro);
    renderBairrosTagsEdit();
}

function renderBairrosTagsEdit() {
    const container = document.getElementById('editBusBairrosTags');
    if (!container) return;
    container.innerHTML = window._busBairros.map(b =>
        `<span class="bairro-tag">
            ${b}
            <button type="button" onclick="removerBairroEdit('${b.replace(/'/g,"\'")}')">×</button>
        </span>`
    ).join('');
}

async function deletarOnibus(id) {
    if (!confirm('Excluir este ônibus? Os colaboradores serão desalocados.')) return;
    try {
        const res = await fetch(`${API_URL}/rota/onibus/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            mostrarMensagem('Ônibus excluído com sucesso!');
            carregarOnibus();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
}

// ========== COLABORADORES ==========
let todosColabs = [];

async function carregarColaboradores() {
    try {
        const [colabsRes, onibusRes, rotasRes] = await Promise.all([
            fetch(`${API_URL}/rota/colaboradores`),
            fetch(`${API_URL}/rota/onibus`),
            fetch(`${API_URL}/rota/rotas`)
        ]);
        todosColabs     = await colabsRes.json();
        const onibus    = await onibusRes.json();
        const rotas     = await rotasRes.json();

        // Atualizar filtro de ônibus
        const filtroSelect = document.getElementById('filtroOnibusColab');
        const onibusOpts   = onibus.map(b => `<option value="${b.id}">${b.nome}</option>`).join('');
        filtroSelect.innerHTML = `<option value="">Todos os ônibus</option><option value="sem">Sem ônibus</option>${onibusOpts}`;

        // Estatísticas
        const alocados = rotas.filter(r => r.ativo).map(r => r.colaborador_id);
        document.getElementById('statTotalColabs').textContent    = todosColabs.length;
        document.getElementById('statColabsAlocados').textContent = alocados.length;
        document.getElementById('statColabsSemBus').textContent   = todosColabs.filter(c => !alocados.includes(c.id) && !c.is_motorista).length;

        renderTabelaColaboradores(todosColabs, onibus, rotas);
    } catch(e) {
        console.error(e);
        mostrarMensagem('Erro ao carregar colaboradores', 'error');
    }
}

function renderTabelaColaboradores(colabs, onibus, rotas) {
    const tbody = document.getElementById('tbodyColaboradores');
    tbody.innerHTML = '';
    colabs.forEach(c => {
        const rota    = rotas.find(r => r.colaborador_id === c.id && r.ativo);
        const bus     = rota ? onibus.find(b => b.id === rota.onibus_id) : null;
        const busBadge = bus
            ? `<span class="status-badge status-entrada">${bus.nome}</span>`
            : (c.is_motorista
                ? `<span class="status-badge" style="background:#2E3440;color:white;">🚌 Motorista</span>`
                : `<span class="status-badge" style="background:#FAEEDA;color:#854F0B;">Sem ônibus</span>`);
        const enderecoCompleto = [c.logradouro, c.numero].filter(Boolean).join(', ');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.matricula || '-'}</td>
            <td><strong>${c.nome}</strong></td>
            <td>${enderecoCompleto || '-'}</td>
            <td>${c.bairro || '-'}</td>
            <td><span class="status-badge" style="background:#E6F1FB;color:#185FA5;">${c.turno}</span></td>
            <td>${c.setor || '-'}</td>
            <td>${busBadge}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="abrirModalAlocar(${c.id}, '${c.nome.replace(/'/g,"\\'")}')">🚌 Alocar</button>
                    <button class="btn btn-warning" onclick="editarColaborador(${c.id})">✏️ Editar</button>
                    <button class="btn btn-danger" onclick="deletarColaborador(${c.id})">🗑️ Excluir</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function filtrarColaboradores() {
    const termo  = document.getElementById('searchColabs').value.toLowerCase();
    const turno  = document.getElementById('filtroTurno').value;
    const onibus = document.getElementById('filtroOnibusColab').value;
    const rows   = document.querySelectorAll('#tbodyColaboradores tr');

    rows.forEach(row => {
        const txt        = row.textContent.toLowerCase();
        const matchTermo = !termo  || txt.includes(termo);
        const matchTurno = !turno  || txt.includes(turno.toLowerCase());
        // filtro de ônibus por badge no texto
        let matchOnibus = true;
        if (onibus === 'sem') matchOnibus = row.querySelector('td:nth-child(7)')?.textContent.includes('Sem ônibus');
        else if (onibus) matchOnibus = txt.includes(onibus);
        row.style.display = (matchTermo && matchTurno && matchOnibus) ? '' : 'none';
    });
}

async function editarColaborador(id) {
    try {
        const [colabRes, onibusRes, rotasRes] = await Promise.all([
            fetch(`${API_URL}/rota/colaboradores/${id}`),
            fetch(`${API_URL}/rota/onibus`),
            fetch(`${API_URL}/rota/rotas`)
        ]);
        const c      = await colabRes.json();
        const onibus = await onibusRes.json();
        const rotas  = await rotasRes.json();
        const rotaAtual = rotas.find(r => r.colaborador_id === id && r.ativo);

        const onibusOpts = onibus.map(b =>
            `<option value="${b.id}" ${rotaAtual?.onibus_id === b.id ? 'selected' : ''}>${b.nome} (${b.placa})</option>`
        ).join('');

        document.getElementById('modalBody').innerHTML = `
            <h2 style="color:#2E3440;margin-bottom:20px;">✏️ Editar Colaborador</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label>Matrícula</label>
                    <input type="text" id="editColMat" value="${c.matricula || ''}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Nome *</label>
                    <input type="text" id="editColNome" value="${c.nome}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Turno</label>
                    <select id="editColTurno" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;">
                        <option ${c.turno==='Manhã'?'selected':''}>Manhã</option>
                        <option ${c.turno==='Tarde'?'selected':''}>Tarde</option>
                        <option ${c.turno==='Noite'?'selected':''}>Noite</option>
                    </select></div>
                <div class="form-group"><label>Setor</label>
                    <input type="text" id="editColSetor" value="${c.setor || ''}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Logradouro</label>
                    <input type="text" id="editColLogr" value="${c.logradouro || ''}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Número</label>
                    <input type="text" id="editColNum" value="${c.numero || ''}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Bairro</label>
                    <input type="text" id="editColBairro" value="${c.bairro || ''}" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;"></div>
                <div class="form-group"><label>Ônibus / Linha (Passageiro)</label>
                    <select id="editColOnibus" style="width:100%;padding:8px;border:1px solid #D0B580;border-radius:6px;">
                        <option value="">— Sem ônibus —</option>${onibusOpts}
                    </select></div>
            </div>

            <!-- Campo Motorista -->
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid #E8E8E8;">
                <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#F8F8F8;border:2px solid ${c.is_motorista ? '#10b981' : '#E8E8E8'};border-radius:10px;cursor:pointer;margin-bottom:12px;"
                    onclick="toggleMotoristaEdit()">
                    <input type="checkbox" id="editColIsMotorista" ${c.is_motorista ? 'checked' : ''}
                        style="width:18px;height:18px;cursor:pointer;accent-color:#ED1C24;">
                    <div>
                        <div style="font-weight:700;color:#2E3440;font-size:14px;">🚌 Este colaborador é motorista</div>
                        <div style="font-size:12px;color:#666;margin-top:2px;">Marque se este colaborador dirige um ônibus da empresa</div>
                    </div>
                </div>
                <div id="editCampoOnibusMotorista" style="display:${c.is_motorista ? 'block' : 'none'};">
                    <div class="form-group">
                        <label>🚌 Ônibus que ele dirige</label>
                        <select id="editColOnibusMotorista" style="width:100%;padding:8px;border:2px solid #ED1C24;border-radius:8px;font-size:0.95em;">
                            <option value="">— Selecione o ônibus —</option>
                            ${onibus.map(b => `<option value="${b.id}" ${c.onibus_motorista_id === b.id ? 'selected' : ''}>${b.nome} (${b.placa})</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-actions" style="margin-top:20px;">
                <button class="btn btn-primary" onclick="salvarEdicaoColaborador(${id}, ${rotaAtual?.id || 'null'})">✅ Salvar</button>
                <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
            </div>`;
        document.getElementById('modal').style.display = 'block';
    } catch(e) {
        mostrarMensagem('Erro ao carregar colaborador', 'error');
    }
}

async function salvarEdicaoColaborador(id, rotaId) {
    const isMotorista = document.getElementById('editColIsMotorista')?.checked || false;
    const dados = {
        matricula:           document.getElementById('editColMat').value,
        nome:                document.getElementById('editColNome').value,
        turno:               document.getElementById('editColTurno').value,
        setor:               document.getElementById('editColSetor').value,
        logradouro:          document.getElementById('editColLogr').value,
        numero:              document.getElementById('editColNum').value,
        bairro:              document.getElementById('editColBairro').value,
        is_motorista:        isMotorista,
        onibus_motorista_id: isMotorista
            ? (document.getElementById('editColOnibusMotorista')?.value || null)
            : null
    };
    const novoOnibusId = document.getElementById('editColOnibus').value;

    try {
        const res = await fetch(`${API_URL}/rota/colaboradores/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (!res.ok) throw new Error();

        // Atualizar alocação
        await fetch(`${API_URL}/rota/rotas/alocar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colaborador_id: id, onibus_id: novoOnibusId || null })
        });

        mostrarMensagem('Colaborador atualizado com sucesso!');
        fecharModal();
        carregarColaboradores();
    } catch(e) {
        mostrarMensagem('Erro ao salvar colaborador', 'error');
    }
}

async function deletarColaborador(id) {
    if (!confirm('Excluir este colaborador? Ele será removido de todas as rotas.')) return;
    try {
        const res = await fetch(`${API_URL}/rota/colaboradores/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            mostrarMensagem('Colaborador excluído com sucesso!');
            carregarColaboradores();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
}

// ========== MODAL ALOCAR ==========
let colaboradorParaAlocar = null;

async function abrirModalAlocar(colaboradorId, nome) {
    colaboradorParaAlocar = colaboradorId;
    document.getElementById('modalAlocarNome').textContent = `Colaborador: ${nome}`;
    document.getElementById('modalOrdemEmbarque').value = '';

    try {
        const res    = await fetch(`${API_URL}/rota/onibus`);
        const onibus = await res.json();
        const sel    = document.getElementById('modalSelectOnibus');
        sel.innerHTML = `<option value="">— Sem ônibus —</option>` +
            onibus.map(b => `<option value="${b.id}">${b.nome} — ${b.placa} (${b.capacidade} lugares)</option>`).join('');
    } catch(e) { /* silencioso */ }

    document.getElementById('modalAlocar').style.display = 'block';
}

async function confirmarAlocacao() {
    const onibusId = document.getElementById('modalSelectOnibus').value;
    const ordem    = document.getElementById('modalOrdemEmbarque').value;
    try {
        const res = await fetch(`${API_URL}/rota/rotas/alocar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                colaborador_id: colaboradorParaAlocar,
                onibus_id: onibusId || null,
                ordem_embarque: ordem || null
            })
        });
        const data = await res.json();
        if (res.ok) {
            mostrarMensagem('Colaborador alocado com sucesso!');
            fecharModalAlocar();
            carregarDashboard();
            if (document.getElementById('colaboradores').classList.contains('active')) carregarColaboradores();
        } else {
            mostrarMensagem(data.error || 'Erro ao alocar', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
}

// ========== ROTAS ==========
// ========== GEOCODIFICAÇÃO (Google Maps Geocoding API) ==========
const _geoCache = {};

async function geocodificar(endereco) {
    if (_geoCache[endereco]) return _geoCache[endereco];
    try {
        const q = encodeURIComponent(endereco + ', Passo Fundo, RS, Brasil');
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=AIzaSyAK5tNlfXqF1bin7urWetpudnIj7lKzl-0&language=pt-BR`
        );
        const data = await res.json();
        if (data.status === 'OK' && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            const coords = { lat: loc.lat, lng: loc.lng };
            _geoCache[endereco] = coords;
            return coords;
        }
    } catch(e) { console.warn('Geocodificação falhou para:', endereco); }
    return null;
}

/**
 * Monta o melhor endereço possível para geocodificação
 * Prioridade: CEP + número > Logradouro + número + cidade > bairro + cidade
 */
function montarEnderecoGeo(colab) {
    // Prioridade 1: Logradouro + número + CEP + cidade (mais completo)
    if (colab.logradouro) {
        const num = colab.numero ? `, ${colab.numero}` : '';
        const cidade = colab.cidade || 'Passo Fundo';
        const cep = colab.cep ? ` - ${colab.cep}` : '';
        return `${colab.logradouro}${num}, ${cidade}, RS${cep}, Brasil`;
    }
    // Prioridade 2: CEP formatado + cidade
    if (colab.cep) {
        const cepLimpo = colab.cep.replace(/[^0-9]/g, '');
        const cepFmt = cepLimpo.length === 8 ? `${cepLimpo.substring(0,5)}-${cepLimpo.substring(5)}` : cepLimpo;
        const cidade = colab.cidade || 'Passo Fundo';
        return `${cepFmt}, ${cidade}, RS, Brasil`;
    }
    // Prioridade 3: Bairro + cidade
    if (colab.bairro) {
        const cidade = colab.cidade || 'Passo Fundo';
        return `${colab.bairro}, ${cidade}, RS, Brasil`;
    }
    return null;
}

// ========== ALGORITMO VIZINHO MAIS PRÓXIMO ==========
function distancia(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function otimizarRota(origem, paradas, destino) {
    if (paradas.length <= 1) return paradas;
    const naoVisitados = [...paradas];
    const rota = [];
    let atual = origem;
    while (naoVisitados.length > 0) {
        let menorDist = Infinity, melhorIdx = 0;
        naoVisitados.forEach((p, i) => {
            if (!p.coords) return;
            const d = distancia(atual, p.coords);
            if (d < menorDist) { menorDist = d; melhorIdx = i; }
        });
        rota.push(naoVisitados[melhorIdx]);
        atual = naoVisitados[melhorIdx].coords || atual;
        naoVisitados.splice(melhorIdx, 1);
    }
    return rota;
}

// ========== MAPAS GOOGLE MAPS ==========
const _mapas = {};
const _directionsRenderers = {};

// Converte segundos em "Xh Ymin" ou "Ymin"
function formatarTempo(segundos) {
    const h = Math.floor(segundos / 3600);
    const m = Math.round((segundos % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}

// Converte metros em "X,X km"
function formatarDistancia(metros) {
    if (metros >= 1000) return `${(metros/1000).toFixed(1).replace('.',',')} km`;
    return `${metros} m`;
}

// Soma minutos a um horário "HH:MM" e retorna "HH:MM"
function adicionarMinutos(horario, minutos) {
    const [h, m] = horario.split(':').map(Number);
    const total = h * 60 + m + minutos;
    const hf = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const mf = String(total % 60).padStart(2, '0');
    return `${hf}:${mf}`;
}

function inicializarMapa(mapId, pontos, horarioSaida, onInfoCallback) {
    if (_directionsRenderers[mapId]) {
        _directionsRenderers[mapId].setMap(null);
        delete _directionsRenderers[mapId];
    }

    const pontoValido = pontos.find(p => p.coords);
    const centro = pontoValido?.coords || { lat: -28.2576, lng: -52.4089 };

    const mapEl = document.getElementById(mapId);
    if (!mapEl) return;

    const mapa = new google.maps.Map(mapEl, {
        center: centro,
        zoom: 13,
        mapTypeId: 'roadmap',
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });
    _mapas[mapId] = mapa;

    const bounds = new google.maps.LatLngBounds();
    const infoWindow = new google.maps.InfoWindow();

    pontos.forEach((p, i) => {
        if (!p.coords) return;
        bounds.extend(p.coords);

        let cor, label, zIndex;
        if (p.tipo === 'origem') { cor = '#ED1C24'; label = 'S'; zIndex = 999; }
        else if (p.tipo === 'destino') { cor = '#2E3440'; label = 'D'; zIndex = 998; }
        else { cor = '#D0B580'; label = String(p.ordem); zIndex = i; }

        const marker = new google.maps.Marker({
            position: p.coords, map: mapa, zIndex,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: cor, fillOpacity: 1,
                strokeColor: '#FFFFFF', strokeWeight: 3, scale: 16
            },
            label: {
                text: label,
                color: cor === '#D0B580' ? '#2E3440' : 'white',
                fontSize: '11px', fontWeight: 'bold'
            }
        });

        marker.addListener('click', () => {
            infoWindow.setContent(`<div style="font-family:sans-serif;padding:4px;">
                <strong>${p.nome}</strong><br>
                <span style="color:#666;font-size:12px;">${p.endereco || ''}</span>
                ${p.horarioEstimado ? `<br><span style="color:#ED1C24;font-weight:600;">🕐 ${p.horarioEstimado}</span>` : ''}
            </div>`);
            infoWindow.open(mapa, marker);
        });
    });

    // Directions API — rota real + distância + tempo
    const pontosCom = pontos.filter(p => p.coords);
    if (pontosCom.length >= 2) {
        const origem   = pontosCom[0].coords;
        const destFinal = pontosCom[pontosCom.length - 1].coords;
        const waypoints = pontosCom.slice(1, -1).map(p => ({
            location: new google.maps.LatLng(p.coords.lat, p.coords.lng),
            stopover: true
        }));

        const directionsService = new google.maps.DirectionsService();
        const renderer = new google.maps.DirectionsRenderer({
            map: mapa, suppressMarkers: true,
            polylineOptions: { strokeColor: '#ED1C24', strokeWeight: 4, strokeOpacity: 0.85 }
        });
        _directionsRenderers[mapId] = renderer;

        directionsService.route({
            origin: new google.maps.LatLng(origem.lat, origem.lng),
            destination: new google.maps.LatLng(destFinal.lat, destFinal.lng),
            waypoints: waypoints.slice(0, 23),
            travelMode: google.maps.TravelMode.DRIVING,
            region: 'BR'
        }, (result, status) => {
            if (status === 'OK') {
                renderer.setDirections(result);

                // Calcular distância e tempo totais das legs
                const legs = result.routes[0].legs;
                let distanciaTotal = 0;
                let tempoTotal = 0;
                const temposAcumulados = []; // tempo acumulado até cada parada

                let acumulado = 0;
                legs.forEach((leg, i) => {
                    distanciaTotal += leg.distance.value; // metros
                    tempoTotal += leg.duration.value;     // segundos
                    acumulado += leg.duration.value;
                    temposAcumulados.push(acumulado);
                });

                // Calcular horários estimados por parada
                const horariosEstimados = temposAcumulados.map(sec => {
                    return adicionarMinutos(horarioSaida, Math.round(sec / 60));
                });

                // Callback com as informações calculadas
                if (onInfoCallback) {
                    onInfoCallback({
                        distancia: formatarDistancia(distanciaTotal),
                        tempo: formatarTempo(tempoTotal),
                        tempoSegundos: tempoTotal,
                        horariosEstimados
                    });
                }
            } else {
                mapa.fitBounds(bounds, { padding: 40 });
            }
        });
    } else {
        mapa.fitBounds(bounds, { padding: 40 });
    }
}

// ========== SENTIDO IDA / VOLTA ==========
const KUHN_BRASIL = {
    nome: 'Kuhn Brasil',
    endereco: 'R. Arnô Pini, 1380 - Invernadinha, Passo Fundo - RS',
    cep: '99050-130',
    // Coordenadas fixas da Kuhn Brasil — R. Arnô Pini, 1380 - Invernadinha
    coords: { lat: -28.23328, lng: -52.397115 }
};

// Helper: retorna coordenadas fixas da Kuhn sem geocodificar
function coordsKuhn() {
    return KUHN_BRASIL.coords;
}

let _sentidoAtual = 'ida'; // 'ida' ou 'volta'

function setSentido(sentido) {
    _sentidoAtual = sentido;

    // Atualizar botões
    document.getElementById('btnIda').classList.toggle('btn-sentido-ativo', sentido === 'ida');
    document.getElementById('btnVolta').classList.toggle('btn-sentido-ativo', sentido === 'volta');

    // Atualizar info box
    const box = document.getElementById('infoSentidoBox');
    if (sentido === 'ida') {
        box.innerHTML = `
            <span class="rota-sentido-tag rota-sentido-ida">🌅 IDA</span>
            <span>Origem: <strong>Garagem de cada ônibus</strong></span>
            <span>→</span>
            <span>Paradas: <strong>Casa dos colaboradores</strong></span>
            <span>→</span>
            <span>Destino: <strong>Kuhn Brasil — R. Arnô Pini, 1380</strong></span>`;
    } else {
        box.innerHTML = `
            <span class="rota-sentido-tag rota-sentido-volta">🌆 VOLTA</span>
            <span>Origem: <strong>Kuhn Brasil — R. Arnô Pini, 1380</strong></span>
            <span>→</span>
            <span>Paradas: <strong>Casa dos colaboradores</strong></span>
            <span>→</span>
            <span>Destino: <strong>Garagem de cada ônibus</strong></span>`;
    }

    renderRotas();
}

// ========== CARREGAR ROTAS ==========
async function carregarRotas() {
    try {
        const [onibusRes, colabsRes, rotasRes] = await Promise.all([
            fetch(`${API_URL}/rota/onibus`),
            fetch(`${API_URL}/rota/colaboradores`),
            fetch(`${API_URL}/rota/rotas`)
        ]);
        const onibus = await onibusRes.json();
        const colabs = await colabsRes.json();
        const rotas  = await rotasRes.json();

        const filtroOnibus = document.getElementById('filtroRotaOnibus');
        filtroOnibus.innerHTML = `<option value="">Todos os ônibus</option>` +
            onibus.map(b => `<option value="${b.id}">${b.nome}</option>`).join('');

        window._rotaData = { onibus, colabs, rotas };

        // Inicializar info do sentido
        setSentido(_sentidoAtual);
    } catch(e) {
        console.error(e);
        mostrarMensagem('Erro ao carregar rotas', 'error');
    }
}

function renderRotas() {
    if (!window._rotaData) return;
    const { onibus, colabs, rotas } = window._rotaData;
    const sentido      = _sentidoAtual;
    const filtroTurno  = document.getElementById('filtroRotaTurno')?.value || '';
    const filtroOnibus = document.getElementById('filtroRotaOnibus')?.value || '';
    const container    = document.getElementById('rotasContainer');
    container.innerHTML = '';

    let onibusFiltrados = onibus.filter(b => b.ativo);
    if (filtroOnibus) onibusFiltrados = onibusFiltrados.filter(b => b.id == filtroOnibus);

    let temRota = false;

    onibusFiltrados.forEach(bus => {
        let passageiros = rotas
            .filter(r => r.onibus_id === bus.id && r.ativo)
            .map(r => colabs.find(c => c.id === r.colaborador_id))
            .filter(Boolean);

        if (filtroTurno) passageiros = passageiros.filter(c => c.turno === filtroTurno);
        if (passageiros.length === 0) return;
        temRota = true;

        passageiros.sort((a, b) => {
            const ra = rotas.find(r => r.colaborador_id === a.id && r.onibus_id === bus.id);
            const rb = rotas.find(r => r.colaborador_id === b.id && r.onibus_id === bus.id);
            return (ra?.ordem_embarque || 99) - (rb?.ordem_embarque || 99);
        });

        const passageirosOrdenados = sentido === 'volta' ? [...passageiros].reverse() : passageiros;

        // Usar horário correto conforme sentido
        const horarioBase = sentido === 'ida'
            ? (bus.horario_saida ? bus.horario_saida.substring(0,5) : '06:30')
            : (bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '17:30');

        const mapId = `mapa-onibus-${bus.id}-${sentido}`;
        const infoId = `info-onibus-${bus.id}-${sentido}`;
        const timelineId = `timeline-onibus-${bus.id}-${sentido}`;

        const origemNome  = sentido === 'ida' ? 'Origem / Garagem' : 'Kuhn Brasil';
        const origemEnd   = sentido === 'ida' ? bus.ponto_origem   : KUHN_BRASIL.endereco;
        const origemCor   = sentido === 'ida' ? 'rota-stop-origem' : 'rota-stop-destino';
        const destinoNome = sentido === 'ida' ? 'Destino — Kuhn Brasil' : 'Garagem / Fim da Linha';
        const destinoEnd  = sentido === 'ida' ? KUHN_BRASIL.endereco   : bus.ponto_origem;
        const destinoCor  = sentido === 'ida' ? 'rota-stop-destino'    : 'rota-stop-origem';
        const sentidoIcon = sentido === 'ida' ? '🌅' : '🌆';

        // Timeline inicial com horários estimados simples (será substituída pelo Google)
        const [hBase, mBase] = horarioBase.split(':').map(Number);
        const paradasHTML = passageirosOrdenados.map((c, i) => {
            const totalMin = mBase + (i + 1) * 7;
            const h = String(hBase + Math.floor(totalMin / 60)).padStart(2, '0');
            const m = String(totalMin % 60).padStart(2, '0');
            const end = [c.logradouro, c.numero].filter(Boolean).join(', ');
            return `<div class="rota-stop" id="stop-${bus.id}-${sentido}-${i}">
                        <div class="rota-stop-line"></div>
                        <div class="rota-stop-dot">${i + 1}</div>
                        <div class="rota-stop-info">
                            <div class="rota-stop-nome">${c.nome}</div>
                            <div class="rota-stop-end">${end}${c.bairro ? ' — ' + c.bairro : ''}</div>
                            <div class="rota-stop-hora">
                                <span class="rota-hora-badge" id="hora-${bus.id}-${sentido}-${i}">🕐 ~${h}:${m}</span>
                                <span class="rota-turno-badge">${c.turno}</span>
                            </div>
                        </div>
                    </div>`;
        }).join('');

        container.innerHTML += `
            <div class="rota-card">
                <!-- HEADER -->
                <div class="rota-card-header">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span class="rota-card-titulo">${sentidoIcon} ${bus.nome}</span>
                        <span class="rota-card-placa">${bus.placa}</span>
                        <span class="rota-card-badge" style="background:${sentido==='ida'?'#ED1C24':'#2E3440'}">${sentido==='ida'?'IDA':'VOLTA'}</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <span class="rota-card-badge">${passageiros.length} passageiro${passageiros.length!==1?'s':''}</span>
                        <button class="btn btn-success" style="font-size:12px;padding:5px 12px;"
                            onclick="otimizarEAplicar(${bus.id}, '${sentido}')">⚡ Otimizar</button>
                        <button class="btn btn-info" style="font-size:12px;padding:5px 12px;background:#25D366;color:white;"
                            onclick="compartilharWhatsApp(${bus.id}, '${sentido}')">📱 WhatsApp</button>
                        <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;"
                            onclick="imprimirFolhaRota(${bus.id}, '${sentido}')">🖨️ Imprimir</button>
                    </div>
                </div>

                <!-- MÉTRICAS (atualizado pelo Google Directions) -->
                <div id="${infoId}" class="rota-metricas">
                    <div class="rota-metrica-item">
                        <span class="rota-metrica-icon">📏</span>
                        <span class="rota-metrica-valor" id="dist-${bus.id}-${sentido}">Calculando...</span>
                        <span class="rota-metrica-label">distância</span>
                    </div>
                    <div class="rota-metrica-item">
                        <span class="rota-metrica-icon">⏱️</span>
                        <span class="rota-metrica-valor" id="tempo-${bus.id}-${sentido}">Calculando...</span>
                        <span class="rota-metrica-label">tempo total</span>
                    </div>
                    <div class="rota-metrica-item">
                        <span class="rota-metrica-icon">🕐</span>
                        <span class="rota-metrica-valor">${horarioBase}</span>
                        <span class="rota-metrica-label">horário saída</span>
                    </div>
                    <div class="rota-metrica-item">
                        <span class="rota-metrica-icon">👥</span>
                        <span class="rota-metrica-valor">${passageiros.length}/${bus.capacidade}</span>
                        <span class="rota-metrica-label">ocupação</span>
                    </div>
                    <div class="rota-metrica-item">
                        <span class="rota-metrica-icon">🏁</span>
                        <span class="rota-metrica-valor" id="chegada-${bus.id}-${sentido}">--:--</span>
                        <span class="rota-metrica-label">chegada estimada</span>
                    </div>
                </div>

                <!-- LAYOUT MAPA + TIMELINE -->
                <div class="rota-layout-split">
                    <div class="rota-mapa-wrap">
                        <div class="rota-mapa-label">🗺️ Rota no Mapa — ${sentido==='ida'?'IDA':'VOLTA'}</div>
                        <div id="${mapId}" class="rota-mapa-container"></div>
                        <div class="rota-mapa-legenda">
                            <span><span style="background:#ED1C24" class="rota-legenda-dot">S</span> Origem</span>
                            <span><span style="background:#D0B580;color:#2E3440" class="rota-legenda-dot">N</span> Parada</span>
                            <span><span style="background:#2E3440" class="rota-legenda-dot">D</span> Destino</span>
                        </div>
                    </div>

                    <div class="rota-stops-container" id="${timelineId}">
                        <!-- Origem -->
                        <div class="rota-stop">
                            <div class="rota-stop-line"></div>
                            <div class="rota-stop-dot ${origemCor}">S</div>
                            <div class="rota-stop-info">
                                <div class="rota-stop-nome">${origemNome}</div>
                                <div class="rota-stop-end">${origemEnd}</div>
                                <div class="rota-stop-hora">
                                    <span class="rota-hora-badge rota-hora-saida">🕐 ${horarioBase}</span>
                                    <span style="font-size:11px;color:#ED1C24;font-weight:600;">${sentido==='ida'?'Saída da garagem':'Saída da empresa'}</span>
                                </div>
                            </div>
                        </div>
                        ${paradasHTML}
                        <!-- Destino -->
                        <div class="rota-stop">
                            <div class="rota-stop-dot ${destinoCor}">D</div>
                            <div class="rota-stop-info">
                                <div class="rota-stop-nome">${destinoNome}</div>
                                <div class="rota-stop-end">${destinoEnd}</div>
                                <div class="rota-stop-hora">
                                    <span class="rota-hora-badge rota-hora-chegada" id="chegada-stop-${bus.id}-${sentido}">🏁 --:--</span>
                                    <span style="font-size:11px;color:#2E3440;font-weight:600;">Chegada estimada</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        // Carregar mapa com callback para atualizar métricas e horários reais
        carregarMapaOnibus(bus, passageirosOrdenados, sentido, mapId, horarioBase, (info) => {
            // Atualizar distância e tempo
            const distEl = document.getElementById(`dist-${bus.id}-${sentido}`);
            const tempoEl = document.getElementById(`tempo-${bus.id}-${sentido}`);
            const chegadaEl = document.getElementById(`chegada-${bus.id}-${sentido}`);
            const chegadaStopEl = document.getElementById(`chegada-stop-${bus.id}-${sentido}`);

            if (distEl) distEl.textContent = info.distancia;
            if (tempoEl) tempoEl.textContent = info.tempo;

            // Horário de chegada = saída + tempo total
            const chegada = adicionarMinutos(horarioBase, Math.round(info.tempoSegundos / 60));
            if (chegadaEl) chegadaEl.textContent = chegada;
            if (chegadaStopEl) chegadaStopEl.textContent = `🏁 ${chegada}`;

            // Atualizar horários de cada parada
            info.horariosEstimados.forEach((hora, i) => {
                const el = document.getElementById(`hora-${bus.id}-${sentido}-${i}`);
                if (el) el.textContent = `🕐 ${hora}`;
            });
        });
    });

    if (!temRota) {
        container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#4A4A4A;">
            <div style="font-size:3em;margin-bottom:12px;">🗺️</div>
            <div>Nenhuma rota encontrada para os filtros selecionados.</div>
        </div>`;
    }
}

async function carregarMapaOnibus(bus, passageiros, sentido, mapId, horarioSaida, onInfoCallback) {
    const pontos = [];
    const endKuhn = KUHN_BRASIL.endereco;

    if (sentido === 'ida') {
        const coordOrigem = (bus.origem_lat && bus.origem_lng)
            ? { lat: bus.origem_lat, lng: bus.origem_lng }
            : null;
        pontos.push({ tipo: 'origem', nome: 'Origem / Garagem', endereco: bus.ponto_origem, coords: coordOrigem });
        for (const c of passageiros) {
            const endDisplay = [c.logradouro, c.numero, c.bairro].filter(Boolean).join(', ');
            const coords = (c.latitude && c.longitude) ? { lat: c.latitude, lng: c.longitude } : null;
            pontos.push({ tipo: 'parada', nome: c.nome, endereco: endDisplay, coords, ordem: pontos.length });
        }
        pontos.push({ tipo: 'destino', nome: 'Kuhn Brasil', endereco: KUHN_BRASIL.endereco, coords: coordsKuhn() });
    } else {
        pontos.push({ tipo: 'origem', nome: 'Kuhn Brasil', endereco: KUHN_BRASIL.endereco, coords: coordsKuhn() });
        for (const c of passageiros) {
            const endDisplay = [c.logradouro, c.numero, c.bairro].filter(Boolean).join(', ');
            const coords = (c.latitude && c.longitude) ? { lat: c.latitude, lng: c.longitude } : null;
            pontos.push({ tipo: 'parada', nome: c.nome, endereco: endDisplay, coords, ordem: pontos.length });
        }
        const coordGaragem = (bus.origem_lat && bus.origem_lng)
            ? { lat: bus.origem_lat, lng: bus.origem_lng }
            : null;
        pontos.push({ tipo: 'destino', nome: 'Garagem / Fim da Linha', endereco: bus.ponto_origem, coords: coordGaragem });
    }

    inicializarMapa(mapId, pontos, horarioSaida, onInfoCallback);
}

// ========== OTIMIZAR E APLICAR ROTA ==========
async function otimizarEAplicar(busId, sentido = 'ida') {
    if (!window._rotaData) return;
    const { onibus, colabs, rotas } = window._rotaData;
    const bus = onibus.find(b => b.id === busId);
    if (!bus) return;

    mostrarMensagem('⚡ Otimizando rota, aguarde...', 'success');

    const passageiros = rotas
        .filter(r => r.onibus_id === busId && r.ativo)
        .map(r => colabs.find(c => c.id === r.colaborador_id))
        .filter(Boolean);

    const coordKuhn    = coordsKuhn();
    const coordGaragem = (bus.origem_lat && bus.origem_lng)
        ? { lat: bus.origem_lat, lng: bus.origem_lng }
        : { lat: -28.2576, lng: -52.4089 };

    // Origem do algoritmo depende do sentido
    const coordOrigem = sentido === 'ida' ? coordGaragem : coordKuhn;
    const coordDest   = sentido === 'ida' ? coordKuhn    : coordGaragem;

    const paradasGeo = [];
    for (const c of passageiros) {
        const coords = (c.latitude && c.longitude) ? { lat: c.latitude, lng: c.longitude } : null;
        paradasGeo.push({ ...c, coords });
    }

    // Otimizar ordem a partir da origem correta
    const rotaOtimizada = otimizarRota(coordOrigem, paradasGeo, coordDest);

    // Salvar nova ordem no banco
    try {
        for (let i = 0; i < rotaOtimizada.length; i++) {
            await fetch(`${API_URL}/rota/rotas/alocar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    colaborador_id: rotaOtimizada[i].id,
                    onibus_id: busId,
                    ordem_embarque: i + 1
                })
            });
        }
        mostrarMensagem(`✅ Rota ${sentido.toUpperCase()} otimizada e salva!`);
        await carregarRotas();
    } catch(e) {
        mostrarMensagem('Erro ao salvar rota otimizada', 'error');
    }
}

// ========== CADASTRAR ==========
async function carregarSelectsOnibus() {
    try {
        const res    = await fetch(`${API_URL}/rota/onibus`);
        const onibus = await res.json();
        const opts   = `<option value="">— Sem ônibus —</option>` +
            onibus.map(b => `<option value="${b.id}">${b.nome} — ${b.placa}</option>`).join('');
        document.getElementById('colOnibus').innerHTML = opts;
    } catch(e) { /* silencioso */ }
}

// Form Colaborador
document.getElementById('formColaborador').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('formColaborador').dataset.editId;
    const dados = {
        matricula:   document.getElementById('colMatricula').value.trim(),
        nome:        document.getElementById('colNome').value.trim(),
        cpf:         document.getElementById('colCpf').value.replace(/\D/g,''),
        telefone:    document.getElementById('colTelefone').value.replace(/\D/g,''),
        turno:       document.getElementById('colTurno').value,
        setor:       document.getElementById('colSetor').value.trim(),
        logradouro:  document.getElementById('colLogradouro').value.trim(),
        numero:      document.getElementById('colNumero').value.trim(),
        bairro:      document.getElementById('colBairro').value.trim(),
        cidade:      (document.getElementById('colCidade')?.value || document.getElementById('busCidadeSelect')?.value || 'Passo Fundo').trim(),
        cep:         document.getElementById('colCep').value.trim(),
        is_motorista: document.getElementById('colIsMotorista')?.checked || false,
        onibus_motorista_id: document.getElementById('colIsMotorista')?.checked
            ? (document.getElementById('colOnibusMotorista')?.value || null)
            : null
    };
    const onibusId = document.getElementById('colOnibus').value;

    // Validação de duplicata via API
    if (!editId) {
        if (dados.matricula) {
            const check = await fetch(`${API_URL}/rota/colaboradores/check?matricula=${dados.matricula}`);
            if (check.ok) { const r = await check.json(); if (r.existe) { mostrarMensagem('⚠️ Matrícula já cadastrada!', 'error'); return; } }
        }
        if (dados.cpf) {
            const check = await fetch(`${API_URL}/rota/colaboradores/check?cpf=${dados.cpf}`);
            if (check.ok) { const r = await check.json(); if (r.existe) { mostrarMensagem('⚠️ CPF já cadastrado!', 'error'); return; } }
        }
    }

    try {
        const url    = editId ? `${API_URL}/rota/colaboradores/${editId}` : `${API_URL}/rota/colaboradores`;
        const method = editId ? 'PUT' : 'POST';
        const res    = await fetch(url, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        const data = await res.json();
        if (!res.ok) { mostrarMensagem(data.error || 'Erro ao cadastrar', 'error'); return; }

        const colabId = editId || data.id;
        if (onibusId) {
            await fetch(`${API_URL}/rota/rotas/alocar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ colaborador_id: colabId, onibus_id: onibusId })
            });
        }
        mostrarMensagem(editId ? 'Colaborador atualizado!' : 'Colaborador cadastrado com sucesso!');
        limparFormColaborador();
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
});

function limparFormColaborador() {
    document.getElementById('formColaborador').reset();
    delete document.getElementById('formColaborador').dataset.editId;
    window._cidadeSelecionada['col'] = 'Passo Fundo';
    inicializarSeletsEstado();
    const btn = document.querySelector('#formColaborador button[type="submit"]');
    btn.textContent = '✅ Cadastrar Colaborador';
    btn.onclick = null;
}

// Form Ônibus
document.getElementById('formOnibus').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('formOnibus').dataset.editId;
    const placa  = document.getElementById('busPlaca').value.toUpperCase().trim();
    const dados  = {
        nome:               document.getElementById('busNome').value.trim(),
        placa,
        tipo_veiculo:       document.getElementById('busTipoVeiculo').value ||'Ônibus',
        capacidade:         parseInt(document.getElementById('busCapacidade').value),
        ponto_origem:       document.getElementById('busOrigem').value.trim(),
        cep_origem:         document.getElementById('busCep').value.trim(),
        horario_saida:      document.getElementById('busHorario').value,
        horario_saida_volta: document.getElementById('busHorarioVolta').value || '17:30' 
    };

    // Verificar placa duplicada
    if (!editId) {
        const check = await fetch(`${API_URL}/rota/onibus/check?placa=${placa}`);
        if (check.ok) { const r = await check.json(); if (r.existe) { mostrarMensagem('⚠️ Placa já cadastrada!', 'error'); return; } }
    }

    try {
        const url    = editId ? `${API_URL}/rota/onibus/${editId}` : `${API_URL}/rota/onibus`;
        const method = editId ? 'PUT' : 'POST';
        const res    = await fetch(url, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        const data = await res.json();
        if (res.ok) {
            // Salvar bairros do ônibus
            const busId = editId || data.id;
            if (busId) await salvarBairrosOnibus(busId);
            mostrarMensagem(editId ? 'Ônibus atualizado!' : 'Ônibus cadastrado com sucesso!');
            limparFormOnibus();
            carregarSelectsOnibus();
        } else {
            mostrarMensagem(data.error || 'Erro ao cadastrar', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
});

function limparFormOnibus() {
    document.getElementById('formOnibus').reset();
    delete document.getElementById('formOnibus').dataset.editId;
    document.getElementById('busHorario').value = '06:30';
    document.getElementById('busHorarioVolta').value = '17:30';
    document.getElementById('busBairrosTags').innerHTML = '';
    document.getElementById('busBairroInput').value = '';
    window._busBairros = [];
    const btn = document.querySelector('#formOnibus button[type="submit"]');
    btn.textContent = '✅ Cadastrar Ônibus';
    btn.onclick = null;
}

// ========== ESTADO / CIDADE / BAIRRO — Google Places Autocomplete ==========
window._busBairros = [];
window._cidadeSelecionada = { bus: '', col: '' };
window._estadoSelecionado = { bus: '', col: '' };
let _autocompleteService = null;
let _sessionToken = null;

// Lista de estados brasileiros
const ESTADOS_BR = [
    {uf:'AC',nome:'Acre'},{uf:'AL',nome:'Alagoas'},{uf:'AP',nome:'Amapá'},
    {uf:'AM',nome:'Amazonas'},{uf:'BA',nome:'Bahia'},{uf:'CE',nome:'Ceará'},
    {uf:'DF',nome:'Distrito Federal'},{uf:'ES',nome:'Espírito Santo'},
    {uf:'GO',nome:'Goiás'},{uf:'MA',nome:'Maranhão'},{uf:'MT',nome:'Mato Grosso'},
    {uf:'MS',nome:'Mato Grosso do Sul'},{uf:'MG',nome:'Minas Gerais'},
    {uf:'PA',nome:'Pará'},{uf:'PB',nome:'Paraíba'},{uf:'PR',nome:'Paraná'},
    {uf:'PE',nome:'Pernambuco'},{uf:'PI',nome:'Piauí'},{uf:'RJ',nome:'Rio de Janeiro'},
    {uf:'RN',nome:'Rio Grande do Norte'},{uf:'RS',nome:'Rio Grande do Sul'},
    {uf:'RO',nome:'Rondônia'},{uf:'RR',nome:'Roraima'},{uf:'SC',nome:'Santa Catarina'},
    {uf:'SP',nome:'São Paulo'},{uf:'SE',nome:'Sergipe'},{uf:'TO',nome:'Tocantins'}
];

// Inicializar selects de estado nos dois formulários
function inicializarSeletsEstado() {
    ['busEstado','colEstado'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione o estado...</option>' +
            ESTADOS_BR.map(e => `<option value="${e.uf}" ${e.uf==='RS'?'selected':''}>${e.uf} — ${e.nome}</option>`).join('');
    });
    // Auto-carregar cidades do RS nos dois forms
    onEstadoChange('bus');
    onEstadoChange('col');
}

// Quando muda o estado — carrega cidades via IBGE
async function onEstadoChange(prefix) {
    const estadoSel = document.getElementById(`${prefix}Estado`);
    const cidadeId = prefix === 'bus' ? 'busCidadeSelect' : prefix === 'editBus' ? 'editBusCidadeSelect' : 'colCidade';
    const bairroId = prefix === 'bus' ? 'busBairroInput' : prefix === 'editBus' ? 'editBusBairroInput' : 'colBairro';
    const cidadeSel = document.getElementById(cidadeId);
    const bairroInput = document.getElementById(bairroId);

    if (!estadoSel || !cidadeSel) return;
    const uf = estadoSel.value;
    window._estadoSelecionado[prefix] = uf;
    window._cidadeSelecionada[prefix] = '';

    if (!uf) {
        cidadeSel.innerHTML = '<option value="">Selecione o estado primeiro...</option>';
        cidadeSel.disabled = true;
        if (bairroInput) { bairroInput.disabled = true; bairroInput.placeholder = 'Selecione a cidade primeiro...'; }
        return;
    }

    cidadeSel.innerHTML = '<option value="">Carregando cidades...</option>';
    cidadeSel.disabled = true;

    try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
        const cidades = await res.json();
        cidadeSel.innerHTML = '<option value="">Selecione a cidade...</option>' +
            cidades.map(c => `<option value="${c.nome}" ${c.nome==='Passo Fundo'?'selected':''}>${c.nome}</option>`).join('');
        cidadeSel.disabled = false;

        // Auto-selecionar Passo Fundo se RS
        if (uf === 'RS') {
            cidadeSel.value = 'Passo Fundo';
            onCidadeChange(prefix);
        }
    } catch(e) {
        cidadeSel.innerHTML = '<option value="">Erro ao carregar cidades</option>';
    }
}

// Quando muda a cidade — habilita autocomplete de bairros
function onCidadeChange(prefix) {
    const cidadeId = prefix === 'bus' ? 'busCidadeSelect' : prefix === 'editBus' ? 'editBusCidadeSelect' : 'colCidade';
    const bairroId = prefix === 'bus' ? 'busBairroInput' : prefix === 'editBus' ? 'editBusBairroInput' : 'colBairro';
    const cidadeSel = document.getElementById(cidadeId);
    const bairroInput = document.getElementById(bairroId);
    if (!cidadeSel || !bairroInput) return;

    const cidade = cidadeSel.value;
    window._cidadeSelecionada[prefix] = cidade;

    if (cidade) {
        bairroInput.disabled = false;
        bairroInput.placeholder = `Digite o bairro em ${cidade}...`;
    } else {
        bairroInput.disabled = true;
        bairroInput.placeholder = 'Selecione a cidade primeiro...';
    }
}

// Autocomplete de bairros com Google Places
let _autocompleteTimer = null;

function onBairroInput(prefix) {
    const inputId = prefix === 'bus' ? 'busBairroInput' : prefix === 'editBus' ? 'editBusBairroInput' : 'colBairro';
    const dropId  = prefix === 'bus' ? 'busBairroDropdown' : prefix === 'editBus' ? 'editBusBairroDropdown' : 'colBairroDropdown';
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropId);
    if (!input || !dropdown) return;

    const texto = input.value.trim();
    if (texto.length < 2) { dropdown.style.display = 'none'; return; }

    const cidade   = window._cidadeSelecionada[prefix];
    const estado   = window._estadoSelecionado[prefix];
    if (!cidade) { dropdown.style.display = 'none'; return; }

    clearTimeout(_autocompleteTimer);
    _autocompleteTimer = setTimeout(() => {
        buscarBairrosGoogle(texto, cidade, estado, dropdown, (bairro) => {
            input.value = bairro;
            dropdown.style.display = 'none';
            if (prefix === 'bus') adicionarBairroOnibus();
        });
    }, 300);
}

function buscarBairrosGoogle(texto, cidade, estado, dropdown, onSelect) {
    if (typeof google === 'undefined') return;
    if (!_autocompleteService) {
        _autocompleteService = new google.maps.places.AutocompleteService();
    }
    if (!_sessionToken) {
        _sessionToken = new google.maps.places.AutocompleteSessionToken();
    }

    _autocompleteService.getPlacePredictions({
        input: `${texto}, ${cidade} - ${estado}`,
        sessionToken: _sessionToken,
        componentRestrictions: { country: 'BR' },
        types: ['sublocality', 'neighborhood', 'sublocality_level_1']
    }, (predictions, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            // Fallback: busca como endereço geral na cidade
            _autocompleteService.getPlacePredictions({
                input: `${texto}, ${cidade}, ${estado}, Brasil`,
                sessionToken: _sessionToken,
                componentRestrictions: { country: 'BR' }
            }, (preds2, status2) => {
                if (status2 === google.maps.places.PlacesServiceStatus.OK && preds2) {
                    renderDropdownBairros(preds2, cidade, dropdown, onSelect);
                } else {
                    dropdown.style.display = 'none';
                }
            });
            return;
        }
        renderDropdownBairros(predictions, cidade, dropdown, onSelect);
    });
}

// Callbacks globais para dropdowns
window._dropdownCallbacks = {};

function selecionarBairroDropdown(dropId, nome) {
    const cb = window._dropdownCallbacks[dropId];
    if (cb) cb(nome);
    const el = document.getElementById(dropId);
    if (el) el.style.display = 'none';
}

function renderDropdownBairros(predictions, cidade, dropdown, onSelect) {
    const filtrados = predictions.filter(p =>
        p.description.toLowerCase().includes(cidade.toLowerCase())
    ).slice(0, 6);

    if (filtrados.length === 0) { dropdown.style.display = 'none'; return; }

    const dropId = dropdown.id || ('drop_' + Date.now());
    window._dropdownCallbacks[dropId] = onSelect;

    dropdown.innerHTML = filtrados.map(p => {
        const nome = p.description.split(',')[0].trim();
        const nomeSeguro = nome.replace(/'/g, "&#39;");
        const resto = p.description.split(',').slice(1).join(',').trim();
        return `<div class="bairro-dropdown-item"
            onclick="selecionarBairroDropdown('${dropId}', '${nomeSeguro}')">
            📍 <strong>${nome}</strong>
            <span style="font-size:11px;color:#888;">${resto}</span>
        </div>`;
    }).join('');

    dropdown.style.display = 'block';

    setTimeout(() => {
        document.addEventListener('click', function fechar(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
                document.removeEventListener('click', fechar);
            }
        });
    }, 100);
}


// ========== BAIRROS DOS ÔNIBUS ==========

function adicionarBairroOnibus() {
    const input = document.getElementById('busBairroInput');
    const valor = input.value.trim();
    if (!valor) return;

    const novos = valor.split(',').map(b => b.trim()).filter(Boolean);
    novos.forEach(b => {
        if (!window._busBairros.includes(b)) {
            window._busBairros.push(b);
        }
    });
    input.value = '';
    document.getElementById('busBairroDropdown').style.display = 'none';
    renderBairrosTags();
}

function removerBairro(bairro) {
    window._busBairros = window._busBairros.filter(b => b !== bairro);
    renderBairrosTags();
}

function renderBairrosTags() {
    const container = document.getElementById('busBairrosTags');
    if (!container) return;
    container.innerHTML = window._busBairros.map(b => `
        <span class="bairro-tag">
            ${b}
            <button type="button" onclick="removerBairro('${b.replace(/'/g,"\'")}')">×</button>
        </span>`).join('');
}

async function carregarBairrosOnibus(busId) {
    try {
        const res = await fetch(`${API_URL}/rota/onibus/${busId}/bairros`);
        const data = await res.json();
        window._busBairros = data.map(b => b.bairro);
        // Renderizar tanto nas tags do form de cadastro quanto do modal de edição
        renderBairrosTags();
        renderBairrosTagsEdit();
    } catch(e) { window._busBairros = []; }
}

async function salvarBairrosOnibus(busId) {
    try {
        await fetch(`${API_URL}/rota/onibus/${busId}/bairros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bairros: window._busBairros })
        });
    } catch(e) { console.warn('Erro ao salvar bairros:', e); }
}

// ========== MOTORISTA ==========
function toggleMotorista() {
    const cb = document.getElementById('colIsMotorista');
    const campo = document.getElementById('campoOnibusMotorista');
    cb.checked = !cb.checked;
    campo.style.display = cb.checked ? 'block' : 'none';

    // Popular select de ônibus
    if (cb.checked && window._rotaData) {
        const sel = document.getElementById('colOnibusMotorista');
        sel.innerHTML = '<option value="">— Selecione o ônibus —</option>';
        window._rotaData.onibus.forEach(b => {
            sel.innerHTML += `<option value="${b.id}">${b.nome} — ${b.placa}</option>`;
        });
    }
}

// ========== MOTORISTA EDIT ==========
function toggleMotoristaEdit() {
    const cb = document.getElementById('editColIsMotorista');
    const campo = document.getElementById('editCampoOnibusMotorista');
    cb.checked = !cb.checked;
    campo.style.display = cb.checked ? 'block' : 'none';
}

// ========== SUGERIR LINHA ==========
async function sugerirLinha() {
    const bairroColab = document.getElementById('colBairro').value.trim();
    if (!bairroColab) {
        mostrarMensagem('Preencha o bairro do colaborador primeiro!', 'error');
        return;
    }

    const btn = document.getElementById('btnSugerirLinha');
    btn.textContent = '⏳ Calculando...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/rota/onibus/todos-bairros`);
        const onibus = await res.json();

        if (onibus.length === 0) {
            document.getElementById('boxSugestaoLinha').style.display = 'block';
            document.getElementById('boxSugestaoLinha').innerHTML = `
                <div class="sugestao-vazia">Nenhum ônibus cadastrado ainda.</div>`;
            return;
        }

        // Calcular score para cada ônibus
        const bairroLower = bairroColab.toLowerCase().trim();
        const sugestoes = onibus.map(bus => {
            const vagas = bus.capacidade - bus.passageiros;
            let score = 0;
            let matchTipo = 'nenhum';

            // Verificar se algum bairro cadastrado bate com o do colaborador
            bus.bairros.forEach(b => {
                const bLower = b.toLowerCase().trim();
                if (bLower === bairroLower) {
                    score = 100; matchTipo = 'exato';
                } else if (score < 100 && (bLower.includes(bairroLower) || bairroLower.includes(bLower))) {
                    score = 70; matchTipo = 'parcial';
                }
            });

            // Penalizar ônibus lotados
            if (vagas <= 0) score = Math.max(0, score - 50);

            return { bus, vagas, score, matchTipo };
        }).sort((a, b) => b.score - a.score);

        // Renderizar sugestões
        const box = document.getElementById('boxSugestaoLinha');
        box.style.display = 'block';

        if (sugestoes[0].score === 0) {
            // Nenhum bairro corresponde — mostrar todas com vagas disponíveis
            box.innerHTML = `
                <div class="sugestao-header">
                    ⚠️ Nenhuma linha atende <strong>${bairroColab}</strong> diretamente.
                    Linhas com vagas disponíveis:
                </div>
                ${sugestoes.filter(s => s.vagas > 0).map(s => renderSugestaoCard(s, false)).join('') || 
                  '<div class="sugestao-vazia">Todos os ônibus estão lotados!</div>'}`;
        } else {
            box.innerHTML = `
                <div class="sugestao-header">
                    🚌 Sugestões para o bairro <strong>${bairroColab}</strong>:
                </div>
                ${sugestoes.map((s, i) => renderSugestaoCard(s, i === 0 && s.score > 0)).join('')}`;
        }

    } catch(e) {
        mostrarMensagem('Erro ao buscar sugestões', 'error');
        console.error(e);
    } finally {
        btn.textContent = '🚌 Sugerir Melhor Linha pelo Bairro';
        btn.disabled = false;
    }
}

function renderSugestaoCard(s, melhor) {
    const { bus, vagas, score, matchTipo } = s;
    const pct = Math.round((bus.passageiros / bus.capacidade) * 100);
    const corBarra = pct >= 80 ? '#ED1C24' : pct >= 60 ? '#D0B580' : '#10b981';
    let badgeMatch = '';
    if (matchTipo === 'exato')   badgeMatch = '<span class="sugestao-badge sugestao-badge-exato">✅ Bairro atendido</span>';
    else if (matchTipo === 'parcial') badgeMatch = '<span class="sugestao-badge sugestao-badge-parcial">🟡 Bairro próximo</span>';
    else badgeMatch = '<span class="sugestao-badge sugestao-badge-none">⚪ Sem bairro cadastrado</span>';

    const lotado = vagas <= 0;

    return `
        <div class="sugestao-card ${melhor ? 'sugestao-card-melhor' : ''} ${lotado ? 'sugestao-card-lotado' : ''}">
            ${melhor ? '<div class="sugestao-recomendado">⭐ MELHOR OPÇÃO</div>' : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <div>
                    <strong style="font-size:15px;">🚌 ${bus.nome}</strong>
                    <span style="color:#4A4A4A;font-size:12px;margin-left:8px;">${bus.placa}</span>
                    ${badgeMatch}
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    ${!lotado ? `<button class="btn btn-primary" style="font-size:12px;padding:5px 14px;"
                        onclick="selecionarLinha(${bus.id}, '${bus.nome.replace(/'/g,"\'")}')">
                        Selecionar esta linha
                    </button>` : '<span style="color:#ED1C24;font-weight:700;font-size:12px;">LOTADO</span>'}
                </div>
            </div>
            <div style="margin-top:8px;">
                <div style="font-size:12px;color:#4A4A4A;margin-bottom:4px;">
                    📍 ${bus.ponto_origem} &nbsp;|&nbsp;
                    🌅 ${bus.horario_saida ? bus.horario_saida.substring(0,5) : '--'} &nbsp;|&nbsp;
                    🌆 ${bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '--'}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:6px;background:#E8E8E8;border-radius:3px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:${corBarra};border-radius:3px;"></div>
                    </div>
                    <span style="font-size:12px;white-space:nowrap;">${bus.passageiros}/${bus.capacidade} (${pct}%) — ${vagas > 0 ? vagas + ' vagas' : 'SEM VAGAS'}</span>
                </div>
                ${bus.bairros.length > 0 ? `<div style="margin-top:6px;font-size:11px;color:#4A4A4A;">
                    🏘️ Bairros: ${bus.bairros.join(', ')}
                </div>` : ''}
            </div>
        </div>`;
}

function selecionarLinha(busId, busNome) {
    const select = document.getElementById('colOnibus');
    select.value = busId;
    document.getElementById('boxSugestaoLinha').style.display = 'none';
    mostrarMensagem(`✅ Linha "${busNome}" selecionada!`);
}

// ========== USUÁRIOS ==========
async function carregarUsuariosRota() {
    try {
        const res      = await fetch(`${API_URL}/usuarios`);
        const usuarios = await res.json();
        const tbody    = document.getElementById('tbodyUsuariosRota');
        tbody.innerHTML = '';
        usuarios.forEach(u => {
            const badges = { admin:'#ED1C24', operador:'#D0B580', visualizador:'#2E3440' };
            const cores  = { admin:'white', operador:'#2E3440', visualizador:'white' };
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.nome}</td>
                <td>${u.email}</td>
                <td><span class="status-badge" style="background:${badges[u.perfil]||'#888'};color:${cores[u.perfil]||'white'};">${(u.perfil||'').toUpperCase()}</span></td>
                <td>${u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-warning" onclick="editarUsuarioRota(${u.id})">✏️ Editar</button>
                        <button class="btn btn-danger" onclick="deletarUsuarioRota(${u.id})">🗑️ Excluir</button>
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });
    } catch(e) {
        mostrarMensagem('Erro ao carregar usuários', 'error');
    }
}

document.getElementById('formUsuarioRota').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('formUsuarioRota').dataset.editId;
    const dados  = {
        nome:   document.getElementById('uNome').value,
        email:  document.getElementById('uEmail').value,
        senha:  document.getElementById('uSenha').value,
        perfil: document.getElementById('uPerfil').value
    };
    if (!editId && !dados.senha) { mostrarMensagem('Senha obrigatória para novos usuários', 'error'); return; }
    if (dados.senha && dados.senha.length < 6) { mostrarMensagem('Senha mínima de 6 caracteres', 'error'); return; }
    if (editId && !dados.senha) delete dados.senha;

    try {
        const url    = editId ? `${API_URL}/usuarios/${editId}` : `${API_URL}/usuarios`;
        const method = editId ? 'PUT' : 'POST';
        const res    = await fetch(url, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        const data = await res.json();
        if (res.ok) {
            mostrarMensagem(editId ? 'Usuário atualizado!' : 'Usuário criado com sucesso!');
            limparFormUsuarioRota();
            carregarUsuariosRota();
        } else {
            mostrarMensagem(data.error || 'Erro ao salvar', 'error');
        }
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
});

async function editarUsuarioRota(id) {
    try {
        const res = await fetch(`${API_URL}/usuarios/${id}`);
        const u   = await res.json();
        document.getElementById('uNome').value    = u.nome;
        document.getElementById('uEmail').value   = u.email;
        document.getElementById('uSenha').value   = '';
        document.getElementById('uPerfil').value  = u.perfil;
        document.getElementById('formUsuarioRota').dataset.editId = id;
        const btn = document.querySelector('#formUsuarioRota button[type="submit"]');
        btn.textContent = '✅ Atualizar Usuário';
        document.getElementById('usuarios').scrollIntoView({ behavior: 'smooth' });
    } catch(e) {
        mostrarMensagem('Erro ao carregar usuário', 'error');
    }
}

async function deletarUsuarioRota(id) {
    if (!confirm('Excluir este usuário?')) return;
    try {
        const res  = await fetch(`${API_URL}/usuarios/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) { mostrarMensagem('Usuário excluído!'); carregarUsuariosRota(); }
        else mostrarMensagem(data.error || 'Erro ao excluir', 'error');
    } catch(e) {
        mostrarMensagem('Erro ao conectar com servidor', 'error');
    }
}

function limparFormUsuarioRota() {
    document.getElementById('formUsuarioRota').reset();
    delete document.getElementById('formUsuarioRota').dataset.editId;
    document.querySelector('#formUsuarioRota button[type="submit"]').textContent = '✅ Salvar Usuário';
}


// ========== WHATSAPP ==========
function compartilharWhatsApp(busId, sentido) {
    if (!window._rotaData) return;
    const { onibus, colabs, rotas } = window._rotaData;
    const bus = onibus.find(b => b.id === busId);
    if (!bus) return;

    let passageiros = rotas
        .filter(r => r.onibus_id === busId && r.ativo)
        .map(r => colabs.find(c => c.id === r.colaborador_id))
        .filter(Boolean);

    passageiros.sort((a, b) => {
        const ra = rotas.find(r => r.colaborador_id === a.id && r.onibus_id === busId);
        const rb = rotas.find(r => r.colaborador_id === b.id && r.onibus_id === busId);
        return (ra?.ordem_embarque || 99) - (rb?.ordem_embarque || 99);
    });

    if (sentido === 'volta') passageiros = [...passageiros].reverse();

    const horario = sentido === 'ida'
        ? (bus.horario_saida ? bus.horario_saida.substring(0,5) : '06:30')
        : (bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '17:30');

    const origemEnd = sentido === 'ida' ? bus.ponto_origem : KUHN_BRASIL.endereco;
    const destinoEnd = sentido === 'ida' ? KUHN_BRASIL.endereco : bus.ponto_origem;

    // Montar URL do Google Maps
    const pontos = [
        origemEnd,
        ...passageiros.map(c => [c.logradouro, c.numero, c.bairro, 'Passo Fundo RS'].filter(Boolean).join(' ')),
        destinoEnd
    ].map(p => encodeURIComponent(p)).join('/');

    const mapsUrl = `https://www.google.com/maps/dir/${pontos}`;

    // Montar lista de paradas
    const [hBase, mBase] = horario.split(':').map(Number);
    const listaParadas = passageiros.map((c, i) => {
        const totalMin = mBase + (i + 1) * 7;
        const h = String(hBase + Math.floor(totalMin / 60)).padStart(2, '0');
        const m = String(totalMin % 60).padStart(2, '0');
        const end = [c.logradouro, c.numero].filter(Boolean).join(', ');
        return `${i + 1}. ${c.nome} — ${end}, ${c.bairro || ''} (~${h}:${m})`;
    }).join('\n');

    const sentidoTexto = sentido === 'ida' ? '🌅 IDA — Para Kuhn Brasil' : '🌆 VOLTA — Para Casa';
    const msg = `🚌 *${bus.nome} | ${bus.placa}*\n` +
        `${sentidoTexto}\n` +
        `🕐 Saída: *${horario}*\n\n` +
        `📍 *Paradas (${passageiros.length} passageiros):*\n` +
        `${listaParadas}\n\n` +
        `🗺️ *Rota completa no Google Maps:*\n${mapsUrl}\n\n` +
        `_Enviado pelo Sistema de Roteirização Kuhn Brasil_`;

    const waUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
}

// ========== IMPRIMIR FOLHA DE ROTA ==========
function imprimirFolhaRota(busId, sentido) {
    if (!window._rotaData) return;
    const { onibus, colabs, rotas } = window._rotaData;
    const bus = onibus.find(b => b.id === busId);
    if (!bus) return;

    let passageiros = rotas
        .filter(r => r.onibus_id === busId && r.ativo)
        .map(r => colabs.find(c => c.id === r.colaborador_id))
        .filter(Boolean);

    passageiros.sort((a, b) => {
        const ra = rotas.find(r => r.colaborador_id === a.id && r.onibus_id === busId);
        const rb = rotas.find(r => r.colaborador_id === b.id && r.onibus_id === busId);
        return (ra?.ordem_embarque || 99) - (rb?.ordem_embarque || 99);
    });

    if (sentido === 'volta') passageiros = [...passageiros].reverse();

    const horario = sentido === 'ida'
        ? (bus.horario_saida ? bus.horario_saida.substring(0,5) : '06:30')
        : (bus.horario_saida_volta ? bus.horario_saida_volta.substring(0,5) : '17:30');

    const [hBase, mBase] = horario.split(':').map(Number);
    const sentidoTexto = sentido === 'ida' ? '🌅 IDA — Para Kuhn Brasil' : '🌆 VOLTA — Para Casa';
    const origemEnd = sentido === 'ida' ? bus.ponto_origem : KUHN_BRASIL.endereco;
    const destinoEnd = sentido === 'ida' ? KUHN_BRASIL.endereco : bus.ponto_origem;
    const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });

    const linhasTabela = passageiros.map((c, i) => {
        const totalMin = mBase + (i + 1) * 7;
        const h = String(hBase + Math.floor(totalMin / 60)).padStart(2, '0');
        const m = String(totalMin % 60).padStart(2, '0');
        const end = [c.logradouro, c.numero].filter(Boolean).join(', ');
        return `<tr>
            <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:16px;color:#ED1C24;">${i+1}</td>
            <td style="padding:10px 12px;font-weight:600;">${c.nome}</td>
            <td style="padding:10px 12px;color:#444;">${end}${c.bairro ? ' — ' + c.bairro : ''}</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;color:#185FA5;">${h}:${m}</td>
            <td style="padding:10px 12px;text-align:center;">
                <div style="width:20px;height:20px;border:2px solid #999;border-radius:3px;display:inline-block;"></div>
            </td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Folha de Rota — ${bus.nome}</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', sans-serif; padding:20px; color:#222; }
    .header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:#ED1C24; color:white; border-radius:10px; margin-bottom:20px; }
    .header h1 { font-size:22px; }
    .header p { font-size:13px; opacity:0.9; margin-top:4px; }
    .logo { font-size:28px; font-weight:900; letter-spacing:-1px; }
    .info-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
    .info-card { background:#F8F8F8; border:1px solid #E0E0E0; border-radius:8px; padding:12px 16px; }
    .info-label { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
    .info-value { font-size:16px; font-weight:700; color:#2E3440; }
    .rota-linha { display:flex; align-items:center; gap:8px; padding:10px 16px; background:#FFF8E1; border:1px solid #FFD54F; border-radius:8px; margin-bottom:20px; font-size:13px; }
    table { width:100%; border-collapse:collapse; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    thead { background:linear-gradient(135deg,#ED1C24,#2E3440); color:white; }
    th { padding:12px; text-align:left; font-size:12px; text-transform:uppercase; }
    tbody tr:nth-child(even) { background:#F9F9F9; }
    tbody tr { border-bottom:1px solid #EEE; }
    .footer { margin-top:20px; display:flex; justify-content:space-between; align-items:flex-end; font-size:12px; color:#888; }
    .assinatura { border-top:1px solid #999; padding-top:6px; min-width:200px; text-align:center; }
    @media print {
        body { padding:10px; }
        button { display:none !important; }
    }
</style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">KUHN</div>
            <h1>Folha de Rota</h1>
            <p>${dataHoje}</p>
        </div>
        <div style="text-align:right;">
            <div style="font-size:28px;">🚌</div>
            <div style="font-size:14px;font-weight:700;">${bus.nome}</div>
            <div style="font-size:12px;opacity:0.9;">${bus.placa}</div>
        </div>
    </div>

    <div class="info-grid">
        <div class="info-card">
            <div class="info-label">Sentido</div>
            <div class="info-value">${sentidoTexto}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Horário Saída</div>
            <div class="info-value">🕐 ${horario}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Total Passageiros</div>
            <div class="info-value">👥 ${passageiros.length}</div>
        </div>
        <div class="info-card">
            <div class="info-label">Capacidade</div>
            <div class="info-value">💺 ${bus.capacidade}</div>
        </div>
    </div>

    <div class="rota-linha">
        📍 <strong>Origem:</strong> ${origemEnd}
        &nbsp;&nbsp;→&nbsp;&nbsp;
        🏁 <strong>Destino:</strong> ${destinoEnd}
    </div>

    <table>
        <thead>
            <tr>
                <th style="width:50px;text-align:center;">#</th>
                <th>Colaborador</th>
                <th>Endereço</th>
                <th style="width:80px;text-align:center;">Horário</th>
                <th style="width:60px;text-align:center;">✓</th>
            </tr>
        </thead>
        <tbody>${linhasTabela}</tbody>
    </table>

    <div class="footer">
        <div>
            <div>Sistema de Roteirização — Kuhn Brasil</div>
            <div>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
        </div>
        <div class="assinatura">Assinatura do Motorista</div>
    </div>

    <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

// ========== RASTREAMENTO GPS ==========
let _gpsWatchId = null;
let _gpsInterval = null;

async function iniciarRastreamento(busId) {
    if (!navigator.geolocation) {
        mostrarMensagem('GPS não disponível neste dispositivo', 'error');
        return;
    }
    mostrarMensagem('📍 Rastreamento iniciado!');
    _gpsWatchId = navigator.geolocation.watchPosition(async (pos) => {
        try {
            await fetch(`${API_URL}/rota/rastreamento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    onibus_id: busId,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    velocidade: pos.coords.speed || 0,
                    precisao: pos.coords.accuracy
                })
            });
        } catch(e) { console.warn('Erro ao enviar GPS:', e); }
    }, (err) => {
        console.warn('Erro GPS:', err);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 });
}

function pararRastreamento() {
    if (_gpsWatchId) {
        navigator.geolocation.clearWatch(_gpsWatchId);
        _gpsWatchId = null;
        mostrarMensagem('Rastreamento pausado');
    }
}

// ========== PAINEL DO MOTORISTA ==========
function abrirPainelMotorista(busId) {
    if (!window._rotaData) return;
    const { onibus, colabs, rotas } = window._rotaData;
    const bus = onibus.find(b => b.id === busId);
    if (!bus) return;

    const passageiros = rotas
        .filter(r => r.onibus_id === busId && r.ativo)
        .map(r => colabs.find(c => c.id === r.colaborador_id))
        .filter(Boolean);

    passageiros.sort((a, b) => {
        const ra = rotas.find(r => r.colaborador_id === a.id && r.onibus_id === busId);
        const rb = rotas.find(r => r.colaborador_id === b.id && r.onibus_id === busId);
        return (ra?.ordem_embarque || 99) - (rb?.ordem_embarque || 99);
    });

    const listaPassageiros = passageiros.map((c, i) => {
        const end = [c.logradouro, c.numero, c.bairro].filter(Boolean).join(', ');
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F0F0F0;">
            <div>
                <div style="font-weight:600;font-size:14px;">${i+1}. ${c.nome}</div>
                <div style="font-size:12px;color:#666;">${end}</div>
            </div>
            <button onclick="confirmarCheckin(${bus.id}, ${c.id}, this)"
                style="background:#10b981;color:white;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                ✓ Embarcar
            </button>
        </div>`;
    }).join('');

    document.getElementById('modalBody').innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h2 style="color:#2E3440;">📍 Painel do Motorista</h2>
            <div style="text-align:right;">
                <div style="font-weight:700;">${bus.nome}</div>
                <div style="font-size:12px;color:#666;">${bus.placa}</div>
            </div>
        </div>

        <div id="gpsStatus" style="padding:10px 14px;background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;font-size:13px;margin-bottom:16px;">
            📍 GPS: Aguardando...
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button onclick="ativarGPSMotorista(${bus.id})"
                style="flex:1;padding:12px;background:#ED1C24;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">
                🟢 Iniciar Rota + GPS
            </button>
            <button onclick="pararRastreamento()"
                style="padding:12px 16px;background:#E8E8E8;color:#2E3440;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">
                ⏹ Parar
            </button>
        </div>

        <div style="font-weight:700;color:#2E3440;margin-bottom:8px;font-size:13px;text-transform:uppercase;">
            👥 Check-in dos Passageiros (${passageiros.length})
        </div>
        <div>${listaPassageiros || '<div style="text-align:center;padding:20px;color:#888;">Nenhum passageiro nesta linha</div>'}</div>
    `;
    document.getElementById('modal').style.display = 'block';
}

async function ativarGPSMotorista(busId) {
    const statusEl = document.getElementById('gpsStatus');
    if (!statusEl) return;
    statusEl.innerHTML = '📍 GPS: Solicitando permissão...';
    await iniciarRastreamento(busId);
    statusEl.innerHTML = '🟢 GPS: Ativo — sua localização está sendo compartilhada';
    statusEl.style.background = '#E1F5EE';
    statusEl.style.borderColor = '#9FE1CB';
    statusEl.style.color = '#0F6E56';
}

async function confirmarCheckin(busId, colabId, btn) {
    try {
        const res = await fetch(`${API_URL}/rota/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                colaborador_id: colabId,
                onibus_id: busId,
                sentido: _sentidoAtual || 'ida',
                embarcou: 1
            })
        });
        const data = await res.json();
        if (res.ok) {
            btn.textContent = `✅ ${data.horario}`;
            btn.style.background = '#6B7280';
            btn.disabled = true;
        }
    } catch(e) {
        mostrarMensagem('Erro ao registrar check-in', 'error');
    }
}

// ========== NAVEGAÇÃO ==========
function irParaPortaria() {
    // Garante que o usuário logado continua no localStorage antes de navegar
    if (usuarioLogado) {
        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
    }
    window.location.href = '/app';
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    atualizarCabecalhoUsuario();
    carregarDashboard();
});