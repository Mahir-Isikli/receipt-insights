import streamlit as st
import google.generativeai as genai
import os
import json
from datetime import datetime
import pandas as pd
from PIL import Image
import io
import psycopg2
import psycopg2.extras
import uuid
import tempfile
import plotly.graph_objects as go
import time
from collections import deque

# Page configuration
st.set_page_config(
    page_title="Receipt Analyzer",
    page_icon="🧾",
    layout="wide"
)

# Initialize Gemini API
genai.configure(api_key=st.secrets["GOOGLE_API_KEY"])

# Database connection
def get_database_connection():
    try:
        conn = psycopg2.connect(st.secrets["DATABASE_URL"])
        return conn
    except Exception as e:
        st.error(f"Database connection error: {e}")
        return None

# Initialize the model
generation_config = {
    "temperature": 0.4,
    "top_p": 0.95,
    "top_k": 0,
}

# Set up the model
model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config=generation_config
)

# Define spending categories
CATEGORIES = [
    "Groceries",
    "Produce",
    "Meat & Seafood",
    "Dairy & Eggs",
    "Bakery",
    "Snacks & Beverages",
    "Household Supplies",
    "Personal Care",
    "Ready-made Foods",
    "Miscellaneous"
]

# Add rate limiting and retry logic
def process_with_rate_limit(func):
    def wrapper(*args, **kwargs):
        max_retries = 3
        base_delay = 1  # Base delay in seconds
        
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if "quota" in str(e).lower() or "rate limit" in str(e).lower():
                    delay = base_delay * (2 ** attempt)  # Exponential backoff
                    time.sleep(delay)
                    continue
                raise e
        return func(*args, **kwargs)  # Final attempt
    return wrapper

@process_with_rate_limit
def extract_receipt_info(image):
    prompt = """
    Extract the following information from this receipt image:
    1. Date and time of purchase
       - Date format: YYYY-MM-DD
       - Time format: HHMM (24-hour format, e.g., 1430 for 2:30 PM)
    2. Store name
    3. Total amount
    4. List of items with their prices and health scores
    
    For each item:
    - Assign one of these categories:
      - Groceries (basic food items)
      - Produce (fruits and vegetables)
      - Meat & Seafood
      - Dairy & Eggs
      - Bakery
      - Snacks & Beverages
      - Household Supplies
      - Personal Care
      - Ready-made Foods
      - Miscellaneous
    
    - Assign a health score:
      - Score food items from 1 to 10 (1 being least healthy, 10 being most healthy)
      - Use 0 for non-food items (like household supplies, personal care items)
    
    Format the response as JSON with keys:
    - purchase_datetime (combine date and time as YYYY-MM-DD HH:MM:SS)
    - store_name
    - total_amount
    - items (array of objects with name, price, category, and health_score)
    """
    
    img = Image.open(image)
    response = model.generate_content([prompt, img])
    
    try:
        # Extract JSON response
        json_text = response.text
        # Find the beginning and end of JSON object in case there's extra text
        start_idx = json_text.find('{')
        end_idx = json_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_text = json_text[start_idx:end_idx]
        
        # Convert to Python dictionary
        receipt_data = json.loads(json_text)
        
        # Ensure datetime is in correct format
        if 'purchase_datetime' in receipt_data:
            # Parse the datetime to ensure it's valid
            datetime.strptime(receipt_data['purchase_datetime'], '%Y-%m-%d %H:%M:%S')
        else:
            raise ValueError("purchase_datetime not found in receipt data")
        
        # Calculate average health score for food items
        if 'items' in receipt_data:
            food_scores = [item.get('health_score', 0) for item in receipt_data['items'] 
                         if item.get('health_score', 0) > 0]  # Only include actual food items
            receipt_data['health_score'] = round(sum(food_scores) / len(food_scores), 1) if food_scores else 0
            
        return receipt_data
    except Exception as e:
        st.error(f"Error parsing response: {e}")
        st.write("Raw response:", response.text)
        return None

# Save receipt data to database
def save_to_database(receipt_data, image_path):
    conn = get_database_connection()
    if conn:
        try:
            cursor = conn.cursor()
            
            # Create a categories JSON object by counting items in each category
            categories = {}
            for item in receipt_data.get('items', []):
                category = item.get('category', 'Miscellaneous')
                if category in categories:
                    categories[category] += float(item.get('price', 0))
                else:
                    categories[category] = float(item.get('price', 0))
            
            # Insert into database with health score
            cursor.execute(
                """
                INSERT INTO receipts 
                (purchase_datetime, store_name, total_amount, items, categories, image_path, health_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    receipt_data.get('purchase_datetime'),
                    receipt_data.get('store_name'),
                    receipt_data.get('total_amount'),
                    json.dumps(receipt_data.get('items', [])),
                    json.dumps(categories),
                    image_path,
                    receipt_data.get('health_score', None)
                )
            )
            receipt_id = cursor.fetchone()[0]
            conn.commit()
            cursor.close()
            conn.close()
            return receipt_id
        except Exception as e:
            st.error(f"Database error: {e}")
            if conn:
                conn.close()
            return None

# Get receipt history from database
def get_receipt_history():
    conn = get_database_connection()
    if conn:
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            
            query = """
                SELECT id, upload_timestamp, purchase_datetime, store_name, total_amount, categories, items
                FROM receipts
                ORDER BY upload_timestamp DESC
                LIMIT 20
            """
            
            cursor.execute(query)
            results = cursor.fetchall()
            
            column_names = [desc[0] for desc in cursor.description]
            results_with_columns = [dict(zip(column_names, row)) for row in results]
            
            cursor.close()
            conn.close()
            return results_with_columns
        except Exception as e:
            st.error(f"Error retrieving receipt history: {e}")
            if conn:
                conn.close()
            return []

def get_analytics_data(start_date=None, end_date=None):
    conn = get_database_connection()
    if conn:
        try:
            cursor = conn.cursor()
            
            # First check if the analytics table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'receipt_analytics'
                );
            """)
            table_exists = cursor.fetchone()[0]
            
            if not table_exists:
                # Create the analytics table
                cursor.execute("""
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
                    )
                """)
                
                # Populate it with data from receipts table
                cursor.execute("""
                    INSERT INTO receipt_analytics (
                        date, hour, week, year, total_amount, health_score, 
                        rolling_avg_health, items_count
                    )
                    SELECT 
                        DATE(purchase_datetime) as date,
                        EXTRACT(HOUR FROM purchase_datetime) as hour,
                        EXTRACT(WEEK FROM purchase_datetime) as week,
                        EXTRACT(YEAR FROM purchase_datetime) as year,
                        total_amount,
                        health_score,
                        AVG(health_score) OVER (
                            ORDER BY purchase_datetime 
                            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                        ) as rolling_avg_health,
                        JSONB_ARRAY_LENGTH(items::jsonb) as items_count
                    FROM receipts
                    ORDER BY purchase_datetime;
                """)
                conn.commit()
            
            cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            
            query = """
                SELECT 
                    date,
                    hour,
                    week,
                    year,
                    total_amount,
                    health_score,
                    rolling_avg_health,
                    items_count
                FROM receipt_analytics
                WHERE 1=1
            """
            
            params = []
            if start_date:
                query += " AND date >= %s"
                params.append(start_date)
            if end_date:
                query += " AND date <= %s"
                params.append(end_date)
            
            query += " ORDER BY date, hour"
            
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            column_names = [desc[0] for desc in cursor.description]
            results_with_columns = [dict(zip(column_names, row)) for row in results]
            
            cursor.close()
            conn.close()
            return pd.DataFrame(results_with_columns)
        except Exception as e:
            st.error(f"Error retrieving analytics data: {e}")
            if conn:
                conn.close()
            return pd.DataFrame()

def plot_hourly_distribution(df):
    # Create simple hourly distribution plot using plotly
    hourly_stats = df.groupby('hour')['total_amount'].count().reset_index()
    hourly_stats.columns = ['hour', 'count']
    
    fig = go.Figure()
    
    # Add shopping frequency line
    fig.add_trace(go.Scatter(
        x=hourly_stats['hour'],
        y=hourly_stats['count'],
        mode='lines+markers',
        name='Shopping Frequency',
        line=dict(color='#2ecc71', width=2),
        hovertemplate="Hour: %{x}:00<br>Number of Visits: %{y}<extra></extra>"
    ))
    
    fig.update_layout(
        title='Shopping Time Patterns',
        xaxis=dict(
            title='Hour of Day', 
            tickmode='linear', 
            tick0=0, 
            dtick=1,
            ticktext=[f"{i:02d}:00" for i in range(24)],
            tickvals=list(range(24))
        ),
        yaxis=dict(title='Number of Visits'),
        hovermode='x unified',
        showlegend=False,
        height=400
    )
    
    return fig

def get_health_score_metrics(df):
    metrics = {
        'avg_health': df['health_score'].mean(),
        'highest_health': df['health_score'].max(),
        'lowest_health': df['health_score'].min(),
        'avg_amount': df['total_amount'].mean()
    }
    return metrics

def plot_health_distribution(df):
    fig = go.Figure()
    
    # Add histogram of health scores
    fig.add_trace(go.Histogram(
        x=df['health_score'],
        nbinsx=20,
        name='Distribution',
        hovertemplate="Health Score: %{x}<br>Count: %{y}<extra></extra>"
    ))
    
    # Add box plot
    fig.add_trace(go.Box(
        x=df['health_score'],
        name='Box Plot',
        boxpoints='outliers',
        hovertemplate="Health Score: %{x}<extra></extra>"
    ))
    
    fig.update_layout(
        title='Health Score Distribution',
        xaxis_title='Health Score',
        yaxis_title='Count',
        height=400,
        showlegend=True
    )
    
    return fig

def plot_weekly_trends(df):
    weekly_stats = df.groupby(['year', 'week']).agg({
        'health_score': ['mean', 'std'],
        'rolling_avg_health': 'mean'
    }).reset_index()
    
    fig = go.Figure()
    
    # Add weekly average line
    fig.add_trace(go.Scatter(
        x=[f"{row['year']}-W{row['week']}" for _, row in weekly_stats.iterrows()],
        y=weekly_stats['health_score']['mean'],
        mode='lines+markers',
        name='Weekly Average',
        line=dict(color='#2ecc71', width=2),
        hovertemplate="Week: %{x}<br>Health Score: %{y:.1f}<extra></extra>"
    ))
    
    # Add rolling average line
    fig.add_trace(go.Scatter(
        x=[f"{row['year']}-W{row['week']}" for _, row in weekly_stats.iterrows()],
        y=weekly_stats['rolling_avg_health']['mean'],
        mode='lines',
        name='Rolling Average',
        line=dict(color='#e74c3c', width=2, dash='dash'),
        hovertemplate="Week: %{x}<br>Rolling Avg: %{y:.1f}<extra></extra>"
    ))
    
    fig.update_layout(
        title='Weekly Health Score Trends',
        xaxis_title='Week',
        yaxis_title='Health Score',
        height=400,
        showlegend=True,
        hovermode='x unified'
    )
    
    return fig

def initialize_upload_state():
    if 'upload_queue' not in st.session_state:
        st.session_state.upload_queue = deque()
    if 'processed_count' not in st.session_state:
        st.session_state.processed_count = 0
    if 'total_count' not in st.session_state:
        st.session_state.total_count = 0
    if 'results_summary' not in st.session_state:
        st.session_state.results_summary = {
            'success': 0,
            'failed': 0,
            'receipts': []
        }

def process_upload_queue():
    if not st.session_state.upload_queue:
        return
    
    total_files = st.session_state.total_count
    processed = st.session_state.processed_count
    
    # Progress bar for overall progress
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    while st.session_state.upload_queue and not st.session_state.get('stop_processing', False):
        file = st.session_state.upload_queue.popleft()
        
        try:
            # Update status
            status_text.text(f"Processing receipt {processed + 1} of {total_files}...")
            
            # Process receipt
            receipt_data = extract_receipt_info(file)
            
            if receipt_data:
                # Save to database
                receipt_id = save_to_database(receipt_data, f"receipt_{uuid.uuid4()}")
                
                if receipt_id:
                    st.session_state.results_summary['success'] += 1
                    st.session_state.results_summary['receipts'].append({
                        'store': receipt_data.get('store_name', 'Unknown'),
                        'date': receipt_data.get('purchase_datetime', ''),
                        'total': receipt_data.get('total_amount', 0),
                        'health_score': receipt_data.get('health_score', 0)
                    })
                else:
                    st.session_state.results_summary['failed'] += 1
            else:
                st.session_state.results_summary['failed'] += 1
            
        except Exception as e:
            st.session_state.results_summary['failed'] += 1
            st.error(f"Error processing receipt: {str(e)}")
        
        # Update progress
        processed += 1
        st.session_state.processed_count = processed
        progress_bar.progress(processed / total_files)
    
    # Show final summary
    if processed == total_files:
        status_text.text("✅ All receipts processed!")
        show_upload_summary()

def show_upload_summary():
    summary = st.session_state.results_summary
    
    # Show success/failure counts
    st.markdown(f"""
        ### Upload Summary
        - ✅ Successfully processed: {summary['success']}
        - ❌ Failed: {summary['failed']}
    """)
    
    if summary['receipts']:
        # Create summary DataFrame
        df = pd.DataFrame(summary['receipts'])
        df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d %H:%M')
        df.columns = ['Store', 'Date', 'Total Amount', 'Health Score']
        
        # Display compact summary table
        st.dataframe(
            df,
            use_container_width=True,
            hide_index=True
        )

def reset_upload_state():
    st.session_state.upload_queue = deque()
    st.session_state.processed_count = 0
    st.session_state.total_count = 0
    st.session_state.results_summary = {
        'success': 0,
        'failed': 0,
        'receipts': []
    }
    st.session_state.stop_processing = False

# Create the Streamlit app
def main():
    # Add custom CSS
    st.markdown("""
        <style>
        /* Main container styling */
        .main {
            padding: 0 1rem;
        }
        
        /* Upload area styling */
        .uploadedFile {
            border: 2px dashed #cccccc;
            border-radius: 5px;
            padding: 1rem;
            margin: 1rem 0;
        }
        
        /* Receipt info styling */
        .receipt-info {
            background-color: #f8f9fa;
            padding: 1.5rem;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        
        /* Table styling */
        .stDataFrame {
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        /* Status messages */
        .stSuccess, .stInfo, .stWarning, .stError {
            padding: 1rem;
            border-radius: 5px;
            margin: 1rem 0;
        }
        
        /* Analytics dashboard styling */
        .stPlotlyChart {
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            padding: 10px;
            margin-bottom: 20px;
        }
        
        .analytics-metric {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        </style>
    """, unsafe_allow_html=True)
    
    st.title("📊 Receipt Analyzer")
    
    # Create tabs
    tab1, tab2, tab3 = st.tabs(["Upload Receipt", "History", "Analytics"])
    
    with tab1:
        st.header("Upload Your Receipt")
        st.write("Upload one or more supermarket receipts to extract and analyze your shopping data.")
        
        # Initialize upload state
        initialize_upload_state()
        
        # Multiple file uploader
        uploaded_files = st.file_uploader(
            "Choose receipt images",
            type=["jpg", "jpeg", "png", "pdf"],
            accept_multiple_files=True
        )
        
        if uploaded_files:
            # Reset state for new upload
            if len(uploaded_files) != st.session_state.total_count:
                reset_upload_state()
                st.session_state.upload_queue.extend(uploaded_files)
                st.session_state.total_count = len(uploaded_files)
            
            # Process queue
            process_upload_queue()
            
            # Add option to clear results and upload new files
            if st.button("Clear Results"):
                reset_upload_state()
                st.rerun()
    
    with tab2:
        st.header("Receipt History")
        
        # Get history from database
        receipts = get_receipt_history()
        
        if receipts:
            # Create DataFrame with explicit column names
            history_df = pd.DataFrame(receipts)
            
            # Format timestamps and dates
            if 'upload_timestamp' in history_df.columns:
                history_df['upload_timestamp'] = pd.to_datetime(history_df['upload_timestamp']).dt.strftime('%Y-%m-%d %H:%M')
            if 'purchase_datetime' in history_df.columns:
                history_df['purchase_datetime'] = pd.to_datetime(history_df['purchase_datetime']).dt.strftime('%Y-%m-%d %H%M')
            
            # Display main table with expandable rows
            for _, receipt in history_df.iterrows():
                health_score = receipt.get('health_score', 0)
                health_score_display = f" - Health: {health_score}/10" if health_score > 0 else ""
                with st.expander(f"📝 {receipt['store_name']} - {receipt['purchase_datetime']} - ${receipt['total_amount']}{health_score_display}"):
                    try:
                        # Handle items
                        items = receipt.get('items', '[]')
                        if isinstance(items, str):
                            items = json.loads(items)
                        
                        if items:
                            st.write("### Items")
                            items_df = pd.DataFrame(items)
                            if not items_df.empty and all(col in items_df.columns for col in ['name', 'price', 'category', 'health_score']):
                                # Format health score display
                                items_df['health_score'] = items_df['health_score'].apply(
                                    lambda x: f"{x}/10" if x > 0 else "N/A"
                                )
                                st.dataframe(items_df[['name', 'price', 'category', 'health_score']], use_container_width=True)
                        
                        # Handle categories
                        categories = receipt.get('categories', '{}')
                        if isinstance(categories, str):
                            categories = json.loads(categories)
                        
                        if categories:
                            st.write("### Categories")
                            for category, amount in categories.items():
                                st.write(f"- {category}: ${float(amount):.2f}")
                        
                    except Exception as e:
                        st.error(f"Error displaying receipt details: {str(e)}")
        else:
            st.write("No receipts found in the database")
    
    with tab3:
        st.header("Shopping Analytics")
        
        # Time range selector
        time_ranges = {
            "Last 2 weeks": 14,
            "Last month": 30,
            "Last 3 months": 90,
            "Last 6 months": 180,
            "Last year": 365,
            "Custom range": 0
        }
        
        selected_range = st.selectbox(
            "Select Time Range",
            options=list(time_ranges.keys()),
            index=0  # Default to "Last 2 weeks"
        )
        
        # Calculate default dates
        today = datetime.now().date()
        if selected_range == "Custom range":
            col1, col2 = st.columns(2)
            with col1:
                start_date = st.date_input("Start Date", value=today - pd.Timedelta(days=14))
            with col2:
                end_date = st.date_input("End Date", value=today)
        else:
            days = time_ranges[selected_range]
            start_date = today - pd.Timedelta(days=days)
            end_date = today
            st.info(f"Showing data from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        
        # Fetch analytics data
        df = get_analytics_data(start_date, end_date)
        
        if not df.empty:
            # Health Score Metrics
            metrics = get_health_score_metrics(df)
            
            st.markdown("""
                <style>
                .metric-container {
                    background-color: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 30px;
                }
                .metric-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 15px;
                }
                .metric-item {
                    text-align: center;
                    flex: 1;
                    padding: 10px;
                }
                </style>
            """, unsafe_allow_html=True)
            
            st.markdown("<div class='metric-container'>", unsafe_allow_html=True)
            st.subheader("Health Score Summary")
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric(
                    "Average Health Score",
                    f"{metrics['avg_health']:.1f}/10"
                )
            with col2:
                st.metric(
                    "Highest Health Score",
                    f"{metrics['highest_health']:.1f}/10"
                )
            with col3:
                st.metric(
                    "Lowest Health Score",
                    f"{metrics['lowest_health']:.1f}/10"
                )
            st.markdown("</div>", unsafe_allow_html=True)
            
            # Shopping Time Analysis
            st.subheader("Shopping Patterns")
            st.plotly_chart(plot_hourly_distribution(df), use_container_width=True)
            
            # Health Score Distribution
            st.subheader("Health Score Distribution")
            st.plotly_chart(plot_health_distribution(df), use_container_width=True)
            
            # Weekly Trends
            st.subheader("Weekly Health Score Trends")
            st.plotly_chart(plot_weekly_trends(df), use_container_width=True)
            
        else:
            st.info("No data available for the selected date range")

if __name__ == "__main__":
    main()
