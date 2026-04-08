/**
 * ============================================================
 * SISTEMA DE RH - POSIGRAF
 * Módulo: Cadastro Manual de Candidatos (cadastro.js)
 * ============================================================
 *
 * Responsabilidade:
 *   Permite ao time de RH cadastrar candidatos manualmente,
 *   com validações completas de dados pessoais, formação
 *   acadêmica e indicação por colaborador. Espelha a
 *   funcionalidade do formulário público (inscricao.js),
 *   com acesso restrito ao sistema interno.
 *
 * Diferenças em relação ao inscricao.js:
 *   - Requer autenticação (acesso interno)
 *   - Exibe lista de candidatos com ações de status
 *   - Carrega todas as vagas (abertas e fechadas)
 *
 * Validações implementadas:
 *   - Campos obrigatórios: nome, CPF, e-mail, vaga, nascimento
 *   - Idade mínima: 14 anos
 *   - Arquivo PDF com tamanho máximo de 5MB
 *   - CPF único na base de dados
 *   - Indicação com e-mail corporativo válido
 *   - Formação compatível com tipo de instituição
 * ============================================================
 */

/**
 * @type {SupabaseClient}
 */
const client = supabase.createClient(
    'https://zbjebceloppkbsstgwgp.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiamViY2Vsb3Bwa2Jzc3Rnd2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjI1NDIsImV4cCI6MjA5MDEzODU0Mn0.xzLnvBUwQAvVxqZkVrehXh-gYNwB2IVQxWJ8GyplDAo'
);

/* ============================================================
   MÓDULO: PERFIL E NAVEGAÇÃO
   ============================================================ */

/**
 * carregarPerfil()
 * Preenche dados de perfil na sidebar. Simulado para demonstração.
 */
function carregarPerfil() {
    document.getElementById('nomePerfil').textContent = "RH Admin";
    document.getElementById('emailPerfil').textContent = "rh@posigraf.com.br";
    document.getElementById('fotoPerfil').src = "https://via.placeholder.com/80";
}

function logout()      { alert("Logout (simulado)"); }
function irDashboard() { window.location.href = "index.html"; }

/* ============================================================
   MÓDULO: INDICAÇÃO
   ============================================================ */

/**
 * verificarOrigem()
 * Exibe o bloco de campos de indicação quando a origem
 * selecionada pelo usuário for "indicacao".
 * Utiliza a classe CSS .visivel para controle de display.
 */
function verificarOrigem() {
    const origem = document.getElementById('origem').value;
    const div = document.getElementById('indicacaoFields');
    div.classList.toggle('visivel', origem === "indicacao");
}

/**
 * buscarIndicador()
 * Busca o nome do colaborador indicador pelo e-mail corporativo
 * informado. O campo de nome é preenchido automaticamente
 * e está bloqueado para edição manual (readonly).
 *
 * @async
 * @returns {Promise<void>}
 */
async function buscarIndicador() {
    const email = document.getElementById('email_indicador').value;

    if (!email) return;

    const { data, error } = await client
        .from('colaboradores')
        .select('nome')
        .eq('email_corporativo', email)
        .single();

    if (error || !data) {
        alert("Colaborador não encontrado com este e-mail corporativo!");
        document.getElementById('quem_indicou').value = "";
        return;
    }

    document.getElementById('quem_indicou').value = data.nome;
}

/* ============================================================
   MÓDULO: VAGAS
   ============================================================ */

/**
 * carregarVagas()
 * Popula o select de vagas com todas as vagas cadastradas.
 * Diferente do formulário público, exibe vagas abertas e
 * fechadas para cadastro manual pelo RH.
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarVagas() {
    const { data } = await client.from('vagas').select('*');
    const select = document.getElementById('vaga');
    select.innerHTML = "";
    data.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.titulo} (${v.tipo_contrato || "clt"})`;
        select.appendChild(opt);
    });
}

/* ============================================================
   MÓDULO: FORMAÇÃO ACADÊMICA DINÂMICA
   ============================================================ */

/**
 * Referências DOM para elementos de formação acadêmica.
 * Mantidas no escopo de módulo para reutilização nos event listeners.
 */
const tipoFormacaoSelect     = document.getElementById('tipo_formacao');
const tipoInstituicaoSelect  = document.getElementById('tipo_instituicao');
const camposFormacaoDetalhes = document.getElementById('camposFormacaoDetalhes');

/**
 * Mapeamento de formações para tipos de instituição compatíveis.
 * Implementa a regra de negócio de compatibilidade entre
 * o nível de formação e o tipo de estabelecimento de ensino.
 *
 * @type {Object.<string, string[]>}
 */
const opcoesInstituicao = {
    "ensino_medio":          ["escola_tecnica", "tecnico"],
    "ensino_medio_integrado":["escola_tecnica", "tecnico"],
    "curso_tecnico":         ["escola_tecnica", "tecnico"],
    "graduacao":             ["faculdade"],
    "pos_graduacao":         ["faculdade"]
};

/**
 * Event listener de mudança de formação.
 * Atualiza dinamicamente as opções do select de tipo de
 * instituição com base no nível de formação selecionado,
 * garantindo apenas combinações válidas.
 */
tipoFormacaoSelect.addEventListener('change', () => {
    const tipo   = tipoFormacaoSelect.value;
    const opcoes = opcoesInstituicao[tipo] || [];

    // Reconstrói as opções do select de instituição
    tipoInstituicaoSelect.innerHTML = '<option value="">Selecione</option>';
    opcoes.forEach(o => {
        const textos = {
            faculdade:     "Faculdade",
            tecnico:       "Curso Técnico",
            escola_tecnica:"Escola Integrada"
        };
        tipoInstituicaoSelect.innerHTML += `<option value="${o}">${textos[o]}</option>`;
    });

    // Exibe ou oculta campos de detalhes conforme o tipo
    camposFormacaoDetalhes.classList.toggle('visivel', tipo !== "sem_formacao");
});

/* ============================================================
   MÓDULO: UTILITÁRIOS
   ============================================================ */

/**
 * calcularIdade(data)
 * Calcula idade em anos completos com correção de aniversário.
 *
 * @param {string} data - Data de nascimento no formato YYYY-MM-DD
 * @returns {number} Idade em anos completos
 */
function calcularIdade(data) {
    const hoje = new Date();
    const nasc = new Date(data);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
}

/* ============================================================
   MÓDULO: LISTAGEM DE CANDIDATOS
   ============================================================ */

/**
 * carregarCandidatos()
 * Busca e exibe todos os candidatos cadastrados com
 * ações de aprovação, reprovação e reabertura de processo.
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarCandidatos() {
    const { data } = await client.from('candidatos').select('*');
    const lista = document.getElementById('lista');
    lista.innerHTML = "";

    if (!data || data.length === 0) {
        lista.innerHTML = "<li style='color:var(--neutro-400);padding:16px;'>Nenhum candidato cadastrado.</li>";
        return;
    }

    data.forEach(c => {
        const item = document.createElement('li');
        item.setAttribute('data-status', c.status);

        const badges = {
            'aprovado':   '<span class="badge badge-sucesso">Aprovado</span>',
            'reprovado':  '<span class="badge badge-erro">Reprovado</span>',
            'em_processo':'<span class="badge badge-aviso">Em Processo</span>'
        };

        item.innerHTML = `
            <strong style="flex:1;">${c.nome}</strong>
            ${badges[c.status] || ''}
            <span class="texto-muted">${c.curso || "—"}</span>
        `;

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

        btnGrupo.append(btnA, btnR, btnV);
        item.appendChild(btnGrupo);
        lista.appendChild(item);
    });
}

/* ============================================================
   MÓDULO: CADASTRO DE CANDIDATOS
   ============================================================ */

/**
 * cadastrar()
 * Executa o fluxo completo de cadastro manual de candidato:
 *   1. Coleta e valida dados do formulário
 *   2. Verifica duplicidade de CPF
 *   3. Faz upload do currículo PDF (se fornecido)
 *   4. Insere o candidato no banco de dados
 *   5. Registra indicação (se aplicável)
 *   6. Atualiza a lista de candidatos
 *
 * @async
 * @returns {Promise<void>}
 */
async function cadastrar() {

    // --- Coleta de dados do formulário ---
    const nome           = document.getElementById('nome').value.trim();
    const cpf            = document.getElementById('cpf').value.trim();
    const email          = document.getElementById('email').value.trim();
    const vaga_id        = document.getElementById('vaga').value;
    const data_nascimento= document.getElementById('data_nascimento').value;
    const origem         = document.getElementById('origem').value;
    const email_indicador= document.getElementById('email_indicador')?.value;
    const quem_indicou   = document.getElementById('quem_indicou').value.trim();
    const tipo_formacao  = document.getElementById('tipo_formacao').value || "sem_formacao";
    const tipo_instituicao= document.getElementById('tipo_instituicao').value;
    const instituicao    = document.getElementById('instituicao').value;
    const curso          = document.getElementById('curso').value;
    const file           = document.getElementById('curriculo').files[0];

    // --- Validação de campos obrigatórios ---
    if (!nome || !cpf || !email || !vaga_id || !data_nascimento) {
        alert("Preencha todos os campos obrigatórios!");
        return;
    }

    // --- Validação de idade mínima (14 anos) ---
    const idade = calcularIdade(data_nascimento);
    if (idade < 14) {
        alert("O candidato deve ter no mínimo 14 anos!");
        return;
    }

    // --- Validação do arquivo de currículo ---
    if (file) {
        const tipo = file.type;
        const nomeArquivo = file.name.toLowerCase();

        if (tipo !== "application/pdf" && !nomeArquivo.endsWith(".pdf")) {
            alert("Apenas arquivos PDF são aceitos!");
            return;
        }

        const tamanhoMax = 5 * 1024 * 1024; // 5MB em bytes
        if (file.size > tamanhoMax) {
            alert("O arquivo deve ter no máximo 5MB!");
            return;
        }
    }

    // --- Validação de indicação ---
    if (origem === "indicacao" && (!email_indicador || !quem_indicou)) {
        alert("Informe um e-mail corporativo válido para registrar a indicação!");
        return;
    }

    // --- Verificação de CPF duplicado ---
    const { data: existente } = await client
        .from('candidatos')
        .select('id')
        .eq('cpf', cpf)
        .single();

    if (existente) {
        alert("Este CPF já está cadastrado no sistema!");
        return;
    }

    // --- Busca dados da vaga selecionada ---
    const { data: vaga } = await client
        .from('vagas')
        .select('tipo_contrato, titulo')
        .eq('id', vaga_id)
        .single();

    if (!vaga) {
        alert("Vaga não encontrada!");
        return;
    }

    // --- Validação de compatibilidade da formação ---
    if (tipo_formacao !== "sem_formacao") {
        if (!instituicao || !tipo_instituicao || !curso) {
            alert("Preencha todos os dados de formação ou selecione 'Sem Formação'!");
            return;
        }
        if (!opcoesInstituicao[tipo_formacao].includes(tipo_instituicao)) {
            alert("Tipo de instituição incompatível com o nível de formação selecionado!");
            return;
        }
    }

    // --- Upload do currículo para o Storage do Supabase ---
    let urlCurriculo = null;

    if (file) {
        const fileName = Date.now() + "_" + file.name;

        const { error: uploadError } = await client.storage
            .from('curriculos')
            .upload(fileName, file);

        if (uploadError) {
            alert("Erro no upload do currículo!");
            return;
        }

        const { data: urlData } = client.storage
            .from('curriculos')
            .getPublicUrl(fileName);

        urlCurriculo = urlData.publicUrl;
    }

    // --- Inserção do candidato no banco de dados ---
    const { data: candidatoCriado, error } = await client
        .from('candidatos')
        .insert([{
            nome, cpf, email, origem, vaga_id,
            vaga_nome:        vaga.titulo,
            idade,
            data_nascimento,
            tipo_formacao,
            tipo_instituicao: tipo_formacao !== "sem_formacao" ? tipo_instituicao : null,
            instituicao:      tipo_formacao !== "sem_formacao" ? instituicao : null,
            curso:            tipo_formacao !== "sem_formacao" ? curso : null,
            status:           'em_processo',
            curriculo_url:    urlCurriculo
        }])
        .select()
        .single();

    if (error) {
        console.error("Erro ao cadastrar:", error);
        alert("Erro ao cadastrar candidato. Verifique o console.");
        return;
    }

    // --- Registro da indicação (quando aplicável) ---
    if (origem === "indicacao") {
        const { error: erroIndicacao } = await client
            .from('indicacoes')
            .insert([{
                nome_indicado:   nome,
                quem_indicou:    quem_indicou,
                email_indicador: email_indicador,
                candidato_id:    candidatoCriado.id
            }]);

        if (erroIndicacao) {
            console.warn("Candidato salvo, mas erro ao registrar indicação:", erroIndicacao);
            alert("Candidato salvo, mas houve um erro ao registrar a indicação.");
        }
    }

    alert("Candidato cadastrado com sucesso! 🚀");
    limparCampos();
    carregarCandidatos();
}

/* ============================================================
   MÓDULO: ATUALIZAÇÃO DE STATUS
   ============================================================ */

/**
 * atualizarStatus(id, status)
 * Atualiza o status de processamento de um candidato.
 *
 * @async
 * @param {string|number} id     - ID do candidato
 * @param {string}        status - Novo status
 */
async function atualizarStatus(id, status) {
    await client.from('candidatos').update({ status }).eq('id', id);
    carregarCandidatos();
}

/* ============================================================
   MÓDULO: LIMPEZA DO FORMULÁRIO
   ============================================================ */

/**
 * limparCampos()
 * Reseta o formulário de cadastro para o estado inicial,
 * ocultando campos condicionais e limpando todos os inputs.
 */
function limparCampos() {
    const campos = ['nome','cpf','email','data_nascimento','instituicao',
                    'curso','curriculo','email_indicador','quem_indicou'];

    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    document.getElementById('tipo_instituicao').value = "";
    document.getElementById('tipo_formacao').value = "sem_formacao";
    document.getElementById('origem').value = "linkedin";

    document.getElementById('indicacaoFields').classList.remove('visivel');
    camposFormacaoDetalhes.classList.remove('visivel');
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
carregarPerfil();
carregarVagas();
carregarCandidatos();
