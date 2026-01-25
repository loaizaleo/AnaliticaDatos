// index_whatsapp_web_V20_COMPLETO.js
/**
 * VERSIÓN COMPLETA - Incluye todos los reportes HTML y funcionalidades del V19
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const serveIndex = require('serve-index');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(express.json());

/* ---------- CONFIGURACIÓN ---------- */
const PORT = 3000;

const MEDIA_DIR = path.join(__dirname, 'media');
const MEDIA_ORIGINALES = path.join(MEDIA_DIR, 'originales');
const CARPETA_REPORTES = path.join(__dirname, 'reporte_bodega');
const CARPETA_JSON = path.join(CARPETA_REPORTES, 'reportes_json');
const CARPETA_HTML = path.join(CARPETA_REPORTES, 'reportes_html');
const CARPETA_ANOTACIONES = path.join(CARPETA_REPORTES, 'anotaciones');

const ARCHIVO_DEVOLUCIONES = path.join(CARPETA_REPORTES, 'devoluciones.json');
const ARCHIVO_CONFIRMACIONES = path.join(CARPETA_REPORTES, 'confirmaciones.json');

const gruposPermitidos = ["Ventas 55", "Entra/sale-bodega 55", "Devoluciones bodega"];
const GRUPO_CONFIRMACION = "Entra/sale-bodega 55";
const GRUPO_VENTAS = "Ventas 55";
const confirmacionesValidas = ['v', 'va', 'c', 'ca', 'b', 'ba', 'van', 'voy', 'bv', 'bc'];

/* ---------- INICIALIZAR DIRECTORIOS ---------- */
[CARPETA_REPORTES, CARPETA_JSON, CARPETA_HTML, MEDIA_DIR, MEDIA_ORIGINALES, CARPETA_ANOTACIONES].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ---------- ESTADO EN MEMORIA ---------- */
let confirmaciones = {
    fotosPendientes: new Map(),
    fotosConfirmadas: new Map()
};

let devoluciones = {};

/* ---------- FUNCIONES DE PERSISTENCIA ---------- */
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

function guardarConfirmacionesPersistentes() {
    const dump = {
        fotosPendientes: Array.from(confirmaciones.fotosPendientes.entries()),
        fotosConfirmadas: Array.from(confirmaciones.fotosConfirmadas.entries())
    };
    fs.writeFileSync(ARCHIVO_CONFIRMACIONES, JSON.stringify(dump, null, 2), 'utf8');
}

function cargarDevolucionesPersistentes() {
    try {
        if (fs.existsSync(ARCHIVO_DEVOLUCIONES)) {
            devoluciones = JSON.parse(fs.readFileSync(ARCHIVO_DEVOLUCIONES, 'utf8'));
        }
    } catch (err) {
        console.warn('⚠️ Error cargando devoluciones:', err.message);
    }
}

function guardarDevolucionesPersistentes() {
    fs.writeFileSync(ARCHIVO_DEVOLUCIONES, JSON.stringify(devoluciones, null, 2), 'utf8');
}

// Cargar datos
cargarConfirmacionesPersistentes();
cargarDevolucionesPersistentes();

/* ---------- FUNCIONES DEL SISTEMA ---------- */
function guardarFotoInmutable(media, fechaTexto, nombreGrupo) {
    try {
        const ext = media.mimetype.split('/')[1] || 'bin';
        const filename = `${Date.now()}.${ext}`;

        const carpetaOriginales = path.join(MEDIA_ORIGINALES, nombreGrupo, fechaTexto);
        if (!fs.existsSync(carpetaOriginales)) fs.mkdirSync(carpetaOriginales, { recursive: true });

        const rutaOriginal = path.join(carpetaOriginales, filename);
        const rutaTrabajo = path.join(MEDIA_DIR, nombreGrupo, fechaTexto, filename);
        const carpetaTrabajo = path.dirname(rutaTrabajo);
        if (!fs.existsSync(carpetaTrabajo)) fs.mkdirSync(carpetaTrabajo, { recursive: true });

        fs.writeFileSync(rutaOriginal, Buffer.from(media.data, 'base64'));
        fs.writeFileSync(rutaTrabajo, Buffer.from(media.data, 'base64'));

        return {
            rutaOriginal: rutaOriginal,
            rutaTrabajo: rutaTrabajo,
            nombreArchivo: filename
        };
    } catch (error) {
        console.error('❌ Error guardando foto inmutable:', error);
        throw error;
    }
}

function extraerInformacion(mensaje = '') {
    const texto = mensaje.toLowerCase();
    const tallas = (texto.match(/\b(\d{1,2}(?:\.\d)?)\b/g) || [])
        .filter(t => parseFloat(t) >= 20 && parseFloat(t) <= 50);

    let color = null;
    const colorMatch1 = texto.match(/(?:de la|la)\s+(\w+)/i);
    if (colorMatch1) {
        color = colorMatch1[1];
    } else {
        const colorMatch2 = texto.match(/(?:color)\s+(\w+)/i);
        if (colorMatch2) color = colorMatch2[1];
    }

    return { tallas, color };
}

function confirmarFoto(fotoId, mensaje, contactInfo, timestamp) {
    const fotoData = confirmaciones.fotosPendientes.get(fotoId);
    const { tallas, color } = extraerInformacion(mensaje);

    confirmaciones.fotosConfirmadas.set(fotoId, {
        ...fotoData,
        confirmador: contactInfo.pushname,
        confirmadorNumero: contactInfo.number,
        confirmacionTimestamp: timestamp.toISOString(),
        mensajeConfirmacion: mensaje,
        tallas,
        color,
        devuelta: false,
        productosDevueltos: []
    });
    confirmaciones.fotosPendientes.delete(fotoId);
    guardarConfirmacionesPersistentes();
    console.log(`✅ Confirmada: ${fotoData.nombreArchivo}, Tallas: ${tallas.join(', ')}, Color: ${color || 'N/A'}`);
}

/* ---------- EXPRESS SERVER ---------- */
app.use('/media', express.static(MEDIA_DIR), serveIndex(MEDIA_DIR, { icons: true }));
app.use('/reporte', express.static(CARPETA_HTML));
app.use('/anotaciones', express.static(CARPETA_ANOTACIONES));
app.use('/originales', express.static(MEDIA_ORIGINALES));

app.get('/anotacion/:fotoId', (req, res) => {
    const anotacionPath = path.join(CARPETA_ANOTACIONES, `${req.params.fotoId}.json`);
    if (fs.existsSync(anotacionPath)) {
        res.sendFile(anotacionPath);
    } else {
        res.status(404).json({ error: 'Anotación no encontrada' });
    }
});

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

app.post('/marcar-devolucion', (req, res) => {
    const { fotoId, observaciones = '', usuario = 'Usuario Bodega', productosDevueltos = [] } = req.body;
    if (!fotoId) return res.status(400).json({ success: false, message: 'fotoId requerido' });

    if (!confirmaciones.fotosConfirmadas.has(fotoId)) {
        return res.status(404).json({ success: false, message: 'Foto no encontrada entre confirmadas' });
    }

    const fotoData = confirmaciones.fotosConfirmadas.get(fotoId);
    fotoData.devuelta = true;
    fotoData.productosDevueltos = productosDevueltos;

    devoluciones[fotoId] = {
        nombreArchivo: fotoData.nombreArchivo,
        devueltaPor: usuario,
        fechaDevolucion: new Date().toISOString(),
        observaciones,
        productosDevueltos: productosDevueltos,
        devolucionParcial: productosDevueltos.length > 0,
        cantidadProductos: productosDevueltos.length
    };

    guardarDevolucionesPersistentes();
    guardarConfirmacionesPersistentes();
    generarReporteConfirmaciones();

    res.json({ success: true });
});

app.post('/guardar-anotacion', (req, res) => {
    const { fotoId, anotaciones } = req.body;
    if (!fotoId || !anotaciones) return res.status(400).json({ success: false, message: 'fotoId y anotaciones requeridos' });

    try {
        const anotacionPath = path.join(CARPETA_ANOTACIONES, `${fotoId}.json`);
        if (fs.existsSync(anotacionPath)) {
            const fechaActual = new Date().toISOString().split('T')[0];
            const backupDir = path.join(CARPETA_ANOTACIONES, 'backups', fechaActual);
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const backupPath = path.join(backupDir, `${fotoId}_${Date.now()}.json`);
            fs.copyFileSync(anotacionPath, backupPath);
        }
        fs.writeFileSync(anotacionPath, JSON.stringify(anotaciones, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error('Error guardando anotación:', error);
        res.status(500).json({ success: false, message: 'Error guardando anotación' });
    }
});

/* ---------- WHATSAPP CLIENT ---------- */
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-bodega",
        dataPath: "./whatsapp_auth"
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP EN TU TELÉFONO:');
    console.log('══════════════════════════════════════════════════════════\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅✅✅ WHATSAPP CONECTADO Y LISTO ✅✅✅');
    console.log('👤 Usuario:', client.info.pushname || 'N/A');
    console.log('📱 Número:', client.info.wid.user || 'N/A');
    console.log('🚀 Sistema de bodega funcionando...');
});

client.on('auth_failure', msg => {
    console.error('❌ Falla de autenticación:', msg);
});

client.on('disconnected', reason => {
    console.log('🔌 Cliente desconectado:', reason);
});

/* ---------- MANEJADOR DE MENSAJES ---------- */
client.on('message', async msg => {
    try {
        const chat = await msg.getChat();

        if (!chat.isGroup || !gruposPermitidos.includes(chat.name)) {
            return;
        }

        let contactInfo = {
            pushname: msg._data?.notifyName || 'Usuario',
            number: msg.from.split('@')[0] || 'Desconocido'
        };

        try {
            const contact = await msg.getContact();
            contactInfo.pushname = contact.pushname || contact.name || contactInfo.pushname;
            contactInfo.number = contact.number || contactInfo.number;
        } catch (contactError) {
            // Usar datos básicos si falla
        }

        const fecha = new Date();
        const fechaLocal = new Date(fecha.getTime() - (fecha.getTimezoneOffset() * 60000));
        const fechaTexto = fechaLocal.toISOString().split('T')[0];
        const horaTexto = fecha.toLocaleTimeString('es-CO', { hour12: false });
        const fechaHora = `${fechaTexto} ${horaTexto}`;

        const nombreGrupo = chat.name.replace(/[^a-zA-Z0-9]/g, '_');
        const logsDir = path.join(__dirname, 'logs', nombreGrupo);
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const logPath = path.join(logsDir, `${fechaTexto}.txt`);

        if (msg.body) {
            fs.appendFileSync(logPath, `${fechaHora} ${contactInfo.pushname}: ${msg.body}\n`, 'utf8');
        }

        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();

                if (media) {
                    const rutasFoto = guardarFotoInmutable(media, fechaTexto, nombreGrupo);

                    fs.appendFileSync(logPath, `${fechaHora} ${contactInfo.pushname}: [Archivo: ${rutasFoto.nombreArchivo}]\n`, 'utf8');

                    console.log(`📦 Archivo guardado: ${rutasFoto.nombreArchivo}`);

                    if (chat.name === GRUPO_CONFIRMACION) {
                        const fotoId = msg.id._serialized || `local_${Date.now()}`;
                        confirmaciones.fotosPendientes.set(fotoId, {
                            timestamp: fecha.toISOString(),
                            autor: contactInfo.pushname,
                            numero: contactInfo.number,
                            mensaje: msg.body || '',
                            nombreArchivo: rutasFoto.nombreArchivo,
                            rutaArchivo: rutasFoto.rutaOriginal,
                            rutaTrabajo: rutasFoto.rutaTrabajo,
                            carpetaFecha: path.dirname(rutasFoto.rutaOriginal),
                            caption: msg.caption || '',
                            fechaFoto: fechaTexto
                        });
                        guardarConfirmacionesPersistentes();
                        console.log(`📸 Foto pendiente registrada: ${rutasFoto.nombreArchivo}`);
                    }

                    if (chat.name === GRUPO_VENTAS && msg.type === 'image') {
                        console.log(`🛍️  Foto en Ventas: ${rutasFoto.nombreArchivo}`);
                        fs.appendFileSync(logPath, `${fechaHora} ${contactInfo.pushname}: [Venta - Archivo: ${rutasFoto.nombreArchivo}]\n`, 'utf8');
                    }
                }
            } catch (mediaError) {
                console.error('❌ Error procesando media:', mediaError.message);
            }
        }
        else if (chat.name === GRUPO_CONFIRMACION) {
            const texto = (msg.body || '').toLowerCase().trim();

            if (confirmacionesValidas.some(conf => texto.startsWith(conf))) {
                if (msg.hasQuotedMsg) {
                    const quoted = await msg.getQuotedMessage();
                    if (quoted.hasMedia && quoted.type === 'image') {
                        const fotoId = quoted.id._serialized;
                        if (confirmaciones.fotosPendientes.has(fotoId)) {
                            confirmarFoto(fotoId, msg.body, contactInfo, fecha);
                            console.log(`✅ Confirmación por REPLY: ${fotoId}`);
                            generarReporteConfirmaciones();
                        }
                    }
                }
            }
        }

    } catch (error) {
        console.error('❌ Error en message handler:', error.message);
    }
});

/* ---------- FUNCIÓN COMPLETA DE REPORTES ---------- */
function generarReporteConfirmaciones() {
    const ahora = new Date();
    const fechaLocal = new Date(ahora.getTime() - (ahora.getTimezoneOffset() * 60000));
    const fechaActual = fechaLocal.toISOString().split('T')[0];

    const fotosConfirmadasHoy = Array.from(confirmaciones.fotosConfirmadas.entries())
        .filter(([id, data]) => {
            const fechaFoto = new Date(data.timestamp).toISOString().split('T')[0];
            return fechaFoto === fechaActual;
        });

    const fotosPendientesHoy = Array.from(confirmaciones.fotosPendientes.entries())
        .filter(([id, data]) => {
            const fechaFoto = new Date(data.timestamp).toISOString().split('T')[0];
            return fechaFoto === fechaActual;
        });

    const devolucionesHoy = Object.keys(devoluciones).filter(id => {
        const fechaDevolucion = new Date(devoluciones[id].fechaDevolucion).toISOString().split('T')[0];
        return fechaDevolucion === fechaActual;
    });

    const reporte = {
        fechaReporte: fechaActual,
        totalFotosConfirmadas: fotosConfirmadasHoy.length,
        totalFotosRecibidas: fotosConfirmadasHoy.length + fotosPendientesHoy.length,
        fotosNoConfirmadas: fotosPendientesHoy.length,
        fotosDevueltas: devolucionesHoy.length,
        ultimaActualizacion: ahora.toISOString(),
        fotosConfirmadas: fotosConfirmadasHoy.map(([id, data]) => ({
            id,
            ...data,
            devuelta: devoluciones.hasOwnProperty(id),
            productosDevueltos: devoluciones[id]?.productosDevueltos || []
        }))
    };

    const jsonPath = path.join(CARPETA_JSON, `${fechaActual}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reporte, null, 2), 'utf8');

    generarReporteHTML(reporte);
}

function generarReporteHTML(reporte) {
    const fechaActual = reporte.fechaReporte;

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

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte Bodega - ${fechaActual}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
            padding: 30px;
        }
        
        .header {
            text-align: center;
            padding-bottom: 30px;
            border-bottom: 3px solid #f0f0f0;
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #333;
            font-size: 2.5em;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 20px;
            border-radius: 50px;
            font-size: 0.8em;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .stat-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            border: 2px solid transparent;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
        }
        
        .stat-number {
            font-size: 3em;
            font-weight: bold;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .stat-title {
            color: #666;
            font-size: 1.1em;
            font-weight: 500;
        }
        
        .total-card { border-color: #3498db; }
        .confirmadas-card { border-color: #2ecc71; }
        .pendientes-card { border-color: #f39c12; }
        .devueltas-card { border-color: #e74c3c; }
        
        .photos-section {
            margin-top: 40px;
        }
        
        .section-title {
            font-size: 1.8em;
            color: #333;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .photo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 25px;
        }
        
        .photo-card {
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            border: 2px solid #f0f0f0;
        }
        
        .photo-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
            border-color: #667eea;
        }
        
        .photo-card.devuelta {
            border-color: #2ecc71;
            background: linear-gradient(135deg, #f9fff9 0%, #e8f6e8 100%);
        }
        
        .photo-card.devuelta-parcial {
            border-color: #f39c12;
            background: linear-gradient(135deg, #fffbf0 0%, #fff5e6 100%);
        }
        
        .photo-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            cursor: pointer;
            transition: transform 0.3s ease;
        }
        
        .photo-image:hover {
            transform: scale(1.05);
        }
        
        .photo-info {
            padding: 20px;
        }
        
        .photo-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .photo-title {
            font-weight: bold;
            color: #333;
            font-size: 1.1em;
        }
        
        .status-badge {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .status-confirmed { background: #d4edda; color: #155724; }
        .status-returned { background: #c3e6cb; color: #155724; }
        .status-partial { background: #ffeaa7; color: #856404; }
        .status-pending { background: #fff3cd; color: #856404; }
        
        .photo-details {
            margin-top: 15px;
        }
        
        .detail-row {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            font-size: 0.9em;
            color: #555;
        }
        
        .detail-label {
            font-weight: 600;
            color: #333;
            min-width: 120px;
        }
        
        .detail-value {
            flex: 1;
        }
        
        .sizes-badge {
            display: inline-flex;
            align-items: center;
            background: #e3f2fd;
            color: #1565c0;
            padding: 3px 10px;
            border-radius: 15px;
            margin-right: 5px;
            font-size: 0.8em;
        }
        
        .color-badge {
            display: inline-flex;
            align-items: center;
            background: #f3e5f5;
            color: #7b1fa2;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.8em;
        }
        
        .actions {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.9em;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            flex: 1;
        }
        
        .btn-return {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-return:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }
        
        .btn-annotate {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        
        .btn-annotate:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(245, 87, 108, 0.4);
        }
        
        .btn-disabled {
            background: #95a5a6;
            color: white;
            cursor: not-allowed;
        }
        
        .observations {
            background: #fff9e6;
            border-left: 4px solid #f39c12;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            font-size: 0.9em;
        }
        
        .observations strong {
            color: #d35400;
        }
        
        .products-list {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            max-height: 150px;
            overflow-y: auto;
        }
        
        .product-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }
        
        .product-item:last-child {
            border-bottom: none;
        }
        
        .product-counter {
            background: #17a2b8;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.8em;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            overflow: auto;
        }
        
        .modal-content {
            background: white;
            margin: 50px auto;
            padding: 30px;
            border-radius: 20px;
            max-width: 900px;
            position: relative;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .close-modal {
            position: absolute;
            top: 20px;
            right: 25px;
            font-size: 30px;
            color: #666;
            cursor: pointer;
            transition: color 0.3s;
        }
        
        .close-modal:hover {
            color: #e74c3c;
        }
        
        .canvas-container {
            text-align: center;
            margin: 20px 0;
            border: 2px solid #667eea;
            border-radius: 10px;
            overflow: hidden;
            background: #f8f9fa;
        }
        
        #canvasAnotacion {
            max-width: 100%;
            max-height: 60vh;
            cursor: crosshair;
        }
        
        .annotation-tools {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin: 20px 0;
        }
        
        .tool-btn {
            padding: 10px 20px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
        }
        
        .tool-btn.active {
            background: #667eea;
            color: white;
        }
        
        .tool-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
        }
        
        .annotation-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 20px;
        }
        
        .btn-save {
            background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 1em;
        }
        
        .btn-cancel {
            background: #95a5a6;
            color: white;
            padding: 12px 30px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 1em;
        }
        
        .protection-badge {
            background: #e74c3c;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.8em;
            display: inline-block;
            margin-left: 10px;
        }
        
        .warning-box {
            background: #fff3cd;
            border: 2px solid #ffeaa7;
            border-radius: 10px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            .header h1 {
                font-size: 1.8em;
                flex-direction: column;
                gap: 10px;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .photo-grid {
                grid-template-columns: 1fr;
            }
            
            .actions {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                📊 Reporte Bodega - ${fechaActual}
                <span class="badge">SISTEMA V20</span>
            </h1>
            <p style="color: #666; margin-top: 10px;">
                Última actualización: ${formatoFechaHora(reporte.ultimaActualizacion)}
            </p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card total-card">
                <div class="stat-number" style="color: #3498db;">${reporte.totalFotosRecibidas}</div>
                <div class="stat-title">Total Recibidas</div>
            </div>
            
            <div class="stat-card confirmadas-card">
                <div class="stat-number" style="color: #2ecc71;">${reporte.totalFotosConfirmadas}</div>
                <div class="stat-title">Confirmadas</div>
            </div>
            
            <div class="stat-card pendientes-card">
                <div class="stat-number" style="color: #f39c12;">${reporte.fotosNoConfirmadas}</div>
                <div class="stat-title">Pendientes</div>
            </div>
            
            <div class="stat-card devueltas-card">
                <div class="stat-number" style="color: #e74c3c;">${reporte.fotosDevueltas}</div>
                <div class="stat-title">Devueltas</div>
            </div>
        </div>
        
        <div class="photos-section">
            <h2 class="section-title">
                📸 Fotos Confirmadas (${reporte.fotosConfirmadas.length})
            </h2>
            
            <div class="photo-grid">
`;

    // Generar tarjetas para cada foto
    reporte.fotosConfirmadas.forEach(foto => {
        const rel = path.relative(MEDIA_ORIGINALES, foto.rutaArchivo).split(path.sep).join('/');
        const imgSrc = `/originales/${rel}`;
        const devuelta = foto.devuelta;
        const devolucionParcial = devuelta && foto.productosDevueltos && foto.productosDevueltos.length > 0;

        const horaSolicitud = formatoFechaHora(foto.timestamp);
        const horaConfirmacion = formatoFechaHora(foto.confirmacionTimestamp);

        const tallasHTML = foto.tallas && foto.tallas.length
            ? foto.tallas.map(t => `<span class="sizes-badge">${t}</span>`).join('')
            : '<span style="color: #95a5a6;">No especificadas</span>';

        const colorHTML = foto.color
            ? `<span class="color-badge">${foto.color}</span>`
            : '<span style="color: #95a5a6;">No especificado</span>';

        const observ = devoluciones[foto.id] && devoluciones[foto.id].observaciones
            ? `<div class="observations"><strong>📝 Observaciones:</strong> ${devoluciones[foto.id].observaciones}</div>`
            : '';

        const cantidadProductos = devoluciones[foto.id]?.cantidadProductos || 0;

        const productosInfo = devolucionParcial
            ? `<div class="products-list">
                  <strong>✅ Productos devueltos:</strong>
                  <span class="product-counter">${cantidadProductos} producto(s)</span>
                  ${foto.productosDevueltos.map((p, i) =>
                `<div class="product-item">
                          <span>${p.nombre || `Producto ${i + 1}`}</span>
                          <span>${p.cantidad || 1} unidad(es)</span>
                       </div>`
            ).join('')}
               </div>`
            : '';

        let estadoHTML = '';
        let estadoClase = '';

        if (devuelta) {
            if (devolucionParcial) {
                estadoHTML = `<span class="status-badge status-partial">🔄 DEVOLUCIÓN PARCIAL</span>`;
                estadoClase = 'devuelta-parcial';
            } else {
                estadoHTML = `<span class="status-badge status-returned">✅ DEVUELTO</span>`;
                estadoClase = 'devuelta';
            }
        } else {
            estadoHTML = `<span class="status-badge status-pending">⏳ PENDIENTE DEVOLUCIÓN</span>`;
        }

        html += `
                <div class="photo-card ${estadoClase}" id="foto-${foto.id}">
                    <img src="${imgSrc}" 
                         alt="${foto.nombreArchivo}" 
                         class="photo-image"
                         onclick="abrirAnotador('${foto.id}', '${imgSrc}', '${foto.timestamp}')"
                         onerror="this.src='https://via.placeholder.com/350x200?text=Imagen+no+disponible'">
                    
                    <div class="photo-info">
                        <div class="photo-header">
                            <div class="photo-title">${foto.nombreArchivo}</div>
                            ${estadoHTML}
                        </div>
                        
                        <div class="photo-details">
                            <div class="detail-row">
                                <span class="detail-label">👤 De:</span>
                                <span class="detail-value">${foto.autor}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">✅ Confirmó:</span>
                                <span class="detail-value">${foto.confirmador}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">📅 Solicitud:</span>
                                <span class="detail-value">${horaSolicitud}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">✅ Confirmación:</span>
                                <span class="detail-value">${horaConfirmacion}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">🧵 Tallas:</span>
                                <span class="detail-value">${tallasHTML}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">🎨 Color:</span>
                                <span class="detail-value">${colorHTML}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">💬 Mensaje:</span>
                                <span class="detail-value" style="font-style: italic;">"${foto.mensajeConfirmacion || 'Sin mensaje'}"</span>
                            </div>
                        </div>
                        
                        ${observ}
                        ${productosInfo}
                        
                        <div class="actions">
                            ${devuelta
                ? (devolucionParcial
                    ? '<button class="btn btn-disabled" disabled>✅ Devolución parcial registrada</button>'
                    : '<button class="btn btn-disabled" disabled>✅ Ya devuelto</button>'
                )
                : `<button class="btn btn-return" onclick="marcarDevolucionCompleta('${foto.id}', this)">
                                    🔄 Marcar como devuelto
                                   </button>
                                   <button class="btn btn-annotate" onclick="abrirAnotador('${foto.id}', '${imgSrc}', '${foto.timestamp}')">
                                    ✏️ Anotar productos
                                   </button>`
            }
                        </div>
                    </div>
                </div>`;
    });

    html += `
            </div>
        </div>
    </div>

    <!-- Modal de Anotaciones -->
    <div id="modalAnotacion" class="modal">
        <div class="modal-content">
            <span class="close-modal" onclick="cerrarAnotador()">&times;</span>
            
            <h2 style="margin-bottom: 20px;">
                ✏️ Anotar Productos Devueltos
                <span id="badgeInmutable" class="protection-badge" style="display: none;">SOLO LECTURA</span>
            </h2>
            
            <div id="advertenciaAnotacion" class="warning-box" style="display: none;">
                ⚠️ <strong>Foto de día anterior</strong><br>
                Las anotaciones son de solo lectura para mantener la integridad de los datos históricos.
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
                <p><strong>Instrucciones:</strong> Haz clic y arrastra para dibujar círculos alrededor de los productos devueltos.</p>
            </div>
            
            <div class="annotation-tools">
                <button class="tool-btn active" id="btnCirculo" onclick="cambiarHerramienta('circulo')">⭕ Círculo</button>
                <button class="tool-btn" id="btnLimpiar" onclick="cambiarHerramienta('limpiar')">🗑️ Limpiar Todo</button>
                <button class="tool-btn" id="btnDeshacer" onclick="deshacerAnotacion()">↶ Deshacer Último</button>
            </div>
            
            <div class="canvas-container">
                <canvas id="canvasAnotacion"></canvas>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
                <h3>Productos marcados: <span id="contadorProductos">0</span></h3>
            </div>
            
            <div class="annotation-actions">
                <button class="btn-save" id="btnFinalizar" onclick="finalizarAnotacion()">
                    ✅ Finalizar y Guardar Devolución
                </button>
                <button class="btn-cancel" onclick="cerrarAnotador()">
                    Cancelar
                </button>
            </div>
        </div>
    </div>

    <script>
        // Variables globales
        let anotaciones = [];
        let herramienta = 'circulo';
        let canvas, ctx, imagen;
        let fotoActual, imgSrcActual, puedeEditarActual;
        let dibujando = false;
        let inicioX, inicioY;
        
        // Inicializar protección inmutable
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.photo-card').forEach(card => {
                const fotoId = card.id.replace('foto-', '');
                const imgElement = card.querySelector('img');
                const timestamp = imgElement.getAttribute('onclick').match(/'([^']+)'/)[3];
                
                if (timestamp) {
                    const puedeEditar = esFotoDeHoy(timestamp);
                    if (!puedeEditar) {
                        const annotateBtn = card.querySelector('.btn-annotate');
                        if (annotateBtn) {
                            annotateBtn.innerHTML = '🔒 Anotación bloqueada';
                            annotateBtn.classList.remove('btn-annotate');
                            annotateBtn.classList.add('btn-disabled');
                            annotateBtn.disabled = true;
                            annotateBtn.onclick = null;
                        }
                    }
                }
            });
        });
        
        function esFotoDeHoy(timestamp) {
            const fechaFoto = new Date(timestamp);
            const hoy = new Date();
            return fechaFoto.toDateString() === hoy.toDateString();
        }
        
        function abrirAnotador(fotoId, imgSrc, timestamp) {
            puedeEditarActual = esFotoDeHoy(timestamp);
            fotoActual = fotoId;
            imgSrcActual = imgSrc;
            anotaciones = [];
            
            // Configurar interfaz según permisos
            const badgeInmutable = document.getElementById('badgeInmutable');
            const advertencia = document.getElementById('advertenciaAnotacion');
            const btnFinalizar = document.getElementById('btnFinalizar');
            
            if (puedeEditarActual) {
                badgeInmutable.style.display = 'none';
                advertencia.style.display = 'none';
                btnFinalizar.disabled = false;
            } else {
                badgeInmutable.style.display = 'inline-block';
                advertencia.style.display = 'block';
                btnFinalizar.disabled = true;
                btnFinalizar.style.opacity = '0.5';
            }
            
            // Cargar anotaciones existentes
            fetch('/anotacion/' + fotoId)
                .then(response => {
                    if (!response.ok) throw new Error('No hay anotaciones previas');
                    return response.json();
                })
                .then(data => {
                    anotaciones = data;
                })
                .catch(() => {
                    console.log('No hay anotaciones previas');
                })
                .finally(() => {
                    inicializarCanvas();
                });
            
            document.getElementById('modalAnotacion').style.display = 'block';
        }
        
        function cerrarAnotador() {
            document.getElementById('modalAnotacion').style.display = 'none';
            anotaciones = [];
        }
        
        function inicializarCanvas() {
            canvas = document.getElementById('canvasAnotacion');
            ctx = canvas.getContext('2d');
            
            canvas.width = 800;
            canvas.height = 500;
            
            // Fondo temporal
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Cargando imagen...', canvas.width / 2, canvas.height / 2);
            
            imagen = new Image();
            imagen.onload = function() {
                // Calcular dimensiones manteniendo proporción
                let ancho = imagen.width;
                let alto = imagen.height;
                const maxAncho = 800;
                const maxAlto = 500;
                
                if (ancho > maxAncho) {
                    alto = (alto * maxAncho) / ancho;
                    ancho = maxAncho;
                }
                if (alto > maxAlto) {
                    ancho = (ancho * maxAlto) / alto;
                    alto = maxAlto;
                }
                
                canvas.width = ancho;
                canvas.height = alto;
                
                // Dibujar imagen
                ctx.drawImage(imagen, 0, 0, ancho, alto);
                
                // Dibujar anotaciones existentes
                dibujarAnotaciones();
                actualizarContador();
                
                // Configurar event listeners si se puede editar
                if (puedeEditarActual) {
                    canvas.addEventListener('mousedown', comenzarDibujo);
                    canvas.addEventListener('mousemove', dibujar);
                    canvas.addEventListener('mouseup', terminarDibujo);
                    canvas.addEventListener('mouseout', terminarDibujo);
                }
            };
            
            imagen.onerror = function() {
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('❌ Error cargando la imagen', canvas.width / 2, canvas.height / 2);
            };
            
            imagen.src = imgSrcActual;
        }
        
        function cambiarHerramienta(nuevaHerramienta) {
            if (!puedeEditarActual && nuevaHerramienta !== 'limpiar') {
                alert('⚠️ No puedes hacer anotaciones en fotos de días anteriores');
                return;
            }
            
            herramienta = nuevaHerramienta;
            
            if (herramienta === 'limpiar') {
                if (!puedeEditarActual) {
                    alert('⚠️ No puedes limpiar anotaciones en fotos de días anteriores');
                    return;
                }
                anotaciones = [];
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
                actualizarContador();
                herramienta = 'circulo';
            }
            
            // Actualizar botones
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById('btn' + herramienta.charAt(0).toUpperCase() + herramienta.slice(1)).classList.add('active');
        }
        
        function obtenerCoordenadas(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            let x, y;
            
            if (e.offsetX !== undefined && e.offsetY !== undefined) {
                x = e.offsetX * scaleX;
                y = e.offsetY * scaleY;
            } else {
                x = (e.clientX - rect.left) * scaleX;
                y = (e.clientY - rect.top) * scaleY;
            }
            
            return { x, y };
        }
        
        function comenzarDibujo(e) {
            if (!puedeEditarActual || herramienta !== 'circulo') return;
            
            const coords = obtenerCoordenadas(e);
            inicioX = coords.x;
            inicioY = coords.y;
            dibujando = true;
        }
        
        function dibujar(e) {
            if (!dibujando || herramienta !== 'circulo' || !puedeEditarActual) return;
            
            const coords = obtenerCoordenadas(e);
            const actualX = coords.x;
            const actualY = coords.y;
            const radio = Math.sqrt(Math.pow(actualX - inicioX, 2) + Math.pow(actualY - inicioY, 2));
            
            // Redibujar
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
            dibujarAnotaciones();
            
            // Dibujar círculo temporal
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(inicioX, inicioY, radio, 0, 2 * Math.PI);
            ctx.stroke();
        }
        
        function terminarDibujo(e) {
            if (!dibujando || !puedeEditarActual) return;
            
            dibujando = false;
            const coords = obtenerCoordenadas(e);
            const finalX = coords.x;
            const finalY = coords.y;
            const radio = Math.sqrt(Math.pow(finalX - inicioX, 2) + Math.pow(finalY - inicioY, 2));
            
            if (radio < 10) return;
            
            // Guardar anotación
            anotaciones.push({
                tipo: 'circulo',
                x: inicioX,
                y: inicioY,
                radio: radio,
                color: '#2ecc71'
            });
            
            // Redibujar
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
            dibujarAnotaciones();
            
            actualizarContador();
        }
        
        function dibujarAnotaciones() {
            anotaciones.forEach(anot => {
                ctx.strokeStyle = anot.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(anot.x, anot.y, anot.radio, 0, 2 * Math.PI);
                ctx.stroke();
            });
        }
        
        function deshacerAnotacion() {
            if (!puedeEditarActual) {
                alert('⚠️ No puedes modificar anotaciones en fotos de días anteriores');
                return;
            }
            
            if (anotaciones.length > 0) {
                anotaciones.pop();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
                dibujarAnotaciones();
                actualizarContador();
            }
        }
        
        function actualizarContador() {
            document.getElementById('contadorProductos').textContent = anotaciones.length;
        }
        
        function finalizarAnotacion() {
            if (!puedeEditarActual) {
                alert('⚠️ No puedes guardar anotaciones en fotos de días anteriores');
                return;
            }
            
            if (anotaciones.length === 0) {
                alert('⚠️ No has marcado ningún producto. Dibuja círculos alrededor de los productos devueltos.');
                return;
            }
            
            const observaciones = prompt('Observaciones sobre la devolución (opcional):\\n\\nSe devolvieron ' + anotaciones.length + ' producto(s).', '') || '';
            
            // Guardar anotaciones
            fetch('/guardar-anotacion', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    fotoId: fotoActual,
                    anotaciones: anotaciones
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    const productosDevueltos = anotaciones.map((anot, index) => ({
                        nombre: 'Producto ' + (index + 1),
                        cantidad: 1
                    }));
                    
                    marcarDevolucionParcial(fotoActual, productosDevueltos, observaciones);
                } else {
                    alert('Error guardando anotaciones: ' + result.message);
                }
            })
            .catch(error => {
                alert('Error de conexión: ' + error.message);
            });
        }
        
        function marcarDevolucionParcial(fotoId, productosDevueltos, observaciones) {
            fetch('/marcar-devolucion', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    fotoId: fotoId,
                    observaciones: observaciones,
                    usuario: 'Usuario Bodega',
                    productosDevueltos: productosDevueltos
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    alert('✅ Devolución parcial registrada correctamente\\nProductos devueltos: ' + productosDevueltos.length);
                    cerrarAnotador();
                    location.reload();
                } else {
                    alert('Error: ' + result.message);
                }
            })
            .catch(error => {
                alert('Error de conexión: ' + error.message);
            });
        }
        
        function marcarDevolucionCompleta(fotoId, boton) {
            const obs = prompt('Ingresa observaciones (opcional):') || '';
            
            boton.disabled = true;
            boton.innerHTML = '⏳ Procesando...';
            
            fetch('/marcar-devolucion', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    fotoId: fotoId,
                    observaciones: obs,
                    usuario: 'Usuario Bodega',
                    productosDevueltos: []
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    boton.innerHTML = '✅ Devuelto';
                    boton.classList.remove('btn-return');
                    boton.classList.add('btn-disabled');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    alert('Error: ' + result.message);
                    boton.disabled = false;
                    boton.innerHTML = '🔄 Marcar como devuelto';
                }
            })
            .catch(error => {
                alert('Error de conexión: ' + error.message);
                boton.disabled = false;
                boton.innerHTML = '🔄 Marcar como devuelto';
            });
        }
        
        // Cerrar modal al hacer click fuera
        window.onclick = function(event) {
            const modal = document.getElementById('modalAnotacion');
            if (event.target === modal) {
                cerrarAnotador();
            }
        }
    </script>
</body>
</html>`;

    const htmlPath = path.join(CARPETA_HTML, `${fechaActual}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML V20 generado: ${htmlPath}`);
}

/* ---------- INICIAR SISTEMA ---------- */
app.listen(PORT, () => {
    console.log(`🚀 Servidor web en http://localhost:${PORT}`);
    console.log(`📊 Panel de reportes: http://localhost:${PORT}/reportes`);
    console.log(`💰 COSTO: $0 USD`);
});

console.log('🔄 Inicializando WhatsApp...');
client.initialize();