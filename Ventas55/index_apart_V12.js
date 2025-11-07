// index_apart_V12.js
/**
 * Versión V12 - Correcciones críticas
 * - FIX: Usa fecha LOCAL para reportes (no UTC)
 * - ADD: Muestra horas de solicitud y confirmación
 * - ADD: Encabezado con estadísticas completas
 * - ADD: Feedback visual inmediato al devolver
 * - FIX: Las devoluciones se reflejan en el reporte del día actual
 */

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const express = require('express');
const serveIndex = require('serve-index');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

/* ---------- CONFIG ---------- */
const PORT = 3000;

const MEDIA_DIR = path.join(__dirname, 'media');
const CARPETA_REPORTES = path.join(__dirname, 'reporte_bodega');
const CARPETA_JSON = path.join(CARPETA_REPORTES, 'reportes_json');
const CARPETA_HTML = path.join(CARPETA_REPORTES, 'reportes_html');

const ARCHIVO_DEVOLUCIONES = path.join(CARPETA_REPORTES, 'devoluciones.json');
const ARCHIVO_CONFIRMACIONES = path.join(CARPETA_REPORTES, 'confirmaciones.json');

const gruposPermitidos = ["Ventas 55", "Entra/sale-bodega 55", "Devoluciones bodega"];
const GRUPO_CONFIRMACION = "Entra/sale-bodega 55";
const GRUPO_VENTAS = "Ventas 55";

const confirmacionesValidas = ['v', 'va', 'c', 'ca', 'b', 'ba', 'vb', 'vc', 'bv', 'bc'];

/* ---------- Ensure folders exist ---------- */
[CARPETA_REPORTES, CARPETA_JSON, CARPETA_HTML, MEDIA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ---------- Estado en memoria (y persistencia) ---------- */
let confirmaciones = {
    fotosPendientes: new Map(),
    fotosConfirmadas: new Map()
};

// Cargar confirmaciones desde disco
function cargarConfirmacionesPersistentes() {
    try {
        if (fs.existsSync(ARCHIVO_CONFIRMACIONES)) {
            const raw = JSON.parse(fs.readFileSync(ARCHIVO_CONFIRMACIONES, 'utf8'));
            confirmaciones.fotosPendientes = new Map(raw.fotosPendientes || []);
            confirmaciones.fotosConfirmadas = new Map(raw.fotosConfirmadas || []);
            console.log(`📂 Confirmaciones cargadas (${confirmaciones.fotosConfirmadas.size} confirmadas, ${confirmaciones.fotosPendientes.size} pendientes)`);
        }
    } catch (err) {
        console.warn('⚠️ Error cargando confirmaciones:', err.message);
    }
}

// Guardar confirmaciones en disco
function guardarConfirmacionesPersistentes() {
    const dump = {
        fotosPendientes: Array.from(confirmaciones.fotosPendientes.entries()),
        fotosConfirmadas: Array.from(confirmaciones.fotosConfirmadas.entries())
    };
    fs.writeFileSync(ARCHIVO_CONFIRMACIONES, JSON.stringify(dump, null, 2), 'utf8');
}

// Cargar devoluciones desde disco
let devoluciones = {};
function cargarDevolucionesPersistentes() {
    try {
        if (fs.existsSync(ARCHIVO_DEVOLUCIONES)) {
            devoluciones = JSON.parse(fs.readFileSync(ARCHIVO_DEVOLUCIONES, 'utf8'));
        }
    } catch (err) {
        console.warn('⚠️ Error cargando devoluciones:', err.message);
    }
}

// Guardar devoluciones en disco
function guardarDevolucionesPersistentes() {
    fs.writeFileSync(ARCHIVO_DEVOLUCIONES, JSON.stringify(devoluciones, null, 2), 'utf8');
}

// Inicializar estado
cargarConfirmacionesPersistentes();
cargarDevolucionesPersistentes();

/* ---------- Express: servir media y reportes ---------- */
app.use('/media', express.static(MEDIA_DIR), serveIndex(MEDIA_DIR, { icons: true }));
app.use('/reporte', express.static(CARPETA_HTML));

app.get('/reportes', (req, res) => {
    const archivos = fs.readdirSync(CARPETA_HTML).filter(f => f.endsWith('.html')).sort().reverse();
    const links = archivos.map(f => `<li><a href="/reporte/${f}" target="_blank">${f}</a></li>`).join('');
    res.send(`<h1>Reportes disponibles</h1><ul>${links}</ul><p><a href="/">⬅️ Volver</a></p>`);
});

app.get('/', (req, res) => {
    const archivos = fs.readdirSync(CARPETA_HTML).filter(f => f.endsWith('.html')).sort().reverse();
    if (!archivos.length) return res.send('No hay reportes generados aún.');
    res.redirect(`/reporte/${archivos[0]}`);
});

/* ---------- Endpoint para marcar devolución desde web ---------- */
app.post('/marcar-devolucion', (req, res) => {
    const { fotoId, observaciones = '', usuario = 'Usuario Bodega' } = req.body;
    if (!fotoId) return res.status(400).json({ success: false, message: 'fotoId requerido' });

    if (!confirmaciones.fotosConfirmadas.has(fotoId)) {
        return res.status(404).json({ success: false, message: 'Foto no encontrada entre confirmadas' });
    }

    const fotoData = confirmaciones.fotosConfirmadas.get(fotoId);
    fotoData.devuelta = true;

    devoluciones[fotoId] = {
        nombreArchivo: fotoData.nombreArchivo,
        devueltaPor: usuario,
        fechaDevolucion: new Date().toISOString(),
        observaciones
    };

    guardarDevolucionesPersistentes();
    guardarConfirmacionesPersistentes();

    generarReporteConfirmaciones(); // FIX: Actualiza reporte del día actual

    res.json({ success: true });
});

/* ---------- WhatsApp client ---------- */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp listo'));

/* ---------- Message handler ---------- */
client.on('message', async msg => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        if (!chat.isGroup || !gruposPermitidos.includes(chat.name)) return;

        // FIX: Usar fecha LOCAL en lugar de UTC
        const fecha = new Date();
        const fechaLocal = new Date(fecha.getTime() - (fecha.getTimezoneOffset() * 60000));
        const fechaTexto = fechaLocal.toISOString().split('T')[0];
        const horaTexto = fecha.toLocaleTimeString('es-CO', { hour12: false });
        const fechaHora = `${fechaTexto} ${horaTexto}`;

        const nombreGrupo = chat.name.replace(/[^a-zA-Z0-9]/g, '_');
        const logsDir = path.join(__dirname, 'logs', nombreGrupo);
        const mediaDir = path.join(MEDIA_DIR, nombreGrupo, fechaTexto);
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

        const logPath = path.join(logsDir, `${fechaTexto}.txt`);
        if (msg.body) fs.appendFileSync(logPath, `${fechaHora} ${contact.pushname || contact.number}: ${msg.body}\n`, 'utf8');

        // multimedia
        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            const ext = media.mimetype.split('/')[1] || 'bin';
            const filename = `${Date.now()}.${ext}`;
            const filepath = path.join(mediaDir, filename);
            fs.writeFileSync(filepath, Buffer.from(media.data, 'base64'));

            if (chat.name === GRUPO_CONFIRMACION) {
                const fotoId = msg.id?._serialized || `local_${Date.now()}`;
                confirmaciones.fotosPendientes.set(fotoId, {
                    timestamp: fecha.toISOString(),
                    autor: contact.pushname || contact.number,
                    numero: contact.number,
                    mensaje: msg.body || '',
                    nombreArchivo: filename,
                    rutaArchivo: filepath,
                    carpetaFecha: mediaDir,
                    caption: msg.caption || ''
                });
                guardarConfirmacionesPersistentes();
                console.log(`📸 Foto pendiente registrada: ${filename}`);
            }
        } else if (chat.name === GRUPO_CONFIRMACION) {
            await procesarConfirmacion(msg, contact, fecha);
        }
    } catch (err) {
        console.error('❌ Error en message handler:', err);
    }
});

/* ---------- Extraer info: tallas múltiples + color ---------- */
function extraerInformacion(mensaje = '') {
    const texto = mensaje.toLowerCase();

    // Extrae todos los números entre 20 y 50 como tallas
    const tallas = (texto.match(/\b(\d{1,2}(?:\.\d)?)\b/g) || [])
        .filter(t => parseFloat(t) >= 20 && parseFloat(t) <= 50);

    // Extraer color
    let color = null;
    const colorMatch1 = texto.match(/(?:de la|la)\s+(\w+)/i);
    if (colorMatch1) {
        color = colorMatch1[1];
    } else {
        const colorMatch2 = texto.match(/(?:color)\s+(\w+)/i);
        if (colorMatch2) {
            color = colorMatch2[1];
        }
    }

    return { tallas, color };
}

/* ---------- Procesar confirmaciones ---------- */
async function procesarConfirmacion(message, contact, timestamp) {
    const texto = (message.body || '').toLowerCase().trim();
    if (!texto || !confirmacionesValidas.some(conf => texto.startsWith(conf))) return;

    let fotoConfirmada = false;
    if (message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        if (quoted.hasMedia && quoted.type === 'image') {
            const fotoId = quoted.id._serialized;
            if (confirmaciones.fotosPendientes.has(fotoId)) {
                confirmarFoto(fotoId, message.body, contact, timestamp, 'con_reply');
                fotoConfirmada = true;
            }
        }
    }
 // if (!fotoConfirmada) {
 //     fotoConfirmada = confirmarUltimaFoto(message.body, contact, timestamp);
 // }

    if (fotoConfirmada) {
        generarReporteConfirmaciones();
    }
}

function confirmarFoto(fotoId, mensaje, contact, timestamp, metodo) {
    const fotoData = confirmaciones.fotosPendientes.get(fotoId);
    const { tallas, color } = extraerInformacion(mensaje);

    confirmaciones.fotosConfirmadas.set(fotoId, {
        ...fotoData,
        confirmador: contact.pushname || contact.number,
        confirmadorNumero: contact.number,
        confirmacionTimestamp: timestamp.toISOString(),
        mensajeConfirmacion: mensaje,
        tallas,
        color,
        metodo,
        devuelta: false
    });
    confirmaciones.fotosPendientes.delete(fotoId);
    guardarConfirmacionesPersistentes();
    console.log(`✅ Confirmada: ${fotoData.nombreArchivo}, Tallas: ${tallas.join(', ')}, Color: ${color || 'N/A'}`);
}

/*
function confirmarUltimaFoto(mensaje, contact, timestamp) {
    if (!confirmaciones.fotosPendientes.size) return false;
    let ultima = [...confirmaciones.fotosPendientes.entries()]
        .sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp))[0];

    if (!ultima) return false;
    confirmarFoto(ultima[0], mensaje, contact, timestamp, 'sin_reply');
    return true;
}
*/
/* ---------- Generar reportes ---------- */
function generarReporteConfirmaciones() {
    // FIX: Usar fecha LOCAL para reportes
    const ahora = new Date();
    const fechaLocal = new Date(ahora.getTime() - (ahora.getTimezoneOffset() * 60000));
    const fechaActual = fechaLocal.toISOString().split('T')[0];

    const reporte = {
        fechaReporte: fechaActual,
        totalFotosConfirmadas: confirmaciones.fotosConfirmadas.size,
        totalFotosRecibidas: confirmaciones.fotosConfirmadas.size + confirmaciones.fotosPendientes.size,
        fotosNoConfirmadas: confirmaciones.fotosPendientes.size,
        fotosDevueltas: Object.keys(devoluciones).length,
        ultimaActualizacion: ahora.toISOString(),
        fotosConfirmadas: Array.from(confirmaciones.fotosConfirmadas.entries()).map(([id, data]) => ({
            id,
            ...data,
            devuelta: devoluciones.hasOwnProperty(id)
        }))
    };

    const jsonPath = path.join(CARPETA_JSON, `${fechaActual}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reporte, null, 2), 'utf8');

    generarReporteHTML(reporte);
}

function generarReporteHTML(reporte) {
    const fechaActual = reporte.fechaReporte;

    // ADD: Función para formatear fechas legibles
    const formatoFechaHora = (fechaISO) => {
        if (!fechaISO) return 'N/A';
        const fecha = new Date(fechaISO);
        return fecha.toLocaleString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    let html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte ${fechaActual}</title>
    <style>
    body{font-family:Arial;margin:20px;background:#f5f5f5}
    .container{max-width:1100px;margin:0 auto;background:#fff;padding:20px;border-radius:8px}
    .foto{border:1px solid #ddd;padding:10px;margin:10px 0;display:flex}
    img{max-width:180px;margin-right:15px;border-radius:5px}
    .info{flex:1}
    .btn{padding:8px 12px;border-radius:6px;border:none;cursor:pointer;transition:all 0.3s}
    .btn-devolver{background:#007bff;color:#fff}
    .btn-devolver:hover{background:#0056b3}
    .btn-devolver:disabled{background:#6c757d;cursor:not-allowed}
    .btn-devuelto{background:#28a745;color:#fff;cursor:default}
    .devuelta{border-color:#28a745;background:#f8fff9}
    .observ{margin-top:8px;background:#fffbe6;padding:6px;border-radius:4px}
    .resumen{display:flex;justify-content:space-around;margin:20px 0;background:#f8f9fa;padding:15px;border-radius:8px;text-align:center}
    .resumen-item{flex:1}
    .resumen-numero{font-size:24px;font-weight:bold}
    .resumen-titulo{font-size:14px;color:#666}
    .hora-info{font-size:12px;color:#666;margin:2px 0}
    .estado-badge{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold}
    .estado-pendiente{background:#fff3cd;color:#856404}
    .estado-confirmada{background:#d1ecf1;color:#0c5460}
    .estado-devuelta{background:#d4edda;color:#155724}
    </style></head><body><div class="container">
    <h1>📊 Reporte Bodega - ${fechaActual}</h1>
    <p>Última actualización: ${formatoFechaHora(reporte.ultimaActualizacion)}</p>
    
    <!-- ADD: Panel de resumen completo -->
    <div class="resumen">
        <div class="resumen-item">
            <div class="resumen-numero" style="color:#17a2b8;">${reporte.totalFotosRecibidas}</div>
            <div class="resumen-titulo">Total Recibidas</div>
        </div>
        <div class="resumen-item">
            <div class="resumen-numero" style="color:#28a745;">${reporte.totalFotosConfirmadas}</div>
            <div class="resumen-titulo">Confirmadas</div>
        </div>
        <div class="resumen-item">
            <div class="resumen-numero" style="color:#ffc107;">${reporte.fotosNoConfirmadas}</div>
            <div class="resumen-titulo">Pendientes</div>
        </div>
        <div class="resumen-item">
            <div class="resumen-numero" style="color:#dc3545;">${reporte.fotosDevueltas}</div>
            <div class="resumen-titulo">Devueltas</div>
        </div>
    </div>
    
    <h2>Fotos confirmadas (${reporte.fotosConfirmadas.length})</h2>
    `;

    reporte.fotosConfirmadas.forEach(foto => {
        const rel = path.relative(MEDIA_DIR, foto.rutaArchivo).split(path.sep).join('/');
        const imgSrc = `/media/${rel}`;
        const devuelta = foto.devuelta;
        const devClass = devuelta ? 'devuelta' : '';

        // ADD: Información de horas
        const horaSolicitud = formatoFechaHora(foto.timestamp);
        const horaConfirmacion = formatoFechaHora(foto.confirmacionTimestamp);

        const tallasHTML = foto.tallas && foto.tallas.length ? `<div>🧵 Tallas: ${foto.tallas.join(', ')}</div>` : '';
        const colorHTML = foto.color ? `<div>🎨 Color: ${foto.color}</div>` : '';
        const observ = devoluciones[foto.id] && devoluciones[foto.id].observaciones
            ? `<div class="observ"><strong>📝 Observaciones:</strong> ${devoluciones[foto.id].observaciones}</div>` : '';

        // ADD: Estado visual mejorado
        const estado = devuelta ?
            '<span class="estado-badge estado-devuelta">✅ DEVUELTO</span>' :
            '<span class="estado-badge estado-confirmada">🔄 PENDIENTE DEVOLUCIÓN</span>';

        html += `
        <div class="foto ${devClass}" id="foto-${foto.id}">
            <img src="${imgSrc}" alt="${foto.nombreArchivo}" onerror="this.style.display='none'">
            <div class="info">
                <div><strong>${foto.nombreArchivo}</strong> ${estado}</div>
                <div class="hora-info">📅 Solicitud: ${horaSolicitud}</div>
                <div class="hora-info">✅ Confirmación: ${horaConfirmacion}</div>
                <div>👤 De: ${foto.autor}</div>
                <div>✅ Confirmó: ${foto.confirmador}</div>
                <div>💬 Mensaje: ${foto.mensajeConfirmacion}</div>
                ${tallasHTML}
                ${colorHTML}
                ${observ}
                <div style="margin-top:8px">
                    ${devuelta ?
                '<button class="btn btn-devuelto" disabled>✅ Ya devuelto</button>' :
                '<button class="btn btn-devolver" onclick="marcarDevolucion(\'' + foto.id + '\', this)">🔄 Marcar como devuelto</button>'
            }
                </div>
            </div>
        </div>`;
    });

    html += `
    <script>
        async function marcarDevolucion(fotoId, boton){
            const obs = prompt('Ingresa observaciones (opcional):');
            if (obs === null) return;
            
            // ADD: Feedback visual inmediato
            boton.disabled = true;
            boton.textContent = '⏳ Procesando...';
            boton.style.background = '#6c757d';
            
            try {
                const respuesta = await fetch('/marcar-devolucion', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        fotoId,
                        observaciones: obs,
                        usuario: 'Usuario Bodega'
                    })
                });
                
                const resultado = await respuesta.json();
                
                if (resultado.success){ 
                    // ADD: Cambio visual inmediato sin recargar página completa
                    boton.textContent = '✅ Devuelto';
                    boton.className = 'btn btn-devuelto';
                    boton.disabled = true;
                    
                    // Actualizar el estado visual del contenedor
                    const fotoElement = document.getElementById('foto-' + fotoId);
                    fotoElement.classList.add('devuelta');
                    
                    // Actualizar contadores en el resumen
                    setTimeout(() => {
                        location.reload(); // Recargar para ver contadores actualizados
                    }, 1500);
                } else { 
                    alert('Error: ' + resultado.message); 
                    boton.disabled = false; 
                    boton.textContent = '🔄 Marcar como devuelto';
                    boton.style.background = '#007bff';
                }
            } catch(error){ 
                alert('Error de red: ' + error.message); 
                boton.disabled = false; 
                boton.textContent = '🔄 Marcar como devuelto';
                boton.style.background = '#007bff';
            }
        }
    </script>`;

    html += `</div></body></html>`;

    const htmlPath = path.join(CARPETA_HTML, `${fechaActual}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML generado: ${htmlPath}`);
}

/* ---------- Iniciar servidor y WhatsApp ---------- */
app.listen(PORT, () => console.log(`🚀 Servidor web en http://localhost:${PORT}`));
client.initialize();