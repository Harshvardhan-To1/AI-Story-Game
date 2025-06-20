// AI Story Game Frontend with Simplified Implementation
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
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

// Create a Map to store active game sessions
const gameSessions = new Map();

// Helper function to extract text from API response
function extractText(textResponse) {
  try {
    console.log("Processing text response");
    
    // Default text if extraction fails
    const defaultText = "The adventure continues...";
    
    // Handle null or undefined
    if (!textResponse) return defaultText;
    
    // For string responses
    if (typeof textResponse === 'string') {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(textResponse);
        return parsed.output || textResponse;
      } catch (e) {
        // Not valid JSON, return as is
        return textResponse;
      }
    }
    
    // For object responses
    if (typeof textResponse === 'object') {
      // If it's the raw API response with data property
      if (textResponse.data) {
        const data = textResponse.data;
        
        // If data is a string, try to parse it as JSON
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            return parsed.output || data;
          } catch (e) {
            // Not valid JSON, return as is
            return data;
          }
        }
        
        // If data is an object with output property
        if (typeof data === 'object' && data !== null && data.output) {
          return data.output;
        }
        
        // Return data as string
        return JSON.stringify(data);
      }
      
      // If it has output property directly
      if (textResponse.output) {
        return textResponse.output;
      }
      
      // If it has text property
      if (textResponse.text) {
        return textResponse.text;
      }
    }
    
    // Default fallback
    return defaultText;
  } catch (error) {
    console.error("Error extracting text:", error);
    return "The story continues...";
  }
}

// Function to extract choices from API response
function extractChoices(choicesResponse) {
  try {
    console.log("Processing choices response");
    
    // Default choices
    const defaultChoices = [
      "Continue exploring",
      "Take a different path",
      "Stop and observe your surroundings"
    ];
    
    // If it's already an array
    if (Array.isArray(choicesResponse)) {
      return choicesResponse.length > 0 ? choicesResponse : defaultChoices;
    }
    
    // For object responses with data property
    if (choicesResponse && typeof choicesResponse === 'object' && choicesResponse.data) {
      const data = choicesResponse.data;
      
      // If data is already an array
      if (Array.isArray(data)) {
        return data.length > 0 ? data : defaultChoices;
      }
      
      // If data is a string, try to extract JSON array from code block
      if (typeof data === 'string') {
        // Look for JSON array in code block
        const codeBlockMatch = data.match(/```json\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          try {
            const choices = JSON.parse(codeBlockMatch[1]);
            if (Array.isArray(choices) && choices.length > 0) {
              return choices;
            }
          } catch (e) {
            console.warn("Error parsing JSON from code block");
          }
        }
      }
      
      // If data is an object with output property
      if (typeof data === 'object' && data !== null && data.output) {
        // If output is a string, try to extract JSON array from code block
        if (typeof data.output === 'string') {
          const codeBlockMatch = data.output.match(/```json\s*(\[[\s\S]*?\])\s*```/);
          if (codeBlockMatch && codeBlockMatch[1]) {
            try {
              const choices = JSON.parse(codeBlockMatch[1]);
              if (Array.isArray(choices) && choices.length > 0) {
                return choices;
              }
            } catch (e) {
              console.warn("Error parsing JSON from code block in output");
            }
          }
        }
      }
    }
    
    // Return default choices
    return defaultChoices;
  } catch (error) {
    console.error("Error extracting choices:", error);
    return [
      "Continue forward",
      "Look for another path",
      "Rest and consider your options"
    ];
  }
}

// Initialize a new game session
app.post('/api/game/start', async (req, res) => {
  try {
    const sessionId = Date.now().toString();
    const game = new GameState();
    
    // Start a new game
    const initialScene = await game.startNewGame();
    
    // Store the game instance
    gameSessions.set(sessionId, game);
    
    // Process the scene data
    let imageUrl = null;
    if (initialScene.image && 
        initialScene.image.images && 
        Array.isArray(initialScene.image.images) && 
        initialScene.image.images.length > 0) {
      imageUrl = initialScene.image.images[0].url;
    }
    
    // Extract text and choices
    const storyText = extractText(initialScene.text);
    const choices = extractChoices(initialScene.choices);
    
    // Send the processed scene
    res.json({
      sessionId,
      text: storyText,
      imageUrl: imageUrl,
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
    
    // Process the scene data
    let imageUrl = null;
    if (nextScene.image && 
        nextScene.image.images && 
        Array.isArray(nextScene.image.images) && 
        nextScene.image.images.length > 0) {
      imageUrl = nextScene.image.images[0].url;
    }
    
    // Extract text and choices
    const storyText = extractText(nextScene.text);
    const choices = extractChoices(nextScene.choices);
    
    // Send the processed scene
    res.json({
      sessionId,
      text: storyText,
      imageUrl: imageUrl,
      choices: choices
    });
  } catch (error) {
    console.error("Error processing choice:", error);
    res.status(500).json({ error: "Failed to process choice" });
  }
});

// HTML content for the frontend
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Story Game</title>
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
      debugMode: false
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
      } catch (error) {
        console.error('Error making choice:', error);
        showError('Failed to process your choice. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    
    // Update the game scene in the UI
    function updateGameScene(scene) {
      // Debug information
      const debugHtml = gameState.debugMode ? 
        \`<div id="debug-info" style="margin-top: 30px; padding: 15px; background: #333; border-radius: 5px; font-family: monospace; font-size: 12px; color: #aaa;">
          <h4 style="margin-top: 0;">Debug Information</h4>
          <pre>\${JSON.stringify(scene, null, 2)}</pre>
        </div>\` : 
        \`<div id="debug-info" style="display: none;"></div>\`;
      
      // Create the HTML for the scene
      const html = \`
        <div class="image-container">
          \${scene.imageUrl ? \`<img src="\${scene.imageUrl}" alt="Story scene" class="story-image fade-in">\` : ''}
        </div>
        <div class="story-content">
          <div class="story-text fade-in">\${scene.text}</div>
          <div class="choices-container">
            \${scene.choices.map((choice, index) => \`
              <button 
                class="choice-button fade-in" 
                onclick="makeChoice(\${index})"
              >
                \${choice}
              </button>
            \`).join('')}
          </div>
          \${debugHtml}
        </div>
      \`;
      
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
      }
    }
    
    // Show an error message
    function showError(message) {
      const errorHtml = \`
        <div style="text-align: center; padding: 20px; color: #ff6b6b;">
          <p>\${message}</p>
          <button onclick="startGame()" class="start-button">Try Again</button>
        </div>
      \`;
      
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