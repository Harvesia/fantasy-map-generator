/* Manages all direct user interaction with the canvas, including
panning, zooming, and keyboard controls*/

import { viewport, clampViewport } from './core/state.js';
import { requestRender } from './rendering/mainRenderer.js';

const canvas = document.getElementById("map");
let isPanning = false;
let panStartPos = { x: 0, y: 0 };
let clickStartPosition = { x: 0, y: 0 };
const keyState = {};

/**Handles the main canvas click event, passed from the core listeners file
 * This is kept separate to avoid circular dependencies
 * @param {MouseEvent} e The mouse event*/

export function handleCanvasMouseUp(e, clickHandler) {
    if (!isPanning) {
        clickHandler(e);
    }
    isPanning = false;
    canvas.style.cursor = 'pointer';
}

// Sets up all event listeners for canvas controls
export function setupCanvasControls() {
    canvas.addEventListener('mousedown', (e) => {
        isPanning = false;
        // Used to differentiate a click from a pan
        clickStartPosition = { x: e.clientX, y: e.clientY };
        // Used to calculate pan movement
        panStartPos = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', (e) => {
        // Only pan if the primary mouse button is pressed
        if (e.buttons === 1) {
            const dx = e.clientX - clickStartPosition.x;
            const dy = e.clientY - clickStartPosition.y;
            // Start panning if the mouse has moved more than a small threshold
            if (Math.hypot(dx, dy) > 5) {
                isPanning = true;
            }
            
            if (isPanning) {
                canvas.style.cursor = 'grabbing';
                viewport.x -= (e.clientX - panStartPos.x) / viewport.zoom;
                viewport.y -= (e.clientY - panStartPos.y) / viewport.zoom;
                panStartPos = { x: e.clientX, y: e.clientY };
                clampViewport();
                requestRender();
            }
        }
    });

    // The mouseup event is handled by the core listener to pass in the click handler

    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        canvas.style.cursor = 'pointer';
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate world coordinates before zoom
        const worldXBefore = mouseX / viewport.zoom + viewport.x;
        const worldYBefore = mouseY / viewport.zoom + viewport.y;

        // Apply zoom
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? viewport.zoom * zoomFactor : viewport.zoom / zoomFactor;
        viewport.zoom = Math.max(viewport.MIN_ZOOM, Math.min(viewport.MAX_ZOOM, newZoom));

        // Calculate new viewport position to keep mouse position fixed
        viewport.x = worldXBefore - (mouseX / viewport.zoom);
        viewport.y = worldYBefore - (mouseY / viewport.zoom);

        clampViewport();
        requestRender();
    });

    // Keyboard Listeners
    window.addEventListener('keydown', (e) => { keyState[e.key] = true; });
    window.addEventListener('keyup', (e) => { keyState[e.key] = false; });
    startKeyboardPanLoop();
}

// Starts the animation loop for keyboard-based panning
function startKeyboardPanLoop() {
    let lastTime = 0;
    function loop(time) {
        if(lastTime === 0) lastTime = time;
        const deltaTime = (time - lastTime) / 1000;
        lastTime = time;

        let moved = false;
        const moveSpeed = 300 / viewport.zoom; // Speed adjusts with zoom level

        if (keyState['ArrowUp'] || keyState['w']) { viewport.y -= moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowDown'] || keyState['s']) { viewport.y += moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowLeft'] || keyState['a']) { viewport.x -= moveSpeed * deltaTime; moved = true; }
        if (keyState['ArrowRight'] || keyState['d']) { viewport.x += moveSpeed * deltaTime; moved = true; }

        if(moved) {
            clampViewport();
            requestRender();
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}
