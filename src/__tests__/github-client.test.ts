import { GitHubClient } from '../clients/github-client';
import { Octokit } from '@octokit/rest';
import { BaseIssue, BaseLabel, BaseState } from '../clients/base-client';

jest.mock('@octokit/rest');

describe('GitHubClient', () => {
  let client: GitHubClient;
  let mockOctokit: jest.Mocked<Octokit>;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          listForRepo: jest.fn().mockResolvedValue({ data: [] }),
          get: jest.fn().mockResolvedValue({ data: {} }),
          create: jest.fn().mockResolvedValue({ data: {} }),
          update: jest.fn().mockResolvedValue({ data: {} }),
          listLabelsForRepo: jest.fn().mockResolvedValue({ data: [] }),
          createLabel: jest.fn().mockResolvedValue({ data: {} })
        }
      }
    } as unknown as jest.Mocked<Octokit>;

    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);
    client = new GitHubClient('test-token');
  });

  describe('project reference parsing', () => {
    test('should parse valid project reference', async () => {
      const mockData = { data: [] };
      // @ts-ignore
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce(mockData);

      await client.listIssues('owner/repo');
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'all'
      });
    });

    test('should throw error for invalid project reference', async () => {
      await expect(client.listIssues('invalid')).rejects.toThrow('Invalid project reference');
    });
  });

  describe('listIssues', () => {
    test('should list and map GitHub issues', async () => {
      const mockGitHubIssues = [
        {
          number: 1,
          title: 'Issue 1',
          body: 'Description 1',
          state: 'open',
          labels: [{ name: 'bug', color: 'ff0000' }],
          assignees: [{ login: 'user1' }],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          pull_request: undefined
        },
        {
          number: 2,
          title: 'PR 1',
          state: 'open',
          labels: [],
          assignees: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          pull_request: {} // This is a PR, should be filtered out
        }
      ];

      // @ts-ignore
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({ data: mockGitHubIssues });

      const issues = await client.listIssues('owner/repo');
      expect(issues).toHaveLength(1); // Only one actual issue, PR filtered out
      expect(issues[0]).toEqual({
        id: '1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'open',
          name: 'Open'
        },
        labels: [{
          id: 'bug',
          name: 'bug',
          color: '#ff0000'
        }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          provider: 'github',
          externalId: '1'
        }
      });
    });
  });

  describe('getIssue', () => {
    test('should get and map single GitHub issue', async () => {
      const mockGitHubIssue = {
        number: 1,
        title: 'Issue 1',
        body: 'Description 1',
        state: 'open',
        labels: [{ name: 'bug', color: 'ff0000' }],
        assignees: [{ login: 'user1' }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      // @ts-ignore
      mockOctokit.rest.issues.get.mockResolvedValueOnce({ data: mockGitHubIssue });

      const issue = await client.getIssue('owner/repo', '1');
      expect(issue).toEqual({
        id: '1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'open',
          name: 'Open'
        },
        labels: [{
          id: 'bug',
          name: 'bug',
          color: '#ff0000'
        }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          provider: 'github',
          externalId: '1'
        }
      });
    });
  });

  describe('createIssue', () => {
    test('should create GitHub issue with all fields', async () => {
      const mockGitHubIssue = {
        number: 1,
        title: 'New Issue',
        body: 'Description',
        state: 'open',
        labels: [{ name: 'bug', color: 'ff0000' }],
        assignees: [{ login: 'user1' }],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      // @ts-ignore
      mockOctokit.rest.issues.create.mockResolvedValueOnce({ data: mockGitHubIssue });

      const issue = await client.createIssue('owner/repo', {
        title: 'New Issue',
        description: 'Description',
        state: 'open',
        labels: ['bug'],
        metadata: {
          assigneeIds: ['user1']
        }
      });

      // @ts-ignore
      expect(mockOctokit.rest.issues.create.mock.calls[0][0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        title: 'New Issue',
        body: 'Description',
        labels: ['bug']
      });

      expect(issue).toEqual({
        id: '1',
        title: 'New Issue',
        description: 'Description',
        state: {
          id: 'open',
          name: 'Open'
        },
        labels: [{
          id: 'bug',
          name: 'bug',
          color: '#ff0000'
        }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          provider: 'github',
          externalId: '1'
        }
      });
    });
  });

  describe('updateIssue', () => {
    test('should update GitHub issue with changed fields', async () => {
      const mockGitHubIssue = {
        number: 1,
        title: 'Updated Issue',
        body: 'New Description',
        state: 'closed',
        labels: [{ name: 'feature', color: '00ff00' }],
        assignees: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      // @ts-ignore
      mockOctokit.rest.issues.update.mockResolvedValueOnce({ data: mockGitHubIssue });

      const issue = await client.updateIssue('owner/repo', '1', {
        title: 'Updated Issue',
        description: 'New Description',
        state: 'closed',
        labels: ['feature']
      });

      // @ts-ignore
      expect(mockOctokit.rest.issues.update.mock.calls[0][0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        title: 'Updated Issue',
        body: 'New Description',
        state: 'closed',
        labels: ['feature']
      });

      expect(issue).toEqual({
        id: '1',
        title: 'Updated Issue',
        description: 'New Description',
        state: {
          id: 'closed',
          name: 'Closed'
        },
        labels: [{
          id: 'feature',
          name: 'feature',
          color: '#00ff00'
        }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          provider: 'github',
          externalId: '1'
        }
      });
    });
  });

  describe('deleteIssue', () => {
    test('should close GitHub issue', async () => {
      // @ts-ignore
      mockOctokit.rest.issues.update.mockResolvedValueOnce({ data: {} });

      await client.deleteIssue('owner/repo', '1');

      // @ts-ignore
      expect(mockOctokit.rest.issues.update.mock.calls[0][0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        state: 'closed'
      });
    });
  });

  describe('getLabels', () => {
    test('should list and map GitHub labels', async () => {
      const mockGitHubLabels = [
        { id: 1, name: 'bug', color: 'ff0000', description: 'Bug label' },
        { id: 2, name: 'feature', color: '00ff00' }
      ];

      // @ts-ignore
      mockOctokit.rest.issues.listLabelsForRepo.mockResolvedValueOnce({ data: mockGitHubLabels });

      const labels = await client.getLabels('owner/repo');
      expect(labels).toEqual([
        {
          id: '1',
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label'
        },
        {
          id: '2',
          name: 'feature',
          color: '#00ff00'
        }
      ]);
    });
  });

  describe('getStates', () => {
    test('should return GitHub states', async () => {
      const states = await client.getStates('owner/repo');
      expect(states).toEqual([
        { id: 'open', name: 'Open' },
        { id: 'closed', name: 'Closed' }
      ]);
    });
  });

  describe('createLabel', () => {
    test('should create GitHub label', async () => {
      const mockGitHubLabel = {
        id: 1,
        name: 'new-label',
        color: 'ff0000',
        description: 'New label'
      };

      // @ts-ignore
      mockOctokit.rest.issues.createLabel.mockResolvedValueOnce({ data: mockGitHubLabel });

      const label = await client.createLabel('owner/repo', {
        name: 'new-label',
        color: '#ff0000',
        description: 'New label'
      });

      // @ts-ignore
      expect(mockOctokit.rest.issues.createLabel.mock.calls[0][0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        name: 'new-label',
        color: 'ff0000',
        description: 'New label'
      });

      expect(label).toEqual({
        id: '1',
        name: 'new-label',
        color: '#ff0000',
        description: 'New label'
      });
    });

    test('should handle label creation with minimal fields', async () => {
      const mockGitHubLabel = {
        id: 1,
        name: 'minimal-label',
        color: '000000'
      };

      // @ts-ignore
      mockOctokit.rest.issues.createLabel.mockResolvedValueOnce({ data: mockGitHubLabel });

      const label = await client.createLabel('owner/repo', {
        name: 'minimal-label'
      });

      // @ts-ignore
      expect(mockOctokit.rest.issues.createLabel.mock.calls[0][0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        name: 'minimal-label',
        color: '000000'
      });

      expect(label).toEqual({
        id: '1',
        name: 'minimal-label',
        color: '#000000'
      });
    });
  });
});
