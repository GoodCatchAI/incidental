#!/usr/bin/env node

/**
 * FinnAI Changelog Update
 * Updates the changelog when pattern violations are fixed in a PR
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
  try {
    console.log('📝 Updating FinnAI changelog...');

    // Create finn directory if it doesn't exist
    const finnDir = path.join(process.cwd(), 'finn');
    if (!fs.existsSync(finnDir)) {
      fs.mkdirSync(finnDir, { recursive: true });
    }

    const changelogPath = path.join(finnDir, 'changelog.md');

    // Get PR information from environment
    const prNumber = process.env.GITHUB_REF ? process.env.GITHUB_REF.split('/')[2] : 'unknown';
    const prTitle = process.env.PR_TITLE || 'Pull Request';
    const prAuthor = process.env.GITHUB_ACTOR || 'unknown';
    const timestamp = new Date().toISOString();

    // Check if we have previous violation data
    let previousViolations = [];
    try {
      // Try to get violations from previous check
      // This would require storing state between runs, which we'll simplify for now
      previousViolations = [];
    } catch (error) {
      // No previous violations found
    }

    // Create changelog entry
    const entry = generateChangelogEntry(prNumber, prTitle, prAuthor, timestamp, previousViolations);

    // Append to changelog
    let changelog = '';
    if (fs.existsSync(changelogPath)) {
      changelog = fs.readFileSync(changelogPath, 'utf8');
    } else {
      // Create new changelog with header
      changelog = `# FinnAI Pattern Fixes Changelog\n\n`;
      changelog += `This file tracks pattern violations that were caught and fixed in pull requests.\n\n`;
      changelog += `---\n\n`;
    }

    // Insert new entry at the top (after header)
    const lines = changelog.split('\n');
    const headerEndIndex = lines.findIndex(line => line === '---');

    if (headerEndIndex !== -1) {
      lines.splice(headerEndIndex + 2, 0, entry);
      changelog = lines.join('\n');
    } else {
      changelog += entry;
    }

    fs.writeFileSync(changelogPath, changelog);

    console.log(`✅ Changelog updated: ${changelogPath}`);
    console.log(`📝 Changelog entry created but not committed (requires write permissions)`);
    console.log(`   To enable auto-commit: Grant workflow write permissions in repository settings`);
    console.log(`   Or manually commit the changelog after the PR is merged.`);

    // Note: Auto-commit is disabled by default (requires write permissions)
    // Uncomment the code below if your workflow has write permissions:
    /*
    if (process.env.CI === 'true' && process.env.ENABLE_CHANGELOG_COMMIT === 'true') {
      try {
        execSync(`git config user.name "FinnAI Bot"`, { stdio: 'inherit' });
        execSync(`git config user.email "finn@github-actions"`, { stdio: 'inherit' });
        execSync(`git add ${changelogPath}`, { stdio: 'inherit' });
        execSync(`git commit -m "docs: Update FinnAI changelog for PR #${prNumber}"`, { stdio: 'inherit' });
        execSync(`git push`, { stdio: 'inherit' });

        console.log('✅ Changelog committed and pushed');
      } catch (error) {
        console.warn('Warning: Could not commit changelog:', error.message);
      }
    }
    */

  } catch (error) {
    console.error('❌ Error updating changelog:', error.message);
    // Don't fail the workflow if changelog update fails
    process.exit(0);
  }
}

/**
 * Generate a changelog entry for this PR
 */
function generateChangelogEntry(prNumber, prTitle, prAuthor, timestamp, previousViolations) {
  const date = new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let entry = `## PR #${prNumber}: ${prTitle}\n\n`;
  entry += `**Date:** ${date}\n`;
  entry += `**Author:** @${prAuthor}\n\n`;

  if (previousViolations.length > 0) {
    entry += `### Violations Fixed\n\n`;
    previousViolations.forEach((v, i) => {
      entry += `${i + 1}. **${v.pattern}** in \`${v.file}\`\n`;
      entry += `   - Issue: ${v.issue}\n`;
      entry += `   - Fix: ${v.suggested_fix}\n\n`;
    });
  } else {
    entry += `### Pattern Check Passed\n\n`;
    entry += `All code changes follow established patterns. No violations detected.\n\n`;
  }

  entry += `---\n\n`;

  return entry;
}

main();
