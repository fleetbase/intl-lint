/**
 * ===============================================================================
 *                  Fleetbase Internationalization Linter
 * ===============================================================================
 * 
 * Validates translation keys in Ember project files against YAML translation
 * files to prevent missing translations at runtime.
 * 
 * Usage:
 *   node index.js [options]
 *   
 * Options:
 *   --silent, -s              Suppress errors and run to completion
 *   --path, -p <path>         Path to Ember project (default: ./app)
 *   --translation-path <path> Path to translation file (default: ./translations/en-us.yaml)
 * 
 * @copyright © 2024 Fleetbase Pte Ltd. All rights reserved.
 * @license MIT
 * ===============================================================================
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
    .option('silent', {
        alias: 's',
        type: 'boolean',
        description: 'Run in silent mode',
        default: false,
    })
    .option('path', {
        alias: 'p',
        type: 'string',
        description: 'Path to the Ember project',
        default: './app',
    })
    .option('translation-path', {
        type: 'string',
        description: 'Path to the translation YAML file',
        default: './translations/en-us.yaml',
    }).argv;

/**
 * Extract translation keys from file content
 */
function extractTranslationKeys(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const keys = [];
    let regex;

    if (filePath.endsWith('.hbs')) {
        // Handlebars: {{t "key"}} or (t "key")
        regex = /\{\{\s*t\s+["'`]([^"'`]+?)["'`]\s*\}}|\(t\s+["'`]([^"'`]+?)["'`]\)/g;
    } else if (filePath.endsWith('.js')) {
        // JavaScript: this.intl.t('key') or intl.t('key')
        regex = /(?:this\.)?intl\.t\s*\(\s*["'`]([^"'`]+?)["'`]\s*(?:,\s*\{[^}]*\}\s*)?\)/g;
    } else {
        return keys;
    }

    let match;
    while ((match = regex.exec(content)) !== null) {
        const key = match[1] || match[2];
        if (key && key.trim() !== '') {
            keys.push(key.trim());
        }
    }

    return keys;
}

/**
 * Check if a key exists in translation data (supports nested keys)
 */
function keyExistsInTranslations(key, translationData) {
    const nestedKeys = key.split('.');
    let currentLevel = translationData;

    for (const nestedKey of nestedKeys) {
        if (currentLevel && typeof currentLevel === 'object' && nestedKey in currentLevel) {
            currentLevel = currentLevel[nestedKey];
        } else {
            return false;
        }
    }

    return true;
}

/**
 * Check keys against translation file
 */
function checkKeysInTranslationFile(keys, translationFilePath) {
    const translationContent = fs.readFileSync(translationFilePath, 'utf8');
    const translationData = yaml.load(translationContent) || {};

    const missingKeys = keys.filter((key) => !keyExistsInTranslations(key, translationData));

    return missingKeys;
}

/**
 * Collect all translation keys from directory
 */
function collectKeysFromDirectory(directoryPath) {
    const allKeys = new Set();
    const fileStats = { total: 0, withKeys: 0 };

    function processDirectory(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                processDirectory(fullPath);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.hbs')) {
                fileStats.total++;
                const keys = extractTranslationKeys(fullPath);
                if (keys.length > 0) {
                    fileStats.withKeys++;
                    keys.forEach((key) => allKeys.add(key));
                }
            }
        }
    }

    processDirectory(directoryPath);
    return { keys: Array.from(allKeys), stats: fileStats };
}

/**
 * Main linting function
 */
function lint(options = {}) {
    const silentMode = options.silent === true;
    const projectPath = path.resolve(process.cwd(), options.path);
    const translationFilePath = path.resolve(process.cwd(), options.translationPath);

    // Validate paths
    if (!fs.existsSync(projectPath)) {
        console.error(`[Fleetbase] Error: Project path not found: ${projectPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(translationFilePath)) {
        console.error(`[Fleetbase] Error: Translation file not found: ${translationFilePath}`);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(80));
    console.log('[Fleetbase] Translation Linter');
    console.log('='.repeat(80));

    // Collect all keys
    const { keys, stats } = collectKeysFromDirectory(projectPath);
    console.log(`[Fleetbase] Scanned ${stats.total} file(s), found ${keys.length} unique translation key(s)`);

    // Check against translation file
    const translationFileName = path.basename(translationFilePath, path.extname(translationFilePath));
    const missingKeys = checkKeysInTranslationFile(keys, translationFilePath);

    console.log('');
    console.log(`[Fleetbase] ${translationFileName}:`);

    if (missingKeys.length > 0) {
        console.log(`[Fleetbase]   ⚠️  ${missingKeys.length} missing translation(s)`);
        console.log('');

        // Show all missing keys with indentation
        missingKeys.forEach((key) => {
            console.log(`[Fleetbase]      - ${key}`);
        });

        console.log('');
        console.log('='.repeat(80) + '\n');

        if (!silentMode) {
            console.error('[Fleetbase] ❌ Translation validation failed!');
            process.exit(1);
        } else {
            console.log('[Fleetbase] ⚠️  Translation validation completed with warnings (silent mode)');
        }
    } else {
        console.log(`[Fleetbase]   ✓ All translations present`);
        console.log('');
        console.log('='.repeat(80) + '\n');
        console.log('[Fleetbase] ✓ Translation validation passed!');
    }
}

// Run if called directly
if (require.main === module) {
    lint({
        silent: argv.silent,
        path: argv.path,
        translationPath: argv['translation-path'],
    });
}

module.exports = lint;
