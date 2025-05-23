// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt'); // Asegúrate que esté importado
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

// --- Cargar Configuración de Wasabi ---
let wasabiConfig = {};
try {
    const configPath = path.join(__dirname, 'wasabi_config.json');
    if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath);
        wasabiConfig = JSON.parse(rawConfig);
        console.log("Configuración de Wasabi cargada desde wasabi_config.json");
    } else {
        console.warn("Advertencia: wasabi_config.json no encontrado. Usando variables de entorno o esperando que estén definidas.");
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
    console.error("¡ERROR CRÍTICO! Cliente S3 para Wasabi NO configurado.");
}

// --- Configuración de la Base de Datos ---
const DATABASE_CONNECTION_STRING = process.env.DATABASE_URL;

if (!DATABASE_CONNECTION_STRING) {
    console.error("¡ERROR CRÍTICO! La variable de entorno DATABASE_URL no está configurada.");
    // En un entorno de producción, podrías querer que la aplicación falle si no puede conectarse a la BD.
    // process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false } // Revisa la recomendación de Render para SSL en producción
});
pool.connect()
    .then(() => console.log('¡Conectado a PostgreSQL en Render!'))
    .catch(err => console.error('Error de conexión a PostgreSQL en Render:', err.stack));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MAX_FAILED_ATTEMPTS_PER_USER = 10;
const LOCKOUT_DURATION_MINUTES = 15;

app.post('/acceder-galeria-privada', async (req, res) => {
    const { nombre_usuario_galeria, codigo_acceso_galeria } = req.body;
    if (!nombre_usuario_galeria || !codigo_acceso_galeria) {
        return res.status(400).json({ success: false, message: 'Usuario y código son requeridos.' });
    }
    try {
        const queryText = `
            SELECT id, codigo_acceso_galeria, prefijo_s3, descripcion_galeria, 
                   intentos_fallidos, bloqueado_hasta, ingresos_correctos, activo
            FROM accesos_galerias WHERE nombre_usuario_galeria = $1;`;
        const { rows } = await pool.query(queryText, [nombre_usuario_galeria]);

        if (rows.length === 0) {
            console.log(`Intento de login fallido: Usuario no encontrado - ${nombre_usuario_galeria}`);
            return res.status(401).json({ success: false, message: 'Usuario de galería no encontrado.' });
        }
        
        const galeriaInfo = rows[0];
        if (!galeriaInfo.activo) {
            console.log(`Intento de login: Usuario desactivado - ${nombre_usuario_galeria}`);
            return res.status(403).json({ success: false, message: 'Este acceso a galería ha sido desactivado.' });
        }

        if (galeriaInfo.bloqueado_hasta && new Date(galeriaInfo.bloqueado_hasta) > new Date()) {
            const timeLeftMinutes = Math.ceil((new Date(galeriaInfo.bloqueado_hasta) - new Date()) / (60 * 1000));
            console.log(`Intento de login: Usuario bloqueado - ${nombre_usuario_galeria}`);
            return res.status(429).json({ success: false, message: `Demasiados intentos. Acceso bloqueado. Intenta de nuevo en ${timeLeftMinutes} minutos.` });
        }
        
        // Usando comparación de texto plano (TEMPORAL - ¡CAMBIAR A BCRYPT!)
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria); 
        // Para usar bcrypt (RECOMENDADO):
        // const esCodigoValido = await bcrypt.compare(codigo_acceso_galeria, galeriaInfo.codigo_acceso_galeria);
        console.log(`VALIDACIÓN LOGIN para '${nombre_usuario_galeria}': Ingresado='${codigo_acceso_galeria}', EnBD='${galeriaInfo.codigo_acceso_galeria}', Válido=${esCodigoValido}`);

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

        // Código válido
        const nuevosIngresosCorrectos = galeriaInfo.ingresos_correctos + 1;
        await pool.query('UPDATE accesos_galerias SET intentos_fallidos = 0, bloqueado_hasta = NULL, ingresos_correctos = $1 WHERE id = $2', [nuevosIngresosCorrectos, galeriaInfo.id]);
        console.log(`Login exitoso para ${nombre_usuario_galeria}. Ingreso Nro: ${nuevosIngresosCorrectos}. ID Acceso: ${galeriaInfo.id}`);


        if (!s3Client || !BUCKET_NAME) {
            console.error("Error crítico: S3 Client o BUCKET_NAME no están configurados al intentar obtener imágenes.");
            return res.status(500).json({ success: false, message: 'Error de configuración del servidor para S3.' });
        }

        const listParams = { Bucket: BUCKET_NAME, Prefix: galeriaInfo.prefijo_s3 };
        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
            return res.json({ success: true, imagenes: [], tituloGaleria: galeriaInfo.descripcion_galeria, message: 'Galería vacía.', idAcceso: galeriaInfo.id });
        }

        const promesasDeUrls = listedObjects.Contents
            .filter(obj => obj.Key && !obj.Key.endsWith('/') && obj.Size > 0)
            .map(async (obj) => {
                const key = obj.Key;
                const fileName = key.substring(key.lastIndexOf('/') + 1);
                const getViewCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
                const viewUrl = await getSignedUrl(s3Client, getViewCommand, { expiresIn: 3600 });
                // Para la descarga directa desde la galería (no la editada), se usa una URL firmada que sugiere el nombre
                const getDownloadDirectCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"`});
                const downloadUrl = await getSignedUrl(s3Client, getDownloadDirectCommand, { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName };
            });
        const imagenesConUrls = await Promise.all(promesasDeUrls);
        // Devolver también el id de acceso para que el frontend lo pueda usar al registrar interacciones
        res.json({ success: true, imagenes: imagenesConUrls, tituloGaleria: galeriaInfo.descripcion_galeria, idAcceso: galeriaInfo.id });
    } catch (error) {
        console.error("Error en /acceder-galeria-privada:", error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});

app.post('/procesar-y-descargar-imagen', async (req, res) => {
    const { originalWasabiUrl, edits, originalName } = req.body;

    if (!originalWasabiUrl || !edits) {
        return res.status(400).json({ success: false, message: "Faltan parámetros: URL original de Wasabi y/o ediciones." });
    }

    try {
        console.log("--- INICIO /procesar-y-descargar-imagen ---");
        console.log("Backend: Procesar y descargar. URL (base):", originalWasabiUrl.substring(0, originalWasabiUrl.indexOf('?') > -1 ? originalWasabiUrl.indexOf('?') : originalWasabiUrl.length) + "...");
        console.log("Backend: Ediciones recibidas (edits object):", JSON.stringify(edits, null, 2));

        const imageResponse = await axios({
            url: originalWasabiUrl, method: 'GET', responseType: 'arraybuffer'
        });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        console.log("Backend: Imagen original descargada de Wasabi.");

        let imageProcessor = sharp(imageBuffer);
        const metadata = await imageProcessor.metadata();

        // 1. Aplicar ajustes básicos de sliders
        if (edits.brightness !== undefined && parseFloat(edits.brightness) !== 1) {
            imageProcessor = imageProcessor.modulate({ brightness: parseFloat(edits.brightness) });
            console.log("Aplicado brillo:", edits.brightness);
        }
        if (edits.contrast !== undefined && parseFloat(edits.contrast) !== 1) {
            const contrastValue = parseFloat(edits.contrast);
            imageProcessor = imageProcessor.linear(contrastValue, (1 - contrastValue) * 128);
            console.log("Aplicado contraste:", edits.contrast);
        }
        if (edits.saturate !== undefined && parseFloat(edits.saturate) !== 1) {
            imageProcessor = imageProcessor.modulate({ saturation: parseFloat(edits.saturate) });
            console.log("Aplicado saturación:", edits.saturate);
            if (parseFloat(edits.saturate) === 0) {
                console.log("INFO: Saturación a 0 convertirá la imagen a B&N.");
            }
        }
        
        // 2. Aplicar Viñeta (si está activa y configurada)
        if (edits.vignetteIntensity !== undefined && edits.vignetteIntensity > 0 && metadata.width && metadata.height) {
            const intensity = parseFloat(edits.vignetteIntensity);
            const vignetteAmount = intensity / 100;
            const innerCircleStopPercent = Math.max(20, 100 - vignetteAmount * 70);
            const outerOpacity = Math.min(0.8, vignetteAmount * 0.8);
            const vignetteOverlaySvg = `
                <svg width="${metadata.width}" height="${metadata.height}">
                    <defs>
                        <radialGradient id="vignetteGrad" cx="50%" cy="50%" r="70%" fx="50%" fy="50%">
                            <stop offset="${innerCircleStopPercent}%" stop-color="white" stop-opacity="0" /> 
                            <stop offset="100%" stop-color="black" stop-opacity="${outerOpacity}" />
                        </radialGradient>
                    </defs>
                    <rect x="0" y="0" width="${metadata.width}" height="${metadata.height}" fill="url(#vignetteGrad)"/>
                </svg>`;
            try {
                imageProcessor = imageProcessor.composite([{ input: Buffer.from(vignetteOverlaySvg), blend: 'multiply' }]);
                console.log(`Backend: Aplicando Viñeta SVG. Intensidad: ${intensity}`);
            } catch (vignetteError) { console.error("Error al aplicar viñeta con Sharp:", vignetteError); }
        }

        // 3. Aplicar filtros nombrados y efectos de color finales
        if (edits.activeNamedFilter && edits.activeNamedFilter !== 'original') {
            console.log(`Backend: Procesando filtro nombrado: ${edits.activeNamedFilter}`);
            switch (edits.activeNamedFilter) {
                case 'grayscale':
                case 'bw_intenso':
                case 'noir_look':
                    console.log(`Aplicando filtro B&N: ${edits.activeNamedFilter}`);
                    imageProcessor = imageProcessor.grayscale();
                    if (edits.activeNamedFilter === 'noir_look') {
                        imageProcessor = imageProcessor.sharpen(0.5);
                    }
                    break;

                case 'sepia':
                case 'vintage_suave':
                case 'valencia_filter':
                    console.log(`Aplicando filtro Sepia: ${edits.activeNamedFilter}`);
                    imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    if (edits.activeNamedFilter === 'vintage_suave') {
                        imageProcessor = imageProcessor.gamma(1.05);
                    }
                    break;

                case 'calido':
                    console.log("Aplicando filtro Cálido");
                    imageProcessor = imageProcessor.tint({ r: 255, g: 230, b: 190 });
                    break;
                case 'frio':
                    console.log("Aplicando filtro Frío");
                    imageProcessor = imageProcessor.tint({ r: 200, g: 220, b: 255 });
                    break;
                case 'kodak_gold':
                    console.log("Aplicando filtro Kodak Gold");
                    imageProcessor = imageProcessor.tint({r:255, g:220, b:170}).modulate({ hue: -5 });
                    break;
                case 'mate_look':
                    console.log("Aplicando filtro Mate Look");
                    imageProcessor = imageProcessor.gamma(1.15);
                    break;
                case 'aden_filter':
                    console.log("Aplicando filtro Aden");
                    imageProcessor = imageProcessor.modulate({ hue: -10 }).tint({r: 225, g:205, b:215 });
                    break;
                case 'teal_orange':
                    console.log("Aplicando filtro Teal & Orange");
                    imageProcessor = imageProcessor.modulate({ hue: 15 });
                    break;
                case 'cinematic_look':
                    console.log("Aplicando filtro Cinematic Look");
                    imageProcessor = imageProcessor.sharpen(0.3);
                    break;
                default:
                    console.log(`Filtro nombrado '${edits.activeNamedFilter}' no reconocido en switch. Verificando flags directos.`);
                    if (edits.grayscale) { // `edits.grayscale` es un booleano del cliente
                        console.log("Fallback (default del switch) a grayscale porque edits.grayscale es true.");
                        imageProcessor = imageProcessor.grayscale();
                    } else if (edits.sepia) { // `edits.sepia` es un booleano del cliente
                        console.log("Fallback (default del switch) a sepia porque edits.sepia es true.");
                        imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    }
                    break;
            }
        } else { // 'original' o sin filtro nombrado activo
            console.log("Procesando como 'original' o solo con sliders (sin filtro nombrado activo).");
            if (edits.grayscale) { 
                console.log("Aplicando grayscale porque edits.grayscale es true (filtro 'original' o sin filtro).");
                imageProcessor = imageProcessor.grayscale();
            } else if (edits.sepia) { 
                console.log("Aplicando sepia porque edits.sepia es true (filtro 'original' o sin filtro).");
                imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
            } else {
                 console.log("Modo 'original' sin grayscale/sepia explícito. La imagen debería ser a color (modificada solo por sliders y saturación).");
            }
        }

        console.log("Backend: Todas las ediciones aplicadas con Sharp.");
        const processedImageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();
        
        const fileName = `editada_${originalName || 'imagen_JonyLager.jpg'}`;
        res.set({ 
            'Content-Type': 'image/jpeg', 
            'Content-Disposition': `attachment; filename="${fileName}"` 
        });
        res.send(processedImageBuffer);
        console.log(`Backend: Imagen editada '${fileName}' enviada.`);
        console.log("--- FIN /procesar-y-descargar-imagen ---");

    } catch (error) {
        console.error("Error al procesar o descargar la imagen:", error);
        let errorMessage = "Error al procesar la imagen en el servidor.";
        if (error.isAxiosError && error.response) errorMessage = `Error al descargar imagen de origen (status ${error.response.status}).`;
        else if (error.message && error.message.toLowerCase().includes('input buffer contains unsupported image format')) errorMessage = "Error: Formato de imagen no soportado.";
        else if (error.message) errorMessage = error.message;
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.post('/registrar-interaccion-edicion', async (req, res) => {
    const {
        idAcceso, 
        nombre_imagen_original,
        filtro_aplicado,
        valor_filtro_inicial,
        valor_filtro_final,
        es_descarga_editada = false
    } = req.body;

    if (idAcceso === undefined || !nombre_imagen_original || !filtro_aplicado) {
        console.warn("Faltan datos cruciales (idAcceso, nombre_imagen_original, filtro_aplicado) para registrar interacción:", req.body);
        return res.status(400).json({ success: false, message: 'Faltan datos para registrar la interacción.' });
    }

    console.log("Backend: Registrando interacción:", { idAcceso, nombre_imagen_original, filtro_aplicado, valor_filtro_final, es_descarga_editada});

    try {
        const queryText = `
            INSERT INTO interacciones_edicion 
                (id_acceso_galeria, nombre_imagen_original, filtro_aplicado, valor_filtro_inicial, valor_filtro_final, es_descarga_editada, timestamp_interaccion)
            VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id;
        `;
        const result = await pool.query(queryText, [
            idAcceso,
            nombre_imagen_original,
            filtro_aplicado, 
            JSON.stringify(valor_filtro_inicial), // Asumiendo que quieres guardarlos como JSON strings
            JSON.stringify(valor_filtro_final),   // Asumiendo que quieres guardarlos como JSON strings
            es_descarga_editada
        ]);
        console.log("Interacción de edición registrada con ID:", result.rows[0].id);
        res.status(201).json({ success: true, message: 'Interacción registrada.' });
    } catch (error) {
        console.error("Error al registrar interacción de edición en BD:", error);
        res.status(500).json({ success: false, message: 'Error interno al registrar la interacción.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Tu sitio web está en: http://localhost:${PORT}`);
    console.log(`CliPremium está en: http://localhost:${PORT}/clipremium.html`);
});