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
}

const pool = new Pool({
    connectionString: DATABASE_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false } 
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
        
        const esCodigoValido = (codigo_acceso_galeria === galeriaInfo.codigo_acceso_galeria); 
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
                const getDownloadDirectCommand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key, ResponseContentDisposition: `attachment; filename="${fileName}"`});
                const downloadUrl = await getSignedUrl(s3Client, getDownloadDirectCommand, { expiresIn: 3600 });
                return { viewUrl, downloadUrl, originalName: fileName };
            });
        const imagenesConUrls = await Promise.all(promesasDeUrls);
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
        console.log("Backend: Ediciones recibidas (edits object):", JSON.stringify(edits, null, 2)); 

        const imageResponse = await axios({
            url: originalWasabiUrl, method: 'GET', responseType: 'arraybuffer'
        });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        console.log("Backend: Imagen original descargada de Wasabi.");

        let imageProcessor = sharp(imageBuffer);
        const metadata = await imageProcessor.metadata();
        console.log("Backend: Metadatos de imagen obtenidos.");

        if (edits.brightness !== undefined && parseFloat(edits.brightness) !== 1) {
            imageProcessor = imageProcessor.modulate({ brightness: parseFloat(edits.brightness) });
            console.log("Slider: Aplicado brillo:", edits.brightness);
        }
        if (edits.contrast !== undefined && parseFloat(edits.contrast) !== 1) {
            const contrastValue = parseFloat(edits.contrast);
            imageProcessor = imageProcessor.linear(contrastValue, (1 - contrastValue) * 128);
            console.log("Slider: Aplicado contraste:", edits.contrast);
        }
        
        if (edits.saturate !== undefined && parseFloat(edits.saturate) !== 1) {
            const saturationValue = parseFloat(edits.saturate);
            imageProcessor = imageProcessor.modulate({ saturation: saturationValue });
            console.log("Slider: Aplicado saturación:", saturationValue);
            if (saturationValue === 0) {
                console.log("ALERTA: Imagen convertida a B&N por saturación del slider a 0.");
            }
        } else {
            console.log("Slider: Saturación no modificada o en valor neutro (1).");
        }
        
        if (edits.vignetteIntensity !== undefined && edits.vignetteIntensity > 0 && metadata.width && metadata.height) {
            // ... (lógica de viñeta)
        }

        if (edits.activeNamedFilter && edits.activeNamedFilter !== 'original') {
            console.log(`Backend: Procesando filtro nombrado: ${edits.activeNamedFilter}`);
            let filterAppliedSuccessfully = false; // Para logueo
            switch (edits.activeNamedFilter) {
                case 'grayscale':
                case 'bw_intenso':
                case 'noir_look':
                    console.log(`Filtro Nombrado: ${edits.activeNamedFilter} (B&N). Forzando grayscale.`);
                    imageProcessor = imageProcessor.grayscale(); 
                    if (edits.activeNamedFilter === 'noir_look') imageProcessor = imageProcessor.sharpen(0.5);
                    filterAppliedSuccessfully = true;
                    break;

                case 'sepia': 
                    console.log(`Filtro Nombrado: ${edits.activeNamedFilter} (Sepia Puro). Forzando grayscale y tinte sepia.`);
                    imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    filterAppliedSuccessfully = true;
                    break;
                
                case 'vintage_suave': 
                    console.log(`Filtro Nombrado: ${edits.activeNamedFilter}. Aplicando tinte suave y gamma.`);
                    // Asumiendo que los sliders (saturate: 0.9, etc.) ya se aplicaron y la imagen es color.
                    imageProcessor = imageProcessor.tint({ r: 255, g: 245, b: 225 }); 
                    imageProcessor = imageProcessor.gamma(1.05);
                    filterAppliedSuccessfully = true;
                    break;

                case 'valencia_filter': 
                    console.log(`Filtro Nombrado: ${edits.activeNamedFilter}. Aplicando tinte cálido.`);
                    imageProcessor = imageProcessor.tint({ r: 255, g: 230, b: 210 }); 
                    filterAppliedSuccessfully = true;
                    break;

                case 'calido':
                    console.log("Filtro Nombrado: Cálido");
                    imageProcessor = imageProcessor.tint({ r: 255, g: 230, b: 190 });
                    filterAppliedSuccessfully = true;
                    break;
                // ... (otros casos de filtros de color) ...
                case 'aden_filter':
                    console.log("Filtro Nombrado: Aden - Prueba Simplificada");
                    // La imagen ya debería tener 85% de saturación por el slider.
                    // Vamos a aplicar solo un tinte muy ligero para ver si el color se mantiene.
                    // Si esto funciona (sale a color con este tinte), el problema está en la combinación original de modulate(hue) y el tinte más complejo.
                    imageProcessor = imageProcessor.tint({ r: 240, g: 230, b: 235 }); // Tinte de prueba muy ligero, ligeramente frío/rosado
                    console.log("Aden (Prueba): Aplicado SOLO un tinte ligero. Hue original (-10 o -20) y tinte anterior ({r:225,g:205,b:215}) omitidos para esta prueba.");
                    // La definición original era: imageProcessor.modulate({ hue: -10 }).tint({r: 225, g:205, b:215 });
                    filterAppliedSuccessfully = true;
                    break;

                case 'cinematic_look': 
                    console.log("Filtro Nombrado: Cinematic Look");
                    imageProcessor = imageProcessor.sharpen(0.3);
                    if (edits.sepia) { 
                        console.log("INFO: 'cinematic_look' con edits.sepia=true, aplicando un tinte sepia muy ligero.");
                        imageProcessor = imageProcessor.tint({r: 245, g: 240, b: 230}); 
                    }
                    filterAppliedSuccessfully = true;
                    break;
                default:
                    console.log(`Filtro nombrado '${edits.activeNamedFilter}' no reconocido en switch. Verificando flags directos de edits.`);
                    if (edits.grayscale) {
                        imageProcessor = imageProcessor.grayscale();
                    } else if (edits.sepia) { 
                        imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
                    }
                    break;
            }
            if(filterAppliedSuccessfully) console.log(`Procesamiento para ${edits.activeNamedFilter} completado.`);

        } else { 
            console.log("Procesando como 'original' (sin filtro nombrado activo).");
            if (edits.grayscale) { 
                imageProcessor = imageProcessor.grayscale();
            } else if (edits.sepia) { 
                imageProcessor = imageProcessor.grayscale().tint({ r: 112, g: 66, b: 20 });
            } else {
                 console.log("Modo 'original' sin grayscale/sepia explícito.");
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
        // ... (manejo de errores)
        let errorMessage = "Error al procesar la imagen en el servidor.";
        if (error.isAxiosError && error.response) errorMessage = `Error al descargar imagen de origen (status ${error.response.status}).`;
        else if (error.message && error.message.toLowerCase().includes('input buffer contains unsupported image format')) errorMessage = "Error: Formato de imagen no soportado.";
        else if (error.message) errorMessage = error.message;
        res.status(500).json({ success: false, message: errorMessage });
    }
});

app.post('/registrar-interaccion-edicion', async (req, res) => {
    // ... (código de esta ruta sin cambios)
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
            JSON.stringify(valor_filtro_inicial), 
            JSON.stringify(valor_filtro_final),   
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