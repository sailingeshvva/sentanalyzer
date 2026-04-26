from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from classifier import SentimentClassifier

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

clf = SentimentClassifier()

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/classify', methods=['POST'])
def classify():
    data = request.json
    text = data.get('text', '')
    result = clf.classify(text)
    return jsonify(result)

@app.route('/api/process_payload', methods=['POST'])
def process_payload():
    payload = request.json
    try:
        result = clf.process_payload(payload)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(port=5000, debug=True)
