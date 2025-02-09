import { NormalizedIssue } from '../types/normalized';

export interface IssueNormalizer<T, U = Partial<T>> {
  /**
   * Convert a provider-specific issue to a normalized issue format
   */
  normalize(issue: T): Promise<NormalizedIssue>;

  /**
   * Convert a normalized issue back to provider-specific format
   */
  denormalize(issue: NormalizedIssue): Promise<U>;
}
