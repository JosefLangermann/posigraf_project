/**
 * ============================================================
 * SISTEMA DE RH - POSIGRAF
 * Módulo: Gestão de Colaboradores (colaboradores.js)
 * ============================================================
 *
 * Responsabilidade:
 *   Gerencia a listagem, filtragem e operações sobre
 *   colaboradores da empresa, incluindo efetivos (CLT) e
 *   temporários (estágio/aprendiz). Implementa fluxo de
 *   desligamento com confirmação em dois passos e efetivação
 *   de temporários para contratos CLT.
 *
 * Tabelas Supabase utilizadas:
 *   - colaboradores : Colaboradores com contrato CLT ativo
 *   - temporarios   : Estagiários e aprendizes com data_fim
 *   - vagas         : Usada ao efetivar para buscar vagas CLT
 *
 * Estratégia de consulta:
 *   As duas tabelas são consultadas em paralelo e mescladas
 *   no cliente, com deduplicação por CPF para evitar
 *   duplicatas em caso de migração incompleta.
 * ============================================================
 */

/**
 * @type {SupabaseClient}
 * Instância global do cliente Supabase para esta página.
 */
const client = supabase.createClient(
    'https://zbjebceloppkbsstgwgp.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiamViY2Vsb3Bwa2Jzc3Rnd2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjI1NDIsImV4cCI6MjA5MDEzODU0Mn0.xzLnvBUwQAvVxqZkVrehXh-gYNwB2IVQxWJ8GyplDAo'
);

/* ============================================================
   MÓDULO: NORMALIZAÇÃO DE TIPOS
   Funções de conversão entre formatos internos e de exibição.
   ============================================================ */

/**
 * normalizarTipo(tipo)
 * Converte o valor de tipo_contrato armazenado no banco de
 * dados para um dos três tipos canônicos do sistema:
 * "efetivo", "estagio" ou "aprendiz".
 *
 * Problema resolvido: o campo tipo_contrato pode ser salvo
 * com diferentes grafias ("estagio", "estágio", "Estágio"),
 * então a normalização garante comparações consistentes.
 *
 * @param {string|null} tipo - Valor do campo tipo_contrato
 * @returns {string} Tipo canônico normalizado
 */
function normalizarTipo(tipo) {
    if (!tipo) return "temporario";

    tipo = tipo.toLowerCase();

    if (tipo.includes("estag")) return "estagio";
    if (tipo.includes("aprendiz")) return "aprendiz";
    if (tipo.includes("clt")) return "efetivo";

    return tipo;
}

/**
 * labelTipo(tipo)
 * Converte o tipo canônico para um label amigável para
 * exibição na interface.
 *
 * @param {string} tipo - Tipo canônico ("efetivo", "estagio", "aprendiz")
 * @returns {string} Label legível para o usuário final
 */
function labelTipo(tipo) {
    if (tipo === "efetivo")  return "Efetivo (CLT)";
    if (tipo === "estagio")  return "Estagiário";
    if (tipo === "aprendiz") return "Aprendiz";
    return "Temporário";
}

/* ============================================================
   MÓDULO: PERFIL E NAVEGAÇÃO
   ============================================================ */

/**
 * carregarPerfil()
 * Popula os dados de perfil do usuário na sidebar.
 * Versão simulada — integração futura com supabase.auth.
 */
function carregarPerfil() {
    document.getElementById('nomePerfil').textContent = "RH Admin";
    document.getElementById('emailPerfil').textContent = "rh@posigraf.com.br";
    document.getElementById('fotoPerfil').src = "https://via.placeholder.com/80";
}

function logout()          { alert("Logout (simulado)"); }
function irDashboard()     { window.location.href = "index.html"; }
function irCadastro()      { window.location.href = "cadastro.html"; }
function irVagas()         { window.location.href = "vagas.html"; }
function irColaboradores() { /* página atual */ }

/* ============================================================
   MÓDULO: UTILITÁRIOS
   ============================================================ */

/**
 * calcularIdade(data)
 * Retorna a idade em anos completos com base em data de
 * nascimento ISO. Aplica correção para aniversários futuros
 * no ano corrente.
 *
 * @param {string|null} data - Data no formato YYYY-MM-DD
 * @returns {number|string} Idade ou "-" para valor nulo
 */
function calcularIdade(data) {
    if (!data) return "-";

    const hoje = new Date();
    const nasc = new Date(data);

    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();

    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
        idade--;
    }

    return idade;
}

/**
 * resolverTabela(tipo)
 * Determina qual tabela do banco de dados deve ser usada
 * para operações de um determinado tipo de colaborador.
 *
 * @param {string} tipo - Tipo canônico do colaborador
 * @returns {string} Nome da tabela Supabase correspondente
 */
function resolverTabela(tipo) {
    return (tipo === "estagio" || tipo === "aprendiz")
        ? "temporarios"
        : "colaboradores";
}

/* ============================================================
   MÓDULO: CARREGAMENTO E RENDERIZAÇÃO
   ============================================================ */

/**
 * carregarColaboradores()
 * Busca e exibe todos os colaboradores ativos, combinando
 * dados das tabelas 'colaboradores' e 'temporarios'.
 *
 * Estratégia de merge client-side:
 *   1. Busca paralela nas duas tabelas (não usa Promise.all
 *      explicitamente, mas as queries são independentes)
 *   2. Normaliza o campo 'tipo' para cada conjunto
 *   3. Aplica filtro de categoria
 *   4. Deduplica por CPF (Map garante unicidade O(n))
 *   5. Aplica filtro de busca textual
 *   6. Delega renderização para renderLista()
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarColaboradores() {

    const filtro = document.getElementById('filtro').value;
    const busca  = document.getElementById('busca').value.toLowerCase();

    const lista = document.getElementById('lista');
    lista.innerHTML = "<li class='loading'>Carregando colaboradores...</li>";

    try {
        // Consultas independentes às duas tabelas
        let { data: efetivos }   = await client.from('colaboradores').select('*');
        let { data: temporarios } = await client.from('temporarios').select('*');

        efetivos   = efetivos   || [];
        temporarios = temporarios || [];

        // Unifica os dois conjuntos com tipo canônico
        let todos = [
            ...efetivos.map(e => ({ ...e, tipo: "efetivo" })),
            ...temporarios.map(t => ({
                ...t,
                tipo: normalizarTipo(t.tipo_contrato)
            }))
        ];

        // Aplica filtro de categoria (efetivos / temporários)
        if (filtro === "efetivos") {
            todos = todos.filter(p => p.tipo === "efetivo");
        }
        if (filtro === "temporarios") {
            todos = todos.filter(p =>
                p.tipo === "estagio" || p.tipo === "aprendiz"
            );
        }

        // Deduplicação por CPF usando Map (O(n) time, O(n) space)
        const mapa = new Map();
        todos.forEach(p => {
            if (!mapa.has(p.cpf)) mapa.set(p.cpf, p);
        });
        todos = Array.from(mapa.values());

        // Filtro de busca textual por nome
        if (busca.trim() !== "") {
            todos = todos.filter(p =>
                p.nome && p.nome.toLowerCase().includes(busca)
            );
        }

        lista.innerHTML = "";
        renderLista(todos);

    } catch (err) {
        console.error(err);
        lista.innerHTML = "<li style='color:var(--erro);padding:16px;'>Erro ao carregar dados 😢</li>";
    }
}

/**
 * renderLista(todos)
 * Renderiza a lista de colaboradores no DOM.
 * Cada item inclui: nome, setor, tipo, vaga, status e
 * botões de ação contextuais conforme o estado do colaborador.
 *
 * Lógica de botões:
 *   - Status "desligando": exibe [Excluir] e [Reverter]
 *   - Status "ativo":      exibe [Desligar]
 *   - Tipo temporário:     exibe adicionalmente [Efetivar]
 *
 * @param {Array<Object>} todos - Lista de colaboradores unificada
 */
function renderLista(todos) {

    const lista = document.getElementById('lista');

    if (todos.length === 0) {
        lista.innerHTML = "<li style='color:var(--neutro-400);padding:16px;'>Nenhum resultado encontrado.</li>";
        return;
    }

    todos.forEach(p => {

        const item = document.createElement('li');

        item.innerHTML = `
            <strong style="flex:1;min-width:160px;">${p.nome}</strong>
            <span class="texto-muted">${p.setor || "—"}</span>
            <span class="badge ${p.tipo === 'efetivo' ? 'badge-info' : 'badge-aviso'}">${labelTipo(p.tipo)}</span>
            <span class="texto-muted">${p.vaga_nome || "Sem vaga"}</span>
            ${p.status === "desligando" ? '<span class="badge badge-erro">Desligando</span>' : ''}
        `;

        const btnGrupo = document.createElement('div');
        btnGrupo.className = 'btn-grupo';

        // Botão "Ver mais" presente em todos os itens
        const btnVer = document.createElement('button');
        btnVer.textContent = "Ver mais";
        btnVer.className = 'btn-neutro';
        btnVer.onclick = () => toggleDetalhes(p);
        btnGrupo.appendChild(btnVer);

        // Botões condicionais por status
        if (p.status === "desligando") {
            const btnExcluir = document.createElement('button');
            btnExcluir.textContent = "🗑 Excluir";
            btnExcluir.className = 'btn-perigo';
            btnExcluir.onclick = () => excluir(p.id, p.tipo);

            const btnReverter = document.createElement('button');
            btnReverter.textContent = "↺ Reverter";
            btnReverter.className = 'btn-aviso';
            btnReverter.onclick = () => reverterDesligamento(p.id, p.tipo);

            btnGrupo.append(btnExcluir, btnReverter);
        } else {
            const btnDesligar = document.createElement('button');
            btnDesligar.textContent = "Desligar";
            btnDesligar.className = 'btn-perigo';
            btnDesligar.onclick = () => iniciarDesligamento(p.id, p.tipo);
            btnGrupo.appendChild(btnDesligar);
        }

        // Botão "Efetivar" exclusivo para temporários
        if (p.tipo === "estagio" || p.tipo === "aprendiz") {
            const btnEfetivar = document.createElement('button');
            btnEfetivar.textContent = "⬆ Efetivar";
            btnEfetivar.className = 'btn-sucesso';
            btnEfetivar.onclick = () => efetivar(p.id);
            btnGrupo.appendChild(btnEfetivar);
        }

        // Painel de detalhes (oculto por padrão)
        const detalhe = document.createElement('div');
        detalhe.id = "d" + p.id;
        detalhe.className = 'detalhe-panel';
        detalhe.style.display = "none";

        item.append(btnGrupo, detalhe);
        lista.appendChild(item);
    });
}

/* ============================================================
   MÓDULO: DETALHES DO COLABORADOR
   ============================================================ */

/**
 * toggleDetalhes(p)
 * Exibe ou oculta o painel de detalhes de um colaborador.
 * Os dados são populados a partir do objeto 'p' já carregado,
 * sem nova consulta ao banco (dados já disponíveis em memória).
 *
 * O painel exibe datas diferentes conforme o tipo:
 *   - Efetivo:    data de admissão
 *   - Temporário: data de início e data de fim
 *
 * @param {Object} p - Objeto do colaborador com todos os campos
 */
function toggleDetalhes(p) {

    const div = document.getElementById("d" + p.id);

    if (div.style.display === "block") {
        div.style.display = "none";
        return;
    }

    const idade = calcularIdade(p.data_nascimento);

    let dataInfo = "";
    if (p.tipo === "estagio" || p.tipo === "aprendiz") {
        dataInfo = `
            <p><strong>Data Início:</strong> ${p.data_inicio || "—"}</p>
            <p><strong>Data Fim:</strong> ${p.data_fim || "—"}</p>
        `;
    } else if (p.tipo === "efetivo") {
        dataInfo = `<p><strong>Data Admissão:</strong> ${p.data_admissao || "—"}</p>`;
    }

    div.innerHTML = `
        <p><strong>CPF:</strong> ${p.cpf || "—"}</p>
        <p><strong>E-mail:</strong> ${p.email || "—"}</p>
        <p><strong>E-mail Corporativo:</strong> ${p.email_corporativo || "—"}</p>
        <p><strong>Setor:</strong> ${p.setor || "—"}</p>
        <p><strong>Vaga ID:</strong> ${p.vaga_id || "—"}</p>
        ${dataInfo}
        <p><strong>Idade:</strong> ${idade} anos</p>
    `;

    div.style.display = "block";
}

/* ============================================================
   MÓDULO: AÇÕES DE COLABORADORES
   Desligamento, reversão, exclusão e efetivação.
   ============================================================ */

/**
 * iniciarDesligamento(id, tipo)
 * Inicia o processo de desligamento do colaborador,
 * marcando status como "desligando" sem excluir imediatamente.
 * Implementa um fluxo de confirmação em dois passos para
 * prevenir desligamentos acidentais.
 *
 * @async
 * @param {string|number} id   - ID do colaborador
 * @param {string}        tipo - Tipo canônico do colaborador
 */
async function iniciarDesligamento(id, tipo) {
    if (!confirm("Iniciar processo de desligamento?")) return;

    const tabela = resolverTabela(tipo);

    await client.from(tabela)
        .update({ status: "desligando" })
        .eq('id', id);

    carregarColaboradores();
}

/**
 * reverterDesligamento(id, tipo)
 * Cancela o processo de desligamento, restaurando o
 * status do colaborador para "ativo".
 *
 * @async
 * @param {string|number} id   - ID do colaborador
 * @param {string}        tipo - Tipo canônico do colaborador
 */
async function reverterDesligamento(id, tipo) {
    if (!confirm("Cancelar o processo de desligamento?")) return;

    const tabela = resolverTabela(tipo);

    await client.from(tabela)
        .update({ status: "ativo" })
        .eq('id', id);

    carregarColaboradores();
}

/**
 * excluir(id, tipo)
 * Exclui definitivamente o registro do colaborador do
 * banco de dados. Operação irreversível que só deve ser
 * executada após o fluxo de desligamento ser confirmado.
 *
 * @async
 * @param {string|number} id   - ID do colaborador
 * @param {string}        tipo - Tipo canônico do colaborador
 */
async function excluir(id, tipo) {
    if (!confirm("Confirmar exclusão definitiva do colaborador?")) return;

    const tabela = resolverTabela(tipo);

    await client.from(tabela)
        .delete()
        .eq('id', id);

    carregarColaboradores();
}

/**
 * efetivar(id)
 * Converte um colaborador temporário (estágio/aprendiz)
 * em efetivo (CLT), associando-o a uma nova vaga CLT.
 *
 * Fluxo:
 *   1. Busca vagas CLT abertas (exclui estagio e aprendiz)
 *   2. Exibe lista para o usuário escolher a vaga via prompt
 *   3. Valida a escolha e busca dados do temporário
 *   4. Verifica duplicidade de CPF na tabela colaboradores
 *   5. Insere novo registro em 'colaboradores'
 *   6. Remove o registro de 'temporarios'
 *
 * @async
 * @param {string|number} id - ID do temporário a ser efetivado
 */
async function efetivar(id) {

    if (!confirm("Confirmar efetivação (CLT) do colaborador?")) return;

    // Busca vagas aptas para efetivação (não temporárias)
    const { data: vagas } = await client
        .from('vagas')
        .select('id, titulo, setor, tipo_contrato')
        .eq('status', 'aberta')
        .neq('tipo_contrato', 'estagio')
        .neq('tipo_contrato', 'aprendiz');

    if (!vagas || vagas.length === 0) {
        alert("Nenhuma vaga CLT disponível no momento!");
        return;
    }

    // Monta texto de seleção para prompt nativo
    let texto = "Escolha o número da vaga CLT:\n\n";
    vagas.forEach((v, i) => {
        texto += `${i + 1} - ${v.titulo} (${v.setor})\n`;
    });

    const escolha = prompt(texto);
    const index   = parseInt(escolha) - 1;

    if (isNaN(index) || !vagas[index]) {
        alert("Escolha inválida!");
        return;
    }

    const vagaSelecionada = vagas[index];

    const { data: temp } = await client
        .from('temporarios')
        .select('*')
        .eq('id', id)
        .single();

    if (!temp) {
        alert("Erro ao buscar dados do temporário.");
        return;
    }

    // Verifica se CPF já existe na tabela de colaboradores efetivos
    const { data: cpfExist } = await client
        .from('colaboradores')
        .select('id')
        .eq('cpf', temp.cpf)
        .single();

    if (cpfExist) {
        alert("Este CPF já está cadastrado como colaborador efetivo.");
        return;
    }

    // Monta objeto do novo colaborador CLT
    const novoColaborador = {
        nome:              temp.nome,
        cpf:               temp.cpf,
        email:             temp.email,
        email_corporativo: temp.email_corporativo,
        setor:             vagaSelecionada.setor,
        vaga_id:           vagaSelecionada.id,
        vaga_nome:         vagaSelecionada.titulo,
        data_admissao:     new Date().toISOString().split("T")[0],
        status:            "ativo",
        data_nascimento:   temp.data_nascimento,
        tipo_instituicao:  temp.tipo_instituicao,
        curso:             temp.curso,
        instituicao:       temp.instituicao
    };

    const { error } = await client
        .from('colaboradores')
        .insert([novoColaborador]);

    if (error) {
        alert("Erro ao efetivar: " + error.message);
        return;
    }

    // Remove registro da tabela de temporários após migração
    await client.from('temporarios').delete().eq('id', id);

    alert("Colaborador efetivado com sucesso! 🚀");
    carregarColaboradores();
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
carregarPerfil();
carregarColaboradores();
