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

### 3. Set up Database
1. Create a free [Neon Database](https://neon.tech) account
2. Create a new project
3. Get your connection string from the dashboard
4. Execute these SQL commands in your database:

Create the receipts table:
```sql
CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    purchase_datetime TIMESTAMP,
    store_name TEXT,
    total_amount DECIMAL,
    items JSONB,
    categories JSONB,
    image_path TEXT,
    health_score DECIMAL
);
```

Create the analytics table (will be populated automatically):
```sql
CREATE TABLE receipt_analytics (
    id SERIAL PRIMARY KEY,
    date DATE,
    hour INTEGER,
    week INTEGER,
    year INTEGER,
    total_amount DECIMAL,
    health_score DECIMAL,
    rolling_avg_health DECIMAL,
    items_count INTEGER
);
```

### 4. Configure the Application
1. Rename `.streamlit/secrets.example.toml` to `.streamlit/secrets.toml`
2. Update the file with your credentials:
   - Add your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Add your Neon database connection string

Example of filled `secrets.toml`:
```toml
GOOGLE_API_KEY = "ai-studio-xxxxxxxxxxxx"
DATABASE_URL = "postgresql://[user]:[password]@[endpoint]/[database]"
```

### 5. Run the Application
```bash
streamlit run app.py
```

## Project Structure
```
receipt_analyzer/
├── .streamlit/
│   ├── secrets.example.toml  # Template for configuration
│   └── secrets.toml          # Your actual configuration (not in git)
├── uploads/                  # Uploaded receipts (not in git)
├── app.py                    # Main application code
├── requirements.txt          # Python dependencies
└── README.md                # This file
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
- Your receipt data is stored securely in your own database
- Only you can access your information
- No personal data is shared

## Getting Started
1. Upload your first receipt
2. Wait for the analysis to complete
3. Explore your shopping insights in the History and Analytics tabs

## Troubleshooting
- If you see database errors, make sure:
  - Your database connection string is correct
  - You've executed all the required SQL commands
  - Your database user has proper permissions
- If receipt analysis fails:
  - Check that your Gemini API key is valid
  - Ensure the image is clear and readable
  - Try with a different receipt if the issue persists

That's it! Start uploading your receipts to gain insights into your shopping habits and make healthier choices! 🌟
