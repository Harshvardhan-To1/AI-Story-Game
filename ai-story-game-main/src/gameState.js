// AI Story Game Backend with Fixed Authentication
const { fal } = require('@fal-ai/client');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Configure FAL client with correct authentication method from documentation
fal.config({
  credentials: process.env.FAL_KEY
});
// Default choices if extraction fails
const DEFAULT_CHOICES = [
  "Continue exploring",
  "Take a different path",
  "Stop and observe your surroundings"
];

/**
 * Game state manager
 * Handles story progression, API calls, and state management
 */
class GameState {
  constructor() {
    this.currentScene = null;
    this.history = [];
    
    // Configure FAL client with API key on initialization
    this.configureFalClient();
  }
  
  /**
   * Configure the FAL client with the API key
   * This should be called before each API call to ensure proper authentication
   */
  configureFalClient() {
    // Configure FAL client with API key from environment
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      console.error("FAL_KEY environment variable not set");
      throw new Error("FAL_KEY environment variable not set");
    }
    
    fal.config({
      credentials: falKey
    });
    
    console.log("FAL client configured successfully");
  }
  
  /**
   * Start a new game with initial scene
   * @returns {Object} The initial scene data
   */
  async startNewGame() {
    // Ensure client is configured
    this.configureFalClient();
    
    // Initial story setup
    const initialContext = "You find yourself in a mysterious forest at dusk. The trees tower above you, their branches swaying gently in the breeze.";
    
    // Generate the opening text
    const textResult = await this.generateStoryText(initialContext, "Game start");
    console.log("Initial text generation complete");
    
    // Generate the opening image
    const imageResult = await this.generateStoryImage(initialContext);
    console.log("Initial image generation complete");
    
    // Extract text for choices generation
    let storyText = "";
    if (textResult && textResult.data && textResult.data.output) {
      storyText = textResult.data.output;
    }
    
    // Generate initial choices
    const choicesResult = await this.generateChoices(storyText);
    console.log("Initial choices generation complete");
    
    // Store all raw API responses for debugging
    this.currentScene = {
      text: textResult,
      image: imageResult,
      choices: choicesResult
    };
    
    return this.currentScene;
  }
  
  /**
   * Make a choice to advance the story
   * @param {number} choiceIndex - Index of the selected choice
   * @returns {Object} The next scene data
   */
  async makeChoice(choiceIndex) {
    // Ensure client is configured
    this.configureFalClient();
    
    // Store current scene in history
    this.history.push({...this.currentScene});
    
    // Get the selected choice
    let selectedChoice = "";
    if (Array.isArray(this.currentScene.choices) && this.currentScene.choices[choiceIndex]) {
      selectedChoice = this.currentScene.choices[choiceIndex];
    } else {
      selectedChoice = DEFAULT_CHOICES[choiceIndex % DEFAULT_CHOICES.length];
    }
    
    // Get current context text
    let currentContext = "";
    if (this.currentScene.text && this.currentScene.text.data && this.currentScene.text.data.output) {
      currentContext = this.currentScene.text.data.output;
    }
    
    // Generate new text based on the choice
    const textResult = await this.generateStoryText(currentContext, selectedChoice);
    console.log("New text generation complete");
    
    // Generate description for image
    let imagePrompt = selectedChoice;
    if (textResult && textResult.data && textResult.data.output) {
      imagePrompt += " - " + textResult.data.output.substring(0, 100);
    }
    
    // Generate new image
    const imageResult = await this.generateStoryImage(imagePrompt);
    console.log("New image generation complete");
    
    // Extract text for choices generation
    let storyText = "";
    if (textResult && textResult.data && textResult.data.output) {
      storyText = textResult.data.output;
    }
    
    // Generate new choices
    const choicesResult = await this.generateChoices(storyText);
    console.log("New choices generation complete");
    
    // Update current scene with all raw API responses
    this.currentScene = {
      text: textResult,
      image: imageResult,
      choices: choicesResult
    };
    
    return this.currentScene;
  }
  
  /**
   * Generate story text using the LLM
   * @param {string} context - Current story context
   * @param {string} userChoice - User's selected choice
   * @returns {Object} Raw API response
   */
  async generateStoryText(context, userChoice) {
    // Ensure client is configured before API call
    this.configureFalClient();
    
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
      
      console.log("Text generation completed");
      return result;
    } catch (error) {
      console.error("Error generating text:", error);
      
      // Check for authentication errors
      if (error.status === 401) {
        console.error("Authentication failed for story text generation. Please check your FAL_KEY.");
      }
      
      return {
        data: {
          output: "The adventure continues... (Error generating story text)"
        },
        error: error.message
      };
    }
  }
  
  /**
   * Generate image for the current scene
   * @param {string} sceneDescription - Description of the scene
   * @returns {Object} Raw API response
   */
  async generateStoryImage(sceneDescription) {
    // Ensure client is configured before API call
    this.configureFalClient();
    
    const imagePrompt = `
      Scene from interactive story game: ${sceneDescription}
      Detailed, dramatic lighting, cinematic composition, high quality
    `;
    
    try {
      console.log("Generating story image...");
      const result = await fal.subscribe("fal-ai/flux-pro", {
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
      
      console.log("Image generation completed");
      return result.data;
    } catch (error) {
      console.error("Error generating image:", error);
      
      // Check for authentication errors
      if (error.status === 401) {
        console.error("Authentication failed for image generation. Please check your FAL_KEY.");
      }
      
      return {
        images: [],
        error: error.message
      };
    }
  }
  
  /**
   * Generate choices for the next step in the story
   * @param {string} sceneText - The story text
   * @returns {Array} List of choices
   */
  async generateChoices(sceneText) {
    // Ensure client is configured before API call
    this.configureFalClient();
    
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
  Format your response EXACTLY as following:
    [
        "Choice 1",
        "Choice 2",
        "Choice 3"
    ]
  Do not include any explanation or additional text outside the code block list of choices above also never give like json.
`;
    
    try {
        const result = await fal.subscribe("fal-ai/any-llm", {
            input: {
                prompt: choicePrompt
            }
        });
        
        console.log("Extracting choices from:", JSON.stringify(result).substring(0, 200) + "...");
        
        if (Array.isArray(result.data)) {
            return result.data.length > 0 ? result.data : defaultChoices;
        }
        
        if (!result.data || typeof result.data !== 'object') {
            console.warn("Invalid choices response, using defaults");
            return defaultChoices;
        }
        
        if (result.data.output) {
            const output = result.data.output;
            const manualExtract = output.match(/"(.*?)"/g);
            if (manualExtract) {
                const cleanedChoices = manualExtract.map(choice => choice.replace(/"/g, ''));
                console.log("Successfully extracted choices manually");
                return cleanedChoices.length > 0 ? cleanedChoices : defaultChoices;
            }
        }
        
        console.log("Could not extract valid choices, using defaults");
        return defaultChoices;
    } catch (error) {
        console.error("Error generating choices:", error);
        
        // Check for authentication errors
        if (error.status === 401) {
            console.error("Authentication failed for choices generation. Please check your FAL_KEY.");
        }
        
        return defaultChoices;
    }
  }
}

module.exports = { GameState };