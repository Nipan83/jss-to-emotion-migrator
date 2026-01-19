/**
 * JSS to Emotion Migrator - TypeScript Definitions
 */

export interface MigrateOptions {
  /** Parser to use: 'babel' | 'tsx' | 'flow' */
  parser?: 'babel' | 'tsx' | 'flow';
  /** Transform to use: 'jssToEmotion' | 'makeStyles' | 'withStyles' */
  transform?: 'jssToEmotion' | 'makeStyles' | 'withStyles';
  /** Path to the file being transformed (for error reporting) */
  filePath?: string;
}

export interface CleanupOptions {
  /** Parser to use: 'babel' | 'tsx' | 'flow' */
  parser?: 'babel' | 'tsx' | 'flow';
  /** Path to the file being transformed (for error reporting) */
  filePath?: string;
  /** Remove all unused imports, not just JSS-related */
  removeAllUnusedImports?: boolean;
}

export interface CleanupReport {
  /** List of removed import names */
  removedImports: string[];
  /** List of removed declaration names */
  removedDeclarations: string[];
  /** Whether the file is dead (only contains JSS code) */
  isDead: boolean;
  /** Reason why the file is considered dead */
  deadReason: string;
}

export interface CleanupResult {
  /** Transformed source code */
  source: string;
  /** Report of what was cleaned */
  report: CleanupReport;
}

export interface AnalysisResult {
  /** List of unused JSS import names */
  unusedJSSImports: string[];
  /** List of unused style declaration names */
  unusedStyleDeclarations: string[];
  /** Whether the file is dead (only contains JSS code) */
  isDead: boolean;
  /** Reason why the file is considered dead */
  deadReason: string;
}

/**
 * Migrates JSS styles to Emotion styled components
 * @param source - Source code to transform
 * @param options - Transform options
 * @returns Transformed source code
 */
export function migrate(source: string, options?: MigrateOptions): string;

/**
 * Cleans up unused JSS imports and dead code
 * @param source - Source code to clean
 * @param options - Cleanup options
 * @returns Object containing cleaned source and report
 */
export function cleanup(source: string, options?: CleanupOptions): CleanupResult;

/**
 * Analyzes a file for cleanup opportunities without making changes
 * @param source - Source code to analyze
 * @param options - Analysis options
 * @returns Analysis report
 */
export function analyzeForCleanup(source: string, options?: CleanupOptions): AnalysisResult;

/**
 * Creates a jscodeshift transform function
 * @param transformName - Name of the transform
 * @returns jscodeshift transform function
 */
export function createTransform(transformName?: string): Function;

/** Available transforms */
export const transforms: {
  jssToEmotion: Function;
  makeStyles: Function;
  withStyles: Function;
  cleanupJSS: Function;
};

/** Utility functions */
export const utils: {
  styleParser: {
    parseStyleObject: Function;
    extractStyleProperties: Function;
  };
  importHandler: {
    addImport: Function;
    removeImport: Function;
    hasImport: Function;
  };
  jsxTransformer: {
    transformJSXElement: Function;
  };
  styleNameUtils: {
    toPascalCase: Function;
    classNameToComponentName: Function;
    generateUniqueComponentName: Function;
    inferElementType: Function;
  };
};
