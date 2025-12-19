import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pool, PoolClient } from 'pg';

// Retry utility function with exponential backoff
interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on non-retryable errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === options.maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1),
        options.maxDelay
      );
      
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`, (error as Error).message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Check if an error should not be retried
function isNonRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  // Check for GoogleGenerativeAI errors with specific status codes
  const errorWithStatus = error as Error & { status?: number };
  if (errorWithStatus.status !== undefined) {
    const status = errorWithStatus.status;
    // Don't retry on client errors (4xx except 429)
    if (status >= 400 && status < 500 && status !== 429) {
      return true;
    }
  }
  
  // Don't retry on parsing errors or validation errors
  if (error.message.includes('Failed to parse') || 
      error.message.includes('validation failed') ||
      error.message.includes('Content blocked')) {
    return true;
  }
  
  return false;
}

// Enhanced error classification for user-friendly messages
function classifyError(error: unknown): { type: string; userMessage: string; shouldRetry: boolean } {
  if (!(error instanceof Error)) {
    return {
      type: 'unknown',
      userMessage: 'An unexpected error occurred. Please try again.',
      shouldRetry: false
    };
  }

  // GoogleGenerativeAI specific errors
  const errorWithStatus = error as Error & { status?: number };
  if (errorWithStatus.status !== undefined) {
    const status = errorWithStatus.status;
    switch (status) {
      case 503:
        return {
          type: 'service_unavailable',
          userMessage: 'The AI service is temporarily overloaded. Please try again in a few minutes.',
          shouldRetry: true
        };
      case 429:
        return {
          type: 'rate_limit',
          userMessage: 'Too many requests. Please wait a moment and try again.',
          shouldRetry: true
        };
      case 400:
        return {
          type: 'invalid_request',
          userMessage: 'The image could not be processed. Please ensure it\'s a clear receipt image.',
          shouldRetry: false
        };
      case 401:
        return {
          type: 'auth_error',
          userMessage: 'Authentication error. Please contact support.',
          shouldRetry: false
        };
      default:
        if (status >= 500) {
          return {
            type: 'server_error',
            userMessage: 'The AI service is experiencing issues. Please try again later.',
            shouldRetry: true
          };
        }
    }
  }

  // Content filtering errors
  if (error.message.includes('Content blocked')) {
    return {
      type: 'content_blocked',
      userMessage: 'The image was blocked by safety filters. Please try a different image.',
      shouldRetry: false
    };
  }

  // Parsing errors
  if (error.message.includes('Failed to parse')) {
    return {
      type: 'parsing_error',
      userMessage: 'The AI could not extract valid data from the receipt. Please try a clearer image.',
      shouldRetry: false
    };
  }

  // Database errors
  if (error.message.includes('Database operation failed')) {
    return {
      type: 'database_error',
      userMessage: 'Failed to save receipt data. Please try again.',
      shouldRetry: true
    };
  }

  // Default fallback
  return {
    type: 'general_error',
    userMessage: 'Processing failed. Please try again or contact support if the issue persists.',
    shouldRetry: false
  };
}

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

interface ProcessResult {
  fileName: string;
  status: 'success' | 'error';
  receiptId?: string;
  message: string;
  errorType?: string;
  shouldRetry?: boolean;
  debugInfo?: string;
}

// --- Function to process a single receipt image ---
async function processSingleReceipt(imageFile: File, genAI: GoogleGenerativeAI, pool: Pool): Promise<ProcessResult> {
  const fileName = imageFile.name;
  console.log(`[${fileName}] Starting processing...`);
  let dbClient: PoolClient | undefined;

  try {
      // 1. Gemini Processing
      // =====================
      const model = genAI.getGenerativeModel({
          model: "gemini-3-flash",
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

      console.log(`[${fileName}] Sending request to Gemini...`);
      const result = await retryWithBackoff(
        () => model.generateContent([prompt, imagePart]),
        {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          backoffMultiplier: 2
        }
      );

      if (!result.response) {
          console.error(`[${fileName}] Gemini response was blocked.`, result);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Structure of blocked response/result isn't strictly typed
          const blockReason = (result as any)?.promptFeedback?.blockReason ?? 'Unknown reason';
          throw new Error(`Content blocked by safety filters: ${blockReason}`);
      }

      const responseText = result.response.text();
      console.log(`[${fileName}] Gemini Raw Response Text (JSON expected):`, responseText.substring(0, 200) + '...'); // Log truncated response

      let extractedData: ExtractedReceiptData;
      try {
          extractedData = JSON.parse(responseText);
          console.log(`[${fileName}] Parsed Extracted Data (Merchant):`, extractedData.merchant_name);
          if (!extractedData.merchant_name || !extractedData.purchase_datetime || typeof extractedData.total_amount !== 'number' || !extractedData.category || !extractedData.line_items ||
              !extractedData.line_items.every(item => item.item_name && typeof item.item_cost === 'number' && item.category && lineItemCategories.includes(item.category))) {
              throw new Error("Missing or invalid required fields in extracted data, or invalid line item category.");
          }
      } catch (parseError) {
          console.error(`[${fileName}] Failed to parse JSON from Gemini response or validation failed:`, parseError);
          console.error(`[${fileName}] Raw response was:`, responseText);
          throw new Error('Failed to parse valid extraction results from AI.');
      }

      // 2. Database Interaction (Transaction per file)
      // =====================
      console.log(`[${fileName}] Connecting to database...`);
      dbClient = await pool.connect();
      console.log(`[${fileName}] Database connected. Starting transaction...`);

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
              'COMPLETE' // Set to COMPLETE directly
          ];
          const receiptResult = await dbClient.query(insertReceiptQuery, receiptValues);
          const newReceiptId = receiptResult.rows[0].receipt_id;
          console.log(`[${fileName}] Inserted into receipts, ID: ${newReceiptId}`);

          // Insert into line_items table
          if (extractedData.line_items && extractedData.line_items.length > 0) {
              const insertLineItemQuery = `
                  INSERT INTO line_items (receipt_id, item_name, item_cost, category)
                  VALUES ($1, $2, $3, $4);
              `;
              await Promise.all(extractedData.line_items.map(item => {
                  const lineItemValues = [newReceiptId, item.item_name, item.item_cost, item.category];
                   if (!dbClient) { // Re-check inside map just in case, though unlikely here
                        throw new Error("Database client became undefined during line item insertion.");
                   }
                  return dbClient.query(insertLineItemQuery, lineItemValues);
              }));
              console.log(`[${fileName}] Inserted ${extractedData.line_items.length} line items.`);
          }

          await dbClient.query('COMMIT');
          console.log(`[${fileName}] Transaction committed successfully.`);

          return {
              fileName: fileName,
              status: 'success',
              receiptId: newReceiptId,
              message: `Receipt processed and saved successfully (ID: ${newReceiptId}).`
          };

      } catch (dbError) {
          console.error(`[${fileName}] Database transaction error:`, dbError);
          if (dbClient) { // Check if client exists before rollback
              await dbClient.query('ROLLBACK');
              console.log(`[${fileName}] Transaction rolled back.`);
          } else {
             console.error(`[${fileName}] Cannot rollback, dbClient is undefined.`);
          }
          throw new Error(`Database operation failed for ${fileName}.`); // Re-throw to be caught by outer catch
      } // End of inner DB try-catch

  } catch (error) {
      console.error(`[${fileName}] Error processing receipt:`, error);
      
      // Get actual error message for debugging
      const actualError = error instanceof Error ? error.message : String(error);
      const errorInfo = classifyError(error);
      
      return {
          fileName: fileName,
          status: 'error',
          message: `${fileName}: ${actualError}`,
          errorType: errorInfo.type,
          shouldRetry: errorInfo.shouldRetry,
          debugInfo: actualError
      };
  } finally {
      // Ensure the client is always released for this specific file processing
      if (dbClient) {
          dbClient.release();
          console.log(`[${fileName}] Database client released.`);
      }
  }
}

// --- Main API Route Handler ---
export async function POST(request: Request) {
  console.log('Received request at /api/process-receipt (Multi-file)');

  try {
    const formData = await request.formData();
    // Use getAll to capture multiple files under the same key
    const imageFiles = formData.getAll('receiptImages') as File[]; // Assume key is 'receiptImages'

    if (!imageFiles || imageFiles.length === 0) {
        return NextResponse.json({ message: 'No image files uploaded.' }, { status: 400 });
    }

    if (imageFiles.some(file => !(file instanceof File))) {
        return NextResponse.json({ message: 'Invalid data received. Expected only files.' }, { status: 400 });
    }

    // --- Enforce maximum upload limit ---
    const MAX_FILES = 5;
    if (imageFiles.length > MAX_FILES) {
        return NextResponse.json({ message: `Too many files uploaded. Maximum is ${MAX_FILES}.` }, { status: 400 });
    }

    console.log(`Received ${imageFiles.length} image(s):`, imageFiles.map(f => f.name).join(', '));

    // Process all valid image files concurrently using Promise.allSettled
    const processingPromises = imageFiles.map(file => processSingleReceipt(file, genAI, pool));
    const results = await Promise.allSettled(processingPromises);

    // Consolidate results
    const responsePayload: ProcessResult[] = results.map((result, index) => {
        const fileName = imageFiles[index].name; // Get original filename for context
        if (result.status === 'fulfilled') {
            return result.value; // Contains ProcessResult from processSingleReceipt
        } else {
            // Handle unexpected errors during the promise execution itself (outside processSingleReceipt's try/catch)
            console.error(`[${fileName}] Unexpected error in Promise.allSettled:`, result.reason);
            const actualError = result.reason instanceof Error ? result.reason.message : String(result.reason);
            const errorInfo = classifyError(result.reason);
            return {
                fileName: fileName,
                status: 'error',
                message: `${fileName}: ${actualError}`,
                errorType: errorInfo.type,
                shouldRetry: errorInfo.shouldRetry,
                debugInfo: actualError
            };
        }
    });

    console.log("Processing complete. Sending response.");
    // Return 200 OK with the array of results
    return NextResponse.json(responsePayload, { status: 200 });

  } catch (error) {
    // Catch errors from initial setup, FormData parsing, or initial file checks
    console.error('[API Process Receipt Global Error]:', error);
    let errorMessage = 'An unexpected error occurred during request handling.';
     // Keep statusCode 500 for these general/unexpected errors
    const statusCode = 500;

    if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
    }

    return NextResponse.json({ message: errorMessage }, { status: statusCode });
  }
  // No finally block here as individual connections are handled in processSingleReceipt
} 