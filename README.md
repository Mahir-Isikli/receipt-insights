# Receipt Analyzer 📊

A smart tool that helps you understand your shopping habits and make healthier choices by analyzing your grocery receipts.

## Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Mahir-Isikli/receipt-insights.git
cd receipt-insights
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Set up Configuration
Create a `.streamlit` folder in your project root and add a `secrets.toml` file with the following structure:
```toml
# .streamlit/secrets.toml
GOOGLE_API_KEY = "your-gemini-api-key"
DATABASE_URL = "your-database-connection-string"
```

To get these credentials:
1. Get your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Set up your PostgreSQL database and get the connection string

### 4. Run the Application
```bash
streamlit run app.py
```

## Project Structure
```
receipt_analyzer/
├── .streamlit/
│   └── secrets.toml    # Configuration secrets (not in git)
├── .venv/              # Virtual environment (not in git)
├── uploads/           # Uploaded receipts (not in git)
├── app.py             # Main application code
├── requirements.txt   # Python dependencies
└── README.md         # This file
```

## What it does

### 1. Receipt Upload
- Upload one or multiple grocery receipts (supports jpg, jpeg, png, pdf)
- Automatically extracts:
  - Store name
  - Date and time of purchase
  - Total amount spent
  - List of items with prices
  - Health scores for food items

### 2. Health Scoring
- Each food item gets a health score (1-10)
  - 10 = Very healthy (e.g., fresh vegetables)
  - 1 = Less healthy options
  - Non-food items (like paper towels) are marked as N/A

### 3. Shopping History
- View all your past receipts
- See detailed breakdowns of:
  - Items purchased
  - Money spent by category
  - Health scores

### 4. Analytics Dashboard
- See your shopping patterns:
  - What times you usually shop
  - Average health scores over time
  - Weekly trends in your shopping habits
- Filter data by different time ranges:
  - Last 2 weeks
  - Last month
  - Last 3 months
  - Last 6 months
  - Last year
  - Custom date range

## Features
- 🔄 Multiple receipt upload
- 📊 Visual analytics and charts
- 💪 Health score tracking
- 📅 Shopping pattern analysis
- 📱 Works on both desktop and mobile

## Privacy
- Your receipt data is stored securely
- Only you can access your information
- No personal data is shared

## Getting Started
1. Upload your first receipt
2. Wait for the analysis to complete
3. Explore your shopping insights in the History and Analytics tabs

That's it! Start uploading your receipts to gain insights into your shopping habits and make healthier choices! 🌟
