const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

// 📌 Configura aquí los nombres de tus grupos
const gruposPermitidos = ["Ventas 55","Entra/sale-bodega 55","Devoluciones bodega"];

const client = new Client({
    authStrategy: new LocalAuth(), // guarda tu sesión para no volver a escanear
    puppeteer: { headless: true }  // sin abrir navegador visible
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

        // Filtrar por grupos permitidos
        if (chat.isGroup && gruposPermitidos.includes(chat.name)) {
            const fecha = new Date();
            const fechaTexto = fecha.toISOString().split('T')[0]; // YYYY-MM-DD
            const horaTexto = fecha.toLocaleTimeString();
            const nombreGrupo = chat.name.replace(/[^a-zA-Z0-9]/g, '_');

            // 📁 Crear carpetas si no existen
            const logDir = path.join(__dirname, 'logs');
            const mediaDir = path.join(__dirname, 'media', fechaTexto);
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
            if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

            // 📄 Guardar texto del mensaje
            const logPath = path.join(logDir, `${fechaTexto}.txt`);
            const linea = `[${horaTexto}] [${nombreGrupo}] ${contact.pushname || contact.number}: ${msg.body}\n`;
            fs.appendFileSync(logPath, linea, 'utf8');
            console.log(`💬 Guardado: ${msg.body}`);

            // 📸 Guardar archivos multimedia
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                const ext = media.mimetype.split('/')[1];
                const filename = `${mediaDir}/${Date.now()}.${ext}`;
                fs.writeFileSync(filename, media.data, 'base64');
                console.log(`📦 Archivo guardado: ${filename}`);
            }
        }
    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
    }
});

client.initialize();
