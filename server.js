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
// Asegúrate que esta sea tu cadena de conexión correcta o que uses process.env.DATABASE_URL en producción
const DATABASE_CONNECTION_STRING = "postgresql://wrtk_user:1wBzUu8K1rO3n7w2KOTc8pPnyyPtoVJ0@dpg-d0l7en3e5dus73cbcvb0-a.oregon-postgres.render.com/wrtk"; 
if (!DATABASE_CONNECTION_STRING) {
    console.error("¡ERROR CRÍTICO! DATABASE_CONNECTION_STRING está vacía.");
    // Considera process.exit(1) si no puedes funcionar sin BD
} else {
    // No es necesario el console.log de hardcodeado si usas .env para local y Render para producción
    // console.log("Usando DATABASE_CONNECTION_STRING."); 
}
const pool = new Pool({ connectionString: DATABASE_CONNECTION_STRING, ssl: { rejectUnauthorized: false } });
pool.connect().then(() => console.log('Conexión a PostgreSQL establecida.')).catch(err => console.error('Error de conexión a PostgreSQL:', err.stack));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MAX_FAILED_ATTEMPTS_PER_USER = 10; // Definido globalmente
const LOCKOUT_DURATION_MINUTES = 15; // Definido globalmente

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
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria); // Asumiendo texto plano por ahora
        // const esCodigoValido = await bcrypt.compare(codigo_acceso_galeria, galeriaInfo.codigo_acceso_galeria); // Si usaras bcrypt
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
                // Guardar el nombre original del archivo para usarlo en el frontend
                const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"`}), { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName }; // Enviar originalName
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
        const imageBuffer = Buffer.from(imageResponse.data); // No es necesario 'binary' aquí
        console.log("SRV: Imagen original descargada.");
        let imageProcessor = sharp(imageBuffer);
        const metadata = await imageProcessor.metadata();
        console.log("SRV: Metadatos obtenidos.");

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
        
        // La viñeta la eliminamos porque no estaba en tu script.js provisto
        // if (edits.vignetteIntensity !== undefined && edits.vignetteIntensity > 0 && metadata && metadata.width && metadata.height) {
        // ... lógica de viñeta ...
        // }

        if (edits.activeNamedFilter && edits.activeNamedFilter !== 'original') {
            console.log(`SRV: Filtro Nombrado Activo: ${edits.activeNamedFilter}`);
            switch (edits.activeNamedFilter) {
                case 'grayscale':
                case 'bw_intenso':
                case 'noir_look':
                    imageProcessor = imageProcessor.grayscale();
                    if (edits.activeNamedFilter === 'noir_look') imageProcessor = imageProcessor.sharpen(0.5);
                    // El contraste para bw_intenso y noir_look ya se aplicó con el slider
                    console.log(`SRV: Aplicado ${edits.activeNamedFilter} (forzado a grayscale).`);
                    break;
                case 'sepia': 
                    imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 }); // Sepia estándar
                    console.log("SRV: Aplicado Sepia (puro).");
                    break;
                case 'vintage_suave':
                    imageProcessor = imageProcessor.tint({ r: 255, g: 240, b: 220 }); // Tinte cálido muy suave
                    if (edits.sepia) { // Si el cliente también marcó sepia (improbable con la lógica actual)
                         imageProcessor = imageProcessor.tint({ r: 112, g: 66, b: 20 }); // Priorizar sepia puro si se envía
                    }
                    console.log("SRV: Aplicado Vintage Suave.");
                    break;
                case 'valencia_filter':
                    if (edits.sepia) { // Si el cliente lo pide por el CSS sepia(8%)
                        imageProcessor = imageProcessor.tint({ r: 255, g: 225, b: 204 }); // Tinte naranja/amarillo pálido
                    }
                    console.log("SRV: Aplicado Valencia.");
                    break;
                case 'calido':
                    if (edits.sepia) { // Si el cliente lo pide por el CSS sepia(15%)
                         imageProcessor = imageProcessor.tint({r:255, g:220, b:170}); // Tinte anaranjado
                    } else {
                        imageProcessor = imageProcessor.modulate({ hue: -6 }); // Ligeramente hacia rojos/amarillos
                    }
                    console.log("SRV: Aplicado Cálido.");
                    break;
                case 'frio':
                    if (edits.hueRotate !== undefined && edits.hueRotate !== 0) {
                        imageProcessor = imageProcessor.modulate({ hue: parseFloat(edits.hueRotate) }); 
                    }
                    // Opcional: un tinte azulado muy leve
                    // imageProcessor = imageProcessor.tint({ r: 220, g: 230, b: 255 });
                    console.log("SRV: Aplicado Frío.");
                    break;
                case 'kodak_gold':
                    imageProcessor = imageProcessor.modulate({ hue: -8 });
                    if (edits.sepia) { // Si el cliente lo pide por el CSS sepia(10%)
                        imageProcessor = imageProcessor.tint({r:255, g:230, b:190}); // Tinte sepia cálido
                    }
                    console.log("SRV: Aplicado Kodak Gold.");
                    break;
                case 'mate_look': 
                    imageProcessor = imageProcessor.gamma(1.15);
                    console.log("SRV: Aplicado Mate Look.");
                    break;
                case 'aden_filter':
                    if (edits.hueRotate !== undefined && edits.hueRotate !== 0) {
                         imageProcessor = imageProcessor.modulate({ hue: parseFloat(edits.hueRotate) });
                    }
                    // Podrías añadir un tinte rosado/púrpura muy sutil si el hue-rotate no es suficiente
                    // imageProcessor = imageProcessor.tint({ r: 225, g: 205, b: 215 });
                    console.log("SRV: Aplicado Aden.");
                    break;
                case 'teal_orange':
                    // Este filtro es más complejo de replicar fielmente solo con Sharp básico.
                    // Se necesitaría manipulación de canales o LUTs para un buen resultado.
                    // Una aproximación muy simple:
                    imageProcessor = imageProcessor.modulate({ hue: 15 }); // Virar un poco hacia naranjas y cianes
                    console.log("SRV: Aplicado Teal & Orange (básico).");
                    break;
                case 'cinematic_look':
                    imageProcessor = imageProcessor.sharpen(0.3);
                    if (edits.sepia) { // Si el cliente lo pide por el CSS sepia(5%)
                        imageProcessor = imageProcessor.tint({r: 255, g: 245, b: 230}); // Tinte cálido muy sutil
                    }
                    console.log("SRV: Aplicado Cinematic Look.");
                    break;
                default:
                    console.log(`SRV: Filtro Nombrado '${edits.activeNamedFilter}' no específicamente manejado. Usando sliders y flags directos.`);
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

// === NUEVO ENDPOINT PARA REGISTRAR DESCARGAS EN 'registros_descargas' ===
app.post('/registrar-descarga-final', async (req, res) => { // Cambiado el nombre del endpoint
    const {
        idAcceso, 
        nombreUsuarioGaleria, 
        nombreImagenOriginal,
        configuracionEdicion 
    } = req.body;

    if (idAcceso === undefined || idAcceso === null || !nombreImagenOriginal || !configuracionEdicion) {
        console.warn("Intento de registrar descarga con datos faltantes:", req.body);
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan datos para registrar la descarga (idAcceso, nombreImagenOriginal, configuracionEdicion son requeridos).' 
        });
    }

    let nombreUsuarioGaleriaParaGuardar = nombreUsuarioGaleria || null; 
    if (idAcceso && !nombreUsuarioGaleriaParaGuardar) {
        try {
            const userQuery = await pool.query('SELECT nombre_usuario_galeria FROM accesos_galerias WHERE id = $1', [idAcceso]);
            if (userQuery.rows.length > 0) {
                nombreUsuarioGaleriaParaGuardar = userQuery.rows[0].nombre_usuario_galeria;
            }
        } catch (dbError) {
            console.error("Error buscando nombre_usuario_galeria para log:", dbError);
        }
    }

    console.log("Backend: Registrando descarga en tabla 'registros_descargas':", { 
        idAcceso, 
        nombreUsuarioGaleria: nombreUsuarioGaleriaParaGuardar, 
        nombreImagenOriginal, 
        configuracionEdicion 
    });

    try {
        const queryText = `
            INSERT INTO registros_descargas
                (id_acceso_galeria, nombre_usuario_galeria, nombre_imagen_original, configuracion_edicion, timestamp_descarga)
            VALUES ($1, $2, $3, $4, NOW()) RETURNING id;
        `;
        
        const result = await pool.query(queryText, [
            idAcceso,
            nombreUsuarioGaleriaParaGuardar,
            nombreImagenOriginal,
            configuracionEdicion 
        ]);
        
        if (result.rows.length > 0) {
            console.log("Descarga registrada con ID en 'registros_descargas':", result.rows[0].id);
            res.status(201).json({ success: true, message: 'Descarga registrada exitosamente.' });
        } else {
            throw new Error("No se retornó ID después de la inserción en registros_descargas.");
        }
    } catch (error) {
        console.error("Error al registrar descarga en BD ('registros_descargas'):", error);
        res.status(500).json({ success: false, message: 'Error interno al registrar la descarga.' });
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});