import { Pool } from 'pg';
import { NextResponse } from 'next/server';

// Initialize Neon PG client
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon connection
  },
});

interface AvailableMonth {
  year: number;
  month: number;
  label: string;
  receiptCount: number;
}

export async function GET() {
  const client = await pool.connect();

  try {
    // Query to get all months with completed receipts
    const result = await client.query<{ year: number; month: number; receipt_count: string }>(
      `SELECT 
         EXTRACT(YEAR FROM purchase_datetime) as year,
         EXTRACT(MONTH FROM purchase_datetime) as month,
         COUNT(*) as receipt_count
       FROM receipts 
       WHERE processing_status = 'COMPLETE'
       GROUP BY EXTRACT(YEAR FROM purchase_datetime), EXTRACT(MONTH FROM purchase_datetime)
       ORDER BY year DESC, month DESC`
    );

    // Format the results
    const monthLabels = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const availableMonths: AvailableMonth[] = result.rows.map(row => ({
      year: row.year,
      month: row.month,
      label: `${monthLabels[row.month - 1]} ${row.year}`,
      receiptCount: parseInt(row.receipt_count, 10)
    }));

    return NextResponse.json({ months: availableMonths });

  } catch (error) {
    console.error('Error fetching available months:', error);
    return NextResponse.json(
      { message: 'Failed to fetch available months', error: (error as Error).message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
} 