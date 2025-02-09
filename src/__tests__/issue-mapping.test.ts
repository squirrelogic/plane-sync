import { GitHubProvider } from '../providers/github-provider';
import { PlaneProvider } from '../providers/plane-provider';
import { NormalizedIssue, NormalizedStateCategory, NormalizedLabel, NormalizedState } from '../types/normalized';
import { PlaneClient, PlaneIssue, PlaneState, PlaneLabel, CreateIssueData } from '../clients/plane-client';
import { GitHubIssue, CreateGitHubIssue, GitHubNormalizer } from '../normalizers/github-normalizer';
import { PlaneNormalizer } from '../normalizers/plane-normalizer';
import { NormalizedIssueUtils } from '../types/normalized';

// Mock the providers but use real normalizers
jest.mock('../providers/github-provider');
jest.mock('../providers/plane-provider');

describe('Issue Mapping', () => {
  let githubNormalizer: GitHubNormalizer;
  let planeNormalizer: PlaneNormalizer;
  let planeClient: jest.Mocked<PlaneClient>;

  const mockGitHubRawIssue: GitHubIssue = {
    number: 123,
    title: 'Test Issue',
    body: 'Test Description',
    state: 'open',
    labels: [
      { name: 'bug', color: 'ff0000', description: 'Bug label' },
      { name: 'feature', color: '00ff00', description: 'Feature label' }
    ],
    assignees: [{ login: 'user1' }, { login: 'user2' }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    node_id: 'MDU6SXNzdWUx'
  };

  beforeEach(() => {
    // Mock PlaneClient
    planeClient = {
      getStates: jest.fn(),
      getLabels: jest.fn(),
      createLabel: jest.fn()
    } as unknown as jest.Mocked<PlaneClient>;

    // Create real normalizers
    githubNormalizer = new GitHubNormalizer();
    planeNormalizer = new PlaneNormalizer(planeClient, 'workspace-id', 'project-id');
  });

  describe('GitHub Issue Mapping', () => {
    test('should correctly map GitHub issue to normalized issue', async () => {
      const normalizedIssue = await githubNormalizer.normalize(mockGitHubRawIssue);

      expect(normalizedIssue).toEqual({
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo'
        },
        labels: [
          {
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label'
          },
          {
            name: 'feature',
            color: '#00ff00',
            description: 'Feature label'
          }
        ],
        assignees: ['user1', 'user2'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          nodeId: 'MDU6SXNzdWUx'
        },
        sourceProvider: 'github'
      });
    });

    test('should map closed GitHub issue to Done state', async () => {
      const closedIssue: GitHubIssue = {
        ...mockGitHubRawIssue,
        state: 'closed'
      };

      const normalizedIssue = await githubNormalizer.normalize(closedIssue);
      expect(normalizedIssue.state.category).toBe(NormalizedStateCategory.Done);
    });

    test('should handle GitHub issue without optional fields', async () => {
      const minimalIssue: GitHubIssue = {
        number: 123,
        title: 'Test Issue',
        state: 'open',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        labels: [],
        assignees: [],
        node_id: 'MDU6SXNzdWUx',
        body: ''
      };

      const normalizedIssue = await githubNormalizer.normalize(minimalIssue);
      expect(normalizedIssue).toMatchObject({
        description: '',
        labels: [],
        assignees: []
      });
    });

    test('should handle label color normalization', async () => {
      const githubIssue: GitHubIssue = {
        ...mockGitHubRawIssue,
        labels: [
          { name: 'test', color: 'abc' }, // Short color code
          { name: 'test2', color: undefined }, // No color
          { name: 'test3', color: 'ff0000' } // Full color code
        ]
      };

      const normalizedIssue = await githubNormalizer.normalize(githubIssue);
      expect(normalizedIssue.labels).toEqual([
        { name: 'test', color: '#abc', description: undefined },
        { name: 'test2', color: undefined, description: undefined },
        { name: 'test3', color: '#ff0000', description: undefined }
      ]);
    });
  });

  describe('Plane Issue Mapping', () => {
    const mockPlaneStates: PlaneState[] = [
      { id: 'state1', name: 'Backlog', color: '#cccccc' },
      { id: 'state2', name: 'In Progress', color: '#ffff00' },
      { id: 'state3', name: 'Done', color: '#00ff00' }
    ];

    const mockPlaneLabels: PlaneLabel[] = [
      { id: 'label1', name: 'bug', color: '#ff0000', description: 'Bug label' },
      { id: 'label2', name: 'feature', color: '#00ff00', description: 'Feature label' }
    ];

    const mockPlaneRawIssue: PlaneIssue = {
      id: 'plane-123',
      name: 'Test Issue',
      description: 'Test Description',
      state: mockPlaneStates[1], // In Progress state
      labels: [mockPlaneLabels[0], mockPlaneLabels[1]], // Both labels
      assignee_ids: ['user1', 'user2'],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    };

    beforeEach(async () => {
      planeClient.getStates.mockResolvedValue(mockPlaneStates);
      planeClient.getLabels.mockResolvedValue(mockPlaneLabels);
      await planeNormalizer.initialize();
    });

    test('should correctly map Plane issue to normalized issue', async () => {
      const normalizedIssue = await planeNormalizer.normalize(mockPlaneRawIssue);

      expect(normalizedIssue).toEqual({
        id: 'plane-123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.InProgress,
          name: 'In Progress',
          color: '#ffff00'
        },
        labels: [
          {
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label'
          },
          {
            name: 'feature',
            color: '#00ff00',
            description: 'Feature label'
          }
        ],
        assignees: ['user1', 'user2'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          stateId: 'state2'
        },
        sourceProvider: 'plane'
      });
    });

    test('should handle Plane issue without optional fields', async () => {
      const minimalIssue: PlaneIssue = {
        id: 'plane-123',
        name: 'Test Issue',
        state: mockPlaneStates[0], // Backlog state
        labels: [],
        assignee_ids: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      const normalizedIssue = await planeNormalizer.normalize(minimalIssue);
      expect(normalizedIssue).toMatchObject({
        description: '',
        labels: [],
        assignees: []
      });
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      // Set up mock states for initialization
      planeClient.getStates.mockResolvedValue([
        { id: 'state1', name: 'Backlog', color: '#cccccc' },
        { id: 'state2', name: 'In Progress', color: '#ffff00' },
        { id: 'state3', name: 'Done', color: '#00ff00' }
      ]);
      planeClient.getLabels.mockResolvedValue([]);
      await planeNormalizer.initialize();
    });

    test('should handle unknown state mappings gracefully', async () => {
      const planeIssue: PlaneIssue = {
        id: 'plane-123',
        name: 'Test Issue',
        state: {
          id: 'unknown',
          name: 'Unknown State'
        },
        labels: [],
        assignee_ids: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      const normalizedIssue = await planeNormalizer.normalize(planeIssue);
      expect(normalizedIssue.state.category).toBe(NormalizedStateCategory.Backlog); // Default category
    });
  });

  describe('GitHub Normalizer Denormalization', () => {
    test('should correctly denormalize normalized issue to GitHub format', async () => {
      const normalizedIssue: NormalizedIssue = {
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Done,
          name: 'Done'
        },
        labels: [
          { name: 'bug', color: '#ff0000', description: 'Bug label' },
          { name: 'feature', color: '#00ff00' }
        ],
        assignees: ['user1', 'user2'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'github'
      };

      const githubIssue = await githubNormalizer.denormalize(normalizedIssue);
      expect(githubIssue).toEqual({
        title: 'Test Issue',
        body: 'Test Description',
        state: 'closed',
        labels: ['bug', 'feature'],
        assignees: ['user1', 'user2']
      });
    });
  });

  describe('Plane Normalizer Label Handling', () => {
    beforeEach(async () => {
      // Initialize state cache with all possible states
      planeClient.getStates.mockResolvedValue([
        { id: 'state1', name: 'Backlog', color: '#cccccc' },
        { id: 'state2', name: 'Todo', color: '#ffff00' },
        { id: 'state3', name: 'In Progress', color: '#00ff00' },
        { id: 'state4', name: 'Done', color: '#0000ff' }
      ]);

      // Initialize with empty label cache
      planeClient.getLabels.mockResolvedValue([]);

      // Initialize normalizer
      await planeNormalizer.initialize();
    });

    test('should create new labels when they dont exist', async () => {
      // Setup: Empty label cache (already set in beforeEach)
      let labelIdCounter = 1;
      planeClient.createLabel.mockImplementation(async (_, __, data) => ({
        id: `label-${labelIdCounter++}`,
        ...data
      }));

      const planeIssue: PlaneIssue = {
        id: 'plane-123',
        name: 'Test Issue',
        state: { id: 'state1', name: 'Backlog', color: '#cccccc' },
        labels: [
          { id: 'new1', name: 'newLabel1', color: '#ff0000' },
          { id: 'new2', name: 'newLabel2', color: '#00ff00' }
        ],
        assignee_ids: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      const normalizedIssue = await planeNormalizer.normalize(planeIssue);
      expect(planeClient.createLabel).toHaveBeenCalledTimes(2);
      expect(planeClient.createLabel).toHaveBeenCalledWith(
        'workspace-id',
        'project-id',
        expect.objectContaining({ name: 'newLabel1', color: '#ff0000' })
      );
      expect(planeClient.createLabel).toHaveBeenCalledWith(
        'workspace-id',
        'project-id',
        expect.objectContaining({ name: 'newLabel2', color: '#00ff00' })
      );
      expect(normalizedIssue.labels).toHaveLength(2);
    });

    test('should handle label creation and caching during denormalization', async () => {
      let labelIdCounter = 1;
      planeClient.createLabel.mockImplementation(async (_, __, data) => ({
        id: `label-${labelIdCounter++}`,
        ...data
      }));

      const normalizedIssue: NormalizedIssue = {
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo'
        },
        labels: [
          { name: 'newLabel', color: '#ff0000' }
        ],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'plane'
      };

      // First denormalization should create the label
      const firstResult = await planeNormalizer.denormalize(normalizedIssue);
      expect(planeClient.createLabel).toHaveBeenCalledTimes(1);
      expect(firstResult.label_ids).toEqual(['label-1']);

      // Second call should use cached label
      const secondResult = await planeNormalizer.denormalize(normalizedIssue);
      expect(planeClient.createLabel).toHaveBeenCalledTimes(1); // Still 1, no new calls
      expect(secondResult.label_ids).toEqual(['label-1']);
    });

    test('should handle label color and description during denormalization', async () => {
      let labelIdCounter = 1;
      planeClient.createLabel.mockImplementation(async (_, __, data) => ({
        id: `label-${labelIdCounter++}`,
        ...data
      }));

      const normalizedIssue: NormalizedIssue = {
        id: '123',
        title: 'Test Issue',
        description: 'Test Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo'
        },
        labels: [
          { name: 'label1', color: '#ff0000', description: 'Test Label' },
          { name: 'label2' } // No color or description
        ],
        assignees: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'plane'
      };

      const result = await planeNormalizer.denormalize(normalizedIssue);
      expect(planeClient.createLabel).toHaveBeenCalledTimes(2);
      expect(planeClient.createLabel).toHaveBeenCalledWith(
        'workspace-id',
        'project-id',
        {
          name: 'label1',
          color: '#ff0000',
          description: 'Test Label'
        }
      );
      expect(planeClient.createLabel).toHaveBeenCalledWith(
        'workspace-id',
        'project-id',
        {
          name: 'label2',
          color: '#000000' // Default color
        }
      );
      expect(result.label_ids).toEqual(['label-1', 'label-2']);
    });
  });

  describe('NormalizedIssueUtils', () => {
    test('should correctly compare two normalized issues', () => {
      const source: NormalizedIssue = {
        id: '123',
        title: 'Original Title',
        description: 'Original Description',
        state: {
          category: NormalizedStateCategory.Todo,
          name: 'Todo'
        },
        labels: [{ name: 'bug' }],
        assignees: ['user1'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        sourceProvider: 'github'
      };

      const target: NormalizedIssue = {
        ...source,
        title: 'Changed Title',
        labels: [{ name: 'feature' }],
        assignees: ['user2']
      };

      const comparison = NormalizedIssueUtils.compare(source, target);
      expect(comparison.hasChanges).toBe(true);
      expect(comparison.conflicts).toHaveLength(3);
      expect(comparison.conflicts.map((c: { field: string }) => c.field)).toEqual(['title', 'labels', 'assignees']);
    });

    test('should handle all state category mappings', () => {
      const testCases = [
        { name: 'backlog', expected: NormalizedStateCategory.Backlog },
        { name: 'todo', expected: NormalizedStateCategory.Todo },
        { name: 'in progress', expected: NormalizedStateCategory.InProgress },
        { name: 'ready', expected: NormalizedStateCategory.Ready },
        { name: 'done', expected: NormalizedStateCategory.Done },
        { name: 'unknown', expected: NormalizedStateCategory.Backlog }
      ];

      const config = {
        stateMapping: {
          'backlog': NormalizedStateCategory.Backlog,
          'todo': NormalizedStateCategory.Todo,
          'in progress': NormalizedStateCategory.InProgress,
          'ready': NormalizedStateCategory.Ready,
          'done': NormalizedStateCategory.Done
        },
        defaultCategory: NormalizedStateCategory.Backlog
      };

      testCases.forEach(({ name, expected }) => {
        const category = NormalizedIssueUtils.getCategoryFromName(name, config);
        expect(category).toBe(expected);
      });
    });

    test('should create normalized state with all fields', () => {
      const state = NormalizedIssueUtils.createState(
        NormalizedStateCategory.InProgress,
        'In Progress',
        '#ff0000'
      );

      expect(state).toEqual({
        category: NormalizedStateCategory.InProgress,
        name: 'In Progress',
        color: '#ff0000'
      });
    });
  });
});
