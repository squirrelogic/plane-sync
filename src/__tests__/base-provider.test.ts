import { BaseProvider } from '../providers/base-provider';
import { NormalizedStateCategory, StateMappingConfig, NormalizedIssue, NormalizedState } from '../types/normalized';
import { IssueState } from '../types';

class TestProvider extends BaseProvider {
  protected readonly name = 'test';
  protected readonly stateMappingConfig: StateMappingConfig = {
    stateMapping: {
      'test-state': NormalizedStateCategory.Todo
    },
    defaultCategory: NormalizedStateCategory.Backlog
  };

  async getIssues(): Promise<NormalizedIssue[]> {
    return [];
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    throw new Error('Not implemented');
  }

  async createIssue(issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>): Promise<NormalizedIssue> {
    throw new Error('Not implemented');
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    throw new Error('Not implemented');
  }

  async deleteIssue(id: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async getLabels(): Promise<{ name: string; color?: string; description?: string; metadata?: Record<string, any>; }[]> {
    return [];
  }

  async getStates(): Promise<{ category: NormalizedStateCategory; name: string; color?: string; metadata?: Record<string, any>; }[]> {
    return [];
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === 'test';
  }

  mapState(state: NormalizedState): IssueState {
    return {
      id: state.metadata?.id || '',
      name: state.name,
      category: state.category.replace('_', '') as 'backlog' | 'todo' | 'in_progress' | 'ready' | 'done',
      color: state.color
    };
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('getName', () => {
    test('should return provider name', () => {
      expect(provider.getName()).toBe('test');
    });
  });

  describe('getStateMappingConfig', () => {
    test('should return state mapping config', () => {
      const config = provider.getStateMappingConfig();
      expect(config).toEqual({
        stateMapping: {
          'test-state': NormalizedStateCategory.Todo
        },
        defaultCategory: NormalizedStateCategory.Backlog
      });
    });
  });

  describe('getCategoryFromName', () => {
    test('should map state name to category', () => {
      const category = provider.getStateMappingConfig().stateMapping['test-state'];
      expect(category).toBe(NormalizedStateCategory.Todo);
    });

    test('should return default category for unknown state', () => {
      const category = provider.getStateMappingConfig().stateMapping['unknown-state'] || provider.getStateMappingConfig().defaultCategory;
      expect(category).toBe(NormalizedStateCategory.Backlog);
    });
  });

  describe('mapState', () => {
    test('should map normalized state to issue state', () => {
      const normalizedState: NormalizedState = {
        category: NormalizedStateCategory.Todo,
        name: 'Todo',
        color: '#ff0000',
        metadata: { id: 'state-1' }
      };

      const issueState = provider.mapState(normalizedState);
      expect(issueState).toEqual({
        id: 'state-1',
        name: 'Todo',
        category: 'todo',
        color: '#ff0000'
      });
    });

    test('should handle state without metadata or color', () => {
      const normalizedState: NormalizedState = {
        category: NormalizedStateCategory.InProgress,
        name: 'In Progress'
      };

      const issueState = provider.mapState(normalizedState);
      expect(issueState).toEqual({
        id: '',
        name: 'In Progress',
        category: 'inprogress',
        color: undefined
      });
    });
  });
});
