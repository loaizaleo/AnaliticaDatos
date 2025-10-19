const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

// 📌 Configura aquí los nombres de tus grupos
const gruposPermitidos = ["Ventas 55", "Entra/sale-bodega 55", "Devoluciones bodega"];

const client = new Client({
    authStrategy: new LocalAuth(), // guarda tu sesión
    puppeteer: { headless: true }  // sin navegador visible
});

// 🟢 Mostrar el QR para conectar
client.on('qr', qr => {
    console.log('Escanea este código QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// 🟢 Cuando se conecta correctamente
client.on('ready', () => {
    console.log('✅ Bot conectado a WhatsApp');
});

// 📥 Cuando llega un mensaje
client.on('message', async msg => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();

        // Solo procesa si el mensaje viene de un grupo permitido
        if (chat.isGroup && gruposPermitidos.includes(chat.name)) {
            const fecha = new Date();

            // 🕒 Formato estándar ISO compatible con pandas
            const fechaTexto = fecha.toISOString().split('T')[0]; // YYYY-MM-DD
            const horaTexto = fecha.toLocaleTimeString('es-CO', { hour12: false }); // 24h: 14:32:09
            const fechaHora = `${fechaTexto} ${horaTexto}`;

            // 🧩 Nombre del grupo limpio (para carpetas)
            const nombreGrupo = chat.name.replace(/[^a-zA-Z0-9]/g, '_');

            // 📁 Crear carpetas por grupo y fecha
            const logsDir = path.join(__dirname, 'logs', nombreGrupo);
            const mediaDir = path.join(__dirname, 'media', nombreGrupo, fechaTexto);

            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

            // 📄 Guardar texto del mensaje (sin el nombre del grupo)
            const logPath = path.join(logsDir, `${fechaTexto}.txt`);
            const linea = `${fechaHora} ${contact.pushname || contact.number}: ${msg.body}\n`;
            fs.appendFileSync(logPath, linea, 'utf8');
            console.log(`💬 Guardado: ${msg.body}`);

            // 📸 Guardar archivos multimedia
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                const ext = media.mimetype.split('/')[1];
                const filename = `${mediaDir}/${Date.now()}.${ext}`;
                fs.writeFileSync(filename, media.data, 'base64');

                // Registrar también el archivo multimedia en el log
                const logLinea = `${fechaHora} ${contact.pushname || contact.number}: [Archivo guardado: ${path.basename(filename)}]\n`;
                fs.appendFileSync(logPath, logLinea, 'utf8');

                console.log(`📦 Archivo guardado en: ${filename}`);
            }
        }
    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
    }
});

client.initialize();
