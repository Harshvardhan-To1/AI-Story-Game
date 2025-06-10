// AI Story Game with Improved Choices Extraction
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { fal } = require('@fal-ai/client');
const { GameState } = require('./gameState');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure FAL AI with API key
fal.config({
  credentials: process.env.FAL_KEY
});

// Create a Map to store active game sessions
const gameSessions = new Map();

// Default choices if extraction fails
const DEFAULT_CHOICES = [
  "Continue exploring",
  "Take a different path",
  "Stop and observe your surroundings"
];

/**
 * Extract choices from the LLM response
 * This function handles various output formats and ensures we get valid choices
 * 
 * @param {Object} choicesResponse - The raw API response for choices generation
 * @returns {Array} - Array of string choices
 */
/**
 * Extract choices from the LLM response
 * Simple and robust extraction using manual string matching
 * 
 * @param {Object} choicesResponse - The raw API response for choices generation
 * @returns {Array} - Array of string choices
 */
function extractChoices(choicesResponse) {
  try {
    console.log("Extracting choices from:", JSON.stringify(choicesResponse).substring(0, 200) + "...");
    
    // If the response is already an array, just return it
    if (Array.isArray(choicesResponse)) {
      return choicesResponse.length > 0 ? choicesResponse : DEFAULT_CHOICES;
    }
    
    // If no response or invalid response, return defaults
    if (!choicesResponse || typeof choicesResponse !== 'object') {
      console.warn("Invalid choices response, using defaults");
      return DEFAULT_CHOICES;
    }
    
    // Check if response has data.output property (common format from API)
    if (choicesResponse.data && choicesResponse.data.output) {
      const output = choicesResponse.data.output;
      
      // Extract quoted strings using simple regex
      const manualExtract = output.match(/"(.*?)"/g);
      if (manualExtract) {
        const cleanedChoices = manualExtract.map(choice => choice.replace(/"/g, ''));
        console.log("Successfully extracted choices manually");
        
        // Make sure we have at least 3 choices, pad with defaults if needed
        if (cleanedChoices.length < 3) {
          const neededDefaults = 3 - cleanedChoices.length;
          return [...cleanedChoices, ...DEFAULT_CHOICES.slice(0, neededDefaults)];
        }
        
        // Return the first 3 choices
        return cleanedChoices.slice(0, 3);
      }
    }
    
    // If all extraction attempts fail, return defaults
    console.warn("Could not extract valid choices, using defaults");
    return DEFAULT_CHOICES;
  } catch (error) {
    console.error("Error extracting choices:", error);
    return DEFAULT_CHOICES;
  }
}

/**
 * Generate speech from text using dia-tts
 * 
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string|null>} - URL to the generated audio file or null if failed
 */
async function generateSpeech(text) {
  try {
    console.log("Generating speech for:", text.substring(0, 100) + "...");
    
    // Format the text for dia-tts using [S1] for narrator
    let formattedText = text;
    
    // If the text doesn't already contain speaker tags, add [S1] as narrator
    if (!formattedText.includes('[S1]') && !formattedText.includes('[S2]')) {
      formattedText = `[S1] ${formattedText}`;
    }
    
    // Call the dia-tts API
    const result = await fal.subscribe("fal-ai/dia-tts", {
      input: {
        text: formattedText
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          if (update.logs && update.logs.length > 0) {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        }
      },
    });
    
    console.log("Speech generation completed, requestId:", result.requestId);
    
    // Return the audio URL from the response
    if (result.data && result.data.audio.url) {
      return result.data.audio.url;
    } else {
      console.warn("No audio URL found in the response");
      return null;
    }
  } catch (error) {
    console.error("Error generating speech:", error);
    return null;
  }
}

// Initialize a new game session
app.post('/api/game/start', async (req, res) => {
  try {
    const sessionId = Date.now().toString();
    const game = new GameState();
    
    // Start a new game
    const initialScene = await game.startNewGame();
    console.log("Initial scene retrieved");
    
    // Store the game instance
    gameSessions.set(sessionId, game);
    
    // Process the scene data
    let storyText = "";
    if (initialScene.text && initialScene.text.data && initialScene.text.data.output) {
      storyText = initialScene.text.data.output;
    }
    
    // Generate speech from the story text
    const audioUrl = await generateSpeech(storyText);
    
    // Extract image URL
    let imageUrl = null;
    if (initialScene.image && initialScene.image.images && initialScene.image.images.length > 0) {
      imageUrl = initialScene.image.images[0].url;
    }
    
    // Extract choices with our robust function
    const choices = extractChoices(initialScene.choices);
    
    // Send the processed scene
    res.json({
      sessionId,
      text: storyText,
      imageUrl: imageUrl,
      audioUrl: audioUrl,
      choices: choices
    });
  } catch (error) {
    console.error("Error starting game:", error);
    res.status(500).json({ error: "Failed to start game" });
  }
});

// Make a choice in the game
app.post('/api/game/choice', async (req, res) => {
  try {
    const { sessionId, choiceIndex } = req.body;
    
    // Get the game instance
    const game = gameSessions.get(sessionId);
    if (!game) {
      return res.status(404).json({ error: "Game session not found" });
    }
    
    // Make the choice
    const nextScene = await game.makeChoice(parseInt(choiceIndex, 10));
    console.log("Next scene retrieved");
    
    // Process the scene data
    let storyText = "";
    if (nextScene.text && nextScene.text.data && nextScene.text.data.output) {
      storyText = nextScene.text.data.output;
    }
    
    // Generate speech from the story text
    const audioUrl = await generateSpeech(storyText);
    
    // Extract image URL
    let imageUrl = null;
    if (nextScene.image && nextScene.image.images && nextScene.image.images.length > 0) {
      imageUrl = nextScene.image.images[0].url;
    }
    
    // Extract choices with our robust function
    const choices = extractChoices(nextScene.choices);
    
    // Send the processed scene
    res.json({
      sessionId,
      text: storyText,
      imageUrl: imageUrl,
      audioUrl: audioUrl,
      choices: choices
    });
  } catch (error) {
    console.error("Error processing choice:", error);
    res.status(500).json({ error: "Failed to process choice" });
  }
});

// HTML content for the frontend
// HTML content for the frontend with proper escaping
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Story Adventure</title>
  <style>
    body {
      font-family: 'Bookman Old Style', Georgia, serif;
      background-color: #1a1a1a;
      color: #f0f0f0;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    
    .game-container {
      max-width: 800px;
      width: 100%;
      background-color: #2a2a2a;
      border-radius: 10px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      margin: 20px;
    }
    
    .image-container {
      width: 100%;
      height: 400px;
      overflow: hidden;
      position: relative;
    }
    
    .story-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 1s ease;
    }
    
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10;
    }
    
    .spinner {
      width: 50px;
      height: 50px;
      border: 5px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .story-content {
      padding: 20px;
    }
    
    .story-text {
      line-height: 1.6;
      font-size: 18px;
      white-space: pre-line;
      margin-bottom: 30px;
    }
    
    .choices-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    
    .choice-button {
      background-color: #3a3a3a;
      border: 2px solid #5a5a5a;
      color: #f0f0f0;
      padding: 15px 20px;
      font-size: 16px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: left;
      font-family: 'Bookman Old Style', Georgia, serif;
    }
    
    .choice-button:hover {
      background-color: #4a4a4a;
      border-color: #888;
      transform: translateY(-2px);
    }
    
    .choice-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    .title-container {
      text-align: center;
      padding: 20px;
      background-color: #222;
      border-bottom: 1px solid #444;
    }
    
    .game-title {
      margin: 0;
      font-size: 32px;
      color: #d4af37;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
    
    .start-button {
      background-color: #d4af37;
      color: #222;
      border: none;
      padding: 15px 30px;
      font-size: 18px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: 'Bookman Old Style', Georgia, serif;
      margin-top: 20px;
      font-weight: bold;
    }
    
    .start-button:hover {
      background-color: #e5c158;
      transform: translateY(-2px);
    }
    
    .fade-in {
      animation: fadeIn 0.5s ease-in;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .debug-button {
      position: fixed;
      bottom: 10px;
      right: 10px;
      background-color: #333;
      color: #888;
      border: 1px solid #555;
      padding: 5px 10px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
    }
    
    .audio-controls {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      gap: 10px;
      background-color: #333;
      padding: 15px;
      border-radius: 8px;
      position: relative;
    }
    
    .audio-button {
      background-color: #d4af37;
      color: #222;
      border: none;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 20px;
    }
    
    .audio-button:hover {
      background-color: #e5c158;
      transform: scale(1.05);
    }
    
    .audio-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    .audio-status {
      font-size: 14px;
      color: #aaa;
      flex-grow: 1;
    }
    
    .progress-container {
      width: 100%;
      height: 4px;
      background-color: #444;
      position: absolute;
      bottom: 0;
      left: 0;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }
    
    .progress-bar {
      height: 100%;
      background-color: #d4af37;
      width: 0%;
      transition: width 0.3s linear;
    }
    
    .volume-control {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .volume-icon {
      color: #888;
      font-size: 18px;
      cursor: pointer;
    }
    
    .volume-slider {
      -webkit-appearance: none;
      width: 80px;
      height: 4px;
      border-radius: 2px;
      background: #444;
      outline: none;
    }
    
    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d4af37;
      cursor: pointer;
    }
    
    .volume-slider::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d4af37;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="game-container">
    <div class="title-container">
      <h1 class="game-title">Mystic Paths</h1>
    </div>
    
    <div id="game-content">
      <!-- Game content will be loaded here dynamically -->
      <div class="story-content" style="text-align: center; padding: 50px 20px;">
        <h2>Welcome to the Mystical Adventure</h2>
        <p>Embark on an AI-generated adventure where every choice shapes your unique story.</p>
        <p>The path you choose will lead to wonders or perils unknown.</p>
        <button id="start-game" class="start-button">Begin Your Journey</button>
      </div>
    </div>
  </div>
  
  <button id="debug-button" class="debug-button">Debug Mode</button>

  <script>
    // Game state
    let gameState = {
      sessionId: null,
      isLoading: false,
      debugMode: false,
      audio: null,
      isPlaying: false,
      volume: 0.8
    };
    
    // DOM Elements
    const gameContent = document.getElementById('game-content');
    const startButton = document.getElementById('start-game');
    const debugButton = document.getElementById('debug-button');
    
    // Toggle debug mode
    debugButton.addEventListener('click', function() {
      gameState.debugMode = !gameState.debugMode;
      debugButton.textContent = gameState.debugMode ? 'Hide Debug' : 'Debug Mode';
      
      // Update debug info display
      const debugInfo = document.getElementById('debug-info');
      if (debugInfo) {
        debugInfo.style.display = gameState.debugMode ? 'block' : 'none';
      }
    });
    
    // Play/pause audio function
    function toggleAudio() {
      if (!gameState.audio) return;
      
      if (gameState.isPlaying) {
        gameState.audio.pause();
        gameState.isPlaying = false;
        document.getElementById('play-button').innerHTML = '▶';
        document.getElementById('audio-status').textContent = 'Paused';
      } else {
        gameState.audio.play();
        gameState.isPlaying = true;
        document.getElementById('play-button').innerHTML = '❚❚';
        document.getElementById('audio-status').textContent = 'Playing narration...';
        updateProgressBar();
      }
    }
    
    // Update volume function
    function updateVolume(value) {
      gameState.volume = value;
      
      if (gameState.audio) {
        gameState.audio.volume = value;
      }
      
      // Update volume icon
      const volumeIcon = document.getElementById('volume-icon');
      if (volumeIcon) {
        if (value >= 0.6) {
          volumeIcon.innerHTML = '🔊';
        } else if (value >= 0.2) {
          volumeIcon.innerHTML = '🔉';
        } else if (value > 0) {
          volumeIcon.innerHTML = '🔈';
        } else {
          volumeIcon.innerHTML = '🔇';
        }
      }
    }
    
    // Update progress bar function
    function updateProgressBar() {
      if (!gameState.audio) return;
      
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) {
        const percentage = (gameState.audio.currentTime / gameState.audio.duration) * 100;
        progressBar.style.width = percentage + '%';
      }
      
      // Update time display
      const timeDisplay = document.getElementById('time-display');
      if (timeDisplay) {
        const currentTime = formatTime(gameState.audio.currentTime);
        const totalTime = formatTime(gameState.audio.duration);
        timeDisplay.textContent = currentTime + ' / ' + totalTime;
      }
      
      // Request animation frame for smooth updates
      if (gameState.isPlaying) {
        requestAnimationFrame(updateProgressBar);
      }
    }
    
    // Format time function (converts seconds to MM:SS format)
    function formatTime(seconds) {
      if (isNaN(seconds)) return '00:00';
      
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      
      return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
    }
    
    // Load and play audio function
    function loadAudio(url) {
      // Stop any existing audio
      if (gameState.audio) {
        gameState.audio.pause();
        gameState.audio.removeEventListener('ended', audioEndedHandler);
        gameState.audio.removeEventListener('error', audioErrorHandler);
        gameState.audio = null;
        gameState.isPlaying = false;
      }
      
      if (!url) {
        console.warn("No audio URL provided");
        return;
      }
      
      // Create new audio element
      gameState.audio = new Audio(url);
      gameState.audio.volume = gameState.volume;
      
      // Add event listeners
      gameState.audio.addEventListener('ended', audioEndedHandler);
      gameState.audio.addEventListener('error', audioErrorHandler);
      gameState.audio.addEventListener('loadedmetadata', audioLoadedHandler);
      
      // Auto-play the audio with error handling
      gameState.audio.play().then(() => {
        gameState.isPlaying = true;
        document.getElementById('play-button').innerHTML = '❚❚';
        document.getElementById('audio-status').textContent = 'Playing narration...';
        updateProgressBar();
      }).catch(error => {
        console.error("Auto-play prevented:", error);
        document.getElementById('audio-status').textContent = 'Click play to listen';
      });
    }
    
    // Audio event handlers
    function audioEndedHandler() {
      gameState.isPlaying = false;
      document.getElementById('play-button').innerHTML = '▶';
      document.getElementById('audio-status').textContent = 'Narration complete';
      
      // Reset progress bar
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
      }
    }
    
    function audioErrorHandler() {
      console.error("Error loading audio");
      document.getElementById('audio-status').textContent = 'Error loading audio';
    }
    
    function audioLoadedHandler() {
      // Update time display
      const timeDisplay = document.getElementById('time-display');
      if (timeDisplay) {
        const currentTime = formatTime(0);
        const totalTime = formatTime(gameState.audio.duration);
        timeDisplay.textContent = currentTime + ' / ' + totalTime;
      }
    }
    
    // Start a new game
    async function startGame() {
      setLoading(true);
      
      try {
        const response = await fetch('/api/game/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to start game');
        }
        
        const data = await response.json();
        gameState.sessionId = data.sessionId;
        gameState.currentScene = data;
        
        // Update the UI with the first scene
        updateGameScene(data);
        
        // Load and play audio if available
        if (data.audioUrl) {
          loadAudio(data.audioUrl);
        }
      } catch (error) {
        console.error('Error starting game:', error);
        showError('Failed to start the game. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    // Make a choice in the game
    async function makeChoice(choiceIndex) {
      setLoading(true);
      
      try {
        const response = await fetch('/api/game/choice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: gameState.sessionId,
            choiceIndex: choiceIndex
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to process choice');
        }
        
        const data = await response.json();
        gameState.currentScene = data;
        
        // Update the UI with the new scene
        updateGameScene(data);
        
        // Load and play audio if available
        if (data.audioUrl) {
          loadAudio(data.audioUrl);
        }
      } catch (error) {
        console.error('Error making choice:', error);
        showError('Failed to process your choice. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    // Update the game scene in the UI
    function updateGameScene(scene) {
      // Audio controls
      const audioControlsHtml = scene.audioUrl ? 
        '<div class="audio-controls">' +
          '<button id="play-button" class="audio-button" onclick="toggleAudio()">▶</button>' +
          '<div class="audio-status" id="audio-status">Loading narration...</div>' +
          '<div class="volume-control">' +
            '<span id="volume-icon" class="volume-icon">🔊</span>' +
            '<input type="range" id="volume-slider" class="volume-slider" min="0" max="1" step="0.1" value="' + gameState.volume + '" onchange="updateVolume(this.value)">' +
          '</div>' +
          '<span id="time-display" style="margin-left: 10px; font-size: 12px; color: #888;">00:00 / 00:00</span>' +
          '<div class="progress-container">' +
            '<div id="progress-bar" class="progress-bar"></div>' +
          '</div>' +
        '</div>' : '';
      
      // Debug information
      const debugHtml = gameState.debugMode ? 
        '<div id="debug-info" style="margin-top: 30px; padding: 15px; background: #333; border-radius: 5px; font-family: monospace; font-size: 12px; color: #aaa;">' +
          '<h4 style="margin-top: 0;">Debug Information</h4>' +
          '<pre>' + JSON.stringify(scene, null, 2) + '</pre>' +
        '</div>' : 
        '<div id="debug-info" style="display: none;"></div>';
      
      // Create the HTML for the scene
      const html = 
        '<div class="image-container">' +
          (scene.imageUrl ? '<img src="' + scene.imageUrl + '" alt="Story scene" class="story-image fade-in">' : '') +
        '</div>' +
        '<div class="story-content">' +
          audioControlsHtml +
          '<div class="story-text fade-in">' + scene.text + '</div>' +
          '<div class="choices-container">' +
            scene.choices.map(function(choice, index) {
              return '<button class="choice-button fade-in" onclick="makeChoice(' + index + ')">' +
                choice +
              '</button>';
            }).join('') +
          '</div>' +
          debugHtml +
        '</div>';
      
      // Update the game content
      gameContent.innerHTML = html;
      
      // Scroll to the top
      window.scrollTo(0, 0);
    }
    
    // Show a loading state
    function setLoading(isLoading) {
      gameState.isLoading = isLoading;
      
      if (isLoading) {
        // Add loading overlay to image container if it exists
        const imageContainer = document.querySelector('.image-container');
        if (imageContainer) {
          const loadingOverlay = document.createElement('div');
          loadingOverlay.className = 'loading-overlay';
          loadingOverlay.innerHTML = '<div class="spinner"></div>';
          imageContainer.appendChild(loadingOverlay);
        }
        
        // Disable choice buttons
        const buttons = document.querySelectorAll('.choice-button');
        buttons.forEach(button => {
          button.disabled = true;
        });
        
        // Disable audio button
        const audioButton = document.getElementById('play-button');
        if (audioButton) {
          audioButton.disabled = true;
        }
      } else {
        // Remove loading overlay
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
          loadingOverlay.remove();
        }
        
        // Enable choice buttons
        const buttons = document.querySelectorAll('.choice-button');
        buttons.forEach(button => {
          button.disabled = false;
        });
        
        // Enable audio button
        const audioButton = document.getElementById('play-button');
        if (audioButton) {
          audioButton.disabled = false;
        }
      }
    }
    
    // Show an error message
    function showError(message) {
      const errorHtml = 
        '<div style="text-align: center; padding: 20px; color: #ff6b6b;">' +
          '<p>' + message + '</p>' +
          '<button onclick="startGame()" class="start-button">Try Again</button>' +
        '</div>';
      
      // Add the error message to the game content
      gameContent.innerHTML += errorHtml;
    }
    
    // Add event listener to start button
    if (startButton) {
      startButton.addEventListener('click', startGame);
    }
  </script>
</body>
</html>`;

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write the HTML file to the public directory
fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to play the game`);
});