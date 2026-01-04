#!/usr/bin/env node

/**
 * FinnAI CI/CD Pattern Check
 * Checks PR changes for pattern violations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

async function main() {
  try {
    console.log(`${colors.cyan}${colors.bold}🛡️  FinnAI Pattern Check${colors.reset}\n`);

    // 1. Load pattern configuration
    const configPath = path.join(process.cwd(), 'finn', 'config', 'repo-patterns.json');
    if (!fs.existsSync(configPath)) {
      console.log(`${colors.yellow}⚠️  No patterns found. Skipping check.${colors.reset}`);
      process.exit(0);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const patterns = config.repo_patterns || [];

    // Filter for patterns that should be checked in CI/CD
    // Only enforce positive and neutral patterns that have cicd_enabled !== false
    const enforcedPatterns = patterns.filter(p => {
      const isGoodPattern = p.quality && (p.quality.category === 'positive' || p.quality.category === 'neutral');
      const cicdEnabled = p.cicd_enabled !== false; // Default to true
      return isGoodPattern && cicdEnabled;
    });

    if (enforcedPatterns.length === 0) {
      console.log(`${colors.yellow}⚠️  No patterns enabled for CI/CD checks.${colors.reset}`);

      // Write empty results
      fs.writeFileSync('finn-check-results.json', JSON.stringify({
        violations: [],
        patterns_checked: 0,
        files_checked: 0
      }, null, 2));

      fs.writeFileSync('finn-check-report.md', generateReport([], 0, 0));

      process.exit(0);
    }

    console.log(`Found ${enforcedPatterns.length} pattern(s) to enforce in CI/CD\n`);

    // 2. Get changed files in the PR
    const changedFiles = getChangedFiles();

    if (changedFiles.length === 0) {
      console.log(`${colors.green}✅ No relevant files changed.${colors.reset}`);

      // Write empty results
      fs.writeFileSync('finn-check-results.json', JSON.stringify({
        violations: [],
        patterns_checked: enforcedPatterns.length,
        files_checked: 0
      }, null, 2));

      fs.writeFileSync('finn-check-report.md', generateReport([], enforcedPatterns.length, 0));

      process.exit(0);
    }

    console.log(`Checking ${changedFiles.length} changed file(s) against ${enforcedPatterns.length} pattern(s)...\n`);

    // 3. Check for Anthropic API key
    const apiKey = getApiKey();
    if (!apiKey) {
      console.log(`${colors.yellow}⚠️  No Anthropic API key found.${colors.reset}`);
      console.log(`   Set ANTHROPIC_API_KEY as a GitHub secret to enable pattern checking.`);

      // Write results indicating no check was performed
      fs.writeFileSync('finn-check-results.json', JSON.stringify({
        error: 'No API key configured',
        violations: [],
        patterns_checked: 0,
        files_checked: 0
      }, null, 2));

      fs.writeFileSync('finn-check-report.md',
        '# 🛡️ FinnAI Pattern Check\n\n' +
        '⚠️ **No API key configured**\n\n' +
        'Set `ANTHROPIC_API_KEY` as a GitHub secret to enable pattern checking.\n'
      );

      process.exit(0);
    }

    // 4. Check violations using Anthropic API
    const violations = await checkViolations(changedFiles, enforcedPatterns, apiKey);

    // 5. Write results to files
    const results = {
      violations: violations,
      patterns_checked: enforcedPatterns.length,
      files_checked: changedFiles.length,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync('finn-check-results.json', JSON.stringify(results, null, 2));

    // 6. Generate markdown report
    const report = generateReport(violations, enforcedPatterns.length, changedFiles.length);
    fs.writeFileSync('finn-check-report.md', report);

    // 7. Display results
    if (violations.length === 0) {
      console.log(`${colors.green}${colors.bold}✅ No pattern violations found!${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`${colors.red}${colors.bold}⚠️  Found ${violations.length} pattern violation(s)${colors.reset}\n`);

      violations.forEach((v, i) => {
        console.log(`${colors.bold}${i + 1}. ${v.file}${colors.reset}`);
        console.log(`   Pattern: ${colors.yellow}${v.pattern}${colors.reset}`);
        console.log(`   Issue: ${v.issue}`);
        console.log(`   Fix: ${colors.cyan}${v.suggested_fix}${colors.reset}`);
        console.log('');
      });

      console.log(`${colors.yellow}See PR comment for detailed report${colors.reset}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`${colors.red}❌ Error in finn-check:${colors.reset}`, error.message);

    // Write error results
    fs.writeFileSync('finn-check-results.json', JSON.stringify({
      error: error.message,
      violations: [],
      patterns_checked: 0,
      files_checked: 0
    }, null, 2));

    fs.writeFileSync('finn-check-report.md',
      '# 🛡️ FinnAI Pattern Check\n\n' +
      `❌ **Error**: ${error.message}\n`
    );

    // Don't fail the check on errors
    process.exit(0);
  }
}

/**
 * Get list of changed files in the PR
 */
function getChangedFiles() {
  try {
    // Get the base and head refs from GitHub Actions environment
    const baseSha = process.env.GITHUB_BASE_REF || 'main';
    const headSha = process.env.GITHUB_SHA || 'HEAD';

    // Get changed files
    const output = execSync(
      `git diff --name-only origin/${baseSha}...${headSha}`,
      { encoding: 'utf8' }
    );

    return output
      .split('\n')
      .filter(f => f.trim() !== '')
      .filter(f => f.match(/\.(js|jsx|ts|tsx|py|rb)$/)); // Only check supported files

  } catch (error) {
    console.warn('Warning: Could not get changed files:', error.message);
    return [];
  }
}

/**
 * Get API key from environment variable
 */
function getApiKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

/**
 * Check violations using Anthropic API
 */
async function checkViolations(files, patterns, apiKey) {
  // Maximum characters per file to avoid API limits
  const MAX_FILE_SIZE = 5000;

  // Read file contents (with size limit)
  const fileContents = files.map(file => {
    try {
      let content = fs.readFileSync(file, 'utf8');

      // Truncate large files to avoid exceeding API limits
      if (content.length > MAX_FILE_SIZE) {
        content = content.substring(0, MAX_FILE_SIZE) + '\n... (truncated)';
      }

      return { path: file, content };
    } catch (error) {
      return null;
    }
  }).filter(f => f !== null);

  if (fileContents.length === 0) {
    return [];
  }

  // Build AI prompt
  const patternsJson = JSON.stringify(patterns.map(p => ({
    name: p.name,
    norm: p.norm,
    description: p.description
  })), null, 2);

  const filesJson = JSON.stringify(fileContents, null, 2);

  const prompt = `You are a code quality assistant checking for pattern violations in a pull request.

Repository patterns to enforce (positive and neutral patterns only):
${patternsJson}

Changed files to check:
${filesJson}

Task: Check if any of the changed files violate the established patterns.

ONLY report violations of POSITIVE or NEUTRAL patterns (patterns the codebase should follow).
Do NOT report issues with code that follows the patterns correctly.

Output format (ONLY JSON, no markdown):
{
  "violations": [
    {
      "file": "path/to/file.js",
      "pattern": "pattern_name",
      "issue": "Brief description of violation",
      "suggested_fix": "How to fix it"
    }
  ]
}

If no violations, return: { "violations": [] }`;

  // Call Anthropic API
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data, 'utf8')
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (response.error) {
            reject(new Error(response.error.message));
            return;
          }

          const content = response.content[0].text;
          // Remove markdown code blocks if present
          let jsonStr = content.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
          const result = JSON.parse(jsonStr);
          resolve(result.violations || []);
        } catch (error) {
          reject(new Error('Failed to parse API response: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Generate markdown report for PR comment
 */
function generateReport(violations, patternsChecked, filesChecked) {
  const timestamp = new Date().toISOString();

  let report = `# 🛡️ FinnAI Pattern Check\n\n`;
  report += `*Last updated: ${new Date(timestamp).toLocaleString()}*\n\n`;

  if (violations.length === 0) {
    report += `## ✅ No violations found!\n\n`;
    report += `Checked **${filesChecked} file(s)** against **${patternsChecked} pattern(s)**.\n\n`;
    report += `All changes follow the established code patterns. Great work! 🎉\n`;
    return report;
  }

  report += `## ⚠️ Found ${violations.length} pattern violation(s)\n\n`;
  report += `Checked **${filesChecked} file(s)** against **${patternsChecked} pattern(s)**.\n\n`;

  report += `### Violations:\n\n`;

  violations.forEach((v, i) => {
    report += `#### ${i + 1}. \`${v.file}\`\n\n`;
    report += `**Pattern violated:** ${v.pattern}\n\n`;
    report += `**Issue:** ${v.issue}\n\n`;
    report += `**Suggested fix:** ${v.suggested_fix}\n\n`;
    report += `---\n\n`;
  });

  report += `### Next Steps\n\n`;
  report += `Did you mean to introduce these patterns? If not, here's what you can do:\n\n`;
  report += `1. **Fix the violations**: Apply the suggested fixes above\n`;
  report += `2. **Update patterns**: If this is a new acceptable pattern, update your FinnAI configuration\n`;
  report += `3. **Disable CI/CD check**: If this pattern shouldn't be checked in CI/CD, update the pattern config\n\n`;
  report += `Push your fixes and the check will run again automatically.\n\n`;
  report += `---\n`;
  report += `*Powered by [FinnAI](https://github.com/your-org/finnai)*\n`;

  return report;
}

main();
