// --- CONFIGURAÇÃO DB (INDEXEDDB) ---
const DB_NAME = "NewOrderDB_V4";
const STORE_IMAGENS = "imagens";
let db;

// Inicializa o banco ao carregar
const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_IMAGENS)) {
                db.createObjectStore(STORE_IMAGENS);
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        
        request.onerror = (event) => reject("Erro DB");
    });
};

// Funções de Imagem
const salvarImagemBD = (id, blob) => {
    const tx = db.transaction(STORE_IMAGENS, "readwrite");
    tx.objectStore(STORE_IMAGENS).put(blob, id);
};

const lerImagemBD = (id) => {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_IMAGENS, "readonly");
        const req = tx.objectStore(STORE_IMAGENS).get(id);
        req.onsuccess = () => resolve(req.result); // Retorna Blob ou undefined
        req.onerror = () => resolve(null);
    });
};

const deletarImagemBD = (id) => {
    const tx = db.transaction(STORE_IMAGENS, "readwrite");
    tx.objectStore(STORE_IMAGENS).delete(id);
};

// --- ESTADO DA APLICAÇÃO ---
let appData = {
    categorias: JSON.parse(localStorage.getItem('no_categorias')) || [],
    itens: JSON.parse(localStorage.getItem('no_itens')) || [] // { id: 123, nome: '', qtd: 0, min: 0, status: '', categoria: '' }
};

let activeTab = appData.categorias.length > 0 ? appData.categorias[0] : null;

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    carregarTema();
    inicializarDragDrop();
    
    // Setup Status Selector
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Preview de Foto
    document.getElementById('fotoInput').addEventListener('change', handleFotoSelection);

    renderizarTudo();
});

// --- RENDERIZAÇÃO ---
function renderizarTudo() {
    if (appData.categorias.length === 0) {
        activeTab = null;
        document.getElementById('startState').style.display = 'block';
        document.getElementById('listaItens').style.display = 'none';
    } else {
        document.getElementById('startState').style.display = 'none';
        document.getElementById('listaItens').style.display = 'block';
        if (!appData.categorias.includes(activeTab)) activeTab = appData.categorias[0];
    }
    
    renderTabs();
    if(activeTab) renderListaItens();
}

function renderTabs() {
    const nav = document.getElementById('categoryTabs');
    nav.innerHTML = appData.categorias.map(cat => 
        `<button class="tab ${cat === activeTab ? 'active' : ''}" onclick="mudarAba('${cat}')">${cat}</button>`
    ).join('');
}

async function renderListaItens() {
    const lista = document.getElementById('listaItens');
    const busca = document.getElementById('searchInput').value.toLowerCase();
    
    lista.innerHTML = ''; // Limpa antes de renderizar (não é o mais performático, mas é o mais seguro)

    const itensFiltrados = appData.itens.filter(item => {
        const matchCat = item.categoria === activeTab;
        const matchBusca = item.nome.toLowerCase().includes(busca);
        return matchCat && matchBusca;
    });

    if (itensFiltrados.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        return;
    }
    document.getElementById('emptyState').style.display = 'none';

    // Renderiza Síncrono (Layout) + Assíncrono (Fotos)
    for (const item of itensFiltrados) {
        const isLowStock = parseInt(item.qtd) <= parseInt(item.min) && item.status !== 'entregue';
        
        const li = document.createElement('li');
        li.className = 'item-card';
        li.dataset.id = item.id;
        li.dataset.status = item.status; // Para CSS border color
        
        li.innerHTML = `
            <div class="item-content">
                <img class="item-thumb" id="img-${item.id}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%23ccc' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E">
                <div class="item-info">
                    <strong>${item.nome}</strong>
                    <span>Qtd: ${item.qtd} ${isLowStock ? `<span class="low-stock-warning"><i class="ri-alert-fill"></i> Baixo</span>` : ''}</span>
                </div>
            </div>
            <div class="item-actions">
                <button onclick="abrirModalItem('${item.id}')" class="btn-edit-item"><i class="ri-pencil-line"></i></button>
                <div class="handle-item"><i class="ri-draggable"></i></div>
            </div>
        `;
        lista.appendChild(li);

        // Carrega imagem em background
        lerImagemBD(item.id).then(blob => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                document.getElementById(`img-${item.id}`).src = url;
            }
        });
    }
}

// --- MANIPULAÇÃO DE DADOS ---
function salvarItem() {
    const idExistente = document.getElementById('editId').value;
    const nome = document.getElementById('nomeItem').value;
    const qtd = document.getElementById('qtdItem').value || 0;
    const min = document.getElementById('minItem').value || 0;
    const cat = document.getElementById('catItemSelector').value;
    
    // Pega status ativo
    let status = 'pendente';
    document.querySelectorAll('.status-btn').forEach(btn => {
        if(btn.classList.contains('active')) status = btn.dataset.val;
    });

    if (!nome) return alert("Digite o nome!");

    // Novo ID ou existente
    const id = idExistente ? parseInt(idExistente) : Date.now();

    const novoItem = { 
        id: id, 
        nome, 
        qtd, 
        min, 
        status, 
        categoria: cat 
    };

    if (idExistente) {
        const index = appData.itens.findIndex(i => i.id == idExistente);
        appData.itens[index] = novoItem;
    } else {
        appData.itens.push(novoItem);
    }

    // Salva Imagem se houver nova
    const fileInput = document.getElementById('fotoInput');
    if (fileInput.files.length > 0) {
        comprimirImagem(fileInput.files[0], (blob) => {
            salvarImagemBD(id, blob);
            finalizarSalvamento();
        });
    } else {
        finalizarSalvamento();
    }
}

function finalizarSalvamento() {
    persistir();
    fecharModais();
    renderizarTudo();
}

function excluirItem(id) {
    if(confirm('Excluir este item?')) {
        appData.itens = appData.itens.filter(i => i.id != id);
        deletarImagemBD(id); // Limpa do IndexedDB
        persistir();
        fecharModais();
        renderizarTudo();
    }
}

// --- MODAIS ---
async function abrirModalItem(id = null) {
    if (appData.categorias.length === 0) return alert("Crie uma categoria primeiro.");

    const modal = document.getElementById('modalItem');
    const select = document.getElementById('catItemSelector');
    
    // Limpa inputs
    select.innerHTML = appData.categorias.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('fotoInput').value = ''; 
    document.getElementById('previewFoto').style.display = 'none';
    document.getElementById('placeholderFoto').style.display = 'flex';
    
    // Remove botão excluir antigo
    const oldBtn = document.getElementById('btnExcluirItem');
    if(oldBtn) oldBtn.remove();

    if (id !== null) {
        // EDIÇÃO
        const item = appData.itens.find(i => i.id == id);
        document.getElementById('modalTitle').innerText = 'Editar Item';
        document.getElementById('editId').value = id;
        document.getElementById('nomeItem').value = item.nome;
        document.getElementById('qtdItem').value = item.qtd;
        document.getElementById('minItem').value = item.min || 0;
        select.value = item.categoria;
        
        // Seta Status
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === (item.status || 'pendente'));
        });

        // Carrega foto preview
        const blob = await lerImagemBD(item.id);
        if(blob) {
            document.getElementById('previewFoto').src = URL.createObjectURL(blob);
            document.getElementById('previewFoto').style.display = 'block';
            document.getElementById('placeholderFoto').style.display = 'none';
        }

        // Botão Excluir
        const btn = document.createElement('button');
        btn.id = 'btnExcluirItem';
        btn.innerText = 'EXCLUIR ITEM';
        btn.onclick = () => excluirItem(id);
        document.querySelector('#modalItem .modal-content').appendChild(btn);

    } else {
        // NOVO
        document.getElementById('modalTitle').innerText = 'Novo Item';
        document.getElementById('editId').value = '';
        document.getElementById('nomeItem').value = '';
        document.getElementById('qtdItem').value = '';
        document.getElementById('minItem').value = '';
        
        // Reset Status
        document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.status-btn[data-val="pendente"]').classList.add('active');
    }
    
    modal.style.display = 'flex';
}

// --- IMAGEM & COMPRESSÃO ---
function handleFotoSelection(e) {
    const file = e.target.files[0];
    if(file) {
        const url = URL.createObjectURL(file);
        document.getElementById('previewFoto').src = url;
        document.getElementById('previewFoto').style.display = 'block';
        document.getElementById('placeholderFoto').style.display = 'none';
    }
}

function comprimirImagem(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.getElementById('compressorCanvas');
            const ctx = canvas.getContext('2d');
            
            // Max dimensão 800px (bom compromisso qualidade/tamanho)
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Converte para Blob JPEG 0.7 qualidade
            canvas.toBlob(callback, 'image/jpeg', 0.7);
        };
    };
}

// --- BACKUP COMPLETO (COM IMAGENS) ---
async function exportarBackupCompleto() {
    alert("Gerando backup... isso pode levar alguns segundos se houver muitas fotos.");
    
    // 1. Cria cópia dos dados
    let backupData = { ...appData, images: {} };

    // 2. Converte todas as imagens do DB para Base64
    for (const item of appData.itens) {
        const blob = await lerImagemBD(item.id);
        if (blob) {
            backupData.images[item.id] = await blobToBase64(blob);
        }
    }

    // 3. Download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const el = document.createElement('a');
    el.href = dataStr;
    el.download = `NewOrder_Backup_${new Date().toISOString().slice(0,10)}.json`;
    el.click();
}

function blobToBase64(blob) {
    return new Promise((resolve, _) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64) {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) uInt8Array[i] = raw.charCodeAt(i);
    return new Blob([uInt8Array], { type: contentType });
}

async function importarBackupCompleto(e) {
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const loadedData = JSON.parse(evt.target.result);
            
            // Restaura dados básicos
            appData.categorias = loadedData.categorias || [];
            appData.itens = loadedData.itens || [];
            
            // Restaura Imagens para o IndexedDB
            if (loadedData.images) {
                for (const [id, base64] of Object.entries(loadedData.images)) {
                    const blob = base64ToBlob(base64);
                    salvarImagemBD(parseInt(id), blob);
                }
            }

            persistir();
            alert("Backup restaurado com sucesso!");
            location.reload();
        } catch(err) {
            console.error(err);
            alert('Arquivo inválido ou corrompido.');
        }
    };
    reader.readAsText(e.target.files[0]);
}

// --- UTILITÁRIOS PADRÃO ---
function persistir() {
    localStorage.setItem('no_categorias', JSON.stringify(appData.categorias));
    localStorage.setItem('no_itens', JSON.stringify(appData.itens));
}

function mudarAba(cat) { activeTab = cat; renderizarTudo(); }
function fecharModais() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }

// Drag & Drop
function inicializarDragDrop() {
    Sortable.create(document.getElementById('listaItens'), {
        handle: '.handle-item', animation: 150,
        onEnd: () => {
             if(document.getElementById('searchInput').value !== '') return;
             // Reordenação visual para lógica
             const ids = Array.from(document.querySelectorAll('#listaItens .item-card')).map(el => parseInt(el.dataset.id));
             const outros = appData.itens.filter(i => i.categoria !== activeTab);
             const ordenados = ids.map(id => appData.itens.find(x => x.id === id));
             appData.itens = [...outros, ...ordenados];
             persistir();
        }
    });
    // Configura Drag Categorias (Gestão)
    Sortable.create(document.getElementById('listaCategoriasEdit'), {
        handle: '.handle-cat', animation: 150,
        onEnd: (evt) => {
            const item = appData.categorias.splice(evt.oldIndex, 1)[0];
            appData.categorias.splice(evt.newIndex, 0, item);
            persistir(); renderTabs();
        }
    });
}

// Gestão Categorias e Tema (mesma lógica anterior, resumida)
function abrirGestaoCategorias() {
    const lista = document.getElementById('listaCategoriasEdit'); lista.innerHTML = '';
    appData.categorias.forEach((cat, idx) => {
        lista.innerHTML += `<li class="cat-edit-row"><div class="handle-cat"><i class="ri-draggable"></i></div><input value="${cat}" onchange="renomearCategoria(${idx}, this.value)"><div class="cat-actions"><button onclick="excluirCategoria(${idx})" class="btn-del-cat"><i class="ri-delete-bin-line"></i></button></div></li>`;
    });
    document.getElementById('modalCats').style.display = 'flex';
}
function renomearCategoria(idx, val) { if(!val) return; const old = appData.categorias[idx]; appData.categorias[idx] = val; appData.itens.forEach(i => {if(i.categoria===old) i.categoria=val}); persistir(); renderTabs(); }
function excluirCategoria(idx) { if(confirm('Apagar categoria e itens?')) { const old = appData.categorias[idx]; appData.categorias.splice(idx,1); appData.itens = appData.itens.filter(i=>i.categoria!==old); persistir(); abrirGestaoCategorias(); renderizarTudo(); } }
function adicionarCategoria() { const val = document.getElementById('newCatInput').value.trim(); if(val && !appData.categorias.includes(val)) { appData.categorias.push(val); document.getElementById('newCatInput').value=''; persistir(); abrirGestaoCategorias(); renderizarTudo(); } }
function carregarTema() { document.documentElement.setAttribute('data-theme', localStorage.getItem('theme')||'light'); }
document.getElementById('themeToggle').onclick = () => { const n = document.documentElement.getAttribute('data-theme')==='light'?'dark':'light'; localStorage.setItem('theme', n); carregarTema(); };
document.getElementById('searchInput').oninput = renderListaItens;