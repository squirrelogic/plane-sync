import { NormalizedIssue } from '../types/normalized.js';

export interface IssueNormalizer<T = any, U = any> {
  /**
   * Convert a provider-specific issue to a normalized issue format
   */
  normalize(issue: T): Promise<NormalizedIssue>;

  /**
   * Convert a normalized issue back to provider-specific format
   */
  denormalize(issue: NormalizedIssue): Promise<U>;
}
