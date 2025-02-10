import { GitHubClient } from '../clients/github-client.js';
import { Octokit } from '@octokit/rest';
import { IssueTrackingClient, BaseIssue, BaseLabel, BaseState } from '../clients/base-client.js';
import { GitHubIssue } from '../normalizers/github-normalizer.js';

jest.mock('@octokit/rest');

type OctokitResponse<T> = Promise<{ data: T }>;

interface OctokitMockFunction<T = any> extends jest.Mock<OctokitResponse<T>> {
  mockResolvedValue: (value: { data: T }) => this;
  mockRejectedValue: (error: Error) => this;
}

type MockOctokit = {
  rest: {
    issues: {
      listForRepo: OctokitMockFunction<GitHubIssue[]>;
      get: OctokitMockFunction<GitHubIssue>;
      create: OctokitMockFunction<GitHubIssue>;
      update: OctokitMockFunction<GitHubIssue>;
      listLabelsForRepo: OctokitMockFunction<
        { id: number; name: string; color: string; description?: string }[]
      >;
      createLabel: OctokitMockFunction<{
        id: number;
        name: string;
        color: string;
        description?: string;
      }>;
    };
  };
};

describe('GitHubClient', () => {
  let client: GitHubClient;
  let mockOctokit: MockOctokit;

  const mockGitHubIssue: GitHubIssue = {
    number: 1,
    title: 'Issue 1',
    body: 'Description 1',
    state: 'open',
    labels: [
      {
        name: 'bug',
        color: 'ff0000',
        description: 'Bug label',
      },
    ],
    assignees: [{ login: 'user1' }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    node_id: 'MDU6SXNzdWUx',
  };

  const mockGitHubPR = {
    ...mockGitHubIssue,
    number: 2,
    title: 'PR 1',
    pull_request: {},
  };

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          listForRepo: jest.fn() as OctokitMockFunction<GitHubIssue[]>,
          get: jest.fn() as OctokitMockFunction<GitHubIssue>,
          create: jest.fn() as OctokitMockFunction<GitHubIssue>,
          update: jest.fn() as OctokitMockFunction<GitHubIssue>,
          listLabelsForRepo: jest.fn() as OctokitMockFunction<
            { id: number; name: string; color: string; description?: string }[]
          >,
          createLabel: jest.fn() as OctokitMockFunction<{
            id: number;
            name: string;
            color: string;
            description?: string;
          }>,
        },
      },
    };

    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(
      () => mockOctokit as unknown as Octokit
    );

    client = new GitHubClient('test-token');
  });

  describe('project reference parsing', () => {
    test('should parse valid project reference', async () => {
      const _mockData = { data: [] };

      mockOctokit.rest.issues.listForRepo.mockRejectedValue(new Error('Network error'));

      await expect(client.listIssues('owner/repo')).rejects.toThrow('Network error');
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'all',
        per_page: 100,
      });
    });

    test('should throw error for invalid project reference', async () => {
      await expect(client.listIssues('invalid')).rejects.toThrow('Invalid project reference');
    });
  });

  describe('listIssues', () => {
    test('should list and map GitHub issues', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockGitHubIssue, mockGitHubPR],
      });

      const issues = await client.listIssues('owner/repo');
      expect(issues).toHaveLength(1); // Only one actual issue, PR filtered out
      expect(issues[0]).toEqual({
        id: '1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'open',
          name: 'Open',
        },
        labels: [
          {
            id: 'bug',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        metadata: {
          externalId: '1',
          provider: 'github',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.listForRepo.mockRejectedValue(new Error('Network error'));
      await expect(client.listIssues('owner/repo')).rejects.toThrow('Network error');
    });
  });

  describe('getIssue', () => {
    test('should get and map single GitHub issue', async () => {
      mockOctokit.rest.issues.get.mockResolvedValue({ data: mockGitHubIssue });

      const issue = await client.getIssue('owner/repo', '1');
      expect(issue).toEqual({
        id: '1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'open',
          name: 'Open',
        },
        labels: [
          {
            id: 'bug',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        metadata: {
          externalId: '1',
          provider: 'github',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getIssue('owner/repo', '1')).rejects.toThrow('Network error');
    });
  });

  describe('createIssue', () => {
    test('should create GitHub issue with all fields', async () => {
      mockOctokit.rest.issues.create.mockResolvedValue({ data: mockGitHubIssue });

      const issue = await client.createIssue('owner/repo', {
        title: 'New Issue',
        description: 'Description',
        state: { id: 'open', name: 'Open' },
        labels: [{ id: '1', name: 'bug', color: '#ff0000', description: 'Bug label' }],
      });

      expect(issue).toEqual({
        id: '1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'open',
          name: 'Open',
        },
        labels: [
          {
            id: 'bug',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        metadata: {
          externalId: '1',
          provider: 'github',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.create.mockRejectedValue(new Error('Network error'));

      await expect(
        client.createIssue('owner/repo', {
          title: 'New Issue',
          description: 'Description',
          state: { id: 'open', name: 'Open' },
          labels: [{ id: '1', name: 'bug', color: '#ff0000', description: 'Bug label' }],
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('updateIssue', () => {
    test('should update GitHub issue with changed fields', async () => {
      const updatedMockIssue: GitHubIssue = {
        ...mockGitHubIssue,
        title: 'Updated Issue',
        body: 'Updated Description',
        state: 'closed',
        labels: [
          {
            name: 'enhancement',
            color: '00ff00',
            description: 'Enhancement label',
          },
        ],
      };

      mockOctokit.rest.issues.update.mockResolvedValue({ data: updatedMockIssue });

      const issue = await client.updateIssue('owner/repo', '1', {
        title: 'Updated Issue',
        description: 'Updated Description',
        state: { id: 'closed', name: 'Closed' },
        labels: [
          { id: '2', name: 'enhancement', color: '#00ff00', description: 'Enhancement label' },
        ],
      });

      expect(issue).toEqual({
        id: '1',
        title: 'Updated Issue',
        description: 'Updated Description',
        state: {
          id: 'closed',
          name: 'Closed',
        },
        labels: [
          {
            id: 'enhancement',
            name: 'enhancement',
            color: '#00ff00',
            description: 'Enhancement label',
          },
        ],
        metadata: {
          externalId: '1',
          provider: 'github',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.update.mockRejectedValue(new Error('Network error'));

      await expect(
        client.updateIssue('owner/repo', '1', {
          title: 'Updated Issue',
          description: 'Updated Description',
          state: { id: 'closed', name: 'Closed' },
          labels: [
            { id: '2', name: 'enhancement', color: '#00ff00', description: 'Enhancement label' },
          ],
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('deleteIssue', () => {
    test('should close GitHub issue', async () => {
      const closedIssue: GitHubIssue = {
        ...mockGitHubIssue,
        state: 'closed',
      };
      mockOctokit.rest.issues.update.mockResolvedValue({ data: closedIssue });

      await client.deleteIssue('owner/repo', '1');

      expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        state: 'closed',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.update.mockRejectedValue(new Error('Network error'));

      await expect(client.deleteIssue('owner/repo', '1')).rejects.toThrow('Network error');
    });
  });

  describe('getLabels', () => {
    test('should list and map GitHub labels', async () => {
      const mockGitHubLabels = [
        {
          id: 1,
          name: 'bug',
          color: 'ff0000',
          description: 'Bug label',
        },
      ];

      mockOctokit.rest.issues.listLabelsForRepo.mockResolvedValue({ data: mockGitHubLabels });

      const labels = await client.getLabels('owner/repo');
      expect(labels).toEqual([
        {
          id: '1',
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label',
        },
      ]);
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.listLabelsForRepo.mockRejectedValue(new Error('Network error'));

      await expect(client.getLabels('owner/repo')).rejects.toThrow('Network error');
    });
  });

  describe('getStates', () => {
    test('should return GitHub states', async () => {
      const states = await client.getStates('owner/repo');
      expect(states).toEqual([
        { id: 'open', name: 'Open' },
        { id: 'closed', name: 'Closed' },
      ]);
    });
  });

  describe('createLabel', () => {
    test('should create GitHub label', async () => {
      const mockGitHubLabel = {
        id: 1,
        name: 'new-label',
        color: 'ff0000',
        description: 'New label',
      };

      mockOctokit.rest.issues.createLabel.mockResolvedValue({ data: mockGitHubLabel });

      const label = await client.createLabel('owner/repo', {
        name: 'new-label',
        color: '#ff0000',
        description: 'New label',
      });

      expect(label).toEqual({
        id: '1',
        name: 'new-label',
        color: '#ff0000',
        description: 'New label',
      });
    });

    test('should handle network error', async () => {
      mockOctokit.rest.issues.createLabel.mockRejectedValue(new Error('Network error'));

      await expect(
        client.createLabel('owner/repo', {
          name: 'new-label',
          color: '#ff0000',
          description: 'New label',
        })
      ).rejects.toThrow('Network error');
    });

    test('should handle label creation with minimal fields', async () => {
      const mockGitHubLabel = {
        id: 1,
        name: 'minimal-label',
        color: '000000',
      };

      mockOctokit.rest.issues.createLabel.mockResolvedValue({ data: mockGitHubLabel });

      const label = await client.createLabel('owner/repo', {
        name: 'minimal-label',
      });

      expect(label).toEqual({
        id: '1',
        name: 'minimal-label',
        color: '#000000',
      });
    });
  });

  describe('constructor', () => {
    test('should throw error for empty token', () => {
      expect(() => new GitHubClient('')).toThrow('Invalid GitHub token');
    });

    test('should throw error for whitespace token', () => {
      expect(() => new GitHubClient('   ')).toThrow('Invalid GitHub token');
    });

    test('should throw error for null token', () => {
      expect(() => new GitHubClient(null as unknown as string)).toThrow('Invalid GitHub token');
    });

    test('should throw error for undefined token', () => {
      expect(() => new GitHubClient(undefined as unknown as string)).toThrow(
        'Invalid GitHub token'
      );
    });

    test('should create client with valid token', () => {
      expect(() => new GitHubClient('valid-token')).not.toThrow();
    });
  });
});
