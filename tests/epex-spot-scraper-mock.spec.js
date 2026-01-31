import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import http from 'http';

/**
 * Configuration constants for the EPEX SPOT scraper
 */
const CONFIG = {
  LOCAL_PORT: 8765,
  TABLE_SELECTOR: 'table tbody tr',
  COLUMNS_TO_SCRAPE: {
    LOW: 2,      // Column index for "Low"
    HIGH: 3,     // Column index for "High"
    LAST: 4,     // Column index for "Last"
    WEIGHT_AVG: 5 // Column index for "Weight Avg"
  },
  OUTPUT_DIR: 'output',
  OUTPUT_FILE: 'market_data.csv',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

/**
 * Mock HTML data representing EPEX SPOT market results
 * This simulates the real website structure
 */
const MOCK_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Market Results | EPEX SPOT</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        tr:nth-child(even) { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Market Results</h1>
    <p>Delivery Date: 2026-01-26</p>
    
    <table>
        <thead>
            <tr>
                <th>Time</th>
                <th>Product</th>
                <th>Low</th>
                <th>High</th>
                <th>Last</th>
                <th>Weight Avg</th>
                <th>Volume</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>00:00</td>
                <td>DE</td>
                <td>45.23</td>
                <td>48.75</td>
                <td>47.50</td>
                <td>46.82</td>
                <td>1250</td>
            </tr>
            <tr>
                <td>01:00</td>
                <td>DE</td>
                <td>44.50</td>
                <td>47.80</td>
                <td>46.25</td>
                <td>45.95</td>
                <td>1180</td>
            </tr>
            <tr>
                <td>02:00</td>
                <td>DE</td>
                <td>43.75</td>
                <td>46.90</td>
                <td>45.80</td>
                <td>45.30</td>
                <td>1020</td>
            </tr>
            <tr>
                <td>03:00</td>
                <td>DE</td>
                <td>42.90</td>
                <td>46.50</td>
                <td>45.10</td>
                <td>44.75</td>
                <td>950</td>
            </tr>
            <tr>
                <td>04:00</td>
                <td>DE</td>
                <td>43.20</td>
                <td>47.10</td>
                <td>46.00</td>
                <td>45.45</td>
                <td>1100</td>
            </tr>
            <tr>
                <td>05:00</td>
                <td>DE</td>
                <td>44.10</td>
                <td>48.30</td>
                <td>47.20</td>
                <td>46.40</td>
                <td>1280</td>
            </tr>
        </tbody>
    </table>
</body>
</html>
`;

/**
 * Starts a local HTTP server serving mock data
 * @returns {Promise<{server: http.Server, url: string}>} Server instance and URL
 */
function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(MOCK_HTML);
    });

    server.listen(CONFIG.LOCAL_PORT, 'localhost', () => {
      const url = `http://localhost:${CONFIG.LOCAL_PORT}`;
      console.log(`✓ Mock server started at ${url}`);
      resolve({ server, url });
    });

    server.on('error', reject);
  });
}

/**
 * Stops the mock server
 * @param {http.Server} server - The server instance to stop
 */
function stopMockServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('✓ Mock server stopped');
      resolve();
    });
  });
}

/**
 * Scrapes market data from the page
 * @param {Page} page - Playwright page object
 * @returns {Array} Array of market data objects
 */
async function scrapeMarketData(page) {
  let retries = 0;
  let rows = [];

  while (retries < CONFIG.RETRY_ATTEMPTS && rows.length === 0) {
    try {
      // Wait for table to be visible
      await page.waitForSelector(CONFIG.TABLE_SELECTOR, { 
        timeout: CONFIG.TIMEOUT 
      });

      // Extract data from all rows
      rows = await page.evaluate(({ selector, columnConfig }) => {
        const tableRows = document.querySelectorAll(selector);
        const data = [];

        tableRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          
          if (cells.length > columnConfig.WEIGHT_AVG) {
            data.push({
              Low: cells[columnConfig.LOW]?.textContent?.trim() || '',
              High: cells[columnConfig.HIGH]?.textContent?.trim() || '',
              Last: cells[columnConfig.LAST]?.textContent?.trim() || '',
              'Weight Avg': cells[columnConfig.WEIGHT_AVG]?.textContent?.trim() || ''
            });
          }
        });

        return data;
      }, { selector: CONFIG.TABLE_SELECTOR, columnConfig: CONFIG.COLUMNS_TO_SCRAPE });

      if (rows.length === 0) {
        throw new Error('No data rows found in table');
      }

    } catch (error) {
      retries++;
      console.warn(`Attempt ${retries} failed:`, error.message);
      
      if (retries < CONFIG.RETRY_ATTEMPTS) {
        console.log('Retrying after 1 second...');
        await page.waitForTimeout(1000);
      } else {
        throw new Error(`Failed to scrape data after ${CONFIG.RETRY_ATTEMPTS} attempts`);
      }
    }
  }

  return rows;
}

/**
 * Ensures output directory exists
 */
function ensureOutputDirectory() {
  const outputPath = path.join(process.cwd(), CONFIG.OUTPUT_DIR);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  return outputPath;
}

/**
 * Writes market data to CSV file
 * @param {Array} data - Array of market data objects
 * @returns {string} Path to the created CSV file
 */
async function writeToCSV(data) {
  try {
    if (data.length === 0) {
      throw new Error('No data to write to CSV');
    }

    const outputDir = ensureOutputDirectory();
    const filePath = path.join(outputDir, CONFIG.OUTPUT_FILE);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'Low', title: 'Low' },
        { id: 'High', title: 'High' },
        { id: 'Last', title: 'Last' },
        { id: 'Weight Avg', title: 'Weight Avg' }
      ]
    });

    await csvWriter.writeRecords(data);
    console.log(`✓ CSV file created successfully at: ${filePath}`);
    return filePath;

  } catch (error) {
    console.error('Error writing to CSV:', error);
    throw error;
  }
}

/**
 * Main test case: Scrape mock market data and export to CSV
 * This test uses a local mock server to demonstrate the scraping functionality
 * without requiring internet access to the actual EPEX SPOT website
 */
test('Scrape market data from mock server and export to CSV', async ({ page }) => {
  let server = null;
  let marketData = [];

  try {
    // Step 1: Start mock server
    console.log('Starting mock server with sample EPEX SPOT data...');
    const { server: mockServer, url } = await startMockServer();
    server = mockServer;

    // Step 2: Navigate to mock server
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Step 3: Scrape market data
    console.log('Scraping market data from table...');
    marketData = await scrapeMarketData(page);
    console.log(`✓ Successfully scraped ${marketData.length} rows of data`);

    // Log the first few rows for verification
    console.log('\nFirst few rows of scraped data:');
    marketData.slice(0, 3).forEach((row, index) => {
      console.log(`Row ${index + 1}:`, row);
    });

    // Step 4: Write to CSV file
    console.log('\nWriting data to CSV file...');
    const csvPath = await writeToCSV(marketData);

    // Verify file was created
    if (fs.existsSync(csvPath)) {
      const stats = fs.statSync(csvPath);
      const content = fs.readFileSync(csvPath, 'utf-8');
      console.log(`✓ CSV file verified - Size: ${stats.size} bytes`);
      console.log(`✓ CSV file contains ${marketData.length} data rows plus 1 header row`);
      console.log('\nCSV Content Preview:');
      console.log(content.split('\n').slice(0, 4).join('\n'));
    } else {
      throw new Error('CSV file was not created');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  } finally {
    // Cleanup: Stop the mock server
    if (server) {
      await stopMockServer(server);
    }
  }
});
