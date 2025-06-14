// server.js

// --- Módulos Requeridos ---
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require('sharp');
const axios = require('axios');
const nodemailer = require('nodemailer'); // --- NUEVO: Módulo para enviar correos ---

// --- Carga de Variables de Entorno ---
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// --- Inicialización de Express ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuración de Wasabi S3 ---
let wasabiConfig = {};
try {
    const configPath = path.join(__dirname, 'wasabi_config.json');
    if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath);
        wasabiConfig = JSON.parse(rawConfig);
    }
} catch (error) {
    console.error("Error al cargar wasabi_config.json:", error.message);
}

const WASABI_ACCESS_KEY_ID = process.env.WASABI_ACCESS_KEY_ID || wasabiConfig.WASABI_ACCESS_KEY_ID;
const WASABI_SECRET_ACCESS_KEY = process.env.WASABI_SECRET_ACCESS_KEY || wasabiConfig.WASABI_SECRET_ACCESS_KEY;
const WASABI_REGION = process.env.WASABI_REGION || wasabiConfig.WASABI_REGION || "us-central-1";
const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT || (WASABI_REGION ? `https://s3.${WASABI_REGION}.wasabisys.com` : null);
const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || wasabiConfig.WASABI_BUCKET_NAME;

let s3Client;
if (WASABI_ENDPOINT && WASABI_REGION && WASABI_ACCESS_KEY_ID && WASABI_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
        endpoint: WASABI_ENDPOINT,
        region: WASABI_REGION,
        credentials: { accessKeyId: WASABI_ACCESS_KEY_ID, secretAccessKey: WASABI_SECRET_ACCESS_KEY }
    });
    console.log("Cliente S3 para Wasabi configurado.");
} else {
    console.error("¡ERROR CRÍTICO! Cliente S3 para Wasabi NO configurado. Verifica las variables de entorno.");
}

// --- Configuración de la Base de Datos PostgreSQL ---
const DATABASE_CONNECTION_STRING = process.env.DATABASE_URL || "postgresql://wrtk_user:1wBzUu8K1rO3n7w2KOTc8pPnyyPtoVJ0@dpg-d0l7en3e5dus73cbcvb0-a.oregon-postgres.render.com/wrtk";
if (!DATABASE_CONNECTION_STRING) {
    console.error("¡ERROR CRÍTICO! La cadena de conexión a la base de datos no está definida.");
}
const pool = new Pool({
    connectionString: DATABASE_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
});
pool.connect().then(() => console.log('Conexión a PostgreSQL establecida.')).catch(err => console.error('Error de conexión a PostgreSQL:', err.stack));


// --- NUEVO: Configuración de Nodemailer para Enviar Correos ---
// --- NUEVO: Configuración de Nodemailer más robusta ---

// Primero, definimos las opciones base
const nodemailerOptions = {
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
};

// ¡Aquí está la magia!
// Si la aplicación NO está en producción (es decir, está en tu PC),
// añadimos una regla para que sea menos estricta con los certificados SSL.
if (process.env.NODE_ENV !== 'production') {
    nodemailerOptions.tls = {
        rejectUnauthorized: false
    };
}

// Finalmente, creamos el transportador con las opciones correctas según el entorno
const transporter = nodemailer.createTransport(nodemailerOptions);

// El código de verificación se mantiene igual
transporter.verify((error, success) => {
    if (error) {
        console.error("Error en la configuración de Nodemailer:", error);
    } else {
        console.log("Nodemailer está listo para enviar correos.");
    }
});
transporter.verify((error, success) => {
    if (error) {
        console.error("Error en la configuración de Nodemailer:", error);
    } else {
        console.log("Nodemailer está listo para enviar correos.");
    }
});


// --- Middleware de Express ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ==========================================================================
// REDIRECCIÓN 301 y RUTAS DE PÁGINAS (TU CÓDIGO INTACTO)
// ==========================================================================
app.get('/*.html', (req, res) => {
    const newUrl = req.path.slice(0, -5);
    res.redirect(301, newUrl);
});
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/inicio', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/servicios', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'servicios.html')); });
app.get('/promociones', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'promociones.html')); });
app.get('/clipremium', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'clipremium.html')); });
app.get('/contactanos', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'contactanos.html')); });


// --- Constantes ---
const MAX_FAILED_ATTEMPTS_PER_USER = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const BACKGROUNDS_FOLDER = path.join(__dirname, 'public', 'img', 'fondosusaremos');


// --- Endpoints de la API (TU CÓDIGO ORIGINAL INTACTO)---

// Endpoint para obtener la lista de fondos disponibles
app.get('/api/backgrounds', (req, res) => {
    fs.readdir(BACKGROUNDS_FOLDER, (err, files) => {
        if (err) {
            console.error("Error al leer la carpeta de fondos:", err);
            return res.status(500).json({ message: "No se pudo acceder a los fondos." });
        }
        const imageFiles = files
            .filter(file => /\.(jpe?g|png|webp)$/i.test(file))
            .map(file => ({
                name: file,
                url: `/img/fondosusaremos/${file}`
            }));
        res.json(imageFiles);
    });
});

// Endpoint de login
app.post('/acceder-galeria-privada', async (req, res) => {
    const { nombre_usuario_galeria, codigo_acceso_galeria } = req.body;
    if (!nombre_usuario_galeria || !codigo_acceso_galeria) {
        return res.status(400).json({ success: false, message: 'Usuario y código son requeridos.' });
    }
    try {
        const queryText = `SELECT id, codigo_acceso_galeria, prefijo_s3, descripcion_galeria, intentos_fallidos, bloqueado_hasta, ingresos_correctos, activo FROM accesos_galerias WHERE nombre_usuario_galeria = $1;`;
        const { rows } = await pool.query(queryText, [nombre_usuario_galeria]);
        if (rows.length === 0) {
            console.log(`Intento login fallido: Usuario no encontrado - ${nombre_usuario_galeria}`);
            return res.status(401).json({ success: false, message: 'Usuario o código de acceso incorrecto.' });
        }
        const galeriaInfo = rows[0];
        if (!galeriaInfo.activo) {
            return res.status(403).json({ success: false, message: 'Este acceso a galería ha sido desactivado.' });
        }
        if (galeriaInfo.bloqueado_hasta && new Date(galeriaInfo.bloqueado_hasta) > new Date()) {
            const timeLeftMinutes = Math.ceil((new Date(galeriaInfo.bloqueado_hasta) - new Date()) / 60000);
            return res.status(429).json({ success: false, message: `Demasiados intentos. Acceso bloqueado. Intenta de nuevo en ${timeLeftMinutes} minutos.` });
        }
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria);
        if (!esCodigoValido) {
            let nuevosIntentos = galeriaInfo.intentos_fallidos + 1;
            let nuevoBloqueoHasta = galeriaInfo.bloqueado_hasta;
            if (nuevosIntentos >= MAX_FAILED_ATTEMPTS_PER_USER) {
                nuevoBloqueoHasta = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
            }
            await pool.query('UPDATE accesos_galerias SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3', [nuevosIntentos, nuevoBloqueoHasta, galeriaInfo.id]);
            return res.status(401).json({ success: false, message: 'Usuario o código de acceso incorrecto.' });
        }
        // He revertido la consulta a la que tenías para evitar errores de columnas faltantes.
        await pool.query('UPDATE accesos_galerias SET intentos_fallidos = 0, bloqueado_hasta = NULL, ingresos_correctos = ingresos_correctos + 1 WHERE id = $1', [galeriaInfo.id]);
        const listParams = { Bucket: BUCKET_NAME, Prefix: galeriaInfo.prefijo_s3 };
        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));
        const promesasDeUrls = (listedObjects.Contents || [])
            .filter(obj => obj.Key && !obj.Key.endsWith('/') && obj.Size > 0)
            .map(async (obj) => {
                const key = obj.Key;
                const fileName = key.substring(key.lastIndexOf('/') + 1);
                const viewUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });
                const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"` }), { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName };
            });
        const imagenesConUrls = await Promise.all(promesasDeUrls);
        res.json({ success: true, imagenes: imagenesConUrls, tituloGaleria: galeriaInfo.descripcion_galeria, idAcceso: galeriaInfo.id });
    } catch (error) {
        console.error("Error en /acceder-galeria-privada:", error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});

// Endpoint que orquesta la eliminación del fondo
app.post('/api/change-background', async (req, res) => {
    const { originalImageUrl, backgroundImageUrl } = req.body;
    if (!originalImageUrl || !backgroundImageUrl) {
        return res.status(400).json({ message: 'Faltan URLs de imagen.' });
    }
    const tempDir = os.tmpdir();
    const originalTempPath = path.join(tempDir, `original_${Date.now()}.jpg`);
    const backgroundTempPath = path.join(tempDir, `background_${Date.now()}.jpg`);
    const outputTempPath = path.join(tempDir, `composite_${Date.now()}.jpg`);
    try {
        const [originalRes, backgroundRes] = await Promise.all([
            axios.get(originalImageUrl, { responseType: 'arraybuffer' }),
            axios.get(backgroundImageUrl, { responseType: 'arraybuffer', baseURL: `http://localhost:${PORT}` })
        ]);
        await Promise.all([
            fs.promises.writeFile(originalTempPath, originalRes.data),
            fs.promises.writeFile(backgroundTempPath, backgroundRes.data)
        ]);
        console.log('Servidor: Imágenes temporales creadas. Ejecutando script de Python...');
        const pythonProcess = spawn('python3', ['process_background.py', originalTempPath, backgroundTempPath, outputTempPath]);
        let pythonOutput = '', pythonError = '';
        pythonProcess.stdout.on('data', (data) => pythonOutput += data.toString());
        pythonProcess.stderr.on('data', (data) => pythonError += data.toString());
        pythonProcess.on('close', async (code) => {
            console.log(`Servidor: Proceso de Python terminó con código ${code}.`);
            console.log('Python STDOUT:', pythonOutput);
            if (pythonError) console.error('Python STDERR:', pythonError);
            await Promise.all([fs.promises.unlink(originalTempPath), fs.promises.unlink(backgroundTempPath)]);
            if (code === 0 && fs.existsSync(outputTempPath)) {
                res.sendFile(outputTempPath, (err) => {
                    if (err) console.error("Error al enviar el archivo de salida:", err);
                    fs.promises.unlink(outputTempPath);
                });
            } else {
                if (fs.existsSync(outputTempPath)) await fs.promises.unlink(outputTempPath);
                res.status(500).json({ message: 'Error en el procesamiento de la imagen en Python.', details: pythonError });
            }
        });
    } catch (error) {
        console.error("Error en /api/change-background:", error.message);
        if (fs.existsSync(originalTempPath)) await fs.promises.unlink(originalTempPath);
        if (fs.existsSync(backgroundTempPath)) await fs.promises.unlink(backgroundTempPath);
        if (fs.existsSync(outputTempPath)) await fs.promises.unlink(outputTempPath);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Endpoint para aplicar filtros con Sharp y descargar
app.post('/procesar-y-descargar-imagen', async (req, res) => {
    const { originalWasabiUrl, edits, originalName } = req.body;
    if (!originalWasabiUrl || !edits) {
        return res.status(400).json({ success: false, message: "Faltan parámetros." });
    }
    try {
        const imageResponse = await axios({ url: originalWasabiUrl, method: 'GET', responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);
        let imageProcessor = sharp(imageBuffer);
        if (edits.brightness) imageProcessor.modulate({ brightness: parseFloat(edits.brightness) });
        if (edits.contrast) imageProcessor.linear(parseFloat(edits.contrast), (1 - parseFloat(edits.contrast)) * 128);
        const processedImageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();
        const fileName = `editada_${originalName || 'imagen_JonyLager.jpg'}`;
        res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${fileName}"` });
        res.send(processedImageBuffer);
    } catch (error) {
        console.error("Error al procesar o descargar la imagen:", error);
        res.status(500).json({ success: false, message: 'Error al procesar la imagen en el servidor.' });
    }
});

// Endpoint para registrar las interacciones de edición
app.post('/registrar-interaccion-edicion', async (req, res) => {
    const { idAcceso, nombre_imagen_original, filtro_aplicado, valor_filtro_inicial, valor_filtro_final, es_descarga_editada = false } = req.body;
    if (idAcceso === undefined || !nombre_imagen_original || !filtro_aplicado) {
        return res.status(400).json({ success: false, message: 'Faltan datos para registrar la interacción.' });
    }
    try {
        const queryText = `INSERT INTO interacciones_edicion (id_acceso_galeria, nombre_imagen_original, filtro_aplicado, valor_filtro_inicial, valor_filtro_final, es_descarga_editada, timestamp_interaccion) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id;`;
        const result = await pool.query(queryText, [idAcceso, nombre_imagen_original, filtro_aplicado, JSON.stringify(valor_filtro_inicial), JSON.stringify(valor_filtro_final), es_descarga_editada]);
        res.status(201).json({ success: true, message: 'Interacción registrada.', idInteraccion: result.rows[0].id });
    } catch (error) {
        console.error("Error al registrar interacción de edición en BD:", error);
        res.status(500).json({ success: false, message: 'Error interno al registrar la interacción.' });
    }
});

// --- NUEVO: Endpoint para el formulario de contacto ---
app.post('/api/enviar-formulario', async (req, res) => {
    const { nombre, telefono, correo, mensaje } = req.body;

    if (!nombre || !correo || !mensaje) {
        return res.status(400).json({ message: 'Nombre, correo y mensaje son requeridos.' });
    }

    const mailOptions = {
        from: `"${nombre}" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        replyTo: correo,
        subject: `Nuevo Mensaje de Contacto de: ${nombre}`,
        html: `
            <h1>Nuevo Mensaje desde tu Página Web</h1>
            <p><strong>Nombre:</strong> ${nombre}</p>
            <p><strong>Correo para responder:</strong> ${correo}</p>
            <p><strong>Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
            <hr>
            <h3>Mensaje:</h3>
            <p style="white-space: pre-wrap;">${mensaje}</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: '¡Mensaje enviado con éxito!' });
    } catch (error) {
        console.error('Error al enviar el correo:', error);
        res.status(500).json({ message: 'Error interno del servidor al enviar el mensaje.' });
    }
});


// --- Ruta final "Catch-all" que tenías, ahora comentada ---
// app.get('/*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });


// --- Arranque del Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});