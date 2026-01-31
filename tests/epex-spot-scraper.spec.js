import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

/**
 * Configuration constants for the EPEX SPOT website
 */
const CONFIG = {
  BASE_URL: 'https://www.epex-spot.de/',
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
  return `${CONFIG.BASE_URL}?delivery_date=${deliveryDate}`;
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
      // Wait for table to be visible
      await page.waitForSelector(CONFIG.TABLE_SELECTOR, { 
        timeout: CONFIG.TIMEOUT 
      });

      // Extract data from all rows using page.evaluate for better performance
      rows = await page.evaluate((selector, columnConfig) => {
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
      }, CONFIG.TABLE_SELECTOR, CONFIG.COLUMNS_TO_SCRAPE);

      if (rows.length === 0) {
        throw new Error('No data rows found in table');
      }

    } catch (error) {
      retries++;
      console.warn(`Attempt ${retries} failed:`, error.message);
      
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
 */
test('Scrape EPEX SPOT market data and export to CSV', async ({ page }) => {
  let marketData = [];

  try {
    // Step 1: Navigate to the website with yesterday's date
    const url = buildUrl();
    console.log(`Navigating to: ${url}`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (navigationError) {
      console.error('Navigation failed:', navigationError.message);
      
      // If DNS resolution failed, try without networkidle or with different wait strategy
      if (navigationError.message.includes('ERR_NAME_NOT_RESOLVED')) {
        console.warn('DNS resolution failed. This typically means:');
        console.warn('1. No internet connection');
        console.warn('2. DNS server is unreachable');
        console.warn('3. The domain name is incorrect');
        console.warn('\nPlease verify:');
        console.warn('- Internet connectivity');
        console.warn('- Domain: www.epex-spot.de');
        throw new Error(`Cannot reach website at ${url}. Please check your internet connection and domain name.`);
      }
      
      // For other errors, try with a simpler wait strategy
      console.log('Retrying with simpler wait strategy...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Step 2: Scrape market data
    console.log('Scraping market data...');
    marketData = await scrapeMarketData(page);
    console.log(`✓ Successfully scraped ${marketData.length} rows of data`);

    // Log the first few rows for verification
    console.log('\nFirst few rows of scraped data:');
    marketData.slice(0, 3).forEach((row, index) => {
      console.log(`Row ${index + 1}:`, row);
    });

    // Step 3: Write to CSV file
    console.log('\nWriting data to CSV file...');
    const csvPath = await writeToCSV(marketData);

    // Verify file was created
    if (fs.existsSync(csvPath)) {
      const stats = fs.statSync(csvPath);
      console.log(`✓ CSV file verified - Size: ${stats.size} bytes`);
    } else {
      throw new Error('CSV file was not created');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
});
