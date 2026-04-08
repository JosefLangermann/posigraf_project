/**
 * ============================================================
 * SISTEMA DE RH - POSIGRAF
 * Módulo: Gestão de Vagas (vagas.js)
 * ============================================================
 *
 * Responsabilidade:
 *   Controla o CRUD completo de vagas de emprego, incluindo
 *   criação, edição inline, exclusão e alternância de status
 *   (aberta/fechada). Gerencia a exibição condicional de
 *   campos específicos por tipo de contrato.
 *
 * Tipos de contrato suportados:
 *   - CLT      : Contrato por tempo indeterminado
 *   - Estágio  : Contrato temporário com duração definida
 *   - Aprendiz : Contrato de aprendizagem com instituição parceira
 *
 * Regras de negócio:
 *   - Duração máxima: 24 meses (estágio/aprendiz)
 *   - Aprendiz requer nome da instituição parceira (ex: SENAI)
 *   - Vagas fechadas são exibidas em cinza na listagem
 * ============================================================
 */

/**
 * @type {SupabaseClient}
 */
const client = supabase.createClient(
    'https://zbjebceloppkbsstgwgp.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiamViY2Vsb3Bwa2Jzc3Rnd2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjI1NDIsImV4cCI6MjA5MDEzODU0Mn0.xzLnvBUwQAvVxqZkVrehXh-gYNwB2IVQxWJ8GyplDAo'
);

/**
 * Estado local de edição.
 * Armazena o ID da vaga sendo editada. null indica modo criação.
 * @type {string|number|null}
 */
let editandoId = null;

/* ============================================================
   MÓDULO: CONTROLE DE CAMPOS DINÂMICOS
   ============================================================ */

/**
 * ajustarCampos()
 * Exibe ou oculta campos condicionais do formulário com
 * base no tipo de contrato selecionado.
 *
 * Mapeamento de visibilidade:
 *   - CLT     : nenhum campo adicional
 *   - Estágio : campo de duração (meses)
 *   - Aprendiz: campos de duração e instituição parceira
 */
function ajustarCampos() {
    const tipo = document.getElementById('tipo_contrato').value;

    const duracao = document.getElementById('campoDuracao');
    const inst    = document.getElementById('campoInstituicao');

    if (tipo === "clt") {
        duracao.classList.remove('visivel');
        inst.classList.remove('visivel');
    }

    if (tipo === "estagio") {
        duracao.classList.add('visivel');
        inst.classList.remove('visivel');
    }

    if (tipo === "aprendiz") {
        duracao.classList.add('visivel');
        inst.classList.add('visivel');
    }
}

function logout() { alert("Logout (simulado)"); }

/* ============================================================
   MÓDULO: LISTAGEM DE VAGAS
   ============================================================ */

/**
 * carregarVagas()
 * Busca todas as vagas cadastradas (abertas e fechadas)
 * e as renderiza na lista, com indicação visual de status
 * e botões de ação contextuais.
 *
 * @async
 * @returns {Promise<void>}
 */
async function carregarVagas() {
    const { data } = await client.from('vagas').select('*');

    const lista = document.getElementById('listaVagas');
    lista.innerHTML = "";

    if (!data || data.length === 0) {
        lista.innerHTML = "<li style='color:var(--neutro-400);padding:16px;'>Nenhuma vaga cadastrada.</li>";
        return;
    }

    data.forEach(v => {

        const item = document.createElement('li');

        // Vagas fechadas recebem estilo visual diferenciado
        if (v.status === "fechada") {
            item.style.opacity = "0.6";
        }

        // Badge de tipo de contrato
        const tipoLabel = {
            clt:      '<span class="badge badge-info">CLT</span>',
            estagio:  '<span class="badge badge-aviso">Estágio</span>',
            aprendiz: '<span class="badge badge-neutro">Aprendiz</span>'
        };

        // Badge de status da vaga
        const statusLabel = v.status === "fechada"
            ? '<span class="badge badge-erro">Fechada</span>'
            : '<span class="badge badge-sucesso">Aberta</span>';

        item.innerHTML = `
            <strong style="flex:1;min-width:160px;">${v.titulo}</strong>
            ${tipoLabel[v.tipo_contrato] || '<span class="badge badge-neutro">CLT</span>'}
            ${statusLabel}
            <span class="texto-muted">${v.setor || "—"}</span>
            <span class="texto-muted">${v.salario || "—"}</span>
            ${v.tipo_contrato !== "clt" ? `<span class="texto-muted">${v.duracao_meses || "—"} meses</span>` : ""}
            <div style="width:100%;font-size:.82rem;color:var(--neutro-600);margin-top:4px;">
                ${v.descricao ? `<span><b>Desc:</b> ${v.descricao}</span>` : ""}
                ${v.requisitos ? `<span style="margin-left:12px;"><b>Req:</b> ${v.requisitos}</span>` : ""}
            </div>
        `;

        // Grupo de botões de ação
        const btnGrupo = document.createElement('div');
        btnGrupo.className = 'btn-grupo';

        const btnEditar = document.createElement('button');
        btnEditar.textContent = "✏ Editar";
        btnEditar.className = 'btn-neutro';
        btnEditar.onclick = () => editarVaga(v);

        const btnExcluir = document.createElement('button');
        btnExcluir.textContent = "🗑 Excluir";
        btnExcluir.className = 'btn-perigo';
        btnExcluir.onclick = () => excluirVaga(v.id);

        const btnStatus = document.createElement('button');
        btnStatus.textContent = v.status === "fechada" ? "↺ Reabrir" : "⊘ Fechar";
        btnStatus.className = v.status === "fechada" ? 'btn-sucesso' : 'btn-aviso';
        btnStatus.onclick = () => toggleStatus(v.id, v.status);

        btnGrupo.append(btnEditar, btnExcluir, btnStatus);
        item.appendChild(btnGrupo);
        lista.appendChild(item);
    });
}

/* ============================================================
   MÓDULO: CRIAÇÃO E EDIÇÃO DE VAGAS
   ============================================================ */

/**
 * salvarVaga()
 * Persiste uma vaga no banco de dados — cria uma nova ou
 * atualiza a existente, conforme o estado de editandoId.
 *
 * Validações realizadas:
 *   1. Campos obrigatórios: título e salário
 *   2. Duração máxima de 24 meses para contratos temporários
 *   3. Instituição obrigatória para contrato Aprendiz
 *
 * @async
 * @returns {Promise<void>}
 */
async function salvarVaga() {

    const titulo        = document.getElementById('titulo').value;
    const salario       = document.getElementById('salario').value;
    const turno         = document.getElementById('turno').value;
    const beneficios    = document.getElementById('beneficios').value;
    const setor         = document.getElementById('setor').value;
    const descricao     = document.getElementById('descricao').value;
    const requisitos    = document.getElementById('requisitos').value;
    const tipo_contrato = document.getElementById('tipo_contrato').value;
    const duracao_meses = document.getElementById('duracao_meses').value;
    const instituicao   = document.getElementById('instituicao').value;

    // Validação de campos obrigatórios
    if (!titulo || !salario) {
        alert("Preencha ao menos título e salário!");
        return;
    }

    // Validação de duração para contratos temporários
    if ((tipo_contrato === "aprendiz" || tipo_contrato === "estagio")) {
        if (!duracao_meses || duracao_meses > 24) {
            alert("A duração deve ser de no máximo 24 meses!");
            return;
        }
    }

    // Validação de instituição obrigatória para aprendiz
    if (tipo_contrato === "aprendiz" && !instituicao) {
        alert("Contratos de aprendiz exigem o nome da instituição parceira!");
        return;
    }

    const dados = {
        titulo, salario, turno, beneficios, setor,
        descricao, requisitos, tipo_contrato,
        duracao_meses:  duracao_meses || null,
        instituicao:    tipo_contrato === "aprendiz" ? instituicao : null,
        status:         "aberta"
    };

    if (editandoId) {
        // Modo edição: atualiza registro existente
        await client.from('vagas')
            .update(dados)
            .eq('id', editandoId);

        editandoId = null;
    } else {
        // Modo criação: insere novo registro
        await client.from('vagas').insert([dados]);
    }

    limparFormulario();
    carregarVagas();
}

/**
 * editarVaga(v)
 * Preenche o formulário com os dados de uma vaga existente
 * para edição. Ativa o modo edição setando editandoId.
 *
 * @param {Object} v - Objeto completo da vaga do banco de dados
 */
function editarVaga(v) {
    document.getElementById('titulo').value        = v.titulo;
    document.getElementById('salario').value       = v.salario;
    document.getElementById('turno').value         = v.turno;
    document.getElementById('beneficios').value    = v.beneficios;
    document.getElementById('setor').value         = v.setor;
    document.getElementById('descricao').value     = v.descricao    || "";
    document.getElementById('requisitos').value    = v.requisitos   || "";
    document.getElementById('tipo_contrato').value = v.tipo_contrato || "clt";
    document.getElementById('duracao_meses').value = v.duracao_meses || "";
    document.getElementById('instituicao').value   = v.instituicao  || "";

    ajustarCampos();

    editandoId = v.id;

    // Rola para o formulário para facilitar a edição
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
}

/* ============================================================
   MÓDULO: OPERAÇÕES DE STATUS E EXCLUSÃO
   ============================================================ */

/**
 * toggleStatus(id, statusAtual)
 * Alterna o status de uma vaga entre "aberta" e "fechada".
 * Vagas fechadas não aparecem no formulário público de inscrição.
 *
 * @async
 * @param {string|number} id          - ID da vaga
 * @param {string}        statusAtual - Status atual: "aberta" | "fechada"
 */
async function toggleStatus(id, statusAtual) {
    const novo = statusAtual === "aberta" ? "fechada" : "aberta";

    await client.from('vagas')
        .update({ status: novo })
        .eq('id', id);

    carregarVagas();
}

/**
 * excluirVaga(id)
 * Remove permanentemente uma vaga do banco de dados.
 * Requer confirmação explícita do usuário.
 *
 * Atenção: a exclusão não verifica candidatos vinculados.
 * Recomenda-se fechar a vaga antes de excluí-la em produção.
 *
 * @async
 * @param {string|number} id - ID da vaga
 */
async function excluirVaga(id) {
    if (!confirm("Confirmar exclusão da vaga? Esta ação é irreversível.")) return;

    await client.from('vagas').delete().eq('id', id);

    carregarVagas();
}

/* ============================================================
   MÓDULO: UTILITÁRIOS DE FORMULÁRIO
   ============================================================ */

/**
 * limparFormulario()
 * Reseta todos os campos do formulário de vaga para seus
 * valores padrão e encerra o modo de edição.
 */
function limparFormulario() {
    document.getElementById('titulo').value        = "";
    document.getElementById('salario').value       = "";
    document.getElementById('turno').value         = "";
    document.getElementById('beneficios').value    = "";
    document.getElementById('setor').value         = "";
    document.getElementById('descricao').value     = "";
    document.getElementById('requisitos').value    = "";
    document.getElementById('duracao_meses').value = "";
    document.getElementById('instituicao').value   = "";

    document.getElementById('campoDuracao').classList.remove('visivel');
    document.getElementById('campoInstituicao').classList.remove('visivel');

    editandoId = null;
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
carregarVagas();
