// AI Story Game Backend with Improved Response Handling
// This script implements the backend for an AI story game with text and image generation

// Import required modules
const { fal } = require('@fal-ai/client');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Configure FAL client with correct authentication method from documentation
fal.config({
  credentials: process.env.FAL_KEY
});

// Utility function to log responses for debugging
function logResponse(label, response) {
  console.log(`--- ${label} Response ---`);
  console.log("Type:", typeof response);
  if (response === null || response === undefined) {
    console.log("Value:", response);
    return;
  }
  
  try {
    if (typeof response === 'object') {
      console.log("Keys:", Object.keys(response));
      console.log("Sample:", JSON.stringify(response).substring(0, 150) + "...");
    } else {
      console.log("Value:", String(response).substring(0, 150) + "...");
    }
  } catch (error) {
    console.log("Error stringifying response:", error.message);
  }
}

// Function to generate story text based on game context and user choice
async function generateStoryText(context, userChoice) {
  const prompt = `
    You are narrating an interactive story game. 
    Current story context: ${context}
    User just chose: ${userChoice}
    Continue the story with 2-3 paragraphs based on this choice.
  `;
  
  try {
    console.log("Generating story text...");
    const result = await fal.subscribe("fal-ai/any-llm", {
      input: {
        prompt: prompt
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
    
    console.log("Text generation completed.");
    logResponse("Text Generation", result);
    logResponse("Text Data", result.data);
    
    // Ensure we return a string for the text
    let storyText = "";
    if (result && result.data) {
      if (typeof result.data === 'string') {
        storyText = result.data;
      } else if (typeof result.data === 'object') {
        // If the result is an object, try to extract text from common response formats
        if (result.data.text) {
          storyText = result.data.text;
        } else if (result.data.content) {
          storyText = result.data.content;
        } else if (result.data.response) {
          storyText = result.data.response;
        } else if (result.data.message) {
          storyText = result.data.message;
        } else {
          // Last resort: stringify the entire object
          storyText = JSON.stringify(result.data);
        }
      } else {
        // Convert any other type to string
        storyText = String(result.data);
      }
    }
    
    return {
      success: true,
      text: storyText,
      requestId: result.requestId,
      rawResponse: result // Store the raw response for debugging
    };
  } catch (error) {
    console.error("Error generating text:", error);
    return {
      success: false,
      text: "Failed to generate story text. The journey continues...",
      error: error.message
    };
  }
}

// Function to generate an image based on the story context
async function generateStoryImage(sceneDescription) {
  const imagePrompt = `
    Scene from interactive story game: ${sceneDescription}
    Detailed, dramatic lighting, cinematic composition, high quality
  `;
  
  try {
    console.log("Generating story image...");
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: imagePrompt
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
    
    console.log("Image generation completed.");
    logResponse("Image Generation", result);
    
    return {
      success: true,
      imageData: result.data,
      requestId: result.requestId
    };
  } catch (error) {
    console.error("Error generating image:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Game state manager
class GameState {
  constructor() {
    this.currentScene = null;
    this.history = [];
    this.choices = [];
  }
  
  async startNewGame() {
    // Initial story setup
    const initialContext = "You find yourself in a mysterious forest at dusk. The trees tower above you, their branches swaying gently in the breeze.";
    const initialChoices = [
      "Follow the faint glowing light in the distance",
      "Set up camp and wait until morning",
      "Climb a tree to get a better view"
    ];
    
    // Generate the opening text
    const textResult = await generateStoryText(initialContext, "Game start");
    console.log("Text generation result:", textResult.success ? "Success" : "Failed");
    
    // Generate the opening image
    const imageResult = await generateStoryImage(initialContext);
    console.log("Image generation result:", imageResult.success ? "Success" : "Failed");
    
    // Set up the first scene with proper error handling
    this.currentScene = {
      text: textResult.success ? textResult.text : "As you stand in the mysterious forest, you feel a sense of adventure ahead. The path branches in several directions, each offering its own mysteries to uncover.",
      image: imageResult.success ? imageResult.imageData : null,
      choices: initialChoices
    };
    
    return this.currentScene;
  }
  
  async makeChoice(choiceIndex) {
    // Store current scene in history
    this.history.push({...this.currentScene});
    
    // Get the selected choice
    const selectedChoice = this.currentScene.choices[choiceIndex];
    if (!selectedChoice) {
      throw new Error("Invalid choice index");
    }
    
    // Create context from previous scene and choice
    const currentContext = this.currentScene.text;
    
    // Generate new text based on the choice
    const textResult = await generateStoryText(currentContext, selectedChoice);
    
    // Generate new image based on the choice
    let imageDescription = selectedChoice;
    if (textResult.success && typeof textResult.text === 'string') {
      // Only add text to description if it's available and is a string
      imageDescription += " - " + textResult.text.substring(0, 100);
    }
    
    const imageResult = await generateStoryImage(imageDescription);
    
    // Generate new choices
    const newChoices = await this.generateChoices(textResult.text);
    
    // Update current scene with proper error handling
    this.currentScene = {
      text: textResult.success ? textResult.text : "The adventure continues as you make your choice. What will you do next?",
      image: imageResult.success ? imageResult.imageData : null,
      choices: newChoices
    };
    
    return this.currentScene;
  }
  
  async generateChoices(sceneText) {
    // Default choices in case generation fails
    const defaultChoices = [
      "Continue exploring",
      "Take a different path",
      "Stop and observe your surroundings"
    ];
    
    // If text isn't a string, use default choices
    if (typeof sceneText !== 'string') {
      console.log("Scene text is not a string, using default choices");
      return defaultChoices;
    }
    
    // Generate contextual choices based on the current scene
    const choicePrompt = `
      Based on this scene in our story:
      "${sceneText}"
      
      Generate 3 interesting and distinct choices for what the player might do next.
      Return only the choices as a JSON array of strings.
    `;
    
    try {
      const result = await fal.subscribe("fal-ai/any-llm", {
        input: {
          prompt: choicePrompt
        }
      });
      
      // Log the result for debugging
      logResponse("Choices Generation", result);
      
      // Attempt to parse JSON array from result
      if (result && result.data) {
        try {
          // Check if result.data is already a parsed object
          if (Array.isArray(result.data)) {
            return result.data.length > 0 ? result.data : defaultChoices;
          }
          
          // If it's a string, try to parse it as JSON
          if (typeof result.data === 'string') {
            // Try to find a JSON array in the response
            const jsonMatch = result.data.match(/\[.*\]/s);
            if (jsonMatch) {
              const parsedData = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsedData) && parsedData.length > 0) {
                return parsedData;
              }
            }
            
            // If no JSON array found, try to parse the whole response
            const choices = JSON.parse(result.data);
            if (Array.isArray(choices) && choices.length > 0) {
              return choices;
            }
          }
        } catch (e) {
          console.warn("Could not parse choices as JSON:", e.message);
          
          // Try to extract choices from formatted text
          if (typeof result.data === 'string') {
            const lines = result.data.split('\n').filter(line => 
              line.trim().length > 0 && 
              !line.includes('```') && 
              !line.toLowerCase().includes('options') &&
              !line.toLowerCase().includes('choices')
            );
            
            if (lines.length >= 3) {
              // Take the first 3 non-empty lines as choices
              return lines.slice(0, 3).map(line => 
                line.replace(/^[0-9\-\*\.\)]+\s*/, '') // Remove list markers
              );
            }
          }
        }
      }
      
      // If all parsing attempts fail, use default choices
      console.log("Could not extract valid choices, using defaults");
      return defaultChoices;
    } catch (error) {
      console.error("Error generating choices:", error);
      return defaultChoices;
    }
  }
}

// Simple server implementation for testing
async function runTestGame() {
  console.log("==========================================");
  console.log("TESTING AI STORY GAME BACKEND");
  console.log("==========================================");
  
  const game = new GameState();
  
  console.log("Starting new game...");
  const initialScene = await game.startNewGame();
  console.log("\nInitial Scene:");
  
  if (typeof initialScene.text === 'string') {
    console.log("Text:", initialScene.text.substring(0, 100) + "...");
  } else {
    console.log("Text (not a string):", initialScene.text);
  }
  
  console.log("Image data available:", !!initialScene.image);
  if (initialScene.image && initialScene.image.images && initialScene.image.images.length > 0) {
    console.log("Image URL:", initialScene.image.images[0].url);
  }
  
  console.log("Choices:", initialScene.choices);
  
  console.log("\nMaking choice (0)...");
  const nextScene = await game.makeChoice(0);
  console.log("\nNext Scene:");
  
  if (typeof nextScene.text === 'string') {
    console.log("Text:", nextScene.text.substring(0, 100) + "...");
  } else {
    console.log("Text (not a string):", nextScene.text);
  }
  
  console.log("Image data available:", !!nextScene.image);
  if (nextScene.image && nextScene.image.images && nextScene.image.images.length > 0) {
    console.log("Image URL:", nextScene.image.images[0].url);
  }
  
  console.log("Choices:", nextScene.choices);
  
  console.log("\nTest completed!");
}

// If this file is run directly, run the test game
if (require.main === module) {
  if (!process.env.FAL_KEY) {
    console.error("Error: FAL_KEY not found in environment variables");
    console.log("Please create a .env file with your FAL_KEY");
    process.exit(1);
  }
  
  runTestGame()
    .then(() => {
      console.log("Backend test completed successfully!");
    })
    .catch((error) => {
      console.error("Backend test failed:", error);
    });
}

// Export game components for use in the frontend
module.exports = {
  GameState,
  generateStoryText,
  generateStoryImage
};