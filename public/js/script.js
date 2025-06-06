// public/js/script.js

// --- Variables Globales para Lightbox y Edición ---
let galeriaActivaLightbox = [];
let indiceActualLightbox = 0;
const lightboxElement = document.getElementById('lightbox');
const imagenLightboxElement = document.getElementById('imagen-lightbox');
const tituloLightboxElement = document.getElementById('titulo-lightbox');
const cerrarLightboxBtn = lightboxElement ? lightboxElement.querySelector('.cerrar-lightbox') : null;
const controlPrevLightbox = lightboxElement ? lightboxElement.querySelector('.lightbox-control.prev') : null;
const controlNextLightbox = lightboxElement ? lightboxElement.querySelector('.lightbox-control.next') : null;

let isLightboxImageZoomed = false;
let currentOriginalWasabiUrlForLightbox = '';
let currentIdAccesoGaleriaParaLog = null;

// Selectores para Herramientas de Edición
const editorToolbar = document.getElementById('editor-toolbar');
const toolBrightness = document.getElementById('tool-brightness');
const brightnessSliderContainer = document.getElementById('brightness-slider-container');
const brightnessSlider = document.getElementById('brightness-slider');
const brightnessValueDisplay = document.getElementById('brightness-value');
const toolContrast = document.getElementById('tool-contrast');
const contrastSliderContainer = document.getElementById('contrast-slider-container');
const contrastSlider = document.getElementById('contrast-slider');
const contrastValueDisplay = document.getElementById('contrast-value');
const toolSaturation = document.getElementById('tool-saturation');
const saturationSliderContainer = document.getElementById('saturation-slider-container');
const saturationSlider = document.getElementById('saturation-slider');
const saturationValueDisplay = document.getElementById('saturation-value');
const toolFilters = document.getElementById('tool-filters');
const filtersPanelContainer = document.getElementById('filters-panel-container');
<<<<<<< HEAD
let filterOptions = []; 

// Selectores para la función de Cambiar Fondo
const toolChangeBg = document.getElementById('tool-change-bg');
const backgroundsPanelContainer = document.getElementById('backgrounds-panel-container');

=======
let filterOptions = [];
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
const toolReset = document.getElementById('tool-reset');
const lightboxDownloadButton = document.getElementById('lightbox-download-button');

// --- NUEVAS VARIABLES GLOBALES PARA CAMBIO DE FONDO ---
const changeBackgroundButton = document.getElementById('tool-change-background');
const backgroundSelectorModal = document.getElementById('background-selector-modal');
const closeBackgroundSelectorButton = document.getElementById('close-background-selector');
const backgroundListContainer = document.getElementById('background-list-container');
const backgroundLoadingIndicator = document.getElementById('background-loading-indicator');

const compositeImageDisplayArea = document.createElement('div');
compositeImageDisplayArea.id = 'composite-image-display-area';
compositeImageDisplayArea.style.position = 'relative';
compositeImageDisplayArea.style.width = '100%';
compositeImageDisplayArea.style.height = '100%';
compositeImageDisplayArea.style.display = 'none';
compositeImageDisplayArea.style.margin = 'auto';


let currentForegroundUrl = null;
let currentCompositeBackgroundUrl = null;

// Objeto para almacenar los filtros aplicados actualmente
let currentLightboxFilters = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    blur: 0,
    hueRotate: 0,
    activeNamedFilter: 'original'
};

// --- URL BASE PARA LA API DE PYTHON ---
// Detecta si el frontend está corriendo en Render. AJUSTA 'jonylagerpy.onrender.com' Y 'tu-frontend.onrender.com' con tus URLs reales.
const IS_FRONTEND_DEPLOYED = window.location.hostname.endsWith('onrender.com'); // O una forma más específica si tu frontend tiene otro dominio en Render
const PYTHON_API_BASE_URL = 'https://jonylagerpy.onrender.com';
// Si quieres que tu frontend local SIEMPRE use el backend desplegado, puedes poner:
// const PYTHON_API_BASE_URL = 'https://jonylagerpy.onrender.com';

<<<<<<< HEAD
async function registrarInteraccionEdicion(datosInteraccion) {
    const idAccesoActual = sessionStorage.getItem('idAccesoGaleriaCliente') || currentIdAccesoGaleriaParaLog;

    if (!idAccesoActual && document.getElementById('clipremium-gallery-section')) {
        console.warn("ID de Acceso no disponible para registrar la interacción en CliPremium.");
        return; 
    } else if (!document.getElementById('clipremium-gallery-section')) {
=======
console.log("Usando PYTHON_API_BASE_URL:", PYTHON_API_BASE_URL);


function showLoadingIndicator(show, message = "Procesando...") {
    if (backgroundLoadingIndicator) {
        const pElement = backgroundLoadingIndicator.querySelector('p');
        if (pElement) pElement.textContent = message;
        backgroundLoadingIndicator.style.display = show ? 'block' : 'none';
    }
    if (backgroundListContainer) {
        backgroundListContainer.style.display = show ? 'none' : 'grid';
    }
}

async function populateBackgroundSelector() {
    if (!backgroundListContainer) {
        console.error("Error: El contenedor 'background-list-container' no fue encontrado en el DOM.");
        return;
    }
    showLoadingIndicator(true, "Cargando lista de fondos...");
    try {
        // =========================================================================================
        // ATENCIÓN: Si tu log de errores anterior indicaba "ReferenceError: formData is not defined"
        // en la línea 84 (aproximadamente) de esta función, revisa tu archivo local.
        // Esta función NO debería usar 'formData'.
        // =========================================================================================

        const response = await fetch(`${PYTHON_API_BASE_URL}/list-backgrounds`); // URL actualizada

        if (!response.ok) {
            console.error("Respuesta no OK del servidor al listar fondos:", response.status, response.statusText);
            let errorDetail = `Error del servidor: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorDetail = errorData.error || errorData.message || errorDetail;
            } catch (e) { /* No hay JSON de error, usar el statusText */ }
            throw new Error(errorDetail);
        }

        const backgroundPaths = await response.json();
        console.log("Fondos recibidos por el frontend:", backgroundPaths);

        backgroundListContainer.innerHTML = '';
        if (!backgroundPaths || backgroundPaths.length === 0) {
            backgroundListContainer.innerHTML = '<p>No hay fondos disponibles o la respuesta está vacía.</p>';
            return;
        }

        backgroundPaths.forEach(bgPath => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'background-item';
            // Asumiendo que Node.js sirve 'public' como raíz, y bgPath es 'img/fondos/archivo.jpg'
            itemDiv.innerHTML = `<img src="/${bgPath}" alt="Fondo miniatura" data-bg-src="/${bgPath}">`;
            itemDiv.addEventListener('click', () => {
                handleBackgroundSelection(`/${bgPath}`);
            });
            backgroundListContainer.appendChild(itemDiv);
        });

    } catch (error) {
        console.error("Error en populateBackgroundSelector:", error);
        if (backgroundListContainer) {
            backgroundListContainer.innerHTML = `<p>Error al cargar fondos. Inténtalo de nuevo. (${error.message || 'Error desconocido'})</p>`;
        }
    } finally {
        showLoadingIndicator(false);
    }
}

async function handleBackgroundSelection(selectedBgPath) { // selectedBgPath es la ruta local ej. /img/fondos/...
    if (!imagenLightboxElement) {
        alert("No hay imagen en el lightbox para aplicar el fondo.");
        showLoadingIndicator(false);
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
        return;
    }

    const originalImageWasabiUrl = currentOriginalWasabiUrlForLightbox; // URL de S3

    if (!originalImageWasabiUrl) {
        alert("No se pudo obtener la URL de la imagen original de Wasabi.");
        showLoadingIndicator(false);
        return;
    }

    if (backgroundSelectorModal) backgroundSelectorModal.style.display = 'none';
    showLoadingIndicator(true, "Procesando imagen...");

    try {
        const formData = new FormData();
        formData.append('imageUrl', originalImageWasabiUrl);
        let originalFileName = imagenLightboxElement.getAttribute('data-original-name') || "imagen_cloud.png";
        formData.append('originalFileName', originalFileName);

        console.log("JS DEBUG: Preparando para enviar a /remove-background. URL de Wasabi:", originalImageWasabiUrl);

        const removeBgResponse = await fetch(`${PYTHON_API_BASE_URL}/remove-background`, { // URL actualizada
            method: 'POST',
            body: formData
        });

        if (!removeBgResponse.ok) {
            let errorDetail = `Error del servidor (${removeBgResponse.status}) al procesar imagen.`;
            try {
                const errorData = await removeBgResponse.json();
                errorDetail = errorData.error || errorData.message || errorDetail;
            } catch (e) {
                const textError = await removeBgResponse.text().catch(() => `Respuesta de error del servidor (${removeBgResponse.status}) no legible.`);
                errorDetail = textError || errorDetail;
                console.error("Respuesta de error no JSON de /remove-background:", textError);
            }
            throw new Error(errorDetail);
        }

        const foregroundBlob = await removeBgResponse.blob();
        if (currentForegroundUrl) URL.revokeObjectURL(currentForegroundUrl);
        currentForegroundUrl = URL.createObjectURL(foregroundBlob);
        currentCompositeBackgroundUrl = selectedBgPath;

        displayCompositeImage(currentForegroundUrl, selectedBgPath);

    } catch (error) {
        console.error("Error en handleBackgroundSelection:", error);
        alert(`Error procesando la imagen: ${error.message}`);
        showLoadingIndicator(false);
        hideCompositeImage();
    }
}

function displayCompositeImage(foregroundUrl, backgroundUrl) {
    if (!lightboxElement || !imagenLightboxElement) return;

    const lightboxContent = lightboxElement.querySelector('.lightbox-content');
    if (lightboxContent && !document.getElementById(compositeImageDisplayArea.id)) {
        if (imagenLightboxElement.parentNode) {
             imagenLightboxElement.parentNode.insertBefore(compositeImageDisplayArea, imagenLightboxElement);
        }
    }

    let bgImg = compositeImageDisplayArea.querySelector('img.composite-bg');
    if (!bgImg) {
        bgImg = document.createElement('img');
        bgImg.className = 'composite-bg';
        bgImg.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:1;';
        compositeImageDisplayArea.appendChild(bgImg);
    }

    let fgImg = compositeImageDisplayArea.querySelector('img.composite-fg');
    if (!fgImg) {
        fgImg = document.createElement('img');
        fgImg.className = 'composite-fg';
        fgImg.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; z-index:2;';
        compositeImageDisplayArea.appendChild(fgImg);
    }

    bgImg.src = backgroundUrl;
    fgImg.src = foregroundUrl;

    compositeImageDisplayArea.style.maxWidth = imagenLightboxElement.style.maxWidth || '100%';
    compositeImageDisplayArea.style.maxHeight = imagenLightboxElement.style.maxHeight || 'calc(100% - 80px)';
    compositeImageDisplayArea.style.width = imagenLightboxElement.offsetWidth + 'px';
    compositeImageDisplayArea.style.height = imagenLightboxElement.offsetHeight + 'px';

    imagenLightboxElement.style.display = 'none';
    if(tituloLightboxElement) tituloLightboxElement.style.display = 'none';
    compositeImageDisplayArea.style.display = 'block';
    if (editorToolbar) editorToolbar.style.display = 'flex';

    hideAllEditPanels();
    if (toolBrightness) toolBrightness.style.display = 'none';
    if (toolContrast) toolContrast.style.display = 'none';
    if (toolSaturation) toolSaturation.style.display = 'none';
    if (toolFilters) toolFilters.style.display = 'none';
    if (toolReset) {
        const span = toolReset.querySelector('span');
        if(span) span.textContent = 'Ver Original'; else toolReset.textContent = 'Ver Original';
    }
    showLoadingIndicator(false);
}

function hideCompositeImage() {
    if (compositeImageDisplayArea) compositeImageDisplayArea.style.display = 'none';
    if (currentForegroundUrl) {
        URL.revokeObjectURL(currentForegroundUrl);
        currentForegroundUrl = null;
    }
    currentCompositeBackgroundUrl = null;
    if (imagenLightboxElement) imagenLightboxElement.style.display = 'block';
    if(tituloLightboxElement) tituloLightboxElement.style.display = 'block';

    if (toolBrightness) toolBrightness.style.display = 'flex';
    if (toolContrast) toolContrast.style.display = 'flex';
    if (toolSaturation) toolSaturation.style.display = 'flex';
    if (toolFilters) toolFilters.style.display = 'flex';
    if (toolReset) {
        const span = toolReset.querySelector('span');
        if(span) span.textContent = 'Restablecer'; else toolReset.textContent = 'Restablecer';
    }
    resetImageAdjustments();
}

async function registrarAccionFinal(tipoAccion, configuracionDeEdicion) {
    const idAccesoActual = window.idAccesoGaleriaCliente || currentIdAccesoGaleriaParaLog;
    if (!editorToolbar || editorToolbar.style.display === 'none' || idAccesoActual === null || idAccesoActual === undefined) {
        if (editorToolbar && editorToolbar.style.display !== 'none') {
            console.warn("Registro de acción final omitido: Se requiere un ID de Acceso de cliente válido.", { idDetectado: idAccesoActual, tipo: tipoAccion });
        }
        return;
    }
    const currentLinkElement = galeriaActivaLightbox[indiceActualLightbox];
    const nombreImagenOriginalAttr = currentLinkElement ? currentLinkElement.getAttribute('data-original-name') : null;
    let nombreImagen = 'desconocida.jpg';
    if (nombreImagenOriginalAttr) {
        nombreImagen = nombreImagenOriginalAttr;
    } else if (currentOriginalWasabiUrlForLightbox) {
        try {
            const url = new URL(currentOriginalWasabiUrlForLightbox);
            const pathParts = url.pathname.split('/');
            nombreImagen = decodeURIComponent(pathParts[pathParts.length - 1]);
        } catch (e) {
            nombreImagen = currentOriginalWasabiUrlForLightbox.substring(currentOriginalWasabiUrlForLightbox.lastIndexOf('/') + 1).split('?')[0];
        }
    }
    const galleryTitleElement = document.getElementById('gallery-title-premium');
    let nombreUsuarioGaleriaActual = null;
    if (galleryTitleElement && galleryTitleElement.textContent.startsWith('Galería de ')) {
        nombreUsuarioGaleriaActual = galleryTitleElement.textContent.replace('Galería de ', '').trim();
    } else if (galleryTitleElement && galleryTitleElement.textContent && galleryTitleElement.textContent !== "Tu Galería Privada" && galleryTitleElement.textContent !== "Tu Galería de Recuerdos") {
        nombreUsuarioGaleriaActual = galleryTitleElement.textContent.trim();
    }
    const payload = {
        idAcceso: idAccesoActual,
        nombreUsuarioGaleria: nombreUsuarioGaleriaActual,
        nombreImagenOriginal: nombreImagen,
        configuracionEdicion: configuracionDeEdicion
    };
    try {
        // ATENCIÓN: SI '/registrar-descarga-final' ES UN ENDPOINT DE TU SERVIDOR PYTHON (app.py),
        // DEBES USAR LA URL COMPLETA: `${PYTHON_API_BASE_URL}/registrar-descarga-final`
        const response = await fetch(`${PYTHON_API_BASE_URL}/registrar-descarga-final`, { // <-- VERIFICAR Y AJUSTAR SI ES DE PYTHON
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            let errorMsg = `Error del backend (${response.status}) al registrar '${tipoAccion}'`;
            try { const errorData = await response.json(); errorMsg = errorData.message || errorMsg; } catch (e) { /* no es json */ }
            console.error(errorMsg);
        } else {
            console.log(`Registro de '${tipoAccion}' enviado exitosamente.`);
        }
    } catch (error) {
        console.error(`Fallo de red al enviar registro de '${tipoAccion}':`, error);
    }
}

function applyCssFiltersToLightboxImage() {
    if (!imagenLightboxElement) return;
    let filterString = Object.entries(currentLightboxFilters)
        .map(([key, value]) => {
            if (key === 'brightness' || key === 'contrast' || key === 'saturate') return `${key}(${value / 100})`;
            if (key === 'grayscale' || key === 'sepia' || key === 'invert') return `${key}(${value}%)`;
            if (key === 'blur' && value > 0) return `blur(${value}px)`;
            if (key === 'hueRotate' && value !== 0) return `hue-rotate(${value}deg)`;
            return '';
        })
        .filter(Boolean)
        .join(' ');
    imagenLightboxElement.style.filter = filterString.trim();
}

function resetImageAdjustments() {
    currentLightboxFilters = {
        brightness: 100, contrast: 100, saturate: 100,
        grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0,
        activeNamedFilter: 'original'
    };
    if (brightnessSlider) brightnessSlider.value = 100; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '100%';
    if (contrastSlider) contrastSlider.value = 100; if (contrastValueDisplay) contrastValueDisplay.textContent = '100%';
    if (saturationSlider) saturationSlider.value = 100; if (saturationValueDisplay) saturationValueDisplay.textContent = '100%';

    if (filterOptions.length > 0 && editorToolbar) {
        filterOptions.forEach(opt => opt.classList.remove('active-filter'));
        const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
        if (originalButton) originalButton.classList.add('active-filter');
    }
    applyCssFiltersToLightboxImage();
<<<<<<< HEAD
    
    if (nombreFiltroActivoAnterior !== 'original' || 
        (parseFloat(JSON.parse(filtroAnteriorParaLog).brightness) !== 100 ||
         parseFloat(JSON.parse(filtroAnteriorParaLog).contrast) !== 100 ||
         parseFloat(JSON.parse(filtroAnteriorParaLog).saturate) !== 100 )) {
         registrarInteraccionEdicion({
            filtro_aplicado: 'reset_all',
            valor_filtro_inicial: filtroAnteriorParaLog, 
            valor_filtro_final: JSON.stringify(currentLightboxFilters) 
        });
    }
=======
    console.log("Ajustes de imagen reseteados en el frontend.");
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
}

function hideAllEditPanels() {
    if (brightnessSliderContainer) brightnessSliderContainer.style.display = 'none';
    if (contrastSliderContainer) contrastSliderContainer.style.display = 'none';
    if (saturationSliderContainer) saturationSliderContainer.style.display = 'none';
    if (filtersPanelContainer) filtersPanelContainer.style.display = 'none';
<<<<<<< HEAD
    if (backgroundsPanelContainer) backgroundsPanelContainer.style.display = 'none';
=======
    if (editorToolbar) {
         editorToolbar.querySelectorAll('.tool-button.active').forEach(b => {
            if (b.id !== 'tool-change-background') b.classList.remove('active');
         });
    }
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
}

function updateActiveToolButton(activeButton) {
    if (editorToolbar) {
        editorToolbar.querySelectorAll('.tool-button').forEach(button => {
<<<<<<< HEAD
            if (button.id !== 'tool-reset' && button.id !== 'lightbox-download-button') {
                button.classList.remove('active');
            }
        });
        if (activeButton && activeButton.id !== 'tool-reset' && activeButton.id !== 'lightbox-download-button') {
=======
            if (button.id !== 'tool-reset' && button.id !== 'lightbox-download-button' && button.id !== 'tool-change-background') {
                button.classList.remove('active');
            }
        });
        if (activeButton && activeButton.id !== 'tool-reset' && activeButton.id !== 'lightbox-download-button' && activeButton.id !== 'tool-change-background') {
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
            activeButton.classList.add('active');
        }
    }
}

function mostrarImagenLightbox(indice) {
    if (!lightboxElement || !imagenLightboxElement || !tituloLightboxElement || !controlPrevLightbox || !controlNextLightbox ||
        indice < 0 || indice >= galeriaActivaLightbox.length) { return; }

    hideCompositeImage();

    const enlaceActual = galeriaActivaLightbox[indice];
    if (!enlaceActual) return;

    currentOriginalWasabiUrlForLightbox = enlaceActual.getAttribute('data-original-wasabi-url') || enlaceActual.getAttribute('href');
<<<<<<< HEAD
    
    const idAcceso = sessionStorage.getItem('idAccesoGaleriaCliente');
    if (idAcceso) { 
        currentIdAccesoGaleriaParaLog = idAcceso;
=======

    if (typeof window.idAccesoGaleriaCliente !== 'undefined') {
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
    }

    const titleImagen = enlaceActual.getAttribute('data-title') || 'Imagen de la galería';
    const originalNameFromData = enlaceActual.getAttribute('data-original-name');
    if (originalNameFromData) {
        imagenLightboxElement.setAttribute('data-original-name', originalNameFromData);
    } else {
        const tempName = titleImagen.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 50) + ".jpg";
        imagenLightboxElement.setAttribute('data-original-name', tempName);
    }

    imagenLightboxElement.src = currentOriginalWasabiUrlForLightbox;
    imagenLightboxElement.alt = titleImagen;
    if (tituloLightboxElement) tituloLightboxElement.textContent = titleImagen;

    indiceActualLightbox = indice;
    if (controlPrevLightbox) controlPrevLightbox.classList.toggle('hidden', indiceActualLightbox === 0);
    if (controlNextLightbox) controlNextLightbox.classList.toggle('hidden', indiceActualLightbox === galeriaActivaLightbox.length - 1);

    resetImageAdjustments();

    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
    }
    isLightboxImageZoomed = false;

    if (editorToolbar && enlaceActual) {
        const esGaleriaDeCliente = enlaceActual.getAttribute('data-lightbox') === 'clipremium-gallery';
        editorToolbar.style.display = esGaleriaDeCliente ? 'flex' : 'none';
        if (changeBackgroundButton) changeBackgroundButton.style.display = esGaleriaDeCliente ? 'flex': 'none';

        if (esGaleriaDeCliente) {
            const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
            if (originalButton && filterOptions.length > 0) {
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
            }
        } else {
<<<<<<< HEAD
            const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
            if (originalButton && filterOptions.length > 0) { 
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
            }
=======
            hideAllEditPanels(); updateActiveToolButton(null);
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
        }
    }
}

function abrirLightbox(galeria, indice, esGaleriaDeCliente = false) {
    if (!lightboxElement) { console.error("Lightbox element not found."); return; }
    galeriaActivaLightbox = galeria;
<<<<<<< HEAD
    const idAcceso = sessionStorage.getItem('idAccesoGaleriaCliente');
    if (esGaleriaDeCliente && idAcceso) { 
        currentIdAccesoGaleriaParaLog = idAcceso;
=======

    if (esGaleriaDeCliente && typeof window.idAccesoGaleriaCliente !== 'undefined') {
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
    } else if (esGaleriaDeCliente) {
        console.warn("Abriendo lightbox de cliente pero window.idAccesoGaleriaCliente no está definido.");
        currentIdAccesoGaleriaParaLog = null;
    } else {
        currentIdAccesoGaleriaParaLog = null;
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
    }
    mostrarImagenLightbox(indice);
    lightboxElement.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarLightboxFunction() {
    if (!lightboxElement) return;
    hideCompositeImage();
    lightboxElement.classList.remove('activo');
    document.body.style.overflow = 'auto';
    resetImageAdjustments();
    hideAllEditPanels();
    updateActiveToolButton(null);
    if (editorToolbar) editorToolbar.style.display = 'none';
<<<<<<< HEAD
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
        if (imagenLightboxElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(imagenLightboxElement.src);
        }
        imagenLightboxElement.src = '';
        imagenLightboxElement.style.boxShadow = 'none'; 
    }
=======
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
    isLightboxImageZoomed = false;
    currentOriginalWasabiUrlForLightbox = '';
    currentIdAccesoGaleriaParaLog = null;
}

window.inicializarLightboxGlobal = function(selectorEnlaces) {
    const nuevosEnlacesGaleria = Array.from(document.querySelectorAll(selectorEnlaces));
    if (nuevosEnlacesGaleria.length === 0) return;
    nuevosEnlacesGaleria.forEach((enlace, indice) => {
        if (enlace.dataset.lightboxInitialized === 'true') return;
        const nuevoEnlace = enlace.cloneNode(true);
        if(enlace.parentNode) enlace.parentNode.replaceChild(nuevoEnlace, enlace);
        nuevoEnlace.addEventListener('click', function(evento) {
            evento.preventDefault();
            const esGaleriaDeCliente = this.getAttribute('data-lightbox') === 'clipremium-gallery';
            abrirLightbox(nuevosEnlacesGaleria, indice, esGaleriaDeCliente);
        });
        nuevoEnlace.dataset.lightboxInitialized = 'true';
    });
};

if (lightboxElement) {
    if (cerrarLightboxBtn) cerrarLightboxBtn.addEventListener('click', cerrarLightboxFunction);
    if (controlPrevLightbox) controlPrevLightbox.addEventListener('click', () => {
        if (indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1);
    });
    if (controlNextLightbox) controlNextLightbox.addEventListener('click', () => {
        if (indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1);
    });
    lightboxElement.addEventListener('click', function(event) {
        if (event.target === lightboxElement) cerrarLightboxFunction();
    });
    document.addEventListener('keydown', function(event) {
        if (lightboxElement.classList.contains('activo')) {
            if (event.key === 'Escape') cerrarLightboxFunction();
            else if (event.key === 'ArrowLeft' && controlPrevLightbox && !controlPrevLightbox.classList.contains('hidden')) controlPrevLightbox.click();
            else if (event.key === 'ArrowRight' && controlNextLightbox && !controlNextLightbox.classList.contains('hidden')) controlNextLightbox.click();
        }
    });
    if (imagenLightboxElement) {
        imagenLightboxElement.addEventListener('click', function(e) {
            e.stopPropagation(); /* Lógica de zoom aquí si la tienes */
        });
    }
}

async function loadBackgrounds() {
    if (!backgroundsPanelContainer) return;
    try {
        const response = await fetch('/api/backgrounds');
        if (!response.ok) throw new Error('No se pudo cargar la lista de fondos.');
        
        const backgroundFiles = await response.json();
        
        backgroundsPanelContainer.innerHTML = '';
        backgroundFiles.forEach(bgFile => {
            const bgThumb = document.createElement('img');
            bgThumb.src = bgFile.url;
            bgThumb.className = 'background-thumbnail';
            bgThumb.title = `Usar fondo: ${bgFile.name}`;
            bgThumb.setAttribute('data-bg-url', bgFile.url);
            
            bgThumb.addEventListener('click', handleBackgroundSelection);
            
            backgroundsPanelContainer.appendChild(bgThumb);
        });
    } catch (error) {
        console.error("Error al cargar fondos:", error);
        backgroundsPanelContainer.innerHTML = '<p style="color:white; padding: 1rem;">No se pudieron cargar los fondos.</p>';
    }
}

// Reemplaza esta función completa en tu script.js
async function handleBackgroundSelection(event) {
    const selectedBgUrl = event.target.getAttribute('data-bg-url');
    if (!selectedBgUrl || !currentOriginalWasabiUrlForLightbox) {
        alert("Error: No se ha seleccionado una imagen o un fondo válido.");
        return;
    }

    // --- CAMBIO 1: Cerrar el panel de fondos y desactivar el botón ---
    hideAllEditPanels();
    updateActiveToolButton(null);

    // --- CAMBIO 2: Crear el overlay con el nuevo mensaje y añadirlo al lightbox principal ---
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    // Se usa <br> para un salto de línea y mejor formato del mensaje
    loadingOverlay.innerHTML = '<span>Espere, puede demorar hasta 1 minuto.<br>No cierre la ventana.</span>';
    
    // Lo añadimos al lightbox principal para que lo cubra todo
    if (lightboxElement) {
        lightboxElement.appendChild(loadingOverlay);
    }
    
    try {
        const idAcceso = sessionStorage.getItem('idAccesoGaleriaCliente');

        const response = await fetch('/api/change-background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalImageUrl: currentOriginalWasabiUrlForLightbox,
                backgroundImageUrl: selectedBgUrl,
                idAcceso: idAcceso
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error en el servidor al cambiar el fondo.');
        }
        
        const imageBlob = await response.blob();
        const newImageURL = URL.createObjectURL(imageBlob);

        // Revocar la URL vieja si era un blob, para liberar memoria
        if (imagenLightboxElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(imagenLightboxElement.src);
        }
        
        // Actualizar la imagen del lightbox con el resultado
        imagenLightboxElement.src = newImageURL;
        
        // La imagen base ha cambiado, así que reseteamos los filtros
        resetImageAdjustments();

    } catch (error) {
        console.error("Error al cambiar el fondo:", error);
        alert(`No se pudo cambiar el fondo: ${error.message}`);
    } finally {
        // Quitar el estado de carga al finalizar (sea con éxito o error)
        if (lightboxElement && loadingOverlay.parentNode === lightboxElement) {
            lightboxElement.removeChild(loadingOverlay);
        }
    }
}

function configurarListenersDeEdicion() {
    if (!editorToolbar) return;
    filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));

<<<<<<< HEAD
    // Listener para Brillo
=======
    // Listeners para Brillo, Contraste, Saturación
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
    if (toolBrightness && brightnessSliderContainer && brightnessSlider && brightnessValueDisplay) {
        toolBrightness.addEventListener('click', (e) => { e.stopPropagation(); const isActive = brightnessSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolBrightness); brightnessSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        brightnessSlider.addEventListener('input', (e) => { currentLightboxFilters.brightness = parseInt(e.target.value); if(brightnessValueDisplay) brightnessValueDisplay.textContent = `${currentLightboxFilters.brightness}%`; applyCssFiltersToLightboxImage(); });
        if(brightnessSliderContainer) brightnessSliderContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Listener para Contraste
    if (toolContrast && contrastSliderContainer && contrastSlider && contrastValueDisplay) {
        toolContrast.addEventListener('click', (e) => { e.stopPropagation(); const isActive = contrastSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolContrast); contrastSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        contrastSlider.addEventListener('input', (e) => { currentLightboxFilters.contrast = parseInt(e.target.value); if(contrastValueDisplay) contrastValueDisplay.textContent = `${currentLightboxFilters.contrast}%`; applyCssFiltersToLightboxImage(); });
        if(contrastSliderContainer) contrastSliderContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Listener para Saturación
    if (toolSaturation && saturationSliderContainer && saturationSlider && saturationValueDisplay) {
        toolSaturation.addEventListener('click', (e) => { e.stopPropagation(); const isActive = saturationSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolSaturation); saturationSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        saturationSlider.addEventListener('input', (e) => { currentLightboxFilters.saturate = parseInt(e.target.value); if(saturationValueDisplay) saturationValueDisplay.textContent = `${currentLightboxFilters.saturate}%`; applyCssFiltersToLightboxImage(); });
        if(saturationSliderContainer) saturationSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
<<<<<<< HEAD
    
    // Listener para el panel de Filtros
=======

>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
    if (toolFilters && filtersPanelContainer) {
      toolFilters.addEventListener('click', (e) => { e.stopPropagation(); const isActive = filtersPanelContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolFilters); filtersPanelContainer.style.display = isActive ? 'none' : 'flex'; });
      if(filtersPanelContainer) filtersPanelContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Listener para los botones de filtros individuales
    if (filterOptions.length > 0) {
        filterOptions.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const filterName = this.dataset.filter;
<<<<<<< HEAD
                const filtroAnterior = currentLightboxFilters.activeNamedFilter; 
                const valorInicialSliders = JSON.stringify({ brightness: currentLightboxFilters.brightness, contrast: currentLightboxFilters.contrast, saturate: currentLightboxFilters.saturate });
                
                resetImageAdjustments(); 
                currentLightboxFilters.activeNamedFilter = filterName;

                // Lógica del switch para cada filtro
                switch (filterName) {
                    case 'original': break;
                    case 'grayscale':
                        currentLightboxFilters.grayscale = 100;
                        currentLightboxFilters.saturate = 0; 
                        if (saturationSlider) saturationSlider.value = 0; 
                        if (saturationValueDisplay) saturationValueDisplay.textContent = '0%';
                        break;
                    case 'bw_intenso':
                        currentLightboxFilters.grayscale = 100;
                        currentLightboxFilters.saturate = 0; 
                        currentLightboxFilters.contrast = 160; 
                        if (contrastSlider) contrastSlider.value = 160; if (contrastValueDisplay) contrastValueDisplay.textContent = '160%';
                        if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%';
                        break;
                    case 'vintage_suave':
                        currentLightboxFilters.sepia = 30; 
                        currentLightboxFilters.contrast = 105; 
                        currentLightboxFilters.brightness = 97;
                        if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%';
                        if (brightnessSlider) brightnessSlider.value = 97; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '97%';
                        break;
                    // ... (Añadir aquí todos los otros `case` de tu switch) ...
                    default:
                        console.warn("Filtro nombrado no definido en cliente:", filterName);
                        break;
                }
                
=======
                resetImageAdjustments();
                currentLightboxFilters.activeNamedFilter = filterName;
                // Switch para aplicar filtros
                switch (filterName) {
                    case 'original': break;
                    case 'grayscale': currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'bw_intenso': currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; currentLightboxFilters.contrast = 160; if (contrastSlider) contrastSlider.value = 160; if (contrastValueDisplay) contrastValueDisplay.textContent = '160%'; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'noir_look':  currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; currentLightboxFilters.contrast = 165; if (contrastSlider) contrastSlider.value = 165; if (contrastValueDisplay) contrastValueDisplay.textContent = '165%'; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'sepia': currentLightboxFilters.sepia = 100; currentLightboxFilters.grayscale = 100; currentLightboxFilters.saturate = 0; if (saturationSlider) saturationSlider.value = 0; if (saturationValueDisplay) saturationValueDisplay.textContent = '0%'; break;
                    case 'vintage_suave': currentLightboxFilters.saturate = 90; currentLightboxFilters.sepia = 30; currentLightboxFilters.contrast = 105; currentLightboxFilters.brightness = 97; if (saturationSlider) saturationSlider.value = 90; if (saturationValueDisplay) saturationValueDisplay.textContent = '90%'; if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 97; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '97%'; break;
                    case 'valencia_filter': currentLightboxFilters.saturate = 108; currentLightboxFilters.sepia = 8; currentLightboxFilters.contrast = 105; currentLightboxFilters.brightness = 105; if (saturationSlider) saturationSlider.value = 108; if (saturationValueDisplay) saturationValueDisplay.textContent = '108%'; if (contrastSlider) contrastSlider.value = 105; if (contrastValueDisplay) contrastValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%'; break;
                    case 'calido': currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 103; currentLightboxFilters.sepia = 15; if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%'; if (brightnessSlider) brightnessSlider.value = 103; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '103%'; break;
                    case 'frio': currentLightboxFilters.saturate = 105; currentLightboxFilters.brightness = 102; currentLightboxFilters.hueRotate = 195; if (saturationSlider) saturationSlider.value = 105; if (saturationValueDisplay) saturationValueDisplay.textContent = '105%'; if (brightnessSlider) brightnessSlider.value = 102; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '102%'; break;
                    case 'kodak_gold': currentLightboxFilters.saturate = 110; currentLightboxFilters.brightness = 105; currentLightboxFilters.contrast = 108; currentLightboxFilters.sepia = 10; currentLightboxFilters.hueRotate = -8; if (saturationSlider) saturationSlider.value = 110; if (saturationValueDisplay) saturationValueDisplay.textContent = '110%'; if (contrastSlider) contrastSlider.value = 108; if (contrastValueDisplay) contrastValueDisplay.textContent = '108%'; if (brightnessSlider) brightnessSlider.value = 105; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '105%'; break;
                    case 'mate_look': currentLightboxFilters.saturate = 75; currentLightboxFilters.contrast = 88; currentLightboxFilters.brightness = 108; if (saturationSlider) saturationSlider.value = 75; if (saturationValueDisplay) saturationValueDisplay.textContent = '75%'; if (contrastSlider) contrastSlider.value = 88; if (contrastValueDisplay) contrastValueDisplay.textContent = '88%'; if (brightnessSlider) brightnessSlider.value = 108; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '108%'; break;
                    case 'aden_filter': currentLightboxFilters.saturate = 85; currentLightboxFilters.brightness = 110; currentLightboxFilters.contrast = 90; currentLightboxFilters.hueRotate = -20; currentLightboxFilters.grayscale = 0; currentLightboxFilters.sepia = 0; if (saturationSlider) saturationSlider.value = 85; if (saturationValueDisplay) saturationValueDisplay.textContent = '85%'; if (brightnessSlider) brightnessSlider.value = 110; if (brightnessValueDisplay) brightnessValueDisplay.textContent = '110%'; if (contrastSlider) contrastSlider.value = 90; if (contrastValueDisplay) contrastValueDisplay.textContent = '90%'; break;
                    case 'teal_orange': currentLightboxFilters.saturate = 120; currentLightboxFilters.contrast = 110; if (saturationSlider) saturationSlider.value = 120; if (saturationValueDisplay) saturationValueDisplay.textContent = '120%'; if (contrastSlider) contrastSlider.value = 110; if (contrastValueDisplay) contrastValueDisplay.textContent = '110%'; break;
                    case 'cinematic_look': currentLightboxFilters.saturate = 80; currentLightboxFilters.contrast = 115; currentLightboxFilters.sepia = 5; currentLightboxFilters.grayscale = 0; if (saturationSlider) saturationSlider.value = 80; if (saturationValueDisplay) saturationValueDisplay.textContent = '80%'; if (contrastSlider) contrastSlider.value = 115; if (contrastValueDisplay) contrastValueDisplay.textContent = '115%'; break;
                    default: console.warn("Filtro nombrado no completamente definido para previsualización:", filterName); break;
                }
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
                applyCssFiltersToLightboxImage();
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                this.classList.add('active-filter');
            });
        });
    }

<<<<<<< HEAD
    // Listener para el botón de Cambiar Fondo
    if (toolChangeBg && backgroundsPanelContainer) {
        toolChangeBg.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = backgroundsPanelContainer.style.display === 'flex';
            hideAllEditPanels();
            updateActiveToolButton(isActive ? null : toolChangeBg);
            backgroundsPanelContainer.style.display = isActive ? 'none' : 'flex';
        });
    }

    // Listener para el botón de Restablecer
    if (toolReset) { toolReset.addEventListener('click', (e) => { e.stopPropagation(); resetImageAdjustments(); hideAllEditPanels(); updateActiveToolButton(null); }); }
=======
    if (toolReset) {
        toolReset.addEventListener('click', function(e) {
            e.stopPropagation();
            if (compositeImageDisplayArea.style.display === 'block') {
                hideCompositeImage();
            } else {
                resetImageAdjustments();
            }
            hideAllEditPanels();
            updateActiveToolButton(null);
        });
    }
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434

    // Listener para el botón de Descargar
    if (lightboxDownloadButton && imagenLightboxElement) {
        lightboxDownloadButton.addEventListener('click', async function(e) {
            e.stopPropagation();
<<<<<<< HEAD

            // Si la imagen actual es un blob (fondo cambiado), descargarla directamente
            if (imagenLightboxElement.src.startsWith('blob:')) {
                const link = document.createElement('a');
                link.href = imagenLightboxElement.src;
                const originalFileName = galeriaActivaLightbox[indiceActualLightbox] ? galeriaActivaLightbox[indiceActualLightbox].getAttribute('data-original-name') : 'imagen.jpg';
                link.setAttribute('download', `fondo_cambiado_${originalFileName}`);
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                return;
            }

            // Lógica original para procesar en servidor
            if (!currentOriginalWasabiUrlForLightbox) { alert("No hay URL original de imagen para procesar la descarga."); return; }
            const buttonElement = this; const spanElement = buttonElement.querySelector('span');
            const originalButtonText = spanElement ? spanElement.textContent : 'Descargar';
            if (spanElement) spanElement.textContent = 'Procesando...'; buttonElement.disabled = true;

            const currentLink = galeriaActivaLightbox[indiceActualLightbox];
            const originalFileName = currentLink ? currentLink.getAttribute('data-original-name') : 'imagen_editada.jpg';
            
            const editsToSend = {
                brightness: currentLightboxFilters.brightness / 100,
                contrast: currentLightboxFilters.contrast / 100,
                saturate: currentLightboxFilters.saturate / 100,
                grayscale: currentLightboxFilters.grayscale > 0,
                cssSepiaPercentage: currentLightboxFilters.sepia,
                cssHueRotateDegrees: currentLightboxFilters.hueRotate,
                activeNamedFilter: currentLightboxFilters.activeNamedFilter,
                originalName: originalFileName 
            };

            registrarInteraccionEdicion({ 
                filtro_aplicado: 'download_edited_request',
                valor_filtro_final: JSON.stringify(editsToSend),
                es_descarga_editada: true
            });
            try {
                const response = await fetch('/procesar-y-descargar-imagen', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ originalWasabiUrl: currentOriginalWasabiUrlForLightbox, edits: editsToSend })
                });
                if (!response.ok) {
                    let errorData = { message: `Error del servidor: ${response.status}` };
                    try { errorData = await response.json(); } catch (parseErr) {}
                    throw new Error(errorData.message || `Error HTTP ${response.status}`);
                }
                const disposition = response.headers.get('content-disposition');
                let downloadFileName = `editada_${originalFileName}`;
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
                    if (filenameMatch && filenameMatch.length > 1) downloadFileName = decodeURIComponent(filenameMatch[1]);
                }
                const blob = await response.blob(); const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a'); link.href = url;
                link.setAttribute('download', downloadFileName); document.body.appendChild(link);
                link.click(); link.parentNode.removeChild(link); window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error en la descarga procesada por el servidor:', error);
                alert(`Error al descargar la imagen: ${error.message}`);
            } finally {
                buttonElement.disabled = false; if (spanElement) spanElement.textContent = originalButtonText;
=======
            const originalImageAvailable = currentOriginalWasabiUrlForLightbox && imagenLightboxElement.style.display !== 'none';
            const compositeImageVisible = compositeImageDisplayArea.style.display === 'block' && currentForegroundUrl && currentCompositeBackgroundUrl;

            if (!originalImageAvailable && !compositeImageVisible) {
                 alert("No hay imagen para descargar. Abre una imagen o crea una composición.");
                 return;
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
            }
            // ... (resto de tu lógica de descarga) ...
            // ATENCIÓN: SI '/procesar-y-descargar-imagen' ES UN ENDPOINT DE TU SERVIDOR PYTHON (app.py),
            // DEBES USAR LA URL COMPLETA: `${PYTHON_API_BASE_URL}/procesar-y-descargar-imagen`
            // const response = await fetch(`${PYTHON_API_BASE_URL}/procesar-y-descargar-imagen`, { /* ... */ });
        });
    }

    document.addEventListener('click', function(event) {
<<<<<<< HEAD
        if(lightboxElement && lightboxElement.classList.contains('activo') && editorToolbar && editorToolbar.style.display !== 'none') {
            let clickedOnToolbarOrPanel = editorToolbar.contains(event.target);
            if (!clickedOnToolbarOrPanel) {
                hideAllEditPanels();
                updateActiveToolButton(null);
            }
=======
        if (brightnessSliderContainer && !brightnessSliderContainer.contains(event.target) && toolBrightness && !toolBrightness.contains(event.target) ) {
            brightnessSliderContainer.style.display = 'none'; if(toolBrightness) toolBrightness.classList.remove('active');
        }
        if (contrastSliderContainer && !contrastSliderContainer.contains(event.target) && toolContrast && !toolContrast.contains(event.target)) {
            contrastSliderContainer.style.display = 'none'; if(toolContrast) toolContrast.classList.remove('active');
        }
        if (saturationSliderContainer && !saturationSliderContainer.contains(event.target) && toolSaturation && !toolSaturation.contains(event.target)) {
            saturationSliderContainer.style.display = 'none'; if(toolSaturation) toolSaturation.classList.remove('active');
        }
        if (filtersPanelContainer && !filtersPanelContainer.contains(event.target) && toolFilters && !toolFilters.contains(event.target)) {
            filtersPanelContainer.style.display = 'none'; if(toolFilters) toolFilters.classList.remove('active');
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
<<<<<<< HEAD
    configurarListenersDeEdicion(); 
    loadBackgrounds();

    const currentYearSpanGlobal = document.getElementById('currentYear'); 
    if (currentYearSpanGlobal) currentYearSpanGlobal.textContent = new Date().getFullYear();

    const menuToggleGlobal = document.querySelector('header .menu-toggle');
    const navGlobal = document.querySelector('header .navegacion-principal'); 
    if (menuToggleGlobal && navGlobal) {
        if (!navGlobal.dataset.menuInitialized) { 
            menuToggleGlobal.addEventListener('click', function() {
                navGlobal.classList.toggle('nav-abierta');
                this.setAttribute('aria-expanded', navGlobal.classList.contains('nav-abierta'));
                this.classList.toggle('is-active');
            });
            navGlobal.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if (navGlobal.classList.contains('nav-abierta')) {
                        navGlobal.classList.remove('nav-abierta');
                        menuToggleGlobal.setAttribute('aria-expanded', 'false');
                        menuToggleGlobal.classList.remove('is-active');
                    }
                });
            });
            navGlobal.dataset.menuInitialized = 'true';
        }
    }
    
    const navLinksGlobal = document.querySelectorAll('.navegacion-principal a');
    if (navLinksGlobal.length > 0) {
        const currentUrlGlobal = window.location.href.split('#')[0].split('?')[0];
        navLinksGlobal.forEach(link => {
            try {
                const linkHref = link.getAttribute('href');
                if (linkHref && linkHref.trim() !== '' && linkHref !== '#') { 
                    const linkUrl = new URL(linkHref, document.baseURI).href.split('#')[0].split('?')[0];
                    if (linkUrl === currentUrlGlobal) link.classList.add('activo');
                    else link.classList.remove('activo');
                } else if (link.getAttribute('href') === 'index.html' && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
                    link.classList.add('activo');
                }
            } catch (e) { /* Ignorar errores de URL inválida */ }
=======
    if (editorToolbar) {
        configurarListenersDeEdicion();
    }

    if (changeBackgroundButton) {
        changeBackgroundButton.addEventListener('click', () => {
            if (!currentOriginalWasabiUrlForLightbox && !(imagenLightboxElement && imagenLightboxElement.src)) {
                 alert("Por favor, abre una imagen en el lightbox primero."); return;
            }
            populateBackgroundSelector();
            if (backgroundSelectorModal) backgroundSelectorModal.style.display = 'flex';
>>>>>>> 8b20c7efb97ce950f00c39da4dd5df8fdf247434
        });
    }
    if (closeBackgroundSelectorButton) {
        closeBackgroundSelectorButton.addEventListener('click', () => {
            if (backgroundSelectorModal) backgroundSelectorModal.style.display = 'none';
        });
    }
    if (backgroundSelectorModal) {
        backgroundSelectorModal.addEventListener('click', function(event) {
            if (event.target === backgroundSelectorModal) {
                backgroundSelectorModal.style.display = 'none';
            }
        });
    }
    // Inicialización global de lightbox si es necesario para otras galerías
    // if (typeof window.inicializarLightboxGlobal === 'function') {
    //     window.inicializarLightboxGlobal('#alguna-otra-galeria a');
    // }
});