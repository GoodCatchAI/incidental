# FinnAI GitHub Actions Setup

This directory contains GitHub Actions workflows for automated pattern checking in pull requests.

## Overview

The `finn-check` workflow automatically checks pull requests for violations of your established code patterns. It provides friendly, helpful feedback directly in PR comments.

## Features

- ✅ **Automatic PR checks** - Runs on every pull request
- 💬 **Helpful PR comments** - Posts detailed violation reports as PR comments with code snippets
- 📊 **Pattern enforcement** - Only checks best_practices and neutral_patterns
- 🔄 **Re-runs automatically** - Checks again when you push fixes
- 📝 **Changelog tracking** - Documents fixed violations in `/finn/changelog.md`
- ⚙️ **Configurable** - Control which patterns are checked via `cicd_enabled` flag

## Setup

### 1. Add Anthropic API Key as GitHub Secret

The workflow needs an Anthropic API key to check patterns:

1. Go to your repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: Your Anthropic API key (get one at https://console.anthropic.com/)
5. Click **Add secret**

### 2. ✅ Workflow Files Installed

The FinnAI setup command has already copied the necessary files to your repository:

```
.github/
├── workflows/
│   └── finn-check.yml       # Main workflow
├── scripts/
│   ├── finn-check.js        # Pattern checking script
│   └── update-changelog.js  # Changelog updater
└── README.md                # This file (you're reading it!)
```

All workflow files are now in place. Next, configure GitHub Actions permissions below.

### 3. Configure GitHub Actions Permissions (Required)

**Minimum Required Permissions (Works for most users):**

The workflow needs permission to post PR comments. By default, it should already have this.

If PR comments aren't posting:
1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, ensure:
   - ✅ **Allow GitHub Actions to create and approve pull requests** is checked
3. Click **Save**

**Optional: Enable Changelog Auto-Commit (Advanced):**

If you want the workflow to automatically commit changelog updates, you'll need write permissions:

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
3. Click **Save**
4. In `.github/scripts/update-changelog.js`, uncomment the auto-commit code (lines 74-88)

**Note:** If you can't change workflow permissions:
- You may not be a repository admin
- Your organization may have restricted these settings
- **Don't worry!** The workflow will still work perfectly - it just won't auto-commit changelog updates
- You can manually commit the changelog after PRs are merged

## How It Works

### When a PR is Opened or Updated:

1. **Workflow starts** - Triggered automatically
2. **Loads patterns** - Reads `finn/config/repo-patterns.json`
3. **Gets changed files** - Compares PR branch to base branch
4. **Checks patterns** - Uses Claude AI to detect violations
5. **Posts comment** - Adds/updates PR comment with results

### If Violations Found:

The workflow will:
- ❌ **Fail the check** - Shows red X in PR
- 💬 **Post detailed comment** - Lists each violation with suggested fixes
- 🔄 **Wait for fixes** - Re-runs when you push new commits

Example PR comment:
```markdown
# 🛡️ FinnAI Pattern Check

## ⚠️ Found 2 pattern violation(s)

### Violations:

#### 1. `src/components/UserList.tsx`

**Pattern violated:** async_await_usage

**Issue:** Using .then() callbacks instead of async/await

**Suggested fix:** Convert to async/await syntax for consistency

---

### Next Steps

Did you mean to introduce these patterns? If not, here's what you can do:

1. **Fix the violations**: Apply the suggested fixes above
2. **Update patterns**: If this is a new acceptable pattern, update your FinnAI configuration
3. **Disable CI/CD check**: If this pattern shouldn't be checked in CI/CD, update the pattern config
```

### If No Violations:

The workflow will:
- ✅ **Pass the check** - Shows green checkmark
- 📝 **Update changelog** - Adds entry to `/finn/changelog.md`
- 💬 **Update comment** - Shows success message

## Configuration

### Pattern CI/CD Control

By default, all **best_practices** and **neutral_patterns** are checked in CI/CD. To disable a specific pattern:

1. Open `finn/config/repo-patterns.json`
2. Find the pattern you want to exclude
3. Add `"cicd_enabled": false`:

```json
{
  "name": "my_pattern",
  "norm": "...",
  "category": "best_practices",
  "examples": [
    {
      "file": "src/example.ts",
      "snippet": "const example = () => { ... };"
    }
  ],
  "description": "...",
  "quality": {
    "category": "positive",
    ...
  },
  "cicd_enabled": false  // ← Add this to skip in CI/CD
}
```

### Workflow Customization

Edit `.github/workflows/finn-check.yml` to customize:

- **Trigger events**: Change when the workflow runs
- **Model**: Update the Claude model version
- **Permissions**: Adjust repository permissions
- **Failure behavior**: Change `exit 1` to `exit 0` for warnings-only mode

## Troubleshooting

### Can't Change Workflow Permissions

**Problem:** Settings → Actions → General shows "Read repository contents and packages" and you can't change it to "Read and write".

**Solutions:**

1. **Check if you're a repository admin**
   - Only repository admins can change workflow permissions
   - Ask a repository owner to grant you admin access
   - Or ask them to enable the permissions for you

2. **Organization settings may be restricting this**
   - Go to your **Organization Settings** → **Actions** → **General**
   - Check if "Workflow permissions" is set at the organization level
   - Organization admins can override repository settings

3. **You don't need write permissions!**
   - The workflow works perfectly with read-only permissions
   - It can still post PR comments and run checks
   - The only limitation is it won't auto-commit changelog updates
   - You can manually commit the changelog after PRs merge

### Workflow Not Running

**Check:**
- ✅ GitHub Actions are enabled in repository settings
- ✅ Workflow file is in `.github/workflows/finn-check.yml`
- ✅ Pattern config exists at `finn/config/repo-patterns.json`

### "No API Key" Error

**Fix:**
1. Verify `ANTHROPIC_API_KEY` secret is set in repository settings
2. Check the secret name matches exactly (case-sensitive)
3. Generate a new API key if the current one is invalid

### Check Always Passes (Even With Violations)

**Possible causes:**
- No patterns have `cicd_enabled: true`
- All patterns are marked as "anti_patterns" (only best_practices and neutral_patterns are checked)
- Changed files don't match pattern file types

**Fix:**
1. Check `finn/config/repo-patterns.json`
2. Ensure patterns have `category` of "best_practices" or "neutral_patterns"
3. Verify patterns don't have `cicd_enabled: false`
4. Check quality assessment if present (quality.category of "positive" or "neutral" is recommended)

### Changelog Not Updating

**Check:**
- Workflow has write permissions (Settings → Actions → General)
- `/finn` directory exists in repository
- Git user is configured in workflow

## Workflow Status Badge

Add this to your README to show workflow status:

```markdown
[![FinnAI Check](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/finn-check.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/finn-check.yml)
```

Replace `YOUR_USERNAME` and `YOUR_REPO` with your repository details.

## Support

For issues or questions:
- 📖 [FinnAI Documentation](../docs/)
- 🐛 [Report an Issue](https://github.com/your-org/finnai/issues)
- 💬 [Discussions](https://github.com/your-org/finnai/discussions)

## Cost Considerations

The workflow uses the Anthropic API, which has usage costs:
- **Average cost per PR**: ~$0.01-0.05 (depends on PR size)
- **Model**: Claude Sonnet 4.5 (fast and cost-effective)
- **Tips to reduce costs**:
  - Limit patterns checked in CI/CD via `cicd_enabled: false`
  - Use smaller PRs
  - Only check critical patterns

## Security

- ✅ API key stored securely in GitHub Secrets
- ✅ Workflow runs in isolated environment
- ✅ No sensitive code sent to external services
- ✅ Pattern configs stored in your repository

---

**Last updated:** December 2025
