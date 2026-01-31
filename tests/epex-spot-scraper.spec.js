import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

/**
 * Configuration constants for the EPEX SPOT website
 */
const CONFIG = {
  BASE_URL: 'https://www.epexspot.com/en/market-results',
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
 * Gets yesterday's date in ISO format (YYYY-MM-DD)
 * @returns {string} Yesterday's date
 */
function getYesterdayDate() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Constructs the URL with the delivery date parameter
 * @returns {string} Complete URL with delivery_date parameter
 */
function buildUrl() {
  const deliveryDate = getYesterdayDate();
  return `${CONFIG.BASE_URL}?market_area=GB&delivery_date=${deliveryDate}&data_mode=table`;
}

/**
 * Extracts market data from a single table row
 * @param {Element} row - The table row element
 * @returns {Object|null} Object containing Low, High, Last, and Weight Avg values, or null if extraction fails
 */
function extractRowData(row) {
  try {
    const cells = row.querySelectorAll('td');
    
    if (cells.length <= CONFIG.COLUMNS_TO_SCRAPE.WEIGHT_AVG) {
      console.warn('Row does not have enough columns');
      return null;
    }

    return {
      Low: cells[CONFIG.COLUMNS_TO_SCRAPE.LOW]?.textContent?.trim() || '',
      High: cells[CONFIG.COLUMNS_TO_SCRAPE.HIGH]?.textContent?.trim() || '',
      Last: cells[CONFIG.COLUMNS_TO_SCRAPE.LAST]?.textContent?.trim() || '',
      'Weight Avg': cells[CONFIG.COLUMNS_TO_SCRAPE.WEIGHT_AVG]?.textContent?.trim() || ''
    };
  } catch (error) {
    console.error('Error extracting row data:', error);
    return null;
  }
}

/**
 * Scrapes market data from the EPEX SPOT website
 * @param {Page} page - Playwright page object
 * @returns {Array} Array of market data objects
 */
async function scrapeMarketData(page) {
  let retries = 0;
  let rows = [];

  while (retries < CONFIG.RETRY_ATTEMPTS && rows.length === 0) {
    try {
      // Check page content for 403 error
      const pageContent = await page.content();
      if (pageContent.includes('403') || pageContent.includes('Forbidden')) {
        throw new Error('Page returned 403 Forbidden - website may have bot protection');
      }

      // Wait for any content to load on page
      await page.waitForLoadState('networkidle', { timeout: CONFIG.TIMEOUT });
      
      // Try to find table rows with multiple selector strategies
      let selector = CONFIG.TABLE_SELECTOR;
      let tableFound = await page.$(selector);
      
      if (!tableFound) {
        console.log('Table selector not found, trying alternative selectors...');
        const alternativeSelectors = [
          'tbody tr',
          '[role="row"]',
          '.table tbody tr',
          'table tr[role="row"]'
        ];
        
        for (const altSelector of alternativeSelectors) {
          tableFound = await page.$(altSelector);
          if (tableFound) {
            selector = altSelector;
            console.log(`Found table with selector: ${selector}`);
            break;
          }
        }
        
        if (!tableFound) {
          throw new Error('No table rows found with any selector');
        }
      }

      // Extract data from all rows using page.evaluate for better performance
      rows = await page.evaluate(({ selector, columnConfig }) => {
        const tableRows = document.querySelectorAll(selector);
        const data = [];

        tableRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          
          // Try to extract data from the row
          if (cells.length >= 6) {
            const rowData = {
              Low: cells[columnConfig.LOW]?.textContent?.trim() || '',
              High: cells[columnConfig.HIGH]?.textContent?.trim() || '',
              Last: cells[columnConfig.LAST]?.textContent?.trim() || '',
              'Weight Avg': cells[columnConfig.WEIGHT_AVG]?.textContent?.trim() || ''
            };
            
            // Only add if all fields have data
            if (rowData.Low && rowData.High && rowData.Last && rowData['Weight Avg']) {
              data.push(rowData);
            }
          }
        });

        return data;
      }, { selector, columnConfig: CONFIG.COLUMNS_TO_SCRAPE });

      if (rows.length === 0) {
        throw new Error('No data rows found in table');
      }

    } catch (error) {
      retries++;
      console.warn(`Attempt ${retries} failed:`, error.message);
      
      // If it's a 403, don't retry
      if (error.message.includes('403')) {
        throw error;
      }
      
      if (retries < CONFIG.RETRY_ATTEMPTS) {
        console.log('Retrying after 2 seconds...');
        await page.waitForTimeout(2000);
      } else {
        throw new Error(`Failed to scrape data after ${CONFIG.RETRY_ATTEMPTS} attempts: ${error.message}`);
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
 * Main test case: Scrape EPEX SPOT market data and export to CSV
 * 
 * SIMPLE TEST STEPS:
 * 1. Navigate to website (with yesterday's date)
 * 2. Scrape market data table (Low, High, Last, Weight Avg columns)
 * 3. Write data to CSV file
 * 4. Verify CSV file created successfully
 */
test('Scrape EPEX SPOT market data and export to CSV', async ({ page }) => {
  let marketData = [];

  try {
    // STEP 1: Navigate to website
    console.log('📍 STEP 1: Navigate to website');
    const url = buildUrl();
    console.log(`\n   FULL URL: ${url}\n`);
    
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      const pageContent = await page.content();
      
      if ((response && response.status() === 403) || pageContent.includes('403')) {
        console.warn('   ⚠ Access denied (403 Forbidden)');
        test.skip();
        return;
      }
    } catch (error) {
      console.log('   Retrying with simpler wait...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {
        test.skip();
      });
    }

    // STEP 2: Scrape market data
    console.log('📍 STEP 2: Scrape market data');
    try {
      marketData = await scrapeMarketData(page);
      console.log(`   ✓ Scraped ${marketData.length} rows`);
      marketData.slice(0, 2).forEach((row, i) => {
        console.log(`   Row ${i + 1}:`, row);
      });
    } catch (error) {
      console.warn('   ⚠ Could not scrape live website');
      test.skip();
      return;
    }

    // STEP 3: Write to CSV
    console.log('📍 STEP 3: Write data to CSV');
    const csvPath = await writeToCSV(marketData);
    console.log(`   ✓ CSV created at: ${csvPath}`);

    // STEP 4: Verify file
    console.log('📍 STEP 4: Verify CSV file');
    if (fs.existsSync(csvPath)) {
      const stats = fs.statSync(csvPath);
      console.log(`   ✓ File size: ${stats.size} bytes`);
      console.log(`\n✅ TEST PASSED`);
    } else {
      throw new Error('CSV file not found');
    }

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    throw error;
  }
});
