# Roadcast - Intelligent Route Safety Platform

**VTHacks 2025 Submission** - A comprehensive platform that analyzes traffic crash data and weather conditions to recommend the safest possible routes for travelers.

## Project Overview

We created Roadcast because we believe everyone deserves to get home safely. Our platform takes a fundamentally different approach to navigation by prioritizing safety over speed. While existing apps focus on getting you there faster, we focus on getting you there in one piece.

Roadcast combines years of historical crash data with current weather conditions and AI-powered analysis to recommend routes that actively avoid high-risk areas. We're not just another navigation app - we're your personal safety advisor for every journey.

### What Makes Roadcast Special

- **Smart Route Analysis**: We examine multiple route options through the lens of historical crash data, identifying patterns that traditional apps miss
- **Weather-Aware Routing**: Current weather conditions are integrated into every safety assessment, because we know that rain, snow, and fog change everything
- **Interactive Safety Visualization**: Our dynamic heat maps reveal crash density patterns and safety zones that aren't visible on standard maps
- **AI-Powered Recommendations**: Our intelligent system doesn't just show you data - it explains what it means and gives you actionable advice
- **Real-time Risk Assessment**: Every location and route gets a live safety score based on the latest available information
- **Pattern Recognition**: We identify dangerous intersections, problematic times of day, and hazardous conditions before you encounter them
- **Responsive Interface**: Built with modern web technologies for a smooth, intuitive experience across all devices

## Why This Matters

### The Problem We're Tackling
Traffic accidents affect millions of families every year. Many of these accidents happen in predictable locations and conditions - intersections with poor sight lines, stretches of road with frequent weather-related incidents, or areas with high pedestrian traffic during certain times of day. The tragedy is that much of this risk is avoidable if drivers had access to the right information.

Current navigation systems treat all roads the same. They'll send you down a notorious accident hotspot if it saves you two minutes, without ever mentioning the increased risk you're taking on.

### How Roadcast Makes a Difference
We're changing the conversation from "fastest route" to "safest route." Our platform helps drivers make informed decisions by providing:

- **Proactive Risk Avoidance**: Instead of just reacting to accidents after they happen, we help prevent them by steering users away from high-risk areas
- **Evidence-Based Decision Making**: Every recommendation is backed by comprehensive crash data analysis, not guesswork
- **Real-Time Context**: We consider current conditions, not just historical patterns, because safety is dynamic
- **Clear Communication**: Complex data becomes simple, actionable advice that anyone can understand
- **Community Benefit**: As more people use safer routes, we reduce overall traffic pressure on dangerous road segments

## Technology Stack

We built Roadcast using a carefully chosen combination of modern technologies, each selected for its ability to handle the complex requirements of real-time safety analysis and user experience.

### Frontend Technologies
- **Next.js 15** - The latest React framework providing server-side rendering and optimal performance
- **TypeScript** - Ensuring code reliability and maintainability through static type checking
- **Tailwind CSS** - Enabling rapid, consistent UI development with utility-first styling
- **Mapbox GL JS** - Powering our interactive map visualizations with professional-grade mapping
- **React Map GL** - Seamless React integration for our mapping components
- **Skeleton UI** - Modern, accessible UI components for a polished user experience

### Backend and AI Infrastructure
- **Flask** - Lightweight yet powerful Python web framework for our API services
- **Python 3.12** - Our core backend language, chosen for its excellent data science and AI libraries
- **MongoDB** - NoSQL database perfectly suited for storing and querying geospatial crash data
- **Google Gemini LLM** - Advanced language model providing intelligent analysis and natural language recommendations
- **LangChain** - Framework for building applications with large language models
- **PyTorch** - Industry-leading machine learning framework for our predictive models

### External APIs and Data Sources
- **Open-Meteo API** - Reliable weather data integration for environmental context
- **Mapbox Directions API** - Professional route calculation and alternative route generation
- **Mapbox Geocoding API** - Accurate address resolution and location services
- **MongoDB Atlas** - Scalable cloud database hosting for our crash data
- **Historical Crash Datasets** - Comprehensive traffic incident databases providing the foundation for our analysis

### Machine Learning Components
- **PyTorch CNN** - Convolutional neural networks for recognizing spatial patterns in crash data
- **Multi-Layer Perceptrons** - Deep learning models for risk scoring and prediction
- **Custom Safety Algorithms** - Proprietary algorithms we developed for calculating route safety scores
- **Geospatial Analysis Tools** - Specialized libraries for location-based risk assessment

## Project Architecture

```
Roadcast/
├── web/                    # Frontend application built with Next.js
│   ├── src/app/           # Main application pages and routing
│   ├── src/components/    # Reusable UI components
│   ├── src/lib/          # API integration and utility functions
│   └── public/           # Static assets and images
├── llm/                   # AI and backend services
│   ├── flask_server.py   # Main API server handling requests
│   ├── gemini_*.py      # AI analysis and recommendation modules
│   └── requirements.txt  # Python dependency management
├── roadcast/              # Machine learning models and training
│   ├── models.py         # PyTorch model definitions
│   ├── train.py          # Model training and evaluation scripts
│   ├── inference.py      # Real-time prediction services
│   └── app.py           # ML API endpoints
└── ai/                    # Additional AI processing utilities
    └── main.py           # Core AI processing scripts
```

## Getting Started

### What You'll Need
- **Node.js** (version 18 or higher) for running the frontend
- **Python** (3.12 or higher) for the backend services
- **MongoDB** access for crash data storage
- **Mapbox API key** for mapping services
- **Google Gemini API key** for AI functionality

### Setting Up the Frontend
```bash
cd web
npm install
npm run dev
```
Your frontend will be available at `http://localhost:3000`

### Setting Up the Backend Services
```bash
# Start the LLM and AI service
cd llm
pip install -r requirements.txt
python flask_server.py

# Start the machine learning service
cd roadcast
pip install -r requirements.txt
python app.py
```

### Configuration
You'll need to create `.env` files in the appropriate directories with your API keys:
- `MAPBOX_ACCESS_TOKEN` - For map rendering and route calculation
- `GOOGLE_API_KEY` - For AI-powered analysis
- `MONGO_URI` - For database connectivity
- `OPEN_METEO_API_KEY` - For weather data integration

## How Roadcast Works

The user experience is designed to be simple, but there's sophisticated technology working behind the scenes:

1. **Location Input**: Users enter their starting point and destination through our intuitive interface
2. **Route Generation**: We use Mapbox to generate multiple possible routes between the two points
3. **Safety Analysis**: Each route is analyzed against our comprehensive crash database, looking for patterns and risk factors
4. **Weather Integration**: Current weather conditions are factored into the safety assessment, because we know conditions matter
5. **AI Assessment**: Our language model analyzes all the data and generates human-readable safety insights and recommendations
6. **Visual Display**: Routes are displayed on an interactive map with clear safety indicators and heat zones
7. **Detailed Recommendations**: Users receive specific, actionable advice for their journey, including alternative options and safety tips

## Technical Innovation

### Advanced Safety Scoring System
Our safety scoring goes far beyond simple crash counting. We've developed a sophisticated system that considers:

- **Geospatial Analysis**: Using MongoDB's advanced geospatial queries, we can identify crashes within specific buffers around route segments
- **Temporal Pattern Recognition**: Our system understands that some locations are more dangerous at certain times of day or during specific weather conditions
- **Weather Correlation**: We don't just look at current weather - we analyze how similar weather conditions have historically affected crash rates in specific areas
- **Multi-Factor Risk Assessment**: Our algorithms weigh crash frequency, severity, environmental factors, and road characteristics to create comprehensive safety scores

### AI-Powered Intelligence
What sets Roadcast apart is how we transform complex data into actionable insights:

- **Pattern Recognition**: Our models identify dangerous intersections, problematic road types, and hazardous conditions that aren't immediately obvious
- **Natural Language Processing**: Complex statistical analysis becomes clear, conversational recommendations
- **Contextual Awareness**: The system considers not just historical data, but current conditions and their implications
- **Continuous Improvement**: Our models learn from new data and user feedback to provide increasingly accurate recommendations

## Competition and Recognition

We're excited to present Roadcast at **VTHacks 2025**, where we're competing in several categories that align with our mission:

- **Best Use of AI/ML** - Our sophisticated combination of machine learning models and large language models for safety analysis
- **Social Good & Impact** - Our focus on preventing accidents and saving lives through better routing decisions
- **Most Innovative Solution** - Our unique approach to navigation that prioritizes safety over speed

## Our Team

Roadcast was built by a passionate team of developers who believe technology can make our roads safer. We came together at VTHacks 2025 with diverse backgrounds in software engineering, data science, and user experience design, united by a shared vision of reducing traffic accidents through better information.

We chose this project because we've all had close calls on the road, or know someone who has. The idea that we could use data and AI to help people avoid dangerous situations felt both technically challenging and deeply meaningful.

## What's Next for Roadcast

We see Roadcast as just the beginning. Here's what we're planning for the future:

### Short-term Goals
- **Mobile Applications**: Native iOS and Android apps for on-the-go safety analysis
- **Enhanced Data Sources**: Integration with more comprehensive crash databases and real-time incident reporting
- **User Feedback Loop**: Allow users to report road hazards and verify our safety recommendations

### Long-term Vision
- **Predictive Analytics**: Move beyond historical data to predict where accidents are likely to occur based on current conditions
- **Community Features**: Enable users to share safety information and contribute to collective road safety knowledge
- **Partnership Opportunities**: Work with local transportation departments and insurance companies to expand our impact
- **Global Expansion**: Extend our platform to road networks beyond our current focus area
- **IoT Integration**: Connect with vehicle safety systems and smart traffic infrastructure

### The Bigger Picture
We envision a future where every navigation system considers safety as a primary factor. We want to change the cultural conversation around driving from "How do I get there fastest?" to "How do I get there safely?" If Roadcast can influence even a small percentage of routing decisions, we could potentially prevent thousands of accidents and save lives.

## Technical Challenges and Solutions

Building Roadcast wasn't without its challenges. Here are some of the key problems we solved:

### Data Integration and Processing
Working with large crash datasets presented significant challenges in terms of data cleaning, standardization, and efficient querying. We solved this by implementing a robust MongoDB schema with proper indexing and geospatial optimization.

### Real-time Performance
Analyzing multiple routes against comprehensive crash databases while maintaining responsive user experience required careful optimization of our algorithms and strategic use of caching.

### AI Integration
Combining structured data analysis with natural language generation required thoughtful prompt engineering and careful handling of the interface between our statistical models and language models.

## License and Usage

Roadcast is developed as part of VTHacks 2025 and is available for educational and non-commercial use. We believe in the power of open source to improve road safety, and we encourage other developers to build upon our work.

For commercial licensing or partnership opportunities, please reach out to our team.

---

**Roadcast - Because getting there safely is more important than getting there fast.**

*Built with dedication to road safety and innovative technology at VTHacks 2025.*