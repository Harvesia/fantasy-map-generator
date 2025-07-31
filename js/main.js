/* The main entry point for the application
Its primary responsibilities are to initialize the canvas,
set up event listeners, and trigger the initial world generation*/

import { generateAndRenderWorld } from './core/state.js';
import { setupCoreListeners } from './listeners.js';
import { setupCanvasControls } from './canvasControls.js';
import { setupPanelListeners } from './uiUpdater.js';
import { startRenderLoop } from './rendering/mainRenderer.js';

// Initializes the application when the window has loaded
window.onload = () => {
    const canvas = document.getElementById('map');
    const ctx = canvas.getContext('2d');

    // Basic canvas setup
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.imageSmoothingEnabled = false; 
    console.log("Fantasy Map Generator Initialized.");

    // Set up all user interaction listeners from their respective modules
    setupCoreListeners();  // Handles UI buttons and canvas click logic
    setupCanvasControls(); // Handles pan, zoom, and keyboard movement
    setupPanelListeners(); // Handles info panel close buttons

    // Start the render loop
    startRenderLoop(); 
    
    // Generate the first world
    generateAndRenderWorld();
};
