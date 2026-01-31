/**
 * Network Diagnostic Script
 * Run this to diagnose network connectivity issues
 */

import https from 'https';

function testDomain(domain) {
  return new Promise((resolve) => {
    console.log(`\nTesting: ${domain}`);
    
    const request = https.get(domain, { timeout: 5000 }, (response) => {
      console.log(`✓ Connected successfully (Status: ${response.statusCode})`);
      resolve(true);
    });

    request.on('error', (error) => {
      console.log(`✗ Connection failed: ${error.code || error.message}`);
      resolve(false);
    });

    request.on('timeout', () => {
      console.log('✗ Connection timeout');
      resolve(false);
    });
  });
}

async function runDiagnostics() {
  console.log('=== Network Diagnostics ===\n');
  
  const domains = [
    'https://www.epex-spot.de/',
    'https://www.google.com/',
    'https://www.github.com/'
  ];

  for (const domain of domains) {
    await testDomain(domain);
  }

  console.log('\n=== Results ===');
  console.log('If epex-spot.de failed but others worked, the issue is with that specific domain.');
  console.log('If all failed, check your internet connection.');
}

runDiagnostics().catch(console.error);
