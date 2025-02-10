import { GitHubProvider } from '../providers/github-provider';
import { GitHubClient } from '../clients/github-client';
import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { BaseIssue, BaseLabel, BaseState } from '../clients/base-client';

jest.mock('../clients/github-client');

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  let mockClient: jest.Mocked<GitHubClient>;

  const mockBaseIssue: BaseIssue = {
    id: '123',
    title: 'Test Issue',
    description: 'Test Description',
    state: {
      id: 'open',
      name: 'Open'
    },
    labels: [
      {
        id: 'bug',
        name: 'bug',
        color: '#ff0000',
        description: 'Bug label'
      }
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    metadata: {
      provider: 'github',
      externalId: '123'
    }
  };

  beforeEach(() => {
    mockClient = new GitHubClient('token') as jest.Mocked<GitHubClient>;
    provider = new GitHubProvider(mockClient, 'owner', 'repo');

    // Setup default mock implementations
    mockClient.listIssues.mockResolvedValue([mockBaseIssue]);
    mockClient.getIssue.mockResolvedValue(mockBaseIssue);
    mockClient.createIssue.mockResolvedValue(mockBaseIssue);
    mockClient.updateIssue.mockResolvedValue(mockBaseIssue);
    mockClient.deleteIssue.mockResolvedValue();
    mockClient.getLabels.mockResolvedValue([{
      id: 'bug',
      name: 'bug',
      color: '#ff0000',
      description: 'Bug label'
    }]);
    mockClient.getStates.mockResolvedValue([
      { id: 'open', name: 'Open' },
      { id: 'closed', name: 'Closed' }
    ]);
  });

  describe('getIssues', () => {
    test('should normalize GitHub issues', async () => {
      const issues = await provider.getIssues();
      expect(mockClient.listIssues).toHaveBeenCalledWith('owner/repo');
      expect(issues[0]).toEqual({
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: 'todo',
          name: 'Open'
        },
        labels: [
          {
            name: 'bug',
            description: 'Bug label',
            color: '#ff0000'
          }
        ],
        metadata: {
          externalId: '123',
          nodeId: ''
        },
        sourceProvider: 'github',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        assignees: []
      });
    });
  });

  describe('getIssue', () => {
    test('should normalize single GitHub issue', async () => {
      const issue = await provider.getIssue('123');
      expect(mockClient.getIssue).toHaveBeenCalledWith('owner/repo', '123');
      expect(issue).toEqual({
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Open'
        },
        labels: [{
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label'
        }],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'github',
        metadata: {
          externalId: '123',
          nodeId: ''
        }
      });
    });
  });

  describe('createIssue', () => {
    test('should create and normalize GitHub issue', async () => {
      const newIssue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'> = {
        title: 'New Issue',
        description: 'New Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Open'
        },
        labels: [{
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label'
        }],
        assignees: []
      };

      const issue = await provider.createIssue(newIssue);
      expect(mockClient.createIssue).toHaveBeenCalledWith('owner/repo', {
        title: 'New Issue',
        description: 'New Description',
        state: 'open',
        labels: ['bug']
      });
      expect(issue.title).toBe('Test Issue');
      expect(issue.sourceProvider).toBe('github');
    });
  });

  describe('updateIssue', () => {
    test('should update and normalize GitHub issue', async () => {
      const updateData: Partial<NormalizedIssue> = {
        title: 'Updated Issue',
        state: {
          category: NormalizedStateCategory.Done,
          name: 'Closed'
        }
      };

      const issue = await provider.updateIssue('123', updateData);
      expect(mockClient.updateIssue).toHaveBeenCalledWith('owner/repo', '123', {
        title: 'Updated Issue',
        state: 'closed'
      });
      expect(issue.title).toBe('Test Issue');
      expect(issue.sourceProvider).toBe('github');
    });
  });

  describe('deleteIssue', () => {
    test('should delete GitHub issue', async () => {
      await provider.deleteIssue('123');
      expect(mockClient.deleteIssue).toHaveBeenCalledWith('owner/repo', '123');
    });
  });

  describe('getLabels', () => {
    test('should normalize GitHub labels', async () => {
      const labels = await provider.getLabels();
      expect(mockClient.getLabels).toHaveBeenCalledWith('owner/repo');
      expect(labels[0]).toEqual({
        name: 'bug',
        color: '#ff0000',
        description: 'Bug label'
      });
    });
  });

  describe('getStates', () => {
    test('should normalize GitHub states', async () => {
      const states = await provider.getStates();
      expect(mockClient.getStates).toHaveBeenCalledWith('owner/repo');
      expect(states).toEqual([
        {
          category: NormalizedStateCategory.Todo,
          name: 'Open'
        },
        {
          category: NormalizedStateCategory.Done,
          name: 'Closed'
        }
      ]);
    });
  });

  describe('getName', () => {
    test('should return provider name', () => {
      expect(provider.getName()).toBe('github');
    });
  });

  describe('getStateMappingConfig', () => {
    test('should return state mapping config', () => {
      const config = provider.getStateMappingConfig();
      expect(config.stateMapping).toEqual({
        open: NormalizedStateCategory.Backlog,
        closed: NormalizedStateCategory.Done
      });
      expect(config.defaultCategory).toBe(NormalizedStateCategory.Backlog);
    });
  });

  describe('isSourceOfTruth', () => {
    test('should identify GitHub issues', () => {
      const githubIssue = { sourceProvider: 'github' } as NormalizedIssue;
      const planeIssue = { sourceProvider: 'plane' } as NormalizedIssue;

      expect(provider.isSourceOfTruth(githubIssue)).toBe(true);
      expect(provider.isSourceOfTruth(planeIssue)).toBe(false);
    });
  });
});
