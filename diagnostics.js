import { chromium } from '@playwright/test';

async function diagnoseWebsite() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Get yesterday's date
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const deliveryDate = yesterday.toISOString().split('T')[0];
  
  const url = `https://www.epexspot.com/en/market-results?market_area=GB&delivery_date=${deliveryDate}&data_mode=table`;
  
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Take a screenshot
  await page.screenshot({ path: 'diagnostics-screenshot.png' });
  console.log('Screenshot saved to diagnostics-screenshot.png');
  
  // Get page content
  const content = await page.content();
  console.log('\n=== Page HTML (first 5000 chars) ===');
  console.log(content.substring(0, 5000));
  
  // Find all tables
  const tables = await page.$$('table');
  console.log(`\n=== Found ${tables.length} tables ===`);
  
  // Find all rows
  const rows = await page.$$('tr');
  console.log(`\n=== Found ${rows.length} tr elements ===`);
  
  // Look for any divs with role=row
  const roleRows = await page.$$('[role="row"]');
  console.log(`\n=== Found ${roleRows.length} elements with role="row" ===`);
  
  // Get all td elements
  const cells = await page.$$('td');
  console.log(`\n=== Found ${cells.length} td elements ===`);
  
  // Look for text containing "Low", "High", "Last", "Weight"
  const bodyText = await page.locator('body').textContent();
  console.log(`\n=== Checking for expected column headers ===`);
  console.log('Contains "Low":', bodyText.includes('Low'));
  console.log('Contains "High":', bodyText.includes('High'));
  console.log('Contains "Last":', bodyText.includes('Last'));
  console.log('Contains "Weight":', bodyText.includes('Weight'));
  
  // Print first 500 chars of body to see structure
  console.log('\n=== Body text (first 1000 chars) ===');
  console.log(bodyText.substring(0, 1000));
  
  await browser.close();
}

diagnoseWebsite().catch(console.error);

