// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt'); 
const { Pool } = require('pg');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require('sharp');
const axios = require('axios');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// --- Wasabi Config ---
// ... (Tu configuración de Wasabi, igual que antes)
let wasabiConfig = {};
try {
    const configPath = path.join(__dirname, 'wasabi_config.json');
    if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath);
        wasabiConfig = JSON.parse(rawConfig);
        console.log("Configuración de Wasabi cargada desde wasabi_config.json");
    } else {
        console.warn("Advertencia: wasabi_config.json no encontrado.");
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
    s3Client = new S3Client({ endpoint: WASABI_ENDPOINT, region: WASABI_REGION, credentials: { accessKeyId: WASABI_ACCESS_KEY_ID, secretAccessKey: WASABI_SECRET_ACCESS_KEY } });
    console.log("Cliente S3 para Wasabi configurado.");
} else {
    console.error("¡ERROR CRÍTICO! Cliente S3 para Wasabi NO configurado.");
}

// --- DB Config ---
const DATABASE_CONNECTION_STRING = "postgresql://wrtk_user:1wBzUu8K1rO3n7w2KOTc8pPnyyPtoVJ0@dpg-d0l7en3e5dus73cbcvb0-a.oregon-postgres.render.com/wrtk"; 
if (!DATABASE_CONNECTION_STRING) {
    console.error("¡ERROR CRÍTICO! DATABASE_CONNECTION_STRING está vacía.");
} else {
    console.log("Usando DATABASE_CONNECTION_STRING hardcodeada para desarrollo local.");
}
const pool = new Pool({ connectionString: DATABASE_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });
pool.connect().then(() => console.log('Conexión a PostgreSQL establecida.')).catch(err => console.error('Error de conexión a PostgreSQL:', err.stack));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ... (Ruta /acceder-galeria-privada y otras constantes como MAX_FAILED_ATTEMPTS_PER_USER se mantienen igual que en #59)
app.post('/acceder-galeria-privada', async (req, res) => {
    const { nombre_usuario_galeria, codigo_acceso_galeria } = req.body;
    if (!nombre_usuario_galeria || !codigo_acceso_galeria) {
        return res.status(400).json({ success: false, message: 'Usuario y código son requeridos.' });
    }
    try {
        const queryText = `SELECT id, codigo_acceso_galeria, prefijo_s3, descripcion_galeria, intentos_fallidos, bloqueado_hasta, ingresos_correctos, activo FROM accesos_galerias WHERE nombre_usuario_galeria = $1;`;
        const { rows } = await pool.query(queryText, [nombre_usuario_galeria]);
        if (rows.length === 0) { console.log(`Intento login fallido: Usuario no encontrado - ${nombre_usuario_galeria}`); return res.status(401).json({ success: false, message: 'Usuario de galería no encontrado.' });}
        const galeriaInfo = rows[0];
        if (!galeriaInfo.activo) { console.log(`Intento login: Usuario desactivado - ${nombre_usuario_galeria}`); return res.status(403).json({ success: false, message: 'Este acceso a galería ha sido desactivado.' });}
        if (galeriaInfo.bloqueado_hasta && new Date(galeriaInfo.bloqueado_hasta) > new Date()) {
            const timeLeftMinutes = Math.ceil((new Date(galeriaInfo.bloqueado_hasta) - new Date()) / (60 * 1000));
            console.log(`Intento login: Usuario bloqueado - ${nombre_usuario_galeria}`); return res.status(429).json({ success: false, message: `Demasiados intentos. Acceso bloqueado. Intenta de nuevo en ${timeLeftMinutes} minutos.` });
        }
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria);
        console.log(`VALIDACIÓN LOGIN para '${nombre_usuario_galeria}': Válido=${esCodigoValido}`);
        if (!esCodigoValido) {
            let nuevosIntentos = galeriaInfo.intentos_fallidos + 1;
            let nuevoBloqueoHasta = galeriaInfo.bloqueado_hasta; 
            if (nuevosIntentos >= MAX_FAILED_ATTEMPTS_PER_USER && (!nuevoBloqueoHasta || new Date(nuevoBloqueoHasta) < new Date())) {
                nuevoBloqueoHasta = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                console.log(`Usuario ${nombre_usuario_galeria} bloqueado hasta ${nuevoBloqueoHasta.toISOString()}`);
            }
            await pool.query('UPDATE accesos_galerias SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3', [nuevosIntentos, nuevoBloqueoHasta, galeriaInfo.id]);
            return res.status(401).json({ success: false, message: 'Código de acceso incorrecto.' });
        }
        const nuevosIngresosCorrectos = galeriaInfo.ingresos_correctos + 1;
        await pool.query('UPDATE accesos_galerias SET intentos_fallidos = 0, bloqueado_hasta = NULL, ingresos_correctos = $1 WHERE id = $2', [nuevosIngresosCorrectos, galeriaInfo.id]);
        console.log(`Login exitoso para ${nombre_usuario_galeria}. ID Acceso: ${galeriaInfo.id}`);
        if (!s3Client || !BUCKET_NAME) return res.status(500).json({ success: false, message: 'Error de configuración del servidor para S3.' });
        const listParams = { Bucket: BUCKET_NAME, Prefix: galeriaInfo.prefijo_s3 };
        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));
        if (!listedObjects.Contents || listedObjects.Contents.length === 0) return res.json({ success: true, imagenes: [], tituloGaleria: galeriaInfo.descripcion_galeria, message: 'Galería vacía.', idAcceso: galeriaInfo.id });
        const promesasDeUrls = listedObjects.Contents.filter(obj => obj.Key && !obj.Key.endsWith('/') && obj.Size > 0)
            .map(async (obj) => { 
                const key = obj.Key; const fileName = key.substring(key.lastIndexOf('/') + 1);
                const viewUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });
                const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"`}), { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName };
            });
        const imagenesConUrls = await Promise.all(promesasDeUrls);
        res.json({ success: true, imagenes: imagenesConUrls, tituloGaleria: galeriaInfo.descripcion_galeria, idAcceso: galeriaInfo.id });
    } catch (error) { console.error("Error en /acceder-galeria-privada:", error); res.status(500).json({ success: false, message: 'Error interno del servidor.' }); }
});


app.post('/procesar-y-descargar-imagen', async (req, res) => {
    const { originalWasabiUrl, edits, originalName } = req.body;

    if (!originalWasabiUrl || !edits) {
        return res.status(400).json({ success: false, message: "Faltan parámetros." });
    }

    try {
        console.log("--- INICIO /procesar-y-descargar-imagen ---");
        console.log("SRV: Ediciones recibidas:", JSON.stringify(edits, null, 2));

        const imageResponse = await axios({ url: originalWasabiUrl, method: 'GET', responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);
        console.log("SRV: Imagen original descargada.");

        let imageProcessor = sharp(imageBuffer);
        const metadata = await imageProcessor.metadata(); // Necesario si se usa viñeta
        console.log("SRV: Metadatos obtenidos.");

        // 1. Aplicar sliders
        if (edits.brightness !== undefined && parseFloat(edits.brightness) !== 1) {
            imageProcessor = imageProcessor.modulate({ brightness: parseFloat(edits.brightness) });
            console.log("SRV: Slider Brillo:", edits.brightness);
        }
        if (edits.contrast !== undefined && parseFloat(edits.contrast) !== 1) {
            const contrastValue = parseFloat(edits.contrast);
            imageProcessor = imageProcessor.linear(contrastValue, (1 - contrastValue) * 128);
            console.log("SRV: Slider Contraste:", edits.contrast);
        }
        if (edits.saturate !== undefined && parseFloat(edits.saturate) !== 1) {
            const saturationValue = parseFloat(edits.saturate);
            imageProcessor = imageProcessor.modulate({ saturation: saturationValue });
            console.log("SRV: Slider Saturación:", saturationValue);
            if (saturationValue === 0) {
                console.log("SRV: ALERTA! Imagen DESATURADA A B&N por slider ANTES de filtros nombrados.");
            }
        } else {
            console.log("SRV: Slider Saturación: neutro o no enviado.");
        }
        
        if (edits.vignetteIntensity !== undefined && edits.vignetteIntensity > 0 && metadata && metadata.width && metadata.height) {
            const intensity = parseFloat(edits.vignetteIntensity);
            const vignetteAmount = intensity / 100;
            const innerCircleStopPercent = Math.max(20, 100 - vignetteAmount * 70);
            const outerOpacity = Math.min(0.8, vignetteAmount * 0.8);
            const vignetteOverlaySvg = `<svg width="${metadata.width}" height="${metadata.height}"><defs><radialGradient id="vignetteGrad" cx="50%" cy="50%" r="70%" fx="50%" fy="50%"><stop offset="${innerCircleStopPercent}%" stop-color="white" stop-opacity="0" /><stop offset="100%" stop-color="black" stop-opacity="${outerOpacity}" /></radialGradient></defs><rect x="0" y="0" width="${metadata.width}" height="${metadata.height}" fill="url(#vignetteGrad)"/></svg>`;
            try {
                imageProcessor = imageProcessor.composite([{ input: Buffer.from(vignetteOverlaySvg), blend: 'multiply' }]);
                console.log(`SRV: Aplicando Viñeta SVG. Intensidad: ${intensity}`);
            } catch (vignetteError) { console.error("Error al aplicar viñeta con Sharp:", vignetteError); }
        }

        // 2. Aplicar filtro nombrado
        if (edits.activeNamedFilter && edits.activeNamedFilter !== 'original') {
            console.log(`SRV: Filtro Nombrado Activo: ${edits.activeNamedFilter}`);
            switch (edits.activeNamedFilter) {
                case 'grayscale':
                case 'bw_intenso':
                case 'noir_look':
                    imageProcessor = imageProcessor.grayscale();
                    if (edits.activeNamedFilter === 'noir_look') imageProcessor = imageProcessor.sharpen(0.5);
                    console.log(`SRV: Aplicado ${edits.activeNamedFilter} (forzado a grayscale).`);
                    break;
                case 'sepia': // Sepia puro y monocromático
                    imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    console.log("SRV: Aplicado Sepia (puro).");
                    break;
                
                // --- Filtros de Color con Tintes y Efectos Ajustados ---
                case 'vintage_suave': // sat:0.9, bright:0.97, contrast:1.05, (cliente css sepia:30%)
                    imageProcessor = imageProcessor.gamma(1.05);
                    // Tinte cálido sutil que no domine el color base
                    imageProcessor = imageProcessor.tint({ r: 255, g: 240, b: 220 }); // Naranja muy pálido / color piel
                    console.log("SRV: Aplicado Vintage Suave (gamma + tinte color cálido muy suave).");
                    break;
                case 'valencia_filter': // sat:1.08, bright:1.05, contrast:1.05, (cliente css sepia:8%)
                    // Tinte cálido ligero, manteniendo la alta saturación y brillo del cliente.
                    imageProcessor = imageProcessor.modulate({ hue: -3 }); 
                    break;
                case 'calido': // sat:1.1, bright:1.03, (cliente css sepia:15%)
                    // La imagen ya tiene alta saturación y brillo. Añadir un toque cálido.
                    imageProcessor = imageProcessor.modulate({ hue: -6 }); // Ligeramente hacia rojos/amarillos
                    // El tinte anterior {r:255,g:210,b:170} era muy fuerte. Hacemos uno más sutil o ninguno si hue es suficiente.
                    // Opcional: un tinte muy muy ligero si es necesario y `edits.sepia` es true.
                    // if (edits.sepia) imageProcessor = imageProcessor.tint({ r: 255, g: 235, b: 215 });
                    console.log("SRV: Aplicado Cálido (modulate hue).");
                    break;
                case 'frio': // sat:1.05, bright:1.02, (cliente css hueRotate:195)
                    imageProcessor = imageProcessor.modulate({ hue: 15 }); // Hacia cianes
                    imageProcessor = imageProcessor.tint({ r: 210, g: 225, b: 255 }); // Azul muy pálido
                    console.log("SRV: Aplicado Frío (modulate hue + tinte azulado pálido).");
                    break;
                case 'kodak_gold':
                    imageProcessor = imageProcessor.modulate({ hue: -8, saturation: 1.05 }); // Más naranja, ligero boost de saturación
                    console.log("SRV: Aplicado Kodak Gold.");
                    break;
                case 'mate_look': 
                    imageProcessor = imageProcessor.gamma(1.15);
                    // La saturación (0.75 del cliente) ya se aplicó.
                    console.log("SRV: Aplicado Mate Look.");
                    break;
                case 'aden_filter': // sat:0.85, bright:1.1, contrast:0.9, (cliente css hueRotate:-20)
                    imageProcessor = imageProcessor.modulate({ hue: -20 }); // Usar el HUE que el cliente tiene en CSS
                    
                    console.log("SRV: Aplicado Aden (modulate hue + tinte rosado suave).");
                    break;
                case 'teal_orange':
                    imageProcessor = imageProcessor.modulate({ hue: -5 }); // Ajustar para efecto deseado
                    // Para un teal & orange más avanzado, se necesitaría .recomb() o .composite() con capas de color.
                    console.log("SRV: Aplicado Teal & Orange (básico).");
                    break;
                case 'cinematic_look': // sat:0.8, contrast:1.15, (cliente css sepia:5% -> edits.sepia=true)
                    imageProcessor = imageProcessor.sharpen(0.3);
                    if (edits.sepia) { // Si el cliente lo pide por el CSS sepia(5%)
                        imageProcessor = imageProcessor.tint({r: 255, g: 240, b: 225}); // Tinte cálido MUY MUY sutil
                        console.log("SRV: Cinematic Look con tinte cálido sutil por flag sepia.");
                    } else {
                         console.log("SRV: Aplicado Cinematic Look (solo sharpen).");
                    }
                    break;
                default:
                    console.log(`SRV: Filtro Nombrado '${edits.activeNamedFilter}' no reconocido. Usando solo sliders y flags directos.`);
                    if (edits.grayscale) imageProcessor = imageProcessor.grayscale();
                    else if (edits.sepia) imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    break;
            }
        } else { 
            console.log("SRV: Procesando como 'Original' o solo con sliders.");
            if (edits.grayscale) imageProcessor = imageProcessor.grayscale();
            else if (edits.sepia) imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
        }

        console.log("SRV: Todas las ediciones Sharp completadas.");
        const processedImageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();
        
        const fileName = `editada_${originalName || 'imagen_JonyLager.jpg'}`;
        res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${fileName}"` });
        res.send(processedImageBuffer);
        console.log(`SRV: Imagen editada '${fileName}' enviada.`);
        console.log("--- FIN /procesar-y-descargar-imagen ---");

    } catch (error) {
        console.error("SRV: Error al procesar o descargar la imagen:", error);
        let errorMessage = "Error al procesar la imagen en el servidor.";
        if (error.isAxiosError && error.response) errorMessage = `Error al descargar imagen de origen (status ${error.response.status}).`;
        else if (error.message && error.message.toLowerCase().includes('input buffer contains unsupported image format')) errorMessage = "Error: Formato de imagen no soportado.";
        else if (error.message) errorMessage = error.message;
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.post('/registrar-interaccion-edicion', async (req, res) => {
    const { idAcceso, nombre_imagen_original, filtro_aplicado, valor_filtro_inicial, valor_filtro_final, es_descarga_editada = false } = req.body;
    if (idAcceso === undefined || !nombre_imagen_original || !filtro_aplicado) {
        return res.status(400).json({ success: false, message: 'Faltan datos para registrar la interacción.' });
    }
    console.log("Backend: Registrando interacción:", { idAcceso, nombre_imagen_original, filtro_aplicado, valor_filtro_final, es_descarga_editada});
    try {
        const queryText = `INSERT INTO interacciones_edicion (id_acceso_galeria, nombre_imagen_original, filtro_aplicado, valor_filtro_inicial, valor_filtro_final, es_descarga_editada, timestamp_interaccion) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id;`;
        const result = await pool.query(queryText, [idAcceso, nombre_imagen_original, filtro_aplicado, JSON.stringify(valor_filtro_inicial), JSON.stringify(valor_filtro_final), es_descarga_editada]);
        res.status(201).json({ success: true, message: 'Interacción registrada.', idInteraccion: result.rows[0].id });
    } catch (error) { console.error("Error al registrar interacción de edición en BD:", error); res.status(500).json({ success: false, message: 'Error interno al registrar la interacción.' }); }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});