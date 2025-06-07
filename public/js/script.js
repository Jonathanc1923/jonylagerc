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
let filterOptions = []; 

// Selectores para la función de Cambiar Fondo
const toolChangeBg = document.getElementById('tool-change-bg');
const backgroundsPanelContainer = document.getElementById('backgrounds-panel-container');

const toolReset = document.getElementById('tool-reset');
const lightboxDownloadButton = document.getElementById('lightbox-download-button');

let currentLightboxFilters = {
    brightness: 100, contrast: 100, saturate: 100,
    grayscale: 0, sepia: 0, invert: 0, blur: 0, hueRotate: 0,
    activeNamedFilter: 'original'
};

// --- Funciones del Lightbox y Edición ---

async function registrarInteraccionEdicion(datosInteraccion) {
    const idAccesoActual = sessionStorage.getItem('idAccesoGaleriaCliente') || currentIdAccesoGaleriaParaLog;

    if (!idAccesoActual && document.getElementById('clipremium-gallery-section')) {
        console.warn("ID de Acceso no disponible para registrar la interacción en CliPremium.");
        return; 
    } else if (!document.getElementById('clipremium-gallery-section')) {
        return;
    }

    const nombreImagenOriginalAttr = galeriaActivaLightbox[indiceActualLightbox] ? galeriaActivaLightbox[indiceActualLightbox].getAttribute('data-original-name') : null;
    const nombreImagen = nombreImagenOriginalAttr || (currentOriginalWasabiUrlForLightbox ? currentOriginalWasabiUrlForLightbox.substring(currentOriginalWasabiUrlForLightbox.lastIndexOf('/') + 1).split('?')[0] : 'desconocida.jpg');
    
    const payload = {
        idAcceso: idAccesoActual,
        nombre_imagen_original: nombreImagen,
        ...datosInteraccion,
        timestamp_interaccion: new Date().toISOString()
    };

    try {
        const response = await fetch('/registrar-interaccion-edicion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error('Error al registrar interacción de edición en backend:', await response.text());
        } else {
            console.log('Interacción de edición registrada:', payload);
        }
    } catch (error) {
        console.error('Fallo de red al enviar interacción de edición:', error);
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
    const filtroAnteriorParaLog = JSON.stringify(currentLightboxFilters); 
    const nombreFiltroActivoAnterior = currentLightboxFilters.activeNamedFilter;

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
}

function hideAllEditPanels() {
    if (brightnessSliderContainer) brightnessSliderContainer.style.display = 'none';
    if (contrastSliderContainer) contrastSliderContainer.style.display = 'none';
    if (saturationSliderContainer) saturationSliderContainer.style.display = 'none';
    if (filtersPanelContainer) filtersPanelContainer.style.display = 'none';
    if (backgroundsPanelContainer) backgroundsPanelContainer.style.display = 'none';
}

function updateActiveToolButton(activeButton) {
    if (editorToolbar) {
        editorToolbar.querySelectorAll('.tool-button').forEach(button => {
            if (button.id !== 'tool-reset' && button.id !== 'lightbox-download-button') {
                button.classList.remove('active');
            }
        });
        if (activeButton && activeButton.id !== 'tool-reset' && activeButton.id !== 'lightbox-download-button') {
            activeButton.classList.add('active');
        }
    }
}

function mostrarImagenLightbox(indice) {
    if (!lightboxElement || !imagenLightboxElement || !tituloLightboxElement || !controlPrevLightbox || !controlNextLightbox ||
        indice < 0 || indice >= galeriaActivaLightbox.length) { return; }
    const enlaceActual = galeriaActivaLightbox[indice];
    if (!enlaceActual) return;

    currentOriginalWasabiUrlForLightbox = enlaceActual.getAttribute('data-original-wasabi-url') || enlaceActual.getAttribute('href');
    
    const idAcceso = sessionStorage.getItem('idAccesoGaleriaCliente');
    if (idAcceso) { 
        currentIdAccesoGaleriaParaLog = idAcceso;
    }

    const titleImagen = enlaceActual.getAttribute('data-title') || 'Imagen de la galería';

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
        if (!esGaleriaDeCliente) {
            hideAllEditPanels(); updateActiveToolButton(null);
        } else {
            const originalButton = editorToolbar.querySelector('.filter-option[data-filter="original"]');
            if (originalButton && filterOptions.length > 0) { 
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                originalButton.classList.add('active-filter');
            }
        }
    }
}

function abrirLightbox(galeria, indice, esGaleriaDeCliente = false) {
    if (!lightboxElement) { console.error("Lightbox element not found."); return; }
    galeriaActivaLightbox = galeria;
    const idAcceso = sessionStorage.getItem('idAccesoGaleriaCliente');
    if (esGaleriaDeCliente && idAcceso) { 
        currentIdAccesoGaleriaParaLog = idAcceso;
    }
    mostrarImagenLightbox(indice); 
    lightboxElement.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarLightboxFunction() {
    if (!lightboxElement) return;
    lightboxElement.classList.remove('activo');
    document.body.style.overflow = 'auto';
    resetImageAdjustments(); hideAllEditPanels(); updateActiveToolButton(null);
    if (editorToolbar) editorToolbar.style.display = 'none';
    if (imagenLightboxElement) {
        imagenLightboxElement.classList.remove('zoomed-in');
        imagenLightboxElement.style.cursor = 'zoom-in';
        if (imagenLightboxElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(imagenLightboxElement.src);
        }
        imagenLightboxElement.src = '';
        imagenLightboxElement.style.boxShadow = 'none'; 
    }
    isLightboxImageZoomed = false;
    currentOriginalWasabiUrlForLightbox = '';
}

window.inicializarLightboxGlobal = function(selectorEnlaces) {
    const nuevosEnlacesGaleria = Array.from(document.querySelectorAll(selectorEnlaces));
    if (nuevosEnlacesGaleria.length === 0) return;

    nuevosEnlacesGaleria.forEach((enlace, indice) => {
        const nuevoEnlace = enlace.cloneNode(true);
        if(enlace.parentNode) enlace.parentNode.replaceChild(nuevoEnlace, enlace);
        
        nuevoEnlace.addEventListener('click', function(evento) {
            evento.preventDefault();
            const esGaleriaDeCliente = this.getAttribute('data-lightbox') === 'clipremium-gallery';
            abrirLightbox(nuevosEnlacesGaleria, indice, esGaleriaDeCliente);
        });
    });
};

if (lightboxElement) {
    if (imagenLightboxElement) {
        imagenLightboxElement.addEventListener('click', function(e) { e.stopPropagation(); if (editorToolbar && window.getComputedStyle(editorToolbar).display !== 'none') { if (!isLightboxImageZoomed) { this.classList.add('zoomed-in'); this.style.cursor = 'zoom-out'; } else { this.classList.remove('zoomed-in'); this.style.cursor = 'zoom-in'; } isLightboxImageZoomed = !isLightboxImageZoomed; } });
    }
    if (!lightboxElement.dataset.listenersAttached) {
        if (cerrarLightboxBtn) cerrarLightboxBtn.addEventListener('click', cerrarLightboxFunction);
        lightboxElement.addEventListener('click', function(e) { if (e.target === this) cerrarLightboxFunction(); });
        document.addEventListener('keydown', function(e) { if (lightboxElement.classList.contains('activo') && galeriaActivaLightbox.length > 0) { if (e.key === 'Escape') cerrarLightboxFunction(); if (e.key === 'ArrowLeft' && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); if (e.key === 'ArrowRight' && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); } });
        if (controlPrevLightbox) controlPrevLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox > 0) mostrarImagenLightbox(indiceActualLightbox - 1); });
        if (controlNextLightbox) controlNextLightbox.addEventListener('click', () => { if (galeriaActivaLightbox.length > 0 && indiceActualLightbox < galeriaActivaLightbox.length - 1) mostrarImagenLightbox(indiceActualLightbox + 1); });
        lightboxElement.dataset.listenersAttached = 'true';
    }
}

// Reemplaza esta función completa en tu archivo script.js

async function loadBackgrounds() {
    if (!backgroundsPanelContainer) return;
    try {
        const response = await fetch('/api/backgrounds');
        if (!response.ok) throw new Error('No se pudo cargar la lista de fondos.');
        
        const backgroundFiles = await response.json();
        
        backgroundsPanelContainer.innerHTML = ''; // Limpiar panel
        backgroundFiles.forEach(bgFile => {
            const bgThumb = document.createElement('img');
            bgThumb.src = bgFile.url;
            bgThumb.className = 'background-thumbnail';
            bgThumb.title = `Usar fondo: ${bgFile.name}`;
            bgThumb.setAttribute('data-bg-url', bgFile.url);

            // --- MEJORA DE RENDIMIENTO ---
            // Esta línea le dice al navegador que cargue las imágenes solo cuando sea necesario.
            bgThumb.loading = 'lazy'; 
            
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
    loadingOverlay.innerHTML = '<span>Espere, puede demorar hasta 2 minutos.<br>No cierre la ventana. Aprovecha, por s/25 accede a todas las fotos de tu sesión, podrás cambiarle fondo a todas! (promoción disponible poco tiempo)</span>';
    
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

    // Listener para Brillo
    if (toolBrightness && brightnessSliderContainer && brightnessSlider && brightnessValueDisplay) {
        let valorInicialBrillo = currentLightboxFilters.brightness;
        toolBrightness.addEventListener('click', (e) => { e.stopPropagation(); const isActive = brightnessSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolBrightness); brightnessSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        brightnessSlider.addEventListener('focus', e => { valorInicialBrillo = parseInt(e.target.value); });
        brightnessSlider.addEventListener('input', (e) => { currentLightboxFilters.brightness = parseInt(e.target.value); if(brightnessValueDisplay) brightnessValueDisplay.textContent = `${currentLightboxFilters.brightness}%`; applyCssFiltersToLightboxImage(); });
        brightnessSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'brightness', valor_filtro_inicial: valorInicialBrillo.toString(), valor_filtro_final: e.target.value }); });
        if(brightnessSliderContainer) brightnessSliderContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Listener para Contraste
    if (toolContrast && contrastSliderContainer && contrastSlider && contrastValueDisplay) {
        let valorInicialContraste = currentLightboxFilters.contrast;
        toolContrast.addEventListener('click', (e) => { e.stopPropagation(); const isActive = contrastSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolContrast); contrastSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        contrastSlider.addEventListener('focus', e => { valorInicialContraste = parseInt(e.target.value); });
        contrastSlider.addEventListener('input', (e) => { currentLightboxFilters.contrast = parseInt(e.target.value); if(contrastValueDisplay) contrastValueDisplay.textContent = `${currentLightboxFilters.contrast}%`; applyCssFiltersToLightboxImage(); });
        contrastSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'contrast', valor_filtro_inicial: valorInicialContraste.toString(), valor_filtro_final: e.target.value }); });
        if(contrastSliderContainer) contrastSliderContainer.addEventListener('click', e => e.stopPropagation());
    }

    // Listener para Saturación
    if (toolSaturation && saturationSliderContainer && saturationSlider && saturationValueDisplay) {
        let valorInicialSaturacion = currentLightboxFilters.saturate;
        toolSaturation.addEventListener('click', (e) => { e.stopPropagation(); const isActive = saturationSliderContainer.style.display === 'flex'; hideAllEditPanels(); updateActiveToolButton(isActive ? null : toolSaturation); saturationSliderContainer.style.display = isActive ? 'none' : 'flex'; });
        saturationSlider.addEventListener('focus', e => { valorInicialSaturacion = parseInt(e.target.value); });
        saturationSlider.addEventListener('input', (e) => { currentLightboxFilters.saturate = parseInt(e.target.value); if(saturationValueDisplay) saturationValueDisplay.textContent = `${currentLightboxFilters.saturate}%`; applyCssFiltersToLightboxImage(); });
        saturationSlider.addEventListener('change', e => { registrarInteraccionEdicion({ filtro_aplicado: 'saturation', valor_filtro_inicial: valorInicialSaturacion.toString(), valor_filtro_final: e.target.value }); });
        if(saturationSliderContainer) saturationSliderContainer.addEventListener('click', e => e.stopPropagation());
    }
    
    // Listener para el panel de Filtros
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
                
                applyCssFiltersToLightboxImage();
                filterOptions.forEach(opt => opt.classList.remove('active-filter'));
                this.classList.add('active-filter');

                registrarInteraccionEdicion({
                    filtro_aplicado: 'named_filter_selection',
                    valor_filtro_inicial: filtroAnterior + " " + valorInicialSliders,
                    valor_filtro_final: filterName + " " + JSON.stringify(currentLightboxFilters)
                });
            });
        });
    }

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

    // Listener para el botón de Descargar
    if (lightboxDownloadButton && imagenLightboxElement) {
        lightboxDownloadButton.addEventListener('click', async function(e) {
            e.stopPropagation();

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
            }
        });
    }

    document.addEventListener('click', function(event) {
        if(lightboxElement && lightboxElement.classList.contains('activo') && editorToolbar && editorToolbar.style.display !== 'none') {
            let clickedOnToolbarOrPanel = editorToolbar.contains(event.target);
            if (!clickedOnToolbarOrPanel) {
                hideAllEditPanels();
                updateActiveToolButton(null);
            }
        }
    });
} 

document.addEventListener('DOMContentLoaded', function() {
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
        });
    }

    if (document.getElementById('galeria-inicio')) {
        window.inicializarLightboxGlobal('#galeria-inicio a[data-lightbox="galeria-principal"]');
    }
    console.log("Jony Lager - Script principal cargado y DOM listo.");
});