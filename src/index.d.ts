/**
 * JSS to Emotion Migrator - TypeScript Definitions
 */

export interface MigrateOptions {
  /** Parser to use: 'babel' | 'tsx' | 'flow' */
  parser?: 'babel' | 'tsx' | 'flow';
  /**
   * Transform to use. `jssToEmotion` is the single canonical transform;
   * `makeStyles` / `withStyles` / `jssToEmotionMUI` are deprecated aliases that
   * now delegate to it.
   */
  transform?: 'jssToEmotion' | 'makeStyles' | 'withStyles' | 'jssToEmotionMUI';
  /** Path to the file being transformed (enables cross-file style resolution). */
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

/**
 * Available transforms. `jssToEmotion` is canonical; `makeStyles`, `withStyles`
 * and `jssToEmotionMUI` are deprecated aliases of it.
 */
export const transforms: {
  jssToEmotion: Function;
  makeStyles: Function;
  withStyles: Function;
  jssToEmotionMUI: Function;
  cleanupJSS: Function;
};

/** Utility functions (flat namespace). */
export const utils: {
  deriveStyledComponentName: Function;
  slotToSelector: Function;
  isModifierSlot: Function;
  toPascalCase: Function;
  pascalCase: Function;
  generateUniqueComponentName: Function;
  inferElementType: Function;
  extractStyleObjectFromMakeStyles: Function;
  usesTheme: Function;
  findJSSImports: Function;
  addStyledImport: Function;
  [key: string]: Function;
};
