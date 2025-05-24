import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

interface WeatherData {
    locationName: string;
    temperatureCelsius: number;
    condition: string;
    conditionEmoji: string;
    humidityPercent: number;
    windSpeedKmh: number;
    description: string;
}

const API_KEY = process.env.API_KEY;
const appContainer = document.getElementById('app-container') as HTMLDivElement;

async function initApp() {
    if (!API_KEY) {
        displayError("API Key is missing. Please configure the API_KEY environment variable.");
        return;
    }
    // Initial loading message
    if (appContainer && !appContainer.querySelector('.weather-card') && !appContainer.querySelector('.error-message')) {
        appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">Fetching your location...</p>
            </div>`;
    }
    getUserLocation();
}

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                showLoadingMessage("Fetching weather data...");
                fetchWeatherFromGemini(position.coords.latitude, position.coords.longitude);
            },
            (error: GeolocationPositionError) => {
                console.error("Error getting location. Code:", error.code, "Message:", error.message);
                let userMessage = "Could not retrieve your location.";

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        userMessage = "Location access was denied. To use this app, please enable location services in your browser settings and refresh the page.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        userMessage = "Your location information is currently unavailable. Please ensure your GPS or location services are enabled, or try again later.";
                        break;
                    case error.TIMEOUT:
                        userMessage = "The request to get your location timed out. Please check your connection and try again.";
                        break;
                    default:
                        userMessage = `Could not retrieve your location. ${error.message ? error.message : 'An unknown error occurred.'}`;
                        break;
                }
                displayError(userMessage);
            }
        );
    } else {
        displayError("Geolocation is not supported by this browser. Please use a browser that supports this feature.");
    }
}

async function fetchWeatherFromGemini(latitude: number, longitude: number) {
    showLoadingMessage("Analyzing current conditions with Gemini...");
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const prompt = `
        Provide a weather forecast for latitude ${latitude} and longitude ${longitude}.
        Return the response as a JSON object only, with no surrounding text or markdown.
        The JSON object should have the following structure:
        {
          "locationName": "City, Region",
          "temperatureCelsius": "number (integer)",
          "condition": "e.g., Sunny, Partly Cloudy, Cloudy, Rainy, Light Rain, Heavy Rain, Snowy, Windy, Thunderstorm, Foggy",
          "conditionEmoji": "appropriate emoji for the condition (e.g., ☀️, 🌥️, ☁️, 🌧️, ❄️, 🌬️, ⛈️, 🌫️)",
          "humidityPercent": "number (integer, 0-100)",
          "windSpeedKmh": "number (integer)",
          "description": "A concise, friendly, and engaging weather summary for the current conditions, 20-30 words max."
        }
        Ensure temperature is in Celsius. For condition, choose from a common set.
        Example: "Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Snowy", "Windy", "Thunderstorm", "Foggy".
        Prioritize accuracy for locationName based on coordinates.
    `;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        
        const weatherData = JSON.parse(jsonStr) as WeatherData;
        renderWeather(weatherData);

    } catch (error) {
        console.error("Error fetching weather data from Gemini:", error);
        displayError("Oops! We couldn't fetch the latest weather from Gemini. Please try again later.");
    }
}

function renderWeather(data: WeatherData) {
    if (!appContainer) return;

    appContainer.innerHTML = `
        <div class="weather-card">
            <h1 class="location" aria-label="Location">${data.locationName}</h1>
            <div class="temperature" aria-label="Temperature ${data.temperatureCelsius} degrees Celsius">
                ${Math.round(data.temperatureCelsius)}°C
                <span class="weather-emoji" aria-hidden="true">${data.conditionEmoji}</span>
            </div>
            <p class="condition" aria-label="Current condition: ${data.condition}">${data.condition}</p>
            <div class="weather-details">
                <div class="detail-item">
                    <strong>${data.humidityPercent}%</strong>
                    <span>Humidity</span>
                </div>
                <div class="detail-item">
                    <strong>${data.windSpeedKmh} km/h</strong>
                    <span>Wind</span>
                </div>
            </div>
            <p class="description" aria-label="Weather description">${data.description}</p>
        </div>
    `;
    updateTheme(data.condition.toLowerCase(), data.temperatureCelsius);
}

function updateTheme(condition: string, temperature: number) {
    let startColor = '#74ebd5'; 
    let endColor = '#ACB6E5';   
    let textColorPrimary = '#333';
    let textColorSecondary = '#555';
    let cardBgColor = 'rgba(255, 255, 255, 0.85)';


    if (condition.includes("sunny") || condition.includes("clear")) {
        startColor = '#FFDA7B'; 
        endColor = '#FFB347';   
        textColorPrimary = '#4A4A4A';
        cardBgColor = 'rgba(255, 248, 225, 0.9)'; 
    } else if (condition.includes("cloudy") || condition.includes("partly cloudy")) {
        startColor = '#B0C4DE'; 
        endColor = '#8E9EAB';  
        textColorPrimary = '#404040';
        cardBgColor = 'rgba(240, 248, 255, 0.9)'; 
    } else if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("thunderstorm")) {
        startColor = '#607D8B'; 
        endColor = '#455A64';   
        textColorPrimary = '#FFFFFF';
        textColorSecondary = '#E0E0E0';
        cardBgColor = 'rgba(100, 120, 130, 0.85)';
    } else if (condition.includes("snow") || condition.includes("sleet")) {
        startColor = '#E6E9F0'; 
        endColor = '#E0E7FF';  
        textColorPrimary = '#334E68';
        cardBgColor = 'rgba(250, 250, 255, 0.92)';
    } else if (condition.includes("fog") || condition.includes("mist")) {
        startColor = '#D3D3D3'; 
        endColor = '#A9A9A9';   
        textColorPrimary = '#333';
        cardBgColor = 'rgba(235, 235, 235, 0.9)';
    }


    if (temperature > 30 && (condition.includes("sunny") || condition.includes("clear"))) {
        startColor = '#FF8C42'; 
        endColor = '#FF6220';   
    } else if (temperature < 0) {
        startColor = '#A7C7E7'; 
        endColor = '#8DA8C5';   
    }

    document.documentElement.style.setProperty('--bg-gradient-start', startColor);
    document.documentElement.style.setProperty('--bg-gradient-end', endColor);
    document.documentElement.style.setProperty('--text-color-primary', textColorPrimary);
    document.documentElement.style.setProperty('--text-color-secondary', textColorSecondary);
    document.documentElement.style.setProperty('--card-bg-color', cardBgColor);
}


function displayError(message: string) {
    if (!appContainer) return;
    appContainer.innerHTML = `
        <div class="weather-card error-message" role="alert">
            <p>${message}</p>
            <button id="try-again-button" style="margin-top:15px; padding: 8px 15px; border:none; border-radius:5px; background-color: var(--accent-color); color:white; cursor:pointer;">Try Again</button>
        </div>
    `;
    const tryAgainButton = document.getElementById('try-again-button');
    if (tryAgainButton) {
        tryAgainButton.addEventListener('click', () => {
             // Reset to loading state and retry
            appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">Retrying...</p>
            </div>`;
            initApp(); // Re-initialize the app logic
        });
    }
    // Set a neutral theme for errors
    document.documentElement.style.setProperty('--bg-gradient-start', '#A9A9A9');
    document.documentElement.style.setProperty('--bg-gradient-end', '#696969');
    document.documentElement.style.setProperty('--text-color-primary', '#FFFFFF');
    document.documentElement.style.setProperty('--text-color-secondary', '#DDDDDD');
    document.documentElement.style.setProperty('--card-bg-color', 'rgba(100, 100, 100, 0.8)');
}

function showLoadingMessage(message: string) {
    if (!appContainer) return;
    const loadingContainer = appContainer.querySelector('.loading-container');
    if (loadingContainer) {
        const loadingTextElement = loadingContainer.querySelector('.loading-text');
        if (loadingTextElement) {
            loadingTextElement.textContent = message;
        }
    } else {
        appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">${message}</p>
            </div>`;
    }
}

// Initialize the app when the script is loaded
initApp();
