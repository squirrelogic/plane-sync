import { PlaneProvider } from '../providers/plane-provider';
import { PlaneClient } from '../clients/plane-client';
import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { BaseIssue, BaseLabel, BaseState } from '../clients/base-client';

jest.mock('../clients/plane-client');

describe('PlaneProvider', () => {
  let provider: PlaneProvider;
  let mockClient: jest.Mocked<PlaneClient>;

  const mockBaseIssue: BaseIssue = {
    id: 'plane-123',
    title: 'Test Issue',
    description: 'Test Description',
    state: {
      id: 'state-1',
      name: 'Todo',
      color: '#ff0000'
    },
    labels: [
      {
        id: 'label-1',
        name: 'bug',
        color: '#ff0000',
        description: 'Bug label'
      }
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    metadata: {
      provider: 'plane',
      externalId: '123',
      stateId: 'state-1'
    }
  };

  beforeEach(() => {
    mockClient = new PlaneClient('http://plane.org', 'token') as jest.Mocked<PlaneClient>;
    provider = new PlaneProvider(mockClient, 'workspace-1', 'project-1');

    // Setup default mock implementations
    mockClient.listIssues.mockResolvedValue([mockBaseIssue]);
    mockClient.getIssue.mockResolvedValue(mockBaseIssue);
    mockClient.createIssue.mockResolvedValue(mockBaseIssue);
    mockClient.updateIssue.mockResolvedValue(mockBaseIssue);
    mockClient.deleteIssue.mockResolvedValue();
    mockClient.getLabels.mockResolvedValue([{
      id: 'label-1',
      name: 'bug',
      color: '#ff0000',
      description: 'Bug label'
    }]);
    mockClient.getStates.mockResolvedValue([
      { id: 'state-1', name: 'Todo', color: '#ff0000' },
      { id: 'state-2', name: 'In Progress', color: '#ffff00' },
      { id: 'state-3', name: 'Done', color: '#00ff00' }
    ]);
  });

  describe('getIssues', () => {
    test('should normalize Plane issues', async () => {
      const issues = await provider.getIssues();
      expect(mockClient.listIssues).toHaveBeenCalledWith('workspace-1/project-1');
      expect(issues[0]).toEqual({
        id: 'plane-123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo',
          color: '#ff0000',
          metadata: { id: 'state-1' }
        },
        labels: [{
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label',
          metadata: { id: 'label-1' }
        }],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'plane',
        metadata: {
          stateId: 'state-1',
          externalId: '123'
        }
      });
    });
  });

  describe('getIssue', () => {
    test('should normalize single Plane issue', async () => {
      const issue = await provider.getIssue('plane-123');
      expect(mockClient.getIssue).toHaveBeenCalledWith('workspace-1/project-1', 'plane-123');
      expect(issue.sourceProvider).toBe('plane');
      expect(issue.state.category).toBe(NormalizedStateCategory.Todo);
    });
  });

  describe('createIssue', () => {
    test('should create and normalize Plane issue', async () => {
      const newIssue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'> = {
        title: 'New Issue',
        description: 'New Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo',
          metadata: { id: 'state-1' }
        },
        labels: [{
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label',
          metadata: { id: 'label-1' }
        }],
        assignees: []
      };

      const issue = await provider.createIssue(newIssue);
      expect(mockClient.createIssue).toHaveBeenCalledWith('workspace-1/project-1', {
        title: 'New Issue',
        name: 'New Issue',
        description: 'New Description',
        state: 'state-1',
        state_id: 'state-1',
        labels: ['label-1'],
        label_ids: ['label-1'],
        assignee_ids: []
      });
      expect(issue.title).toBe('Test Issue');
      expect(issue.sourceProvider).toBe('plane');
    });
  });

  describe('updateIssue', () => {
    test('should update and normalize Plane issue', async () => {
      const updateData: Partial<NormalizedIssue> = {
        title: 'Updated Issue',
        state: {
          category: NormalizedStateCategory.Done,
          name: 'Done',
          metadata: { id: 'state-3' }
        }
      };

      const issue = await provider.updateIssue('plane-123', updateData);
      expect(mockClient.updateIssue).toHaveBeenCalledWith('workspace-1/project-1', 'plane-123', {
        title: 'Updated Issue',
        name: 'Updated Issue',
        state: 'state-3',
        state_id: 'state-3'
      });
      expect(issue.title).toBe('Test Issue');
      expect(issue.sourceProvider).toBe('plane');
    });
  });

  describe('deleteIssue', () => {
    test('should delete Plane issue', async () => {
      await provider.deleteIssue('plane-123');
      expect(mockClient.deleteIssue).toHaveBeenCalledWith('workspace-1/project-1', 'plane-123');
    });
  });

  describe('getLabels', () => {
    test('should normalize Plane labels', async () => {
      const labels = await provider.getLabels();
      expect(mockClient.getLabels).toHaveBeenCalledWith('workspace-1/project-1');
      expect(labels[0]).toEqual({
        name: 'bug',
        color: '#ff0000',
        description: 'Bug label',
        metadata: { id: 'label-1' }
      });
    });
  });

  describe('getStates', () => {
    test('should normalize Plane states', async () => {
      const states = await provider.getStates();
      expect(mockClient.getStates).toHaveBeenCalledWith('workspace-1/project-1');
      expect(states).toEqual([
        {
          category: NormalizedStateCategory.Todo,
          name: 'Todo',
          color: '#ff0000',
          metadata: { id: 'state-1' }
        },
        {
          category: NormalizedStateCategory.InProgress,
          name: 'In Progress',
          color: '#ffff00',
          metadata: { id: 'state-2' }
        },
        {
          category: NormalizedStateCategory.Done,
          name: 'Done',
          color: '#00ff00',
          metadata: { id: 'state-3' }
        }
      ]);
    });
  });

  describe('getName', () => {
    test('should return provider name', () => {
      expect(provider.getName()).toBe('plane');
    });
  });

  describe('getStateMappingConfig', () => {
    test('should return state mapping config', () => {
      const config = provider.getStateMappingConfig();
      expect(config.stateMapping).toEqual({
        backlog: NormalizedStateCategory.Backlog,
        todo: NormalizedStateCategory.Todo,
        in_progress: NormalizedStateCategory.InProgress,
        ready: NormalizedStateCategory.Ready,
        done: NormalizedStateCategory.Done
      });
      expect(config.defaultCategory).toBe(NormalizedStateCategory.Backlog);
    });
  });

  describe('isSourceOfTruth', () => {
    test('should identify Plane issues', () => {
      const githubIssue = { sourceProvider: 'github' } as NormalizedIssue;
      const planeIssue = { sourceProvider: 'plane' } as NormalizedIssue;

      expect(provider.isSourceOfTruth(githubIssue)).toBe(false);
      expect(provider.isSourceOfTruth(planeIssue)).toBe(true);
    });
  });
});
