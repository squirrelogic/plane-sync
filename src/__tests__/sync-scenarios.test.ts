import { GitHubProvider } from '../providers/github-provider';
import { PlaneProvider } from '../providers/plane-provider';
import { SyncService } from '../services/sync-service';
import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { PlaneClient, PlaneIssue } from '../clients/plane-client';
import { GitHubClient } from '../clients/github-client';

// Mock implementations
jest.mock('../providers/github-provider');
jest.mock('../providers/plane-provider');
jest.mock('../clients/github-client');
jest.mock('../clients/plane-client');

describe('Sync Scenarios', () => {
  let githubProvider: jest.Mocked<GitHubProvider>;
  let planeProvider: jest.Mocked<PlaneProvider>;
  let syncService: SyncService;
  let githubClient: jest.Mocked<GitHubClient>;
  let planeClient: jest.Mocked<PlaneClient>;

  const mockGithubIssue: NormalizedIssue = {
    id: 'github-123',
    title: 'Test Issue',
    description: 'Test Description',
    state: {
      category: NormalizedStateCategory.Todo,
      name: 'Todo'
    },
    labels: [],
    assignees: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    sourceProvider: 'github'
  };

  const mockPlaneIssue: NormalizedIssue = {
    id: 'plane-456',
    title: 'Test Issue',
    description: 'Test Description',
    state: {
      category: NormalizedStateCategory.Todo,
      name: 'Todo'
    },
    labels: [],
    assignees: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    sourceProvider: 'plane'
  };

  beforeEach(() => {
    githubClient = new GitHubClient('token') as jest.Mocked<GitHubClient>;
    planeClient = new PlaneClient('http://plane.org', 'api-key') as jest.Mocked<PlaneClient>;

    githubProvider = new GitHubProvider(githubClient, 'owner', 'repo', 1, false) as jest.Mocked<GitHubProvider>;
    planeProvider = new PlaneProvider(planeClient, 'workspace', 'project') as jest.Mocked<PlaneProvider>;
    syncService = new SyncService(githubProvider, planeProvider);

    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock getName() for both providers
    githubProvider.getName.mockReturnValue('github');
    planeProvider.getName.mockReturnValue('plane');
  });

  describe('GitHub to Plane Sync', () => {
    test('should update existing Plane issue when GitHub issue matches title/description but no githubIssueId', async () => {
      // Setup: GitHub issue exists, Plane issue exists without GitHub ID
      const githubIssue = { ...mockGithubIssue };
      const planeIssue = {
        ...mockPlaneIssue,
        metadata: {} // No external ID
      };

      githubProvider.getIssues.mockResolvedValue([githubIssue]);
      planeProvider.getIssues.mockResolvedValue([planeIssue]);

      // Execute sync
      await syncService.sync();

      // Verify: Plane issue was updated with GitHub ID
      expect(planeProvider.updateIssue).toHaveBeenCalledWith(planeIssue.id, {
        title: githubIssue.title,
        description: githubIssue.description,
        state: githubIssue.state,
        labels: githubIssue.labels,
        assignees: githubIssue.assignees,
        metadata: {
          externalId: githubIssue.id,
          provider: 'github'
        }
      });
    });

    test('should create new Plane issue when GitHub issue has no matching content', async () => {
      // Setup: GitHub issue exists, no matching Plane issue
      const githubIssue = {
        ...mockGithubIssue,
        title: 'Unique Title',
        description: 'Unique Description'
      };

      githubProvider.getIssues.mockResolvedValue([githubIssue]);
      planeProvider.getIssues.mockResolvedValue([]);

      // Execute sync
      await syncService.sync();

      // Verify: New Plane issue was created
      expect(planeProvider.createIssue).toHaveBeenCalledWith({
        title: githubIssue.title,
        description: githubIssue.description,
        state: githubIssue.state,
        labels: githubIssue.labels,
        assignees: githubIssue.assignees,
        metadata: {
          externalId: githubIssue.id,
          provider: 'github'
        }
      });
    });

    test('should sync based on most recent update when both issues exist', async () => {
      // Setup: Both issues exist, GitHub is more recent
      const githubIssue = {
        ...mockGithubIssue,
        title: 'Updated Title',
        updatedAt: '2024-01-02T00:00:00Z'
      };
      const planeIssue = {
        ...mockPlaneIssue,
        updatedAt: '2024-01-01T00:00:00Z',
        metadata: {
          externalId: githubIssue.id,
          provider: 'github'
        }
      };

      githubProvider.getIssues.mockResolvedValue([githubIssue]);
      planeProvider.getIssues.mockResolvedValue([planeIssue]);

      // Execute sync
      await syncService.sync();

      // Verify: Plane issue was updated to match GitHub
      expect(planeProvider.updateIssue).toHaveBeenCalledWith(planeIssue.id, {
        title: githubIssue.title,
        description: githubIssue.description,
        state: githubIssue.state,
        labels: githubIssue.labels,
        assignees: githubIssue.assignees
      });
    });
  });

  describe('Plane to GitHub Sync', () => {
    test('should create GitHub issue when Plane issue has no GitHub ID', async () => {
      // Setup: Plane issue exists without GitHub ID
      const planeIssue = {
        ...mockPlaneIssue,
        metadata: {} // No external ID
      };

      githubProvider.getIssues.mockResolvedValue([]);
      planeProvider.getIssues.mockResolvedValue([planeIssue]);

      // Mock GitHub issue creation
      const createdGithubIssue = {
        ...mockGithubIssue,
        id: 'new-github-123'
      };
      githubProvider.createIssue.mockResolvedValue(createdGithubIssue);

      // Execute sync
      await syncService.sync();

      // Verify: GitHub issue was created and Plane was updated
      expect(githubProvider.createIssue).toHaveBeenCalledWith({
        title: planeIssue.title,
        description: planeIssue.description,
        state: planeIssue.state,
        labels: planeIssue.labels,
        assignees: planeIssue.assignees,
        metadata: {
          externalId: planeIssue.id,
          provider: 'plane'
        }
      });

      expect(planeProvider.updateIssue).toHaveBeenCalledWith(planeIssue.id, {
        metadata: {
          externalId: createdGithubIssue.id,
          provider: 'github'
        }
      });
    });

    test('should mark Plane issue as cancelled when referenced GitHub issue is deleted', async () => {
      // Setup: Plane issue references non-existent GitHub issue
      const planeIssue = {
        ...mockPlaneIssue,
        metadata: {
          externalId: 'deleted-github-123',
          provider: 'github'
        }
      };

      githubProvider.getIssues.mockResolvedValue([]);
      planeProvider.getIssues.mockResolvedValue([planeIssue]);

      // Execute sync
      await syncService.sync();

      // Verify: Plane issue was marked as cancelled
      expect(planeProvider.updateIssue).toHaveBeenCalledWith(planeIssue.id, {
        state: {
          category: NormalizedStateCategory.Done,
          name: 'Cancelled'
        }
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle conflicting updates gracefully', async () => {
      // Setup: Both issues updated with different content
      const githubIssue = {
        ...mockGithubIssue,
        title: 'GitHub Title',
        updatedAt: '2024-01-02T00:00:00Z'
      };
      const planeIssue = {
        ...mockPlaneIssue,
        title: 'Plane Title',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          externalId: githubIssue.id,
          provider: 'github'
        }
      };

      githubProvider.getIssues.mockResolvedValue([githubIssue]);
      planeProvider.getIssues.mockResolvedValue([planeIssue]);

      // Execute sync
      const result = await syncService.sync();

      // Verify: Conflict was detected
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        sourceIssue: githubIssue,
        targetIssue: planeIssue,
        lastSyncHash: '',
        conflictingFields: [{
          field: 'title',
          sourceValue: githubIssue.title,
          targetValue: planeIssue.title
        }]
      });
    });

    test('should handle rate limiting and retries', async () => {
      // Setup: First call fails with rate limit, second succeeds
      githubProvider.getIssues
        .mockRejectedValueOnce(new Error('API rate limit exceeded'))
        .mockResolvedValueOnce([mockGithubIssue]);
      planeProvider.getIssues.mockResolvedValue([]);

      // Execute sync
      await syncService.sync();

      // Verify: GitHub API was called twice
      expect(githubProvider.getIssues).toHaveBeenCalledTimes(2);
    });
  });
});
