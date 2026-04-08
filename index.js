/**
 * ============================================================
 * SISTEMA DE RH - POSIGRAF
 * Módulo: Dashboard Principal (index.js)
 * ============================================================
 *
 * Responsabilidade:
 *   Controlador da página de dashboard. Gerencia o carregamento
 *   e exibição de métricas de candidatos em tempo real,
 *   renderização de gráfico de distribuição por status e
 *   operações CRUD sobre registros de candidatos.
 *
 * Padrão Arquitetural:
 *   MVC simplificado — este módulo atua como Controller,
 *   o Supabase como Model e o DOM como View.
 *
 * Dependências Externas:
 *   - Supabase JS SDK  : Acesso ao banco de dados PostgreSQL
 *   - Chart.js         : Renderização de gráficos interativos
 *
 * Banco de Dados (Supabase):
 *   Tabelas utilizadas: candidatos, vagas, indicacoes,
 *                       colaboradores, temporarios
 * ============================================================
 */

/**
 * Instância do cliente Supabase.
 * Inicializado com URL do projeto e chave anônima (anon key).
 * A chave anon é segura para uso em client-side — o controle
 * de acesso é feito pelas Row Level Security (RLS) policies.
 *
 * @type {SupabaseClient}
 */
const client = supabase.createClient(
    'https://zbjebceloppkbsstgwgp.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiamViY2Vsb3Bwa2Jzc3Rnd2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjI1NDIsImV4cCI6MjA5MDEzODU0Mn0.xzLnvBUwQAvVxqZkVrehXh-gYNwB2IVQxWJ8GyplDAo'
);

/**
 * Referência global à instância do gráfico Chart.js.
 * Mantida para permitir destruição antes de re-renderização,
 * evitando vazamento de memória e sobreposição de canvas.
 *
 * @type {Chart|null}
 */
let grafico = null;

/* ============================================================
   MÓDULO: PERFIL DO USUÁRIO
   Responsável pela exibição dos dados do usuário logado
   na interface da sidebar.
   ============================================================ */

/**
 * carregarPerfil()
 * Popula os elementos de perfil na sidebar com dados do
 * usuário atualmente autenticado.
 *
 * Nota: Nesta versão, os dados são estáticos/simulados.
 * Em produção, deve ser integrado ao sistema de autenticação
 * do Supabase (supabase.auth.getUser()).
 */
function carregarPerfil() {
    document.getElementById('nomePerfil').textContent = "RH Admin";
    document.getElementById('emailPerfil').textContent = "rh@posigraf.com.br";
    document.getElementById('fotoPerfil').src =
        "https://via.placeholder.com/80";
}

/**
 * editarPerfil()
 * Permite ao usuário atualizar seu nome de exibição via
 * prompt nativo do navegador.
 *
 * Nota: Implementação simplificada. Versão completa deveria
 * persistir o dado no banco de dados via Supabase Auth.
 */
function editarPerfil() {
    const novoNome = prompt("Novo nome:");
    if (novoNome) {
        document.getElementById('nomePerfil').textContent = novoNome;
    }
}

/**
 * logout()
 * Encerra a sessão do usuário.
 * Atualmente simulado — deve chamar supabase.auth.signOut() em produção.
 */
function logout() {
    alert("Logout (simulado)");
}

/** Navegação para outras páginas do sistema */
function irDashboard() {}
function irCadastro() { window.location.href = "cadastro.html"; }

/* ============================================================
   MÓDULO: UTILITÁRIOS
   Funções auxiliares compartilhadas pelo módulo.
   ============================================================ */

/**
 * calcularIdade(data_nascimento)
 * Calcula a idade atual em anos completos a partir de uma
 * data de nascimento no formato ISO (YYYY-MM-DD).
 *
 * Algoritmo:
 *   1. Computa diferença de anos entre hoje e data de nascimento.
 *   2. Verifica se o aniversário deste ano já ocorreu.
 *   3. Caso não tenha ocorrido, subtrai 1 ano.
 *
 * @param {string} data_nascimento - Data no formato ISO 8601
 * @returns {number|string} Idade em anos ou "-" se não informado
 */
function calcularIdade(data_nascimento) {
    if (!data_nascimento) return "-";

    const hoje = new Date();
    const nasc = new Date(data_nascimento);

    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();

    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
        idade--;
    }

    return idade;
}

/* ============================================================
   MÓDULO: CANDIDATOS
   CRUD e renderização da lista de candidatos.
   ============================================================ */

/**
 * carregarCandidatos()
 * Busca candidatos no banco de dados com suporte a filtros
 * por status e busca textual por nome (case-insensitive).
 *
 * Query utiliza JOIN implícito do Supabase para trazer
 * dados relacionados da tabela 'vagas' em uma única chamada,
 * evitando o problema N+1 de consultas.
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarCandidatos() {
    const filtro = document.getElementById('filtro').value;
    const busca = document.getElementById('busca').value;

    // Monta query base com select de colunas e relacionamento
    let query = client.from('candidatos').select(`
        id, nome, status, curriculo_url, vaga_id, data_nascimento,
        vagas ( titulo, tipo_contrato )
    `);

    // Aplica filtro de status quando selecionado
    if (filtro !== "todos") query = query.eq('status', filtro);

    // Aplica filtro de busca por nome com ILIKE (case-insensitive)
    if (busca) query = query.ilike('nome', `%${busca}%`);

    const { data } = await query;

    const lista = document.getElementById('lista');
    lista.innerHTML = "";

    if (!data || data.length === 0) {
        lista.innerHTML = "<li style='color:var(--neutro-400);padding:16px;'>Nenhum candidato encontrado.</li>";
        return;
    }

    // Renderiza cada candidato como item de lista
    data.forEach(c => {
        const item = document.createElement('li');
        const idade = calcularIdade(c.data_nascimento);

        // Mapeia status para badge visual
        const badges = {
            'aprovado':   '<span class="badge badge-sucesso">Aprovado</span>',
            'reprovado':  '<span class="badge badge-erro">Reprovado</span>',
            'em_processo':'<span class="badge badge-aviso">Em Processo</span>'
        };

        item.setAttribute('data-status', c.status);
        item.innerHTML = `
            <strong style="flex:1;min-width:160px;">${c.nome}</strong>
            <span class="texto-muted">${c.vagas ? c.vagas.titulo : "Sem vaga"}</span>
            <span class="texto-muted">${idade} anos</span>
            ${badges[c.status] || `<span class="badge badge-neutro">${c.status}</span>`}
        `;

        // Grupo de botões de ação
        const btnGrupo = document.createElement('div');
        btnGrupo.className = 'btn-grupo';

        const btnA = document.createElement('button');
        btnA.textContent = "✔ Aprovar";
        btnA.className = 'btn-sucesso';
        btnA.onclick = () => atualizarStatus(c.id, "aprovado");

        const btnR = document.createElement('button');
        btnR.textContent = "✖ Reprovar";
        btnR.className = 'btn-perigo';
        btnR.onclick = () => atualizarStatus(c.id, "reprovado");

        const btnV = document.createElement('button');
        btnV.textContent = "↺ Reabrir";
        btnV.className = 'btn-aviso';
        btnV.onclick = () => atualizarStatus(c.id, "em_processo");

        const btnD = document.createElement('button');
        btnD.textContent = "Ver mais";
        btnD.className = 'btn-neutro';
        btnD.onclick = () => verDetalhes(c.id);

        const btnColab = document.createElement('button');
        btnColab.textContent = "🏢 Tornar colaborador";
        btnColab.className = 'btn-secundario';
        btnColab.onclick = () => tornarColaborador(c.id);

        // Botão de colaborador visível apenas para aprovados
        if (c.status !== "aprovado") {
            btnColab.style.display = "none";
        }

        // Botão de exclusão exclusivo para reprovados
        if (c.status === "reprovado") {
            const btnExcluir = document.createElement('button');
            btnExcluir.textContent = "🗑 Excluir";
            btnExcluir.className = 'btn-perigo';
            btnExcluir.onclick = () => excluirCandidato(c.id);
            btnGrupo.appendChild(btnExcluir);
        }

        btnGrupo.append(btnA, btnR, btnV, btnD, btnColab);

        // Div expansível para detalhes do candidato
        const detalhe = document.createElement('div');
        detalhe.id = "d" + c.id;
        detalhe.className = 'detalhe-panel';
        detalhe.style.display = "none";

        item.append(btnGrupo, detalhe);
        lista.appendChild(item);
    });
}

/**
 * excluirCandidato(id)
 * Remove permanentemente um candidato do banco de dados.
 * Exige confirmação explícita do usuário antes de executar.
 * Atualiza a lista e o dashboard após remoção bem-sucedida.
 *
 * @async
 * @param {string|number} id - Identificador único do candidato
 * @returns {Promise<void>}
 */
async function excluirCandidato(id) {
    const confirmar = confirm("Tem certeza que deseja excluir este candidato?");
    if (!confirmar) return;

    await client
        .from('candidatos')
        .delete()
        .eq('id', id);

    alert("Candidato excluído com sucesso.");

    carregarCandidatos();
    carregarDashboard();
}

/* ============================================================
   MÓDULO: DETALHES DO CANDIDATO
   Expansão inline com informações completas do candidato.
   ============================================================ */

/**
 * verDetalhes(id)
 * Exibe ou oculta o painel de detalhes de um candidato.
 * Na primeira abertura, busca os dados completos via Supabase,
 * incluindo dados de indicação (LEFT JOIN implícito).
 *
 * Padrão Toggle: se já visível, oculta; caso contrário, busca e exibe.
 *
 * @async
 * @param {string|number} id - Identificador único do candidato
 * @returns {Promise<void>}
 */
async function verDetalhes(id) {
    const div = document.getElementById("d" + id);

    // Toggle de visibilidade
    if (div.style.display === "block") {
        div.style.display = "none";
        return;
    }

    const { data } = await client
        .from('candidatos')
        .select(`
            nome, email, cpf, origem, status, curriculo_url,
            data_nascimento, instituicao, curso,
            vagas(titulo, tipo_contrato),
            indicacoes ( quem_indicou, email_indicador )
        `)
        .eq('id', id)
        .single();

    const idade = calcularIdade(data.data_nascimento);
    const indicacao = data.indicacoes?.[0];

    div.innerHTML = `
        <p><strong>E-mail:</strong> ${data.email}</p>
        <p><strong>CPF:</strong> ${data.cpf}</p>
        <p><strong>Origem:</strong> ${data.origem}</p>
        <p><strong>Indicado por:</strong> ${indicacao ? indicacao.quem_indicou : "—"}</p>
        <p><strong>E-mail do indicador:</strong> ${indicacao ? indicacao.email_indicador : "—"}</p>
        <p><strong>Status:</strong> ${data.status}</p>
        <p><strong>Idade:</strong> ${idade} anos</p>
        <p><strong>Instituição:</strong> ${data.instituicao || "—"}</p>
        <p><strong>Curso:</strong> ${data.curso || "—"}</p>
        <p><strong>Currículo:</strong> ${
            data.curriculo_url
                ? `<a href="${data.curriculo_url}" target="_blank">Ver PDF</a>`
                : "Não enviado"
        }</p>
    `;

    div.style.display = "block";
}

/* ============================================================
   MÓDULO: E-MAIL CORPORATIVO
   Geração automática de endereço de e-mail institucional.
   ============================================================ */

/**
 * gerarEmailCorporativo(nome)
 * Converte o nome do colaborador em um endereço de e-mail
 * corporativo no padrão "primeiro.ultimo@posigraf.com.br".
 *
 * Transformações aplicadas:
 *   1. Conversão para minúsculas
 *   2. Substituição de espaços por pontos
 *   3. Remoção de acentos e diacríticos (NFD + RegExp)
 *
 * @param {string} nome - Nome completo do colaborador
 * @returns {string} Endereço de e-mail corporativo formatado
 *
 * @example
 * gerarEmailCorporativo("João da Silva")
 * // Retorna: "joao.da.silva@posigraf.com.br"
 */
function gerarEmailCorporativo(nome) {
    return nome
        .toLowerCase()
        .replace(/\s+/g, ".")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        + "@posigraf.com.br";
}

/* ============================================================
   MÓDULO: TORNAR COLABORADOR
   Fluxo de conversão de candidato aprovado em colaborador.
   ============================================================ */

/**
 * tornarColaborador(id)
 * Realiza o fluxo completo de onboarding de um candidato:
 *
 * 1. Busca dados do candidato aprovado
 * 2. Busca dados da vaga associada
 * 3. Determina tabela de destino (colaboradores ou temporarios)
 *    baseado no tipo_contrato da vaga
 * 4. Gera e-mail corporativo automaticamente
 * 5. Insere registro na tabela correta
 * 6. Remove o candidato da tabela de candidatos
 * 7. Atualiza status da indicação (se houver)
 *
 * Regras de negócio:
 *   - Estagio/Aprendiz → tabela 'temporarios' (com data_fim)
 *   - CLT → tabela 'colaboradores' (com data_admissao)
 *
 * @async
 * @param {string|number} id - Identificador único do candidato
 * @returns {Promise<void>}
 */
async function tornarColaborador(id) {

    // Atualiza indicação antes da confirmação para evitar estado inconsistente
    await client
        .from('indicacoes')
        .update({ status: 'convertido' })
        .eq('candidato_id', id);

    const confirmar = confirm("Confirmar conversão em colaborador?");
    if (!confirmar) return;

    const { data: candidato, error: errC } = await client
        .from('candidatos')
        .select('*')
        .eq('id', id)
        .single();

    if (errC || !candidato) {
        alert("Erro ao buscar candidato");
        return;
    }

    const { data: vaga, error: errV } = await client
        .from('vagas')
        .select('tipo_contrato, setor, duracao_meses, titulo')
        .eq('id', candidato.vaga_id)
        .single();

    if (errV || !vaga) {
        alert("Erro ao buscar vaga");
        return;
    }

    // Determina tabela de destino com base no tipo de contrato
    const destino = (
        vaga.tipo_contrato === "estagio" ||
        vaga.tipo_contrato === "aprendiz"
    ) ? "temporarios" : "colaboradores";

    const emailCorp = gerarEmailCorporativo(candidato.nome);
    const hoje = new Date().toISOString().split("T")[0];
    const duracao = vaga.duracao_meses || 6;

    let novo;

    // Monta objeto para temporários (estágio / aprendiz)
    if (destino === "temporarios") {
        novo = {
            nome: candidato.nome,
            cpf: candidato.cpf,
            email: candidato.email,
            email_corporativo: emailCorp,
            setor: vaga.setor,
            vaga_id: candidato.vaga_id,
            vaga_nome: vaga.titulo,
            data_nascimento: candidato.data_nascimento,
            curso: candidato.curso,
            instituicao: candidato.instituicao,
            tipo_instituicao: candidato.tipo_instituicao,
            data_inicio: hoje,
            data_fim: adicionarMeses(hoje, duracao),
            tipo_contrato: vaga.tipo_contrato,
            status: "ativo"
        };
    }
    // Monta objeto para colaboradores efetivos (CLT)
    else {
        novo = {
            nome: candidato.nome,
            cpf: candidato.cpf,
            email: candidato.email,
            email_corporativo: emailCorp,
            setor: vaga.setor,
            vaga_id: candidato.vaga_id,
            vaga_nome: vaga.titulo,
            data_nascimento: candidato.data_nascimento,
            data_admissao: hoje,
            status: "ativo"
        };
    }

    const { error } = await client.from(destino).insert([novo]);

    if (error) {
        console.error("ERRO COMPLETO:", error);
        alert("Erro: " + error.message);
        return;
    }

    // Remove candidato após conversão bem-sucedida
    await client.from('candidatos').delete().eq('id', id);

    alert("Colaborador criado com sucesso! 🚀");

    carregarCandidatos();
    carregarDashboard();
}

/**
 * adicionarMeses(data, meses)
 * Soma um número de meses a uma data ISO e retorna
 * a nova data no formato YYYY-MM-DD.
 * Utilizado para calcular a data_fim de contratos temporários.
 *
 * @param {string} data  - Data de início no formato YYYY-MM-DD
 * @param {number} meses - Quantidade de meses a adicionar
 * @returns {string} Nova data no formato YYYY-MM-DD
 */
function adicionarMeses(data, meses) {
    const d = new Date(data);
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().split("T")[0];
}

/* ============================================================
   MÓDULO: DASHBOARD — MÉTRICAS E GRÁFICO
   ============================================================ */

/**
 * carregarDashboard()
 * Busca todos os candidatos e calcula métricas de desempenho
 * do processo seletivo. Atualiza os cards de métricas e
 * re-renderiza o gráfico de pizza com a distribuição atual.
 *
 * Métricas calculadas:
 *   - Total de candidatos
 *   - Quantitativo por status (em_processo, aprovado, reprovado)
 *   - Taxa de aprovação: (aprovados / total) * 100
 *
 * Nota: O gráfico anterior é destruído antes de criar um novo
 * para evitar sobreposição e vazamento de referências Chart.js.
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarDashboard() {
    const { data } = await client.from('candidatos').select('*');

    let total = data.length;
    let em = 0, ap = 0, rep = 0;

    // Contagem por status via iteração simples O(n)
    data.forEach(c => {
        if (c.status === "em_processo") em++;
        if (c.status === "aprovado") ap++;
        if (c.status === "reprovado") rep++;
    });

    // Taxa percentual de aprovação
    let taxa = total ? (ap / total) * 100 : 0;

    // Atualiza os cards de métricas no DOM
    document.getElementById('total').textContent = total;
    document.getElementById('em_processo').textContent = em;
    document.getElementById('aprovados').textContent = ap;
    document.getElementById('reprovados').textContent = rep;
    document.getElementById('taxa').textContent = taxa.toFixed(1) + "%";

    // Renderiza gráfico de pizza com Chart.js
    const ctx = document.getElementById('grafico').getContext('2d');

    if (grafico) grafico.destroy(); // Evita duplicação

    grafico = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Em processo', 'Aprovados', 'Reprovados'],
            datasets: [{
                data: [em, ap, rep],
                backgroundColor: ['#f5a623', '#0fba72', '#e8344b'],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'DM Sans', size: 12 },
                        padding: 16
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

/* ============================================================
   MÓDULO: ATUALIZAÇÃO DE STATUS
   ============================================================ */

/**
 * atualizarStatus(id, status)
 * Atualiza o status de um candidato no banco de dados.
 * Em caso de reprovação, também atualiza o status da
 * indicação associada para 'rejeitado', mantendo a
 * integridade referencial dos dados de indicação.
 *
 * @async
 * @param {string|number} id     - Identificador do candidato
 * @param {string}        status - Novo status: 'aprovado' | 'reprovado' | 'em_processo'
 * @returns {Promise<void>}
 */
async function atualizarStatus(id, status) {

    await client.from('candidatos')
        .update({ status })
        .eq('id', id);

    // Atualiza indicação associada quando o candidato é reprovado
    if (status === "reprovado") {
        await client
            .from('indicacoes')
            .update({ status: 'rejeitado' })
            .eq('candidato_id', id);
    }

    carregarCandidatos();
    carregarDashboard();
}

/* ============================================================
   INICIALIZAÇÃO DO MÓDULO
   Executado automaticamente ao carregar a página.
   ============================================================ */
carregarPerfil();
carregarCandidatos();
carregarDashboard();
