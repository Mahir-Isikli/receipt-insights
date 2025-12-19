import { Pool } from 'pg';
import { NextResponse, NextRequest } from 'next/server';

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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
  period_label: string;
}

type TimePeriod = 'this_month' | '3_months' | '6_months' | 'all';

function getDateRangeForPeriod(period: TimePeriod): { startDate: Date | null; label: string } {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        label: now.toLocaleString('default', { month: 'long', year: 'numeric' })
      };
    case '3_months':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        label: 'Last 3 months'
      };
    case '6_months':
      return {
        startDate: new Date(now.getFullYear(), now.getMonth() - 5, 1),
        label: 'Last 6 months'
      };
    case 'all':
    default:
      return { startDate: null, label: 'All time' };
  }
}

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const period = (searchParams.get('period') || 'all') as TimePeriod;
    
    const { startDate, label } = getDateRangeForPeriod(period);
    
    const dateFilter = startDate 
      ? `AND purchase_datetime >= $3` 
      : '';
    const params = startDate 
      ? [limit, offset, startDate.toISOString()] 
      : [limit, offset];

    // Optimized: single query for count and receipts using CTE
    const query = `
      WITH filtered_receipts AS (
        SELECT receipt_id, merchant_name, merchant_address, total_amount, 
               purchase_datetime, currency_code, category, processed_timestamp
        FROM receipts 
        WHERE processing_status = 'COMPLETE' ${dateFilter}
      ),
      counted AS (
        SELECT COUNT(*) as total FROM filtered_receipts
      )
      SELECT r.*, c.total as total_count
      FROM filtered_receipts r, counted c
      ORDER BY r.purchase_datetime DESC
      LIMIT $1 OFFSET $2`;

    const receiptsResult = await client.query(query, params);
    const totalCount = parseInt(receiptsResult.rows[0]?.total_count || '0', 10);
    const receipts = receiptsResult.rows;

    if (receipts.length > 0) {
      const receiptIds = receipts.map(r => r.receipt_id);
      
      // Optimized line items query
      const lineItemsResult = await client.query(
        `SELECT line_item_id, receipt_id, item_name, item_cost, category
         FROM line_items 
         WHERE receipt_id = ANY($1)`,
        [receiptIds]
      );

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

      return NextResponse.json({
        receipts: receiptsWithLineItems,
        total_count: totalCount,
        period_label: label
      } as RecentReceiptsResponse);
    }

    return NextResponse.json({
      receipts: [],
      total_count: totalCount,
      period_label: label
    } as RecentReceiptsResponse);

  } catch (error) {
    console.error('Error fetching receipts:', error);
    return NextResponse.json(
      { message: 'Failed to fetch receipts', error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export const dynamic = 'force-dynamic'; 