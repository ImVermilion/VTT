const wrapperMapa = document.getElementById('wrapper-mapa');
const imgMapa = document.getElementById('img-mapa');
const capaRejilla = document.getElementById('capa-rejilla');
const boxDados = document.getElementById('notificacion-dados-3d');
const arenaDados = document.getElementById('arena-3d-jugadores');
const elementoAudio = document.getElementById('audio-ambiente-vtt');

let temporizadorDado;

// --- GESTIÓN VISTAS JUGADOR ---
function cambiarTabJugador(idTab, btn) {
    document.querySelectorAll('.player-vista').forEach(p => p.classList.remove('activa'));
    document.querySelectorAll('.player-nav button').forEach(b => b.classList.remove('activa'));
    document.getElementById(idTab).classList.add('activa');
    btn.classList.add('activa');
}

// --- FICHA Y AUTO-GUARDADO ---
document.getElementById('nombre-jugador').value = localStorage.getItem('miNombreJugadorVTT') || '';
document.getElementById('notas-privadas-jugador').value = localStorage.getItem('misNotasJugadorVTT') || '';

function guardarNombreLocal() {
    localStorage.setItem('miNombreJugadorVTT', document.getElementById('nombre-jugador').value);
}

function guardarNotasJugador() {
    localStorage.setItem('misNotasJugadorVTT', document.getElementById('notas-privadas-jugador').value);
}

document.getElementById('upload-ficha-json').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);

            ['nombre','hp','ca','ini','vel'].forEach(c => {
                if(document.getElementById(`f-${c}`))
                    document.getElementById(`f-${c}`).innerText = data[c] || "-";
            });

            ['fue','des','con','int','sab','car'].forEach(a => {
                if(document.getElementById(`f-${a}`))
                    document.getElementById(`f-${a}`).innerText = data[a] || "10";
                let mod = Math.floor((parseInt(data[a] || 10) - 10) / 2);
                if(document.getElementById(`m-${a}`))
                    document.getElementById(`m-${a}`).innerText = mod >= 0 ? `+${mod}` : `${mod}`;
            });

            if(!document.getElementById('nombre-jugador').value) {
                document.getElementById('nombre-jugador').value = data.nombre || "Héroe";
                guardarNombreLocal();
            }

        } catch(err) {
            alert("Archivo JSON inválido.");
        }
    };
    reader.readAsText(file);
});

// --- ENVIAR TIRADA (A través de Supabase) ---
function procesarTiradaJugador(caras, mod, motivo) {
    const nick = document.getElementById('nombre-jugador').value || "Jugador";
    const baseRoll = Math.floor(Math.random() * caras) + 1;
    
    const paquete = {
        quien: nick,
        caras: caras,
        resultado: baseRoll,
        mod: parseInt(mod || 0),
        total: baseRoll + parseInt(mod || 0),
        motivo: motivo,
        tiempo: Date.now()
    };
    
    // Enviar al canal VTT para que el DM y los demás lo vean
    if (typeof canalVTT !== 'undefined') {
        canalVTT.send({
            type: 'broadcast',
            event: 'dado-jugador',
            payload: paquete
        });
    }

    // Mostrárnoslo a nosotros mismos directamente
    mostrarDadoFlotante(paquete.quien, paquete.caras, paquete.resultado, paquete.mod, paquete.motivo, paquete.total);
}

function tirarAtributoJugador(nombreAtrib, idScore) {
    const score = document.getElementById(idScore).innerText;
    const mod = Math.floor((parseInt(score) - 10) / 2);
    procesarTiradaJugador(20, mod, `Tirada de ${nombreAtrib}`);
}

function tirarDadoGenericoJugador(caras) {
    procesarTiradaJugador(caras, 0, `d${caras}`);
}

// --- CONEXIÓN SUPABASE ---
async function inicializarProyeccionOnline() {
    if (typeof supabaseClient === 'undefined') return;

    // Carga inicial
    let resultadoDB = await supabaseClient.from('vtt_estado').select('*').eq('id', 1).single();
    if (resultadoDB.data) aplicarEstadoVTT(resultadoDB.data);

    // Escuchar cambios en la DB
    supabaseClient
.channel('cambios-db')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vtt_estado' }, payload => {
            aplicarEstadoVTT(payload.new);
        })
        .subscribe((status) => {
    console.log("Realtime:", status);
});
        

    // Escuchar dados del DM
    canalVTT.on('broadcast', { event: 'dado-dm' }, (mensaje) => {
        mostrarDadoFlotante("Dungeon Master", mensaje.payload.caras, mensaje.payload.resultado, 0, "Tirada DM", mensaje.payload.resultado);
    }).subscribe();

    // Escuchar dados de otros jugadores
    canalVTT.on('broadcast', { event: 'dado-jugador' }, (mensaje) => {
        const p = mensaje.payload;
        if (p.quien !== document.getElementById('nombre-jugador').value) {
            mostrarDadoFlotante(p.quien, p.caras, p.resultado, p.mod, p.motivo, p.total);
        }
    }).subscribe();
}

function aplicarEstadoVTT(estado) {

    if (estado.mapa_url) {
        imgMapa.src = estado.mapa_url;
        wrapperMapa.style.display = "inline-block";
    }

    if (estado.rejilla !== undefined) {
        capaRejilla.style.display =
            estado.rejilla ? 'block' : 'none';
    }

    if (estado.tokens) {
        renderizarTokens(estado.tokens);
    }

    // AUDIO GLOBAL
    if (estado.audio_url) {

        if (elementoAudio.src !== estado.audio_url) {

            elementoAudio.src = estado.audio_url;

            elementoAudio.volume =
                estado.audio_volumen || 0.5;

            elementoAudio.play().catch(() => {});
        }
    }
}



const colaDados = [];
let procesandoDado = false;

function mostrarDadoFlotante(quien, caras, base, mod, motivo, total) {

    colaDados.push({
        quien,
        caras,
        base,
        mod,
        motivo,
        total
    });

    if (!procesandoDado) {
        procesarColaDados();
    }
}

async function procesarColaDados() {

    if (colaDados.length === 0) {
        procesandoDado = false;
        return;
    }

    procesandoDado = true;

    const dado = colaDados.shift();

    let cl = `forma-d${dado.caras}`;

    let color = "white";

    if (dado.caras === 20 && dado.base === 20)
        color = "gold";

    if (dado.caras === 20 && dado.base === 1)
        color = "red";

    const div = document.createElement('div');

    div.className = 'dado-historial';

    div.innerHTML = `
        <div class="contenedor-dado-animado">

            <div class="dado-visual ${cl} rodando"
                style="
                    width:75px;
                    height:75px;
                    font-size:2rem;
                ">
                ?
            </div>

        </div>
    `;

    arenaDados.prepend(div);

    boxDados.classList.add('mostrar');

    await new Promise(r => setTimeout(r, 600));

    let sub =
        dado.mod !== 0
        ? `<br><span style="font-size:0.85rem;color:#aaa;">
            (${dado.base} ${dado.mod >= 0 ? '+' : ''}${dado.mod})
           </span>`
        : '';

    div.innerHTML = `
        <div class="contenedor-dado-animado">

            <div class="dado-visual ${cl}"
                style="
                    width:75px;
                    height:75px;
                    font-size:2rem;
                    color:${color};
                ">
                ${dado.total}
            </div>

            <p style="
                color:#2ecc71;
                font-weight:bold;
                text-align:center;
                margin:5px 0;
            ">
                ${dado.quien}
            </p>

            <p style="
                color:#ccc;
                font-size:0.8rem;
                text-align:center;
            ">
                ${dado.motivo}
                ${sub}
            </p>

        </div>
    `;

    while (arenaDados.children.length > 8) {
        arenaDados.removeChild(arenaDados.lastChild);
    }

    setTimeout(() => {
        div.style.opacity = '0.3';
    }, 5000);

    setTimeout(() => {
        div.remove();

        if (arenaDados.children.length === 0) {
            boxDados.classList.remove('mostrar');
        }

    }, 12000);

    setTimeout(() => {
        procesarColaDados();
    }, 1200);
}



inicializarProyeccionOnline();

function mostrarDadoFlotante(quien, caras, base, mod, motivo, total) {
    let cl = `forma-d${caras}`;
    boxDados.classList.add('mostrar');

    arenaDados.innerHTML =
        `<div class="contenedor-dado-animado">
            <div class="dado-visual ${cl} rodando" style="width:75px;height:75px;font-size:1.8rem;">?</div>
        </div>`;

    setTimeout(() => {
        let color = "white";
        if (caras === 20 && base === 20) color = "gold";
        if (caras === 20 && base === 1) color = "red";

        let sub = mod !== 0 ? `<br><span style="font-size:0.85rem;color:#aaa;">(${base} ${mod >= 0 ? '+' : ''}${mod})</span>` : '';

        arenaDados.innerHTML =
            `<div class="contenedor-dado-animado">
                <div class="dado-visual ${cl}" style="width:75px;height:75px;font-size:2.2rem;color:${color};">${total}</div>
                <p style="color:#2ecc71;font-size:1.1rem;margin:6px 0 2px 0;font-weight:bold;text-align:center;">${quien}</p>
                <p style="color:white;font-size:0.8rem;margin:0;text-align:center;">${motivo}${sub}</p>
            </div>`;

        clearTimeout(temporizadorDado);
        temporizadorDado = setTimeout(() => {
            boxDados.classList.remove('mostrar');
        }, 3500);
    }, 600);
}

function renderizarTokens(tokens) {
    document.querySelectorAll('.token-jugador').forEach(t => t.remove());

    tokens.forEach(t => {
        if (!t.visible) return;

        const tokenEl = document.createElement('div');
        tokenEl.className = 'token-jugador';
        tokenEl.style.width = t.escala + 'px';
        tokenEl.style.height = t.escala + 'px';
        tokenEl.style.border = `3px solid ${t.color}`;
        tokenEl.style.backgroundImage = `url(${t.img})`;
        tokenEl.style.left = t.x;
        tokenEl.style.top = t.y;

        wrapperMapa.appendChild(tokenEl);
    });
}
