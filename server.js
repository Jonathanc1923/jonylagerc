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
    require('dotenv').config(); // Carga .env solo si no está en producción
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
        console.warn("Advertencia: wasabi_config.json no encontrado. Usando variables de entorno si están definidas.");
    }
} catch (error) {
    console.error("Error al cargar wasabi_config.json:", error.message);
}
const WASABI_ACCESS_KEY_ID = process.env.WASABI_ACCESS_KEY_ID || wasabiConfig.WASABI_ACCESS_KEY_ID;
const WASABI_SECRET_ACCESS_KEY = process.env.WASABI_SECRET_ACCESS_KEY || wasabiConfig.WASABI_SECRET_ACCESS_KEY;
const WASABI_REGION = process.env.WASABI_REGION || wasabiConfig.WASABI_REGION || "us-central-1"; // Default si no está en config
const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT || (WASABI_REGION ? `https://s3.${WASABI_REGION}.wasabisys.com` : null);
const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || wasabiConfig.WASABI_BUCKET_NAME;
let s3Client;
if (WASABI_ENDPOINT && WASABI_REGION && WASABI_ACCESS_KEY_ID && WASABI_SECRET_ACCESS_KEY && BUCKET_NAME) {
    s3Client = new S3Client({ 
        endpoint: WASABI_ENDPOINT, 
        region: WASABI_REGION, 
        credentials: { 
            accessKeyId: WASABI_ACCESS_KEY_ID, 
            secretAccessKey: WASABI_SECRET_ACCESS_KEY 
        } 
    });
    console.log("Cliente S3 para Wasabi configurado.");
} else {
    console.error("¡ERROR CRÍTICO! Faltan datos para la configuración del Cliente S3 para Wasabi. Revisa tus variables de entorno o wasabi_config.json.");
}

// --- DB Config ---
// Para Render, es MEJOR usar process.env.DATABASE_URL que Render provee automáticamente.
// Esta línea hardcodeada es tu fallback para local si no usas .env
const DATABASE_CONNECTION_STRING = process.env.DATABASE_URL || "postgresql://wrtk_user:1wBzUu8K1rO3n7w2KOTc8pPnyyPtoVJ0@dpg-d0l7en3e5dus73cbcvb0-a.oregon-postgres.render.com/wrtk"; 

if (!DATABASE_CONNECTION_STRING) {
    console.error("¡ERROR CRÍTICO! DATABASE_CONNECTION_STRING no está definida.");
    // En un caso real, aquí podrías querer terminar la aplicación: process.exit(1);
}
const pool = new Pool({ 
    connectionString: DATABASE_CONNECTION_STRING, 
    ssl: { rejectUnauthorized: false } // Necesario para conexiones a Render
});
pool.connect()
    .then(() => console.log('Conexión a PostgreSQL establecida exitosamente.'))
    .catch(err => console.error('Error CRÍTICO de conexión a PostgreSQL:', err.stack));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Para parsear cuerpos de petición JSON
app.use(express.urlencoded({ extended: true })); // Para parsear cuerpos de formularios URL-encoded

const MAX_FAILED_ATTEMPTS_PER_USER = 10;
const LOCKOUT_DURATION_MINUTES = 15;

// Ruta para acceder a galerías privadas (sin cambios funcionales aquí)
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
        
        // Compara el código de acceso. Si usas bcrypt, descomenta la línea de bcrypt.
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria); // Para texto plano
        // const esCodigoValido = await bcrypt.compare(codigo_acceso_galeria, galeriaInfo.codigo_acceso_galeria); // Para bcrypt
        
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
        const nuevosIngresosCorrectos = (galeriaInfo.ingresos_correctos || 0) + 1; // Asegurar que no sea null
        await pool.query('UPDATE accesos_galerias SET intentos_fallidos = 0, bloqueado_hasta = NULL, ingresos_correctos = $1 WHERE id = $2', [nuevosIngresosCorrectos, galeriaInfo.id]);
        console.log(`Login exitoso para ${nombre_usuario_galeria}. ID Acceso: ${galeriaInfo.id}. Ingresos: ${nuevosIngresosCorrectos}`);
        
        if (!s3Client || !BUCKET_NAME) return res.status(500).json({ success: false, message: 'Error de configuración del servidor para S3.' });
        
        const listParams = { Bucket: BUCKET_NAME, Prefix: galeriaInfo.prefijo_s3 };
        const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));
        if (!listedObjects.Contents || listedObjects.Contents.length === 0) return res.json({ success: true, imagenes: [], tituloGaleria: galeriaInfo.descripcion_galeria, message: 'Galería vacía.', idAcceso: galeriaInfo.id });
        
        const promesasDeUrls = listedObjects.Contents.filter(obj => obj.Key && !obj.Key.endsWith('/') && obj.Size > 0)
            .map(async (obj) => { 
                const key = obj.Key; 
                const fileName = key.substring(key.lastIndexOf('/') + 1);
                const viewUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 3600 });
                const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"`}), { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName };
            });
        const imagenesConUrls = await Promise.all(promesasDeUrls);
        res.json({ success: true, imagenes: imagenesConUrls, tituloGaleria: galeriaInfo.descripcion_galeria, idAcceso: galeriaInfo.id });
    } catch (error) { 
        console.error("Error en /acceder-galeria-privada:", error); 
        res.status(500).json({ success: false, message: 'Error interno del servidor.' }); 
    }
});

// Ruta para procesar y descargar imágenes (sin cambios funcionales aquí)
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
        // const metadata = await imageProcessor.metadata(); // Necesario solo si usas viñeta SVG con dimensiones
        // console.log("SRV: Metadatos obtenidos.");

        if (edits.brightness !== undefined && parseFloat(edits.brightness) !== 1) {
            imageProcessor = imageProcessor.modulate({ brightness: parseFloat(edits.brightness) });
        }
        if (edits.contrast !== undefined && parseFloat(edits.contrast) !== 1) {
            const contrastValue = parseFloat(edits.contrast);
            imageProcessor = imageProcessor.linear(contrastValue, (1 - contrastValue) * 128);
        }
        if (edits.saturate !== undefined && parseFloat(edits.saturate) !== 1) {
            imageProcessor = imageProcessor.modulate({ saturation: parseFloat(edits.saturate) });
        }
        
        // Lógica de filtros nombrados
        if (edits.activeNamedFilter && edits.activeNamedFilter !== 'original') {
            console.log(`SRV: Procesando filtro nombrado para Sharp: ${edits.activeNamedFilter}`);
            // Tu lógica de switch para aplicar filtros con Sharp va aquí
            // (basada en la que tenías, ajustada a los valores de 'edits')
            switch (edits.activeNamedFilter) {
                case 'grayscale': case 'bw_intenso': case 'noir_look':
                    imageProcessor = imageProcessor.grayscale();
                    if (edits.activeNamedFilter === 'noir_look') imageProcessor = imageProcessor.sharpen(0.5);
                    // El contraste para bw_intenso/noir_look ya se maneja por el slider de contraste general
                    break;
                case 'sepia': case 'vintage_suave': case 'valencia_filter': // Estos filtros implican un tinte sepia
                    imageProcessor = imageProcessor.grayscale().tint(edits.cssSepiaPercentage >= 50 ? { r: 112, g: 66, b: 20 } : { r: 140 - (edits.cssSepiaPercentage*0.6), g: 90 - (edits.cssSepiaPercentage*0.5), b: 40 - (edits.cssSepiaPercentage*0.4) } ); // Aproximación
                    if (edits.activeNamedFilter === 'vintage_suave') imageProcessor = imageProcessor.gamma(1.05);
                    break;
                case 'calido': imageProcessor = imageProcessor.tint(edits.cssSepiaPercentage > 0 ? {r:255, g:220, b:170} : { r: 255, g: 230, b: 190 }); break; // Ejemplo, ajustar tinte
                case 'frio': imageProcessor = imageProcessor.modulate({ hue: parseFloat(edits.cssHueRotateDegrees) || 0 }); break; // Usa el hue-rotate
                case 'kodak_gold': imageProcessor = imageProcessor.modulate({ hue: parseFloat(edits.cssHueRotateDegrees) || -8 }); if (edits.cssSepiaPercentage > 0) imageProcessor = imageProcessor.tint({r:255, g:230, b:190}); break;
                case 'mate_look': imageProcessor = imageProcessor.gamma(1.15); break;
                case 'aden_filter': imageProcessor = imageProcessor.modulate({ hue: parseFloat(edits.cssHueRotateDegrees) || -20 }); break;
                case 'teal_orange': imageProcessor = imageProcessor.modulate({ hue: 15 }); break; // Simplificado
                case 'cinematic_look': imageProcessor = imageProcessor.sharpen(0.3); if (edits.cssSepiaPercentage > 0) imageProcessor = imageProcessor.tint({r: 255, g: 245, b: 230}); break;
                default:
                    if (edits.grayscale) imageProcessor = imageProcessor.grayscale();
                    else if (edits.sepia) imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    break;
            }
        } else { 
            if (edits.grayscale) imageProcessor = imageProcessor.grayscale();
            else if (edits.sepia) imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
        }

        const processedImageBuffer = await imageProcessor.jpeg({ quality: 90 }).toBuffer();
        const fileName = `editada_${originalName || 'imagen_JonyLager.jpg'}`;
        res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${fileName}"` });
        res.send(processedImageBuffer);
        console.log(`SRV: Imagen editada '${fileName}' enviada.`);
        console.log("--- FIN /procesar-y-descargar-imagen ---");
    } catch (error) { /* ... (tu manejo de error) ... */ }
});

// === ENDPOINT ANTIGUO PARA REGISTRAR INTERACCIONES (COMENTADO/ELIMINADO) ===
/*
app.post('/registrar-interaccion-edicion', async (req, res) => {
    // ... Lógica de la tabla interacciones_edicion que ya no se usará para descargas ...
    // console.log("Backend: /registrar-interaccion-edicion llamado (AHORA OBSOLETO PARA DESCARGAS)");
    // res.status(404).json({success: false, message: "Endpoint obsoleto, usar /registrar-descarga-final"});
});
*/

// === NUEVO ENDPOINT PARA REGISTRAR DESCARGAS EN 'registros_descargas' ===
app.post('/registrar-descarga-final', async (req, res) => {
    const {
        idAcceso, 
        nombreUsuarioGaleria, 
        nombreImagenOriginal,
        configuracionEdicion 
    } = req.body;

    if (idAcceso === undefined || idAcceso === null || !nombreImagenOriginal || !configuracionEdicion) {
        console.warn("REGISTRO DESCARGA: Datos faltantes:", req.body);
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan datos para registrar la descarga (idAcceso, nombreImagenOriginal, configuracionEdicion son requeridos).' 
        });
    }

    let nombreUsuarioGaleriaParaGuardar = nombreUsuarioGaleria || null; 
    if (idAcceso && !nombreUsuarioGaleriaParaGuardar) { // Intentar obtenerlo si no se envió
        try {
            const userQuery = await pool.query('SELECT nombre_usuario_galeria FROM accesos_galerias WHERE id = $1', [idAcceso]);
            if (userQuery.rows.length > 0) {
                nombreUsuarioGaleriaParaGuardar = userQuery.rows[0].nombre_usuario_galeria;
            } else {
                 console.warn(`REGISTRO DESCARGA: No se encontró nombre_usuario_galeria para idAcceso: ${idAcceso}`);
            }
        } catch (dbError) {
            console.error("REGISTRO DESCARGA: Error buscando nombre_usuario_galeria:", dbError);
        }
    }

    console.log("Backend: Registrando descarga en 'registros_descargas':", { 
        idAcceso, 
        nombreUsuarioGaleria: nombreUsuarioGaleriaParaGuardar, 
        nombreImagenOriginal, 
        // configuracionEdicion // No loguear el objeto completo en consola si es muy grande
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
            configuracionEdicion // Pasar el objeto JS directamente, pg lo maneja para JSONB
        ]);
        
        if (result.rows.length > 0) {
            console.log("Descarga registrada con ID en 'registros_descargas':", result.rows[0].id);
            // Enviar una respuesta de éxito pero sin contenido necesariamente, 
            // ya que el frontend no espera un cuerpo de respuesta para esto.
            res.status(201).json({ success: true, message: 'Descarga registrada exitosamente.', registroId: result.rows[0].id });
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