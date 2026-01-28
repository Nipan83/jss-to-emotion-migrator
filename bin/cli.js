#!/usr/bin/env node

/**
 * JSS to Emotion Migrator CLI
 * 
 * Commands:
 *   migrate (default) - Migrate JSS to Emotion
 *   cleanup          - Remove unused JSS imports and dead code
 */

const { program } = require('commander');
const { glob } = require('glob');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { migrate, cleanup, analyzeForCleanup } = require('../src');

// ============== LOGGING UTILITIES ==============

/**
 * Draw a formatted summary box with statistics
 */
function drawSummaryBox(title, stats, options = {}) {
  const { footer, mode = 'normal' } = options;
  const width = 50;
  const line = '─'.repeat(width);
  const doubleLine = '═'.repeat(width);
  
  console.log('');
  console.log(chalk.blue(`╔${doubleLine}╗`));
  console.log(chalk.blue(`║`) + chalk.bold.white(` 📊 ${title}`.padEnd(width)) + chalk.blue(`║`));
  console.log(chalk.blue(`╠${line}╣`));
  
  stats.forEach(({ label, value, color = 'white', icon = ' ', show = true }) => {
    if (!show) return;
    const left = ` ${icon}  ${label}`;
    const right = String(value);
    const padding = width - left.length - right.length - 1;
    const dots = padding > 0 ? '.'.repeat(padding) : ' ';
    const content = left + chalk.gray(dots) + right + ' ';
    console.log(chalk.blue(`║`) + chalk[color](content) + chalk.blue(`║`));
  });
  
  if (footer) {
    console.log(chalk.blue(`╠${line}╣`));
    console.log(chalk.blue(`║`) + chalk.yellow(` ${footer}`.padEnd(width)) + chalk.blue(`║`));
  }
  
  console.log(chalk.blue(`╚${doubleLine}╝`));
  console.log('');
}

/**
 * Print command header with styled banner
 */
function printHeader(icon, title, subtitle = '') {
  const width = 52;
  console.log('');
  console.log(chalk.blue(`${'━'.repeat(width)}`));
  console.log(chalk.blue.bold(`${icon}  ${title}`));
  if (subtitle) {
    console.log(chalk.gray(`   ${subtitle}`));
  }
  console.log(chalk.blue(`${'━'.repeat(width)}`));
  console.log('');
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Log individual file processing result
 */
function logFile(status, relativePath, detail = '', verbose = true) {
  if (!verbose && status === 'skip') return;
  
  const icons = {
    success: chalk.green('✓'),
    migrate: chalk.green('✓'),
    preview: chalk.cyan('◉'),
    skip: chalk.gray('○'),
    error: chalk.red('✗'),
    delete: chalk.red('🗑'),
    warning: chalk.yellow('⚠'),
    clean: chalk.cyan('✓'),
    dead: chalk.yellow('☠'),
  };
  
  const icon = icons[status] || chalk.gray('•');
  const detailStr = detail ? chalk.gray(` (${detail})`) : '';
  console.log(`  ${icon} ${relativePath}${detailStr}`);
}

/**
 * Print a simple section divider
 */
function printDivider(char = '─', width = 52) {
  console.log(chalk.gray(char.repeat(width)));
}

/**
 * Print processing progress header
 */
function printProcessingHeader(count, action = 'Processing') {
  console.log(chalk.gray(`${action} ${count} file(s)...\n`));
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Prompts the user for confirmation
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Tests if a file path matches a regex pattern
 */
function matchesPattern(filePath, pattern) {
  try {
    const regex = new RegExp(pattern);
    return regex.test(filePath);
  } catch (err) {
    console.error(chalk.red(`Invalid regex pattern: ${pattern}`));
    return false;
  }
}

/**
 * Filters files based on include/exclude patterns
 */
function filterFiles(files, includePatterns, excludePatterns) {
  let included = 0, excluded = 0;
  
  const result = files.filter(file => {
    if (includePatterns.length > 0) {
      const matchesAnyInclude = includePatterns.some(pattern => matchesPattern(file, pattern));
      if (!matchesAnyInclude) {
        excluded++;
        return false;
      }
      included++;
    }
    
    if (excludePatterns.length > 0) {
      const matchesAnyExclude = excludePatterns.some(pattern => matchesPattern(file, pattern));
      if (matchesAnyExclude) {
        excluded++;
        return false;
      }
    }
    
    return true;
  });
  
  return { files: result, included, excluded: files.length - result.length };
}

/**
 * Collects multiple option values into an array
 */
function collect(value, previous) {
  return previous.concat([value]);
}

/**
 * Get files from patterns
 */
async function getFiles(patterns, ignorePatterns) {
  let allFiles = [];
  
  for (const pattern of patterns) {
    try {
      const files = await glob(pattern, {
        ignore: ignorePatterns,
        nodir: true,
      });
      allFiles = [...allFiles, ...files];
    } catch (err) {
      console.error(chalk.red(`Error processing pattern "${pattern}": ${err.message}`));
    }
  }
  
  return [...new Set(allFiles)];
}

/**
 * Determine parser based on file extension
 */
function getParser(file, defaultParser) {
  let parser = defaultParser;
  if (parser === 'babel') {
    const ext = path.extname(file);
    if (ext === '.tsx' || ext === '.ts') {
      parser = 'tsx';
    }
  }
  return parser;
}

// ============== MIGRATE COMMAND ==============
program
  .command('migrate', { isDefault: true })
  .description('Migrate JSS styles to Emotion styled API')
  .argument('<patterns...>', 'File patterns to transform')
  .option('--dry-run', 'Preview what will be migrated without making changes', false)
  .option('-p, --parser <parser>', 'Parser to use (babel, tsx, flow)', 'babel')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-y, --yes', 'Skip confirmation prompt', false)
  .option('-i, --include <pattern>', 'Regex to include files (repeatable)', collect, [])
  .option('-e, --exclude <pattern>', 'Regex to exclude files (repeatable)', collect, [])
  .option('--ignore <patterns>', 'Glob patterns to ignore (comma-separated)', 'node_modules/**,dist/**,build/**')
  .option('--list', 'List files without transforming', false)
  .option('--cleanup', 'Also run cleanup after migration', false)
  .action(async (patterns, options) => {
    const startTime = Date.now();
    const isDryRun = options.dryRun;

    if (isDryRun) {
      printHeader('👁️', 'JSS to Emotion Migrator - DRY RUN', 'Preview mode: No files will be modified');
    } else {
      printHeader('🎨', 'JSS to Emotion Migrator', 'Converting to MUI-recommended pattern (PREFIX + classes)');
    }
    
    const ignorePatterns = options.ignore.split(',').map(p => p.trim());
    const allFiles = await getFiles(patterns, ignorePatterns);
    
    if (allFiles.length === 0) {
      console.log(chalk.yellow('  No files found matching the provided patterns.'));
      console.log('');
      return;
    }
    
    const filterResult = filterFiles(allFiles, options.include, options.exclude);
    const filteredFiles = filterResult.files;
    const skippedByFilter = filterResult.excluded;
    
    // Show filtering info
    if (options.include.length > 0 || options.exclude.length > 0) {
      console.log(chalk.gray('  Filters applied:'));
      if (options.include.length > 0) {
        console.log(chalk.gray(`    Include: ${options.include.map(p => `"${p}"`).join(', ')}`));
      }
      if (options.exclude.length > 0) {
        console.log(chalk.gray(`    Exclude: ${options.exclude.map(p => `"${p}"`).join(', ')}`));
      }
      console.log(chalk.gray(`    Selected: ${filteredFiles.length} of ${allFiles.length} files`));
      console.log('');
    }
    
    if (filteredFiles.length === 0) {
      console.log(chalk.yellow('  No files match the include/exclude filters.'));
      console.log('');
      return;
    }
    
    if (options.list) {
      console.log(chalk.blue.bold('  Files that would be processed:\n'));
      filteredFiles.forEach(file => console.log(chalk.gray(`    ${file}`)));
      console.log('');
      console.log(chalk.gray(`  Total: ${filteredFiles.length} file(s)`));
      console.log('');
      return;
    }
    
    // Confirmation warning (skip for dry run)
    if (!isDryRun && options.include.length === 0 && options.exclude.length === 0 && !options.yes) {
      console.log(chalk.yellow.bold('  ⚠️  Warning: No include/exclude filters specified!'));
      console.log(chalk.yellow(`     This will process ALL ${filteredFiles.length} matching file(s).`));
      console.log(chalk.gray('     Use --include/--exclude for incremental migration'));
      console.log('');
      
      if (process.stdin.isTTY) {
        const proceed = await askConfirmation(chalk.yellow('  Proceed with all files? (y/N): '));
        if (!proceed) {
          console.log(chalk.gray('\n  Cancelled.'));
          console.log('');
          return;
        }
        console.log('');
      } else {
        console.log(chalk.red('  Non-interactive mode. Use --yes (-y) to skip confirmation.'));
        console.log('');
        return;
      }
    }
    
    printProcessingHeader(filteredFiles.length, isDryRun ? 'Analyzing' : 'Migrating');
    
    let migrated = 0, skipped = 0, errors = 0;
    let totalMakeStylesCalls = 0, totalWithStylesCalls = 0, totalStyledComponents = 0;
    const migratedFiles = [];
    const impactDetails = [];
    const errorFiles = [];
    
    for (const file of filteredFiles) {
      const filePath = path.resolve(file);
      const relativePath = path.relative(process.cwd(), filePath);
      
      try {
        const source = fs.readFileSync(filePath, 'utf-8');
        const parser = getParser(file, options.parser);
        
        // Count JSS patterns in source for impact analysis
        const makeStylesCount = (source.match(/makeStyles\s*\(/g) || []).length;
        const withStylesCount = (source.match(/withStyles\s*\(/g) || []).length;
        const createStylesCount = (source.match(/createStyles\s*\(/g) || []).length;
        
        let result = migrate(source, {
          parser,
          transform: 'jssToEmotionMUI',
          filePath,
        });
        
        // Also run cleanup if requested
        if (options.cleanup && result !== source) {
          const cleanupResult = cleanup(result, { parser, filePath });
          result = cleanupResult.source;
        }
        
        if (result !== source) {
          // Count styled components created
          const styledComponentsCreated = (result.match(/styled\s*\(/g) || []).length;
          
          totalMakeStylesCalls += makeStylesCount;
          totalWithStylesCalls += withStylesCount;
          totalStyledComponents += styledComponentsCreated;
          
          const impactInfo = [];
          if (makeStylesCount > 0) impactInfo.push(`${makeStylesCount} makeStyles`);
          if (withStylesCount > 0) impactInfo.push(`${withStylesCount} withStyles`);
          if (createStylesCount > 0) impactInfo.push(`${createStylesCount} createStyles`);
          
          if (isDryRun) {
            logFile('preview', relativePath, `would convert: ${impactInfo.join(', ')} → ${styledComponentsCreated} styled`);
            impactDetails.push({
              file: relativePath,
              makeStyles: makeStylesCount,
              withStyles: withStylesCount,
              styledComponents: styledComponentsCreated
            });
          } else {
            fs.writeFileSync(filePath, result, 'utf-8');
            logFile('migrate', relativePath, `converted: ${impactInfo.join(', ')} → ${styledComponentsCreated} styled`);
          }
          migratedFiles.push(relativePath);
          migrated++;
        } else {
          if (options.verbose) logFile('skip', relativePath, 'no JSS found');
          skipped++;
        }
      } catch (err) {
        logFile('error', relativePath, err.message);
        if (options.verbose) console.error(chalk.red(`     ${err.stack}`));
        errorFiles.push({ file: relativePath, error: err.message });
        errors++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    // Draw summary box with impact details for dry run
    const summaryTitle = isDryRun ? 'DRY RUN - IMPACT PREVIEW' : 'MIGRATION SUMMARY';
    const fileLabel = isDryRun ? 'Files Would Be Migrated' : 'Files Migrated';
    
    drawSummaryBox(summaryTitle, [
      { label: fileLabel, value: migrated, color: 'green', icon: '✓', show: true },
      { label: 'Files Skipped', value: skipped + skippedByFilter, color: 'gray', icon: '○', show: true },
      { label: '  └─ No JSS found', value: skipped, color: 'gray', icon: ' ', show: skipped > 0 },
      { label: '  └─ By filter', value: skippedByFilter, color: 'gray', icon: ' ', show: skippedByFilter > 0 },
      { label: 'Errors', value: errors, color: 'red', icon: '✗', show: errors > 0 },
      { label: '', value: '', color: 'gray', icon: '', show: (totalMakeStylesCalls + totalWithStylesCalls) > 0 },
      { label: 'makeStyles() calls', value: totalMakeStylesCalls, color: 'yellow', icon: '📦', show: totalMakeStylesCalls > 0 },
      { label: 'withStyles() calls', value: totalWithStylesCalls, color: 'yellow', icon: '📦', show: totalWithStylesCalls > 0 },
      { label: 'styled() components', value: totalStyledComponents, color: 'cyan', icon: '🎨', show: totalStyledComponents > 0 },
      { label: '', value: '', color: 'gray', icon: '', show: true },
      { label: 'Total Processed', value: filteredFiles.length, color: 'blue', icon: '∑', show: true },
      { label: 'Time Elapsed', value: formatDuration(elapsed), color: 'cyan', icon: '⏱', show: true },
    ], {
      footer: isDryRun ? '👁️  DRY RUN - No files were modified' : null,
    });
    
    // Show next steps for dry run
    if (isDryRun && migrated > 0) {
      console.log(chalk.cyan.bold('  📋 Next Steps:'));
      console.log(chalk.gray('     To apply these changes, run the same command without --dry-run'));
      console.log(chalk.gray('     Example: jss-to-emotion migrate "src/**/*.jsx"'));
      console.log('');
    }
    
    // Show error details if verbose
    if (errors > 0 && options.verbose) {
      console.log(chalk.red.bold('  Error Details:'));
      errorFiles.forEach(({ file, error }) => {
        console.log(chalk.red(`    ${file}: ${error}`));
      });
      console.log('');
    }
  });

// ============== CLEANUP COMMAND ==============
program
  .command('cleanup')
  .description('Remove unused JSS imports and dead code files')
  .argument('<patterns...>', 'File patterns to clean')
  .option('--dry-run', 'Preview what would be cleaned without making changes', false)
  .option('-p, --parser <parser>', 'Parser to use (babel, tsx, flow)', 'babel')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-y, --yes', 'Skip confirmation prompt', false)
  .option('-i, --include <pattern>', 'Regex to include files (repeatable)', collect, [])
  .option('-e, --exclude <pattern>', 'Regex to exclude files (repeatable)', collect, [])
  .option('--ignore <patterns>', 'Glob patterns to ignore', 'node_modules/**,dist/**,build/**')
  .option('--list', 'List files and their cleanup status', false)
  .option('--delete-dead-files', 'Delete files that only contain JSS code (dead code)', false)
  .option('--remove-all-unused-imports', 'Also remove non-JSS unused imports', false)
  .action(async (patterns, options) => {
    const startTime = Date.now();
    const isDryRun = options.dryRun;
    
    if (isDryRun) {
      printHeader('👁️', 'JSS Cleanup Tool - DRY RUN', 'Preview mode: No files will be modified');
    } else {
      printHeader('🧹', 'JSS Cleanup Tool', 'Removing unused JSS imports and dead code');
    }
    
    const ignorePatterns = options.ignore.split(',').map(p => p.trim());
    const allFiles = await getFiles(patterns, ignorePatterns);
    
    if (allFiles.length === 0) {
      console.log(chalk.yellow('  No files found.'));
      console.log('');
      return;
    }
    
    const filterResult = filterFiles(allFiles, options.include, options.exclude);
    const filteredFiles = filterResult.files;
    const skippedByFilter = filterResult.excluded;
    
    if (options.include.length > 0 || options.exclude.length > 0) {
      console.log(chalk.gray(`  Filters: Selected ${filteredFiles.length} of ${allFiles.length} files\n`));
    }
    
    if (filteredFiles.length === 0) {
      console.log(chalk.yellow('  No files match filters.'));
      console.log('');
      return;
    }
    
    // Analysis mode (--list)
    if (options.list) {
      console.log(chalk.blue.bold('  Cleanup Analysis:\n'));
      
      let filesWithIssues = 0, deadFilesCount = 0, totalUnusedImports = 0;
      
      for (const file of filteredFiles) {
        const filePath = path.resolve(file);
        const relativePath = path.relative(process.cwd(), filePath);
        
        try {
          const source = fs.readFileSync(filePath, 'utf-8');
          const parser = getParser(file, options.parser);
          const analysis = analyzeForCleanup(source, { parser });
          
          const issues = [];
          if (analysis.unusedJSSImports.length > 0) {
            issues.push(`unused imports: ${analysis.unusedJSSImports.join(', ')}`);
            totalUnusedImports += analysis.unusedJSSImports.length;
          }
          if (analysis.unusedStyleDeclarations.length > 0) {
            issues.push(`unused styles: ${analysis.unusedStyleDeclarations.join(', ')}`);
          }
          if (analysis.isDead) {
            issues.push(chalk.red(`DEAD FILE: ${analysis.deadReason}`));
            deadFilesCount++;
          }
          
          if (issues.length > 0) {
            logFile('warning', relativePath);
            issues.forEach(issue => console.log(chalk.gray(`       ${issue}`)));
            filesWithIssues++;
          } else if (options.verbose) {
            logFile('skip', relativePath, 'clean');
          }
        } catch (err) {
          logFile('error', relativePath, err.message);
        }
      }
      
      drawSummaryBox('CLEANUP ANALYSIS', [
        { label: 'Files with Issues', value: filesWithIssues, color: 'yellow', icon: '⚠', show: true },
        { label: 'Dead Files', value: deadFilesCount, color: 'red', icon: '☠', show: true },
        { label: 'Unused Imports', value: totalUnusedImports, color: 'gray', icon: '📦', show: true },
        { label: 'Clean Files', value: filteredFiles.length - filesWithIssues, color: 'green', icon: '✓', show: true },
        { label: 'Total Scanned', value: filteredFiles.length, color: 'blue', icon: '∑', show: true },
      ]);
      
      return;
    }
    
    // Confirmation for delete-dead-files (skip for dry run)
    if (!isDryRun && options.deleteDeadFiles && !options.yes) {
      console.log(chalk.red.bold('  ⚠️  Warning: --delete-dead-files will PERMANENTLY DELETE files!'));
      console.log(chalk.yellow('     Recommend running with --dry-run first to preview.'));
      console.log('');
      
      if (process.stdin.isTTY) {
        const proceed = await askConfirmation(chalk.red('  Are you sure? (y/N): '));
        if (!proceed) {
          console.log(chalk.gray('\n  Cancelled.'));
          console.log('');
          return;
        }
        console.log('');
      } else {
        console.log(chalk.red('  Non-interactive mode. Use --yes to confirm deletion.'));
        console.log('');
        return;
      }
    }
    
    printProcessingHeader(filteredFiles.length, isDryRun ? 'Analyzing' : 'Cleaning');
    
    let cleaned = 0, unchanged = 0, deleted = 0, errors = 0, deadDetected = 0;
    let totalImportsRemoved = 0, totalDeclarationsRemoved = 0;
    const deletedFilesList = [];
    const cleanedFilesList = [];
    
    for (const file of filteredFiles) {
      const filePath = path.resolve(file);
      const relativePath = path.relative(process.cwd(), filePath);
      
      try {
        const source = fs.readFileSync(filePath, 'utf-8');
        const parser = getParser(file, options.parser);
        
        const result = cleanup(source, {
          parser,
          filePath,
          removeAllUnusedImports: options.removeAllUnusedImports,
        });
        
        const report = result.report;
        const hasChanges = report.removedImports.length > 0 || report.removedDeclarations.length > 0;
        
        totalImportsRemoved += report.removedImports.length;
        totalDeclarationsRemoved += report.removedDeclarations.length;
        
        // Handle dead files
        if (report.isDead) {
          deadDetected++;
          if (options.deleteDeadFiles) {
            if (isDryRun) {
              logFile('preview', relativePath, `would delete - ${report.deadReason}`);
            } else {
              fs.unlinkSync(filePath);
              logFile('delete', relativePath, `deleted - ${report.deadReason}`);
              deletedFilesList.push(relativePath);
            }
            deleted++;
            continue;
          } else {
            logFile('dead', relativePath, `dead file - use --delete-dead-files`);
            unchanged++;
            continue;
          }
        }
        
        if (hasChanges) {
          const details = [];
          if (report.removedImports.length > 0) details.push(`${report.removedImports.length} imports`);
          if (report.removedDeclarations.length > 0) details.push(`${report.removedDeclarations.length} declarations`);
          
          if (isDryRun) {
            logFile('preview', relativePath, `would remove: ${details.join(', ')}`);
          } else {
            fs.writeFileSync(filePath, result.source, 'utf-8');
            logFile('clean', relativePath, details.join(', '));
          }
          cleanedFilesList.push(relativePath);
          cleaned++;
        } else {
          if (options.verbose) logFile('skip', relativePath, 'already clean');
          unchanged++;
        }
      } catch (err) {
        logFile('error', relativePath, err.message);
        if (options.verbose) console.error(chalk.red(`     ${err.stack}`));
        errors++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    // Draw summary box
    const summaryTitle = isDryRun ? 'DRY RUN - CLEANUP PREVIEW' : 'CLEANUP SUMMARY';
    const cleanedLabel = isDryRun ? 'Files Would Be Cleaned' : 'Files Cleaned';
    const deletedLabel = isDryRun ? 'Files Would Be Deleted' : 'Files Deleted';
    
    drawSummaryBox(summaryTitle, [
      { label: cleanedLabel, value: cleaned, color: 'cyan', icon: '✓', show: true },
      { label: deletedLabel, value: deleted, color: 'red', icon: '🗑', show: deleted > 0 },
      { label: 'Files Unchanged', value: unchanged, color: 'gray', icon: '○', show: true },
      { label: 'Errors', value: errors, color: 'red', icon: '✗', show: errors > 0 },
      { label: 'Dead Files Detected', value: deadDetected, color: 'yellow', icon: '☠', show: deadDetected > 0 && !options.deleteDeadFiles },
      { label: '', value: '', color: 'gray', icon: '', show: totalImportsRemoved > 0 || totalDeclarationsRemoved > 0 },
      { label: 'Imports to Remove', value: totalImportsRemoved, color: 'gray', icon: '📦', show: totalImportsRemoved > 0 },
      { label: 'Declarations to Remove', value: totalDeclarationsRemoved, color: 'gray', icon: '📝', show: totalDeclarationsRemoved > 0 },
      { label: '', value: '', color: 'gray', icon: '', show: true },
      { label: 'Total Processed', value: filteredFiles.length, color: 'blue', icon: '∑', show: true },
      { label: 'Time Elapsed', value: formatDuration(elapsed), color: 'cyan', icon: '⏱', show: true },
    ], {
      footer: isDryRun ? '👁️  DRY RUN - No files were modified' : null,
    });
    
    // Show next steps for dry run
    if (isDryRun && (cleaned > 0 || deleted > 0)) {
      console.log(chalk.cyan.bold('  📋 Next Steps:'));
      console.log(chalk.gray('     To apply these changes, run the same command without --dry-run'));
      if (deadDetected > 0 && !options.deleteDeadFiles) {
        console.log(chalk.gray('     Add --delete-dead-files to remove dead files'));
      }
      console.log('');
    }
    
    // Show deleted files list (only if not dry run)
    if (deletedFilesList.length > 0 && !isDryRun) {
      console.log(chalk.red.bold('  📋 Deleted Files:'));
      deletedFilesList.forEach(f => console.log(chalk.gray(`     ${f}`)));
      console.log('');
    }
    
    // Helpful tips (only if not dry run)
    if (!isDryRun && deadDetected > 0 && !options.deleteDeadFiles) {
      console.log(chalk.yellow(`  💡 Tip: Use --delete-dead-files to remove ${deadDetected} dead file(s)`));
      console.log('');
    }
  });

program.parse();
