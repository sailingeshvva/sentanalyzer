# SentiLens — AI Sentiment Classifier ⚡

SentiLens is a sleek, AI-powered web application that blends a premium frontend UI (filled with glassmorphism aesthetics and dynamic animations) with an advanced Python backend to classify text sentiment as **Positive**, **Neutral**, or **Negative**.

## About the Project
This project was developed to provide an intuitive and efficient way to perform sentiment analysis. You can effortlessly check a single sentence using the **Quick Predict** feature, or upload a full CSV dataset and let SentiLens analyze, calculate, and visualize the overall sentiment distribution for the entire file.

### Key Features
- **Instant Quick Predict**: See live previews of sentiment with gorgeous badges and confidence bars.
- **Bulk CSV Upload & Parsing**: Drag-and-drop CSV files directly into the UI. Map your text to columns and let it predict sentiment automatically!
- **Python-Powered AI (NLTK)**: The engine backing this web app utilizes Python driven by the robust Natural Language Toolkit (NLTK), specifically using the VADER sentiment algorithm.
- **Lightweight Backend (Flask)**: Communicates API requests instantly and reliably to the web page.
- **Export Data**: Directly click and download your analyzed datasets back to a CSV format.

## Technology Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript.
- **Backend**: Python 3.11, Flask, Flask-CORS.
- **AI Core**: NLTK framework (`vader_lexicon`).

## Installation & Local Setup

1. **Prerequisites**
   Ensure you have **Python 3** and `pip` installed on your machine.
   
2. **Setup Dependencies**
   Navigate to the project folder through your terminal and install the required libraries:
   ```bash
   pip install flask flask-cors nltk
   ```

3. **Run the Application**
   Launch the backend server simply by running:
   ```bash
   python server.py
   ```
   *Note: NLTK will automatically download the required lexicon file on the first run.*
   
4. **View in Browser**
   Open your browser and navigate to [http://127.0.0.1:5000/](http://127.0.0.1:5000/)
   live site :- [https://sailingeshvva.github.io/sentanalyzer/](https://sailingeshvva.github.io/sentanalyzer/)

## Repository Structure
- `index.html` — The main graphical interface.
- `app.js` — Client-side functionality, drag & drop logic, and asynchronous requests to the Python server.
- `style.css` — Modern UI styling including beautiful SVGs, colors, and layouts.
- `server.py` — The Flask backend responsible for accepting API callbacks.
- `classifier.py` — Core NLP sentiment classifier handling the processing power.
