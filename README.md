# EPEX SPOT Market Data Scraper

A robust Playwright-based test that scrapes market data from the EPEX SPOT website and exports it to CSV format.

## Features

- ✅ Scrapes the first 4 data columns: Low, High, Last, and Weight Avg
- ✅ Automatic date handling (uses yesterday's date)
- ✅ Retry logic with configurable attempts
- ✅ Comprehensive error handling
- ✅ CSV export with proper formatting
- ✅ Clean, well-commented code
- ✅ Reusable configuration and functions

## Project Structure

```
.
├── package.json                 # Project dependencies
├── playwright.config.js         # Playwright configuration
├── tests/
│   └── epex-spot-scraper.spec.js  # Main test file
├── output/
│   └── market_data.csv         # Generated CSV file
└── README.md                   # This file
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Usage

### Run the test
```bash
npm test
```

### Generate Allure report
```bash
npm run test:allure
npm run allure:generate
npm run allure:open
```

### Run with UI mode (recommended for debugging)
```bash
npm run test:ui
```

### Run with debug mode
```bash
npm run test:debug
```

## Output

The scraped data is exported to `output/market_data.csv` with the following columns:
- **Low**: The lowest price recorded
- **High**: The highest price recorded
- **Last**: The last recorded price
- **Weight Avg**: The weighted average price

## Configuration

Key configuration settings can be modified in the `CONFIG` object in `epex-spot-scraper.spec.js`:

- `BASE_URL`: The EPEX SPOT website URL
- `OUTPUT_DIR`: Directory where CSV files are saved
- `TIMEOUT`: Maximum wait time for table to load (ms)
- `RETRY_ATTEMPTS`: Number of retry attempts if data loading fails

## Error Handling

The script includes robust error handling:
- **Retry logic**: Automatically retries up to 3 times if data loading fails
- **Validation**: Checks for required columns and data validity
- **Logging**: Detailed console output for debugging
- **File verification**: Confirms CSV file creation before completing

## Code Quality

- **Clean Code**: Well-organized functions with single responsibilities
- **Comments**: Comprehensive JSDoc comments for all functions
- **Reusability**: Modular design allows easy adaptation for other websites
- **Configuration-driven**: Centralized configuration for easy customization
- **Error Messages**: Clear, actionable error messages for debugging

## Notes

- The script automatically uses yesterday's date to ensure data is available
- If you encounter date-related issues, the script will automatically adjust the URL parameters
- Network requests are handled with `waitUntil: 'networkidle'` for stability

## Troubleshooting

### "No data rows found in table"
- Check if the website structure has changed
- Verify the URL is correct and data is available for the selected date
- Try running with `npm run test:ui` to see what's happening visually

### CSV file not created
- Ensure the output directory exists and is writable
- Check console logs for specific errors

### Timeout errors
- The website might be slow to load; increase `TIMEOUT` in the CONFIG
- Check your internet connection

### Allure report not generated
- Ensure dependencies are installed: `npm install`
- Make sure tests ran successfully to create `allure-results`
