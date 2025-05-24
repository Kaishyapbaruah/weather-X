import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

interface DailyForecastData {
    date: string; // "YYYY-MM-DD"
    dayOfWeek: string; // "Monday", "Tuesday", etc.
    tempMaxCelsius: number;
    tempMinCelsius: number;
    condition: string;
    conditionEmoji: string;
}

interface CurrentWeatherData {
    locationName: string;
    temperatureCelsius: number;
    condition: string;
    conditionEmoji: string;
    humidityPercent: number;
    windSpeedKmh: number;
    description: string;
}

interface HourlyForecastData {
    time: string; // "HH:00" (24-hour format)
    temperatureCelsius: number;
    condition: string;
    conditionEmoji: string;
    precipitationChancePercent?: number; // Optional
}

interface ActivityData {
    name: "Running" | "Biking" | "Car Travel" | "Jogging" | "Outdoor Play";
    rating: "Good" | "Fair" | "Poor" | "Caution Advised" | "Not Recommended";
    advice?: string; // Optional
}

interface ActivitySuggestions {
    overallSummary: string;
    activities: ActivityData[];
}

interface WeatherData {
    current: CurrentWeatherData;
    forecast: DailyForecastData[]; // 7 days, forecast[0] is today
    hourlyForecastToday?: HourlyForecastData[]; // Optional
    activitySuggestions?: ActivitySuggestions; // Optional
}

const API_KEY = process.env.API_KEY;
const appContainer = document.getElementById('app-container') as HTMLDivElement;

async function initApp() {
    if (!API_KEY) {
        displayError("API Key is missing. Please configure the API_KEY environment variable.");
        return;
    }
    if (appContainer && !appContainer.querySelector('.weather-card') && !appContainer.querySelector('.error-message')) {
        appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">Finding your location & fetching detailed weather...</p>
            </div>`;
    }
    getUserLocation();
}

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                showLoadingMessage("Fetching comprehensive weather data...");
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
    showLoadingMessage("Crafting your weather report with Gemini...");
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const prompt = `
        Provide a comprehensive weather forecast for latitude ${latitude} and longitude ${longitude}.
        Return the response strictly as a JSON object only, with no surrounding text or markdown.
        The JSON object must adhere to the following structure:
        {
          "current": {
            "locationName": "City, Region",
            "temperatureCelsius": "number (integer)",
            "condition": "e.g., Sunny, Partly Cloudy, Rainy",
            "conditionEmoji": "appropriate emoji",
            "humidityPercent": "number (integer, 0-100)",
            "windSpeedKmh": "number (integer)",
            "description": "A concise, friendly, and engaging current weather summary, 20-30 words max."
          },
          "forecast": [ // Array of 7 days, starting with today (forecast[0] is today)
            {
              "date": "YYYY-MM-DD",
              "dayOfWeek": "Full name e.g., Monday",
              "tempMaxCelsius": "number (integer)",
              "tempMinCelsius": "number (integer)",
              "condition": "Daily overall condition e.g., Sunny, Showers, Cloudy",
              "conditionEmoji": "appropriate emoji for the day's overall condition"
            }
            // ...6 more days
          ],
          "hourlyForecastToday": [ // Array for the next 8-12 hours of today, or empty if not applicable/available
            {
              "time": "HH:00", // 24-hour format, e.g., "14:00"
              "temperatureCelsius": "number (integer)",
              "condition": "Hourly specific condition",
              "conditionEmoji": "appropriate emoji",
              "precipitationChancePercent": "number (integer, 0-100, optional, default to 0 if not relevant)"
            }
            // ...more hours
          ],
          "activitySuggestions": { // Optional, can be omitted if not applicable
            "overallSummary": "A general suggestion for activities based on today's overall weather (max 30 words).",
            "activities": [ // Array of 5 specific activities
              {
                "name": "Running", // Must be one of: "Running", "Biking", "Car Travel", "Jogging", "Outdoor Play"
                "rating": "Good", // Must be one of: "Good", "Fair", "Poor", "Caution Advised", "Not Recommended"
                "advice": "Optional short advice, e.g., 'Stay hydrated during afternoon hours.' (max 15 words)"
              },
              { "name": "Biking", "rating": "...", "advice": "..."},
              { "name": "Car Travel", "rating": "...", "advice": "..."},
              { "name": "Jogging", "rating": "...", "advice": "..."},
              { "name": "Outdoor Play", "rating": "...", "advice": "..."}
            ]
          }
        }
        Ensure all temperatures are in Celsius. For conditions, use common, concise terms.
        The 'forecast' array must contain 7 entries.
        'hourlyForecastToday' should cover significant parts of the current day. If it's late, provide for the remaining hours or an empty array.
        'activitySuggestions' ratings should be practical. 'Car Travel' advice could relate to visibility or road conditions.
        Prioritize accuracy for locationName.
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

        if (!weatherData.current || !weatherData.forecast || weatherData.forecast.length < 7) {
            console.error("Invalid or incomplete data structure from Gemini:", weatherData);
            displayError("Received incomplete weather data (current/forecast missing or too short). Please try again.");
            return;
        }
        renderWeather(weatherData);

    } catch (error) {
        console.error("Error fetching or parsing weather data from Gemini:", error);
        if (error instanceof SyntaxError) {
            displayError("There was an issue understanding the weather data from the server. Please try again.");
        } else {
            displayError("Oops! We couldn't fetch the latest weather from Gemini. Please try again later.");
        }
    }
}

function formatForecastDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getShortDayName(dayOfWeek: string): string {
    if (!dayOfWeek || dayOfWeek.length < 3) return "N/A";
    return dayOfWeek.substring(0, 3);
}

function formatHourTime(timeString: string): string { // HH:00
    if (!timeString || !timeString.includes(':')) return "N/A";
    const hour = parseInt(timeString.split(':')[0], 10);
    if (isNaN(hour)) return "N/A";
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

function renderHourlyForecast(hourlyData?: HourlyForecastData[]): string {
    if (!hourlyData || hourlyData.length === 0) {
        return '<p class="no-data-info">Hourly forecast data is not available for today.</p>';
    }

    const hourlyHtml = hourlyData.map(hour => `
        <div class="hourly-forecast-card" aria-label="Forecast for ${formatHourTime(hour.time)}: ${hour.condition}, ${Math.round(hour.temperatureCelsius)}°C">
            <p class="hourly-time">${formatHourTime(hour.time)}</p>
            <div class="hourly-emoji" aria-hidden="true">${hour.conditionEmoji}</div>
            <p class="hourly-temp">${Math.round(hour.temperatureCelsius)}°C</p>
            <p class="hourly-condition">${hour.condition}</p>
            ${hour.precipitationChancePercent && hour.precipitationChancePercent > 0 ? 
                `<p class="hourly-precip" aria-label="Precipitation chance: ${hour.precipitationChancePercent}%"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="vertical-align: middle; margin-right: 4px;"><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75Z" /><path d="M12 2.25a.75.75 0 0 1 .75.75v16.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75ZM8.25 3.75A.75.75 0 0 1 9 3h6a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z" /></svg>${hour.precipitationChancePercent}%</p>` 
                : ''
            }
        </div>
    `).join('');

    return `
        <section class="hourly-forecast-section" aria-labelledby="hourly-title">
            <h2 id="hourly-title" class="section-title">Today's Hourly Forecast</h2>
            <div class="scrollable-container">
                ${hourlyHtml}
            </div>
        </section>
    `;
}

function renderActivitySuggestions(suggestions?: ActivitySuggestions): string {
    if (!suggestions || !suggestions.activities || suggestions.activities.length === 0) {
        return '<p class="no-data-info">Activity suggestions are not available at this time.</p>';
    }

    const activitiesHtml = suggestions.activities.map(activity => `
        <div class="activity-item activity-rating-${activity.rating.toLowerCase().replace(/\s+/g, '-')}" 
             aria-label="${activity.name}: ${activity.rating}. ${activity.advice || ''}">
            <h3 class="activity-name">${activity.name}</h3>
            <p class="activity-rating">${activity.rating}</p>
            ${activity.advice ? `<p class="activity-advice">${activity.advice}</p>` : ''}
        </div>
    `).join('');

    return `
        <section class="activity-suggestions-section" aria-labelledby="activity-title">
            <h2 id="activity-title" class="section-title">Activity Suggestions</h2>
            ${suggestions.overallSummary ? `<p class="activity-summary">${suggestions.overallSummary}</p>` : ''}
            <div class="activities-grid">
                ${activitiesHtml}
            </div>
        </section>
    `;
}

function renderWeather(data: WeatherData) {
    if (!appContainer) return;

    const { current, forecast, hourlyForecastToday, activitySuggestions } = data;
    const todayForecast = forecast[0]; // Today is the first item in the forecast array

    let dailyForecastHtml = '';
    if (forecast && forecast.length > 0) {
        dailyForecastHtml = forecast.map(day => `
            <div class="forecast-day-card" aria-label="Forecast for ${getShortDayName(day.dayOfWeek)}, ${formatForecastDate(day.date)}: ${day.condition}, high ${Math.round(day.tempMaxCelsius)}°C, low ${Math.round(day.tempMinCelsius)}°C">
                <p class="forecast-day-name">${getShortDayName(day.dayOfWeek)}</p>
                <p class="forecast-date">${formatForecastDate(day.date)}</p>
                <div class="forecast-emoji" aria-hidden="true">${day.conditionEmoji}</div>
                <p class="forecast-temp">
                    <span class="temp-max" aria-label="Maximum temperature">${Math.round(day.tempMaxCelsius)}°</span> / 
                    <span class="temp-min" aria-label="Minimum temperature">${Math.round(day.tempMinCelsius)}°</span>
                </p>
                <p class="forecast-condition">${day.condition}</p>
            </div>
        `).join('');
    }

    appContainer.innerHTML = `
        <div class="weather-card">
            <h1 class="location" aria-label="Location">${current.locationName}</h1>
            <div class="current-weather-main">
                <div class="temperature" aria-label="Current temperature ${current.temperatureCelsius} degrees Celsius">
                    ${Math.round(current.temperatureCelsius)}°C
                    <span class="weather-emoji" aria-hidden="true">${current.conditionEmoji}</span>
                </div>
                <div class="today-summary">
                     <p class="condition" aria-label="Current condition: ${current.condition}">${current.condition}</p>
                     <p class="today-high-low" aria-label="Today's high ${todayForecast.tempMaxCelsius}°C, low ${todayForecast.tempMinCelsius}°C">
                        H: ${Math.round(todayForecast.tempMaxCelsius)}° / L: ${Math.round(todayForecast.tempMinCelsius)}°
                     </p>
                     <p class="today-condition-overall" aria-label="Today's overall condition: ${todayForecast.condition}">Today: ${todayForecast.condition}</p>
                </div>
            </div>
            <div class="weather-details">
                <div class="detail-item">
                    <strong>${current.humidityPercent}%</strong>
                    <span>Humidity</span>
                </div>
                <div class="detail-item">
                    <strong>${current.windSpeedKmh} km/h</strong>
                    <span>Wind</span>
                </div>
            </div>
            <p class="description" aria-label="Weather description">${current.description}</p>
        </div>

        ${renderHourlyForecast(hourlyForecastToday)}

        ${dailyForecastHtml ? `
        <section class="forecast-section" aria-labelledby="forecast-title">
            <h2 id="forecast-title" class="section-title">7-Day Forecast</h2>
            <div class="scrollable-container">
                ${dailyForecastHtml}
            </div>
        </section>
        ` : ''}
        
        ${renderActivitySuggestions(activitySuggestions)}
    `;
    updateTheme(current.condition.toLowerCase(), current.temperatureCelsius);
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
            appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">Retrying...</p>
            </div>`;
            initApp();
        });
    }
    // Set a default error theme
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
        // Fallback if loading container isn't there for some reason
        appContainer.innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <p class="loading-text">${message}</p>
            </div>`;
    }
}

initApp();
