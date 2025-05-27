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
let currentIdAccesoGaleriaParaLog = null; // Se llenará desde window.idAccesoGaleriaCliente

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
let filterOptions = []; 

const toolReset = document.getElementById('tool-reset');
const lightboxDownloadButton = document.getElementById('lightbox-download-button');

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

// --- Funciones del Lightbox y Edición ---

// IMPORTANTE: Definición de registrarAccionFinal
async function registrarAccionFinal(tipoAccion, configuracionDeEdicion) {
    const idAccesoActual = window.idAccesoGaleriaCliente || currentIdAccesoGaleriaParaLog;

    if (!editorToolbar || editorToolbar.style.display === 'none' || idAccesoActual === null || idAccesoActual === undefined) {
        if (editorToolbar && editorToolbar.style.display !== 'none') {
             console.warn("Registro de acción final omitido: Se requiere un ID de Acceso de cliente válido.", { idDetectado: idAccesoActual, tipo: tipoAccion });
        }
        return; 
    }

    const nombreImagenOriginalAttr = galeriaActivaLightbox[indiceActualLightbox] ? galeriaActivaLightbox[indiceActualLightbox].getAttribute('data-original-name') : null;
    const nombreImagen = nombreImagenOriginalAttr || (currentOriginalWasabiUrlForLightbox ? currentOriginalWasabiUrlForLightbox.substring(currentOriginalWasabiUrlForLightbox.lastIndexOf('/') + 1).split('?')[0] : 'desconocida.jpg');
    
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
        console.log(`Frontend: Enviando registro de '${tipoAccion}' al endpoint /registrar-descarga:`, payload);
        const response = await fetch('/registrar-descarga', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error(`Error del backend al registrar '${tipoAccion}':`, await response.text());
        } else {
            console.log(`Registro de '${tipoAccion}' (descarga) enviado exitosamente.`);
        }
    } catch (error) {
        console.error(`Fallo de red al enviar registro de '${tipoAccion}':`, error);
    }
}


function applyCssFiltersToLightboxImage() {
    if (!imagenLightboxElement) return;
    let filterString = '';
    filterString += `brightness(${currentLightboxFilters.brightness / 100}) `;
    filterString += `contrast(${currentLightboxFilters.contrast / 100}) `;
    filterString += `saturate(${currentLightboxFilters.saturate / 100}) `;
    filterString += `grayscale(${currentLightboxFilters.grayscale}%) `;
    filterString += `sepia(${currentLightboxFilters.sepia}%) `;
    filterString += `invert(${currentLightboxFilters.invert}%) `;
    if (currentLightboxFilters.blur > 0) filterString += `blur(${currentLightboxFilters.blur}px) `;
    if (currentLightboxFilters.hueRotate !== 0) filterString += `hue-rotate(${currentLightboxFilters.hueRotate}deg) `;
    
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
    console.log("Ajustes de imagen reseteados en el frontend.");
}

function hideAllEditPanels() {
    if (brightnessSliderContainer) brightnessSliderContainer.style.display = 'none';
    if (contrastSliderContainer) contrastSliderContainer.style.display = 'none';
    if (saturationSliderContainer) saturationSliderContainer.style.display = 'none';
    if (filtersPanelContainer) filtersPanelContainer.style.display = 'none';
}

function updateActiveToolButton(activeButton) {
    if (editorToolbar) {
        editorToolbar.querySelectorAll('.tool-button').forEach(button => {
            if (button.id !== 'tool-reset' && button.id !== 'lightbox-download-button') button.classList.remove('active');
        });
        if (activeButton && activeButton.id !== 'tool-reset' && activeButton.id !== 'lightbox-download-button') activeButton.classList.add('active');
    }
}

function mostrarImagenLightbox(indice) {
    if (!lightboxElement || !imagenLightboxElement || !tituloLightboxElement || !controlPrevLightbox || !controlNextLightbox ||
        indice < 0 || indice >= galeriaActivaLightbox.length) { return; }
    const enlaceActual = galeriaActivaLightbox[indice];
    if (!enlaceActual) return;

    currentOriginalWasabiUrlForLightbox = enlaceActual.getAttribute('data-original-wasabi-url') || enlaceActual.getAttribute('href');
    
    if (typeof window.idAccesoGaleriaCliente !== 'undefined') { 
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
    }
    
    const titleImagen = enlaceActual.getAttribute('data-title') || 'Imagen de la galería';

    imagenLightboxElement.setAttribute('src', currentOriginalWasabiUrlForLightbox);
    imagenLightboxElement.setAttribute('alt', titleImagen);
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
        if (esGaleriaDeCliente) {
             const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
             if (originalButton && filterOptions.length > 0) { 
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
             }
        } else {
            hideAllEditPanels(); updateActiveToolButton(null);
        }
    }
}

function abrirLightbox(galeria, indice, esGaleriaDeCliente = false) {
    if (!lightboxElement) { console.error("Lightbox element not found."); return; }
    galeriaActivaLightbox = galeria;
    
    if (esGaleriaDeCliente && typeof window.idAccesoGaleriaCliente !== 'undefined') {
        currentIdAccesoGaleriaParaLog = window.idAccesoGaleriaCliente;
        console.log("ID de Acceso para logging establecido al ABRIR Lightbox:", currentIdAccesoGaleriaParaLog);
    } else if (esGaleriaDeCliente) {
        console.warn("Abriendo lightbox de cliente pero window.idAccesoGaleriaCliente no está definido.");
        currentIdAccesoGaleriaParaLog = null;
    } else {
        currentIdAccesoGaleriaParaLog = null; 
    }

    if (editorToolbar) {
        editorToolbar.style.display = esGaleriaDeCliente ? 'flex' : 'none';
        if (esGaleriaDeCliente) {
             const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
             if (originalButton && filterOptions.length > 0) { 
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
             }
        } else {
            hideAllEditPanels(); updateActiveToolButton(null);
        }
    }
    mostrarImagenLightbox(indice); 
    lightboxElement.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarLightboxFunction() {
    if (!lightboxElement) return;
    lightboxElement.classList.remove('activo');
    document.body.style.overflow = 'auto';
    resetImageAdjustments(); 
    hideAllEditPanels(); 
    updateActiveToolButton(null);
    if (editorToolbar) editorToolbar.style.display = 'none';
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
        imagenLightboxElement.setAttribute('src', '');
        imagenLightboxElement.style.boxShadow = 'none'; 
    }
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
    if (imagenLightboxElement) {
        imagenLightboxElement.addEventListener('click', function(e) { 
            e.stopPropagation(); 
            if (editorToolbar && window.getComputedStyle(editorToolbar).display !== 'none') { 
                if (!isLightboxImageZoomed) { 
                    this.classList.add('zoomed-in'); 
                    this.style.cursor = 'zoom-out'; 
                } else { 
                    this.classList.remove('zoomed-in'); 
                    this.style.cursor = 'zoom-in'; 
                } 
                isLightboxImageZoomed = !isLightboxImageZoomed; 
            } 
        });
    }
    if (!lightboxElement.dataset.listenersAttached) {
        if (cerrarLightboxBtn) cerrarLightboxBtn.addEventListener('click', cerrarLightboxFunction);
        lightboxElement.addEventListener('click', function(e) { if (e.target === this) cerrarLightboxFunction(); });
        document.addEventListener('keydown', function(e) { 
            if (lightboxElement.classList.contains('activo') && galeriaActivaLightbox.length > 0) { 
                if (e.key === 'Escape') cerrarLightboxFunction(); 
                if (e.key === 'ArrowLeft' && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); 
                if (e.key === 'ArrowRight' && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); 
            } 
        });
        if (controlPrevLightbox) controlPrevLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); });
        if (controlNextLightbox) controlNextLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); });
        lightboxElement.dataset.listenersAttached = 'true';
    }
}

function configurarListenersDeEdicion() {
    if (!editorToolbar) {
        console.log("Barra de herramientas (editorToolbar) no encontrada. No se configuran listeners de edición.");
        return;
    }
    
    filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));
    console.log("Configurando listeners de edición para la barra de herramientas...");

    // Sliders (Brillo, Contraste, Saturación) - SOLO ACTUALIZAN UI Y ESTADO LOCAL
    if (toolBrightness && brightnessSliderContainer && brightnessSlider && brightnessValueDisplay) {
        toolBrightness.addEventListener('click', (e) => { e.stopPropagation(); const isActive = brightnessSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolBrightness); brightnessSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        brightnessSlider.addEventListener('input', (e) => { currentLightboxFilters.brightness = parseInt(e.target.value); if(brightnessValueDisplay) brightnessValueDisplay.textContent = `${currentLightboxFilters.brightness}%`; applyCssFiltersToLightboxImage(); });
        if(brightnessSliderContainer) brightnessSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    if (toolContrast && contrastSliderContainer && contrastSlider && contrastValueDisplay) {
        toolContrast.addEventListener('click', (e) => { e.stopPropagation(); const isActive = contrastSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolContrast); contrastSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        contrastSlider.addEventListener('input', (e) => { currentLightboxFilters.contrast = parseInt(e.target.value); if(contrastValueDisplay) contrastValueDisplay.textContent = `${currentLightboxFilters.contrast}%`; applyCssFiltersToLightboxImage(); });
        if(contrastSliderContainer) contrastSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    if (toolSaturation && saturationSliderContainer && saturationSlider && saturationValueDisplay) {
        toolSaturation.addEventListener('click', (e) => { e.stopPropagation(); const isActive = saturationSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolSaturation); saturationSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        saturationSlider.addEventListener('input', (e) => { currentLightboxFilters.saturate = parseInt(e.target.value); if(saturationValueDisplay) saturationValueDisplay.textContent = `${currentLightboxFilters.saturate}%`; applyCssFiltersToLightboxImage(); });
        if(saturationSliderContainer) saturationSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    
    // Botón para abrir panel de Filtros
    if (toolFilters && filtersPanelContainer) {
        toolFilters.addEventListener('click', (e) => { e.stopPropagation(); const isActive = filtersPanelContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolFilters); filtersPanelContainer.style.display = isActive ? 'none' : 'flex'; });
        if(filtersPanelContainer) filtersPanelContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Botones de Filtro individuales (SOLO ACTUALIZAN UI Y ESTADO LOCAL)
    if (filterOptions.length > 0) {
        filterOptions.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const filterName = this.dataset.filter;
                
                resetImageAdjustments(); 
                currentLightboxFilters.activeNamedFilter = filterName; 

                // Lógica del switch para aplicar previsualizaciones CSS y ajustar currentLightboxFilters
                // (Esta es la lógica que ya tenías y que funciona para los filtros CSS)
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
                applyCssFiltersToLightboxImage();
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                this.classList.add('active-filter');
            });
        });
    }

    // Botón de Reset (NO REGISTRA NADA)
    if (toolReset) { 
        toolReset.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            resetImageAdjustments(); 
            hideAllEditPanels(); 
            updateActiveToolButton(null); 
        }); 
    }

    // === BOTÓN DE DESCARGA DEL LIGHTBOX: AQUÍ SE REGISTRA LA INFORMACIÓN ===
    if (lightboxDownloadButton && imagenLightboxElement) {
        lightboxDownloadButton.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!currentOriginalWasabiUrlForLightbox) {
                alert("No hay URL de imagen original para procesar la descarga.");
                return;
            }
            
            const buttonElement = this;
            const spanElement = buttonElement.querySelector('span');
            const originalButtonText = spanElement ? spanElement.textContent : 'Descargar';

            if (spanElement) spanElement.textContent = 'Preparando...';
            buttonElement.disabled = true;

            let originalFileName = "imagen.jpg";
            const currentLink = galeriaActivaLightbox[indiceActualLightbox];
            if (currentLink) {
                 originalFileName = currentLink.getAttribute('data-original-name') || 
                                   (currentLink.getAttribute('data-title') ? 
                                        `${currentLink.getAttribute('data-title').replace(/[^a-z0-9_.-]/gi, '_').substring(0, 50)}.jpg` : 
                                        "imagen.jpg");
            }
            
            // Objeto con la configuración final de edición para guardar en la BD
            const configuracionEdicionParaGuardarEnBD = { ...currentLightboxFilters }; 

            // Llamar a la función de registro ANTES de la descarga real
            await registrarAccionFinal('descarga_cliente', configuracionEdicionParaGuardarEnBD);

            // Preparar el objeto de ediciones para el endpoint de procesamiento de imagen
            if (spanElement) spanElement.textContent = 'Procesando Imagen...';
            const editsParaProcesamiento = {
                brightness: currentLightboxFilters.brightness / 100.0,
                contrast: currentLightboxFilters.contrast / 100.0,
                saturate: currentLightboxFilters.saturate / 100.0,
                grayscale: currentLightboxFilters.grayscale > 0,
                sepia: currentLightboxFilters.sepia > 0,
                invert: currentLightboxFilters.invert > 0,
                blur: currentLightboxFilters.blur,
                hueRotate: currentLightboxFilters.hueRotate,
                activeNamedFilter: currentLightboxFilters.activeNamedFilter,
                originalName: originalFileName
            };

            try {
                const response = await fetch('/procesar-y-descargar-imagen', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        originalWasabiUrl: currentOriginalWasabiUrlForLightbox, 
                        edits: editsParaProcesamiento 
                    })
                });
                
                if (!response.ok) { 
                    let errorData = { message: `Error del servidor: ${response.status}` };
                    try { errorData = await response.json(); } catch (parseErr) { /* No es JSON */ }
                    throw new Error(errorData.message || `Error HTTP ${response.status}`);
                }
                const disposition = response.headers.get('content-disposition');
                let downloadFileName = `editada_${originalFileName}`.replace(/\s+/g, '_');
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
                    if (filenameMatch && filenameMatch.length > 1) {
                        downloadFileName = decodeURIComponent(filenameMatch[1]);
                    }
                }
                const blob = await response.blob(); 
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a'); 
                link.href = url;
                link.setAttribute('download', downloadFileName); 
                document.body.appendChild(link);
                link.click(); 
                link.parentNode.removeChild(link); 
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error en la descarga procesada por el servidor:', error);
                alert(`Error al descargar la imagen: ${error.message}`);
            } finally {
                buttonElement.disabled = false; 
                if (spanElement) spanElement.textContent = originalButtonText;
            }
        });
    }

    // Listener para cerrar paneles con clic fuera
    document.addEventListener('click', function(event) {
        if(lightboxElement && lightboxElement.classList.contains('activo') && 
           editorToolbar && editorToolbar.style.display !== 'none') {
            let clickedOnToolbarOrPanel = false;
            if (editorToolbar.contains(event.target)) clickedOnToolbarOrPanel = true;
            const panels = [brightnessSliderContainer, contrastSliderContainer, saturationSliderContainer, filtersPanelContainer];
            panels.forEach(panel => { if (panel && panel.style.display !== 'none' && panel.contains(event.target)) clickedOnToolbarOrPanel = true; });
            if (!clickedOnToolbarOrPanel) {
                hideAllEditPanels(); updateActiveToolButton(null);
            }
        }
    });
} // Fin de configurarListenersDeEdicion()


// --- Funcionalidad General del Sitio (DOM Listo) ---
document.addEventListener('DOMContentLoaded', function() {
    if (editorToolbar) { 
        filterOptions = Array.from(editorToolbar.querySelectorAll('.filter-option'));
        configurarListenersDeEdicion(); 
    } else {
        // console.log("Barra de herramientas de edición (editorToolbar) no encontrada en esta página.");
    }
    
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
        });
    }

    if (document.getElementById('galeria-inicio')) {
        window.inicializarLightboxGlobal('#galeria-inicio a[data-lightbox="galeria-principal"]');
    }
    if (document.getElementById('clipremium-gallery-container')) { 
         // Idealmente, llamar a window.inicializarLightboxGlobal DESPUÉS de que las imágenes
         // de la galería del cliente se carguen dinámicamente en clipremium.html.
         // window.inicializarLightboxGlobal('#clipremium-gallery-container a[data-lightbox="clipremium-gallery"]');
         console.log("Recordatorio: inicializarLightboxGlobal para #clipremium-gallery-container debe llamarse después de cargar imágenes en esa página.");
    }
    
    console.log("Jony Lager - Script principal cargado y DOM listo.");
});