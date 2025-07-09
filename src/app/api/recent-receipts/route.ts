import { Pool } from 'pg';
import { NextResponse, NextRequest } from 'next/server';

// Initialize Neon PG client
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon connection
  },
});

// Interface for receipt with line items
interface LineItem {
  line_item_id: string;
  item_name: string;
  item_cost: number;
  category: string;
}

interface Receipt {
  receipt_id: string;
  merchant_name: string;
  merchant_address: string | null;
  total_amount: number;
  purchase_datetime: string;
  currency_code: string;
  category: string;
  processed_timestamp: string;
  line_items: LineItem[];
}

interface RecentReceiptsResponse {
  receipts: Receipt[];
  total_count: number;
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    // Get query parameters for pagination
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // First, get the total count of completed receipts
    const countResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM receipts 
       WHERE processing_status = 'COMPLETE'`
    );
    const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get recent receipts with pagination
    const receiptsResult = await client.query(
      `SELECT 
         receipt_id,
         merchant_name,
         merchant_address,
         total_amount,
         purchase_datetime,
         currency_code,
         category,
         processed_timestamp
       FROM receipts 
       WHERE processing_status = 'COMPLETE'
       ORDER BY processed_timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const receipts = receiptsResult.rows;

    // Get line items for all receipts in a single query
    if (receipts.length > 0) {
      const receiptIds = receipts.map(r => r.receipt_id);
      const lineItemsResult = await client.query(
        `SELECT 
           line_item_id,
           receipt_id,
           item_name,
           item_cost,
           category
         FROM line_items 
         WHERE receipt_id = ANY($1)
         ORDER BY line_item_id`,
        [receiptIds]
      );

      // Group line items by receipt_id
      const lineItemsByReceiptId: { [key: string]: LineItem[] } = {};
      lineItemsResult.rows.forEach(item => {
        if (!lineItemsByReceiptId[item.receipt_id]) {
          lineItemsByReceiptId[item.receipt_id] = [];
        }
        lineItemsByReceiptId[item.receipt_id].push({
          line_item_id: item.line_item_id,
          item_name: item.item_name,
          item_cost: parseFloat(item.item_cost),
          category: item.category || 'OTHER'
        });
      });

      // Combine receipts with their line items
      const receiptsWithLineItems: Receipt[] = receipts.map(receipt => ({
        receipt_id: receipt.receipt_id,
        merchant_name: receipt.merchant_name,
        merchant_address: receipt.merchant_address,
        total_amount: parseFloat(receipt.total_amount),
        purchase_datetime: receipt.purchase_datetime,
        currency_code: receipt.currency_code,
        category: receipt.category,
        processed_timestamp: receipt.processed_timestamp,
        line_items: lineItemsByReceiptId[receipt.receipt_id] || []
      }));

      const response: RecentReceiptsResponse = {
        receipts: receiptsWithLineItems,
        total_count: totalCount
      };

      return NextResponse.json(response);
    } else {
      const response: RecentReceiptsResponse = {
        receipts: [],
        total_count: totalCount
      };

      return NextResponse.json(response);
    }

  } catch (error) {
    console.error('Error fetching recent receipts:', error);
    return NextResponse.json(
      { message: 'Failed to fetch recent receipts', error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
} 