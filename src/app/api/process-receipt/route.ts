import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pool, PoolClient } from 'pg';

// Ensure API key and DB URL are loaded correctly
const apiKey = process.env.GOOGLE_API_KEY;
const dbUrl = process.env.NEON_DATABASE_URL;

if (!apiKey) {
  throw new Error('GOOGLE_API_KEY environment variable is not set.');
}
if (!dbUrl) {
  throw new Error('NEON_DATABASE_URL environment variable is not set.');
}

// Initialize Google AI Client
const genAI = new GoogleGenerativeAI(apiKey);

// Initialize PostgreSQL Pool
const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    // Neon requires SSL
    rejectUnauthorized: false, // Adjust as needed for your security requirements
  },
});

// Helper function to convert File to GenerativePart
async function fileToGenerativePart(file: File) {
  const base64EncodedData = Buffer.from(await file.arrayBuffer()).toString("base64");
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
}

// Define the expected JSON structure for Gemini response
// (Still useful for prompt guidance and basic validation)
interface LineItem {
  item_name: string;
  item_cost: number;
  category: string;
}

interface ExtractedReceiptData {
  merchant_name: string;
  merchant_address?: string | null;
  purchase_datetime: string; // ISO 8601 format expected
  currency_code: string;
  total_amount: number;
  category: string;
  line_items: LineItem[];
}

// Define allowed categories for line items
const lineItemCategories = [
  'PRODUCE', 'MEAT_POULTRY', 'SEAFOOD', 'EGGS', 'GRAINS_PASTA',
  'LEGUMES_NUTS_SEEDS', 'OILS_FATS', 'SPICES_CONDIMENTS', 'BEVERAGES',
  'SNACKS_SWEETS', 'FROZEN_FOODS', 'PANTRY_STAPLES', 'HOUSEHOLD_CLEANING',
  'PERSONAL_CARE', 'OTHER'
];

// Update JSON Schema to include line item category with ENUM constraint
const jsonSchema = `{
  "type": "object",
  "properties": {
    "merchant_name": { "type": "string" },
    "merchant_address": { "type": "string" },
    "purchase_datetime": { "type": "string", "format": "date-time" },
    "currency_code": { "type": "string", "maxLength": 3 },
    "total_amount": { "type": "number" },
    "category": { "type": "string" },
    "line_items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "item_name": { "type": "string" },
          "item_cost": { "type": "number" },
          "category": {
            "type": "string",
            "enum": ${JSON.stringify(lineItemCategories)}
          }
        },
        "required": ["item_name", "item_cost", "category"]
      }
    }
  },
  "required": ["merchant_name", "purchase_datetime", "currency_code", "total_amount", "category", "line_items"]
}`;

export async function POST(request: Request) {
  console.log('Received request at /api/process-receipt');
  let dbClient: PoolClient | undefined; // Define client, initialize as undefined

  try {
    const formData = await request.formData();
    const imageFile = formData.get('receiptImage');

    if (!imageFile || !(imageFile instanceof File)) {
        return NextResponse.json({ message: 'No image file uploaded.' }, { status: 400 });
    }

    console.log(`Received image: ${imageFile.name}, Type: ${imageFile.type}, Size: ${imageFile.size} bytes`);

    // 1. Gemini Processing
    // =====================
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Using 1.5 Flash
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const imagePart = await fileToGenerativePart(imageFile);
    const prompt = `Analyze the following receipt image and extract the requested information strictly in the following JSON format. 
    For the overall receipt, infer the category if possible (e.g., Groceries, Restaurant, Fuel, Travel, Utilities, Other), otherwise use 'Uncategorized'. 
    For *each line item*, assign a category from the following list: ${lineItemCategories.join(', ')}. If an item doesn't clearly fit, use 'OTHER'. 
    Ensure purchase_datetime is in ISO 8601 format (YYYY-MM-DDTHH:mm:ss). If only date is visible, use T00:00:00.
    If merchant_address is not clearly visible, omit it or set it to null.
    
    JSON Schema to follow:
    \`\`\`json
    ${jsonSchema}
    \`\`\`
    `;

    console.log("Sending request to Gemini...");
    const result = await model.generateContent([prompt, imagePart]);

    if (!result.response) {
      console.error("Gemini response was blocked.", result);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Structure of blocked response/result isn't strictly typed
      const blockReason = (result as any)?.promptFeedback?.blockReason ?? 'Unknown reason';
      return NextResponse.json({ message: `Content blocked by safety filters: ${blockReason}` }, { status: 400 });
    }
    
    const responseText = result.response.text();
    console.log("Gemini Raw Response Text (JSON expected):", responseText);

    let extractedData: ExtractedReceiptData;
    try {
        extractedData = JSON.parse(responseText);
        console.log("Parsed Extracted Data:", extractedData);
        if (!extractedData.merchant_name || !extractedData.purchase_datetime || typeof extractedData.total_amount !== 'number' || !extractedData.category || !extractedData.line_items ||
            !extractedData.line_items.every(item => item.item_name && typeof item.item_cost === 'number' && item.category && lineItemCategories.includes(item.category))) {
            throw new Error("Missing or invalid required fields in extracted data, or invalid line item category.");
        }
    } catch (parseError) {
        console.error("Failed to parse JSON from Gemini response or validation failed:", parseError);
        console.error("Raw response was:", responseText);
        return NextResponse.json({ message: 'Failed to parse valid extraction results from AI.' }, { status: 500 });
    }

    // 2. Database Interaction
    // =====================
    console.log("Connecting to database...");
    dbClient = await pool.connect();
    console.log("Database connected. Starting transaction...");

    await dbClient.query('BEGIN');
    try {
        // Insert into receipts table
        const insertReceiptQuery = `
            INSERT INTO receipts (
                merchant_name, merchant_address, purchase_datetime, currency_code, 
                total_amount, category, processing_status, processed_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
            RETURNING receipt_id;
        `;
        const receiptValues = [
            extractedData.merchant_name,
            extractedData.merchant_address ?? null, // Ensure null if undefined
            new Date(extractedData.purchase_datetime),
            extractedData.currency_code,
            extractedData.total_amount,
            extractedData.category,
            'COMPLETE'
        ];
        const receiptResult = await dbClient.query(insertReceiptQuery, receiptValues);
        const newReceiptId = receiptResult.rows[0].receipt_id;
        console.log(`Inserted into receipts, ID: ${newReceiptId}`);

        // Insert into line_items table
        if (extractedData.line_items && extractedData.line_items.length > 0) {
            const insertLineItemQuery = `
                INSERT INTO line_items (receipt_id, item_name, item_cost, category) 
                VALUES ($1, $2, $3, $4);
            `;
            // Use Promise.all for potentially better performance with many items
            await Promise.all(extractedData.line_items.map(item => {
                const lineItemValues = [newReceiptId, item.item_name, item.item_cost, item.category];
                if (!dbClient) {
                    throw new Error("Database client became undefined during transaction.");
                }
                return dbClient.query(insertLineItemQuery, lineItemValues);
            }));
            console.log(`Inserted ${extractedData.line_items.length} line items.`);
        }

        await dbClient.query('COMMIT');
        console.log("Transaction committed successfully.");

        return NextResponse.json({ 
            message: `Receipt processed and saved successfully (ID: ${newReceiptId}).`,
            receiptId: newReceiptId,
            // Optionally return data if needed by frontend
            // data: extractedData 
        }, { status: 200 });

    } catch (dbError) {
        console.error("Database transaction error:", dbError);
        if (dbClient) {
            await dbClient.query('ROLLBACK');
            console.log("Transaction rolled back.");
        } else {
            console.error("Cannot rollback, dbClient is undefined.");
        }
        throw new Error('Database operation failed.'); // Let outer catch handle response
    } // End of inner try-catch for DB transaction

  } catch (error) {
    // Catch errors from initial setup, FormData parsing, Gemini call, or DB interaction re-throw
    console.error('[API Process Receipt Error]:', error);
    let errorMessage = 'An unexpected error occurred during processing.';
    const statusCode = 500;

    if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
        // Could add specific status codes based on error message, e.g., DB error vs Gemini error
    } 

    return NextResponse.json({ message: errorMessage }, { status: statusCode });
  } finally {
      // Ensure the client is always released
      if (dbClient) {
          dbClient.release();
          console.log("Database client released.");
      }
  }
} 