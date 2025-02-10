import {
  PlaneClient,
  PlaneIssue,
  PlaneIssueProperty,
  PlaneIssuePropertyValue,
} from '../clients/plane-client';

describe('PlaneClient', () => {
  let client: PlaneClient;
  let fetchMock: jest.Mock;

  const mockIssueTypes = [{ id: 'type-1' }];
  const mockIssueProperties: PlaneIssueProperty[] = [
    {
      id: 'prop-1',
      name: 'external_id',
      display_name: 'External ID',
      property_type: 'text',
      default_value: '123',
      description: 'External identifier',
    },
  ];
  const mockPropertyValues: PlaneIssuePropertyValue[] = [
    {
      id: 'val-1',
      name: 'external_id',
      description: 'External ID value',
      sort_order: 1,
      is_active: true,
      is_default: true,
      external_id: '123',
    },
  ];

  const mockPlaneIssue: PlaneIssue = {
    id: 'issue-1',
    name: 'Issue 1',
    description: 'Description 1',
    state: {
      id: 'state-1',
      name: 'Todo',
      color: '#ff0000',
      description: 'Todo state',
    },
    labels: [
      {
        id: 'label-1',
        name: 'bug',
        color: '#ff0000',
        description: 'Bug label',
      },
    ],
    assignee_ids: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    metadata: {
      stateId: 'state-1',
      externalId: '123',
      provider: 'plane',
    },
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    client = new PlaneClient('http://plane.org', 'test-token');

    // Setup default mock responses
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/issues/')) {
        // Check if it's a single issue request (ends with issue ID)
        if (url.match(/\/issues\/[^/]+\/?$/)) {
          return {
            ok: true,
            json: () => Promise.resolve(mockPlaneIssue),
          };
        }
        // Check if it's an issue list request
        if (!url.includes('/issue-types/') && !url.includes('/issue-properties/')) {
          if (options?.method === 'POST') {
            return {
              ok: true,
              json: () => Promise.resolve(mockPlaneIssue),
            };
          }
          if (options?.method === 'PATCH') {
            return {
              ok: true,
              json: () => Promise.resolve(mockPlaneIssue),
            };
          }
          if (options?.method === 'DELETE') {
            return {
              ok: true,
              json: () => Promise.resolve({}),
            };
          }
          return {
            ok: true,
            json: () => Promise.resolve([mockPlaneIssue]),
          };
        }
      }
      if (url.includes('/issue-types/')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockIssueTypes),
        };
      }
      if (url.includes('/issue-properties/') && !url.includes('/values/')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockIssueProperties),
        };
      }
      if (url.includes('/values/')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockPropertyValues),
        };
      }
      if (url.includes('/labels/')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'label-1',
                name: 'bug',
                color: '#ff0000',
                description: 'Bug label',
              },
            ]),
        };
      }
      if (url.includes('/states/')) {
        return {
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'state-1',
                name: 'Todo',
                color: '#ff0000',
                description: 'Todo state',
              },
            ]),
        };
      }
      return {
        ok: true,
        json: () => Promise.resolve({}),
      };
    });
  });

  describe('project reference parsing', () => {
    test('should parse valid project reference', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.listIssues('workspace-1/project-1');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://plane.org/api/v1/workspaces/workspace-1/projects/project-1/issues/',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    test('should throw error for invalid project reference', async () => {
      await expect(client.listIssues('invalid')).rejects.toThrow('Invalid workspace ID: invalid');
    });
  });

  describe('listIssues', () => {
    test('should list and map Plane issues', async () => {
      const issues = await client.listIssues('workspace-1/project-1');
      expect(issues[0]).toEqual({
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'state-1',
          name: 'Todo',
          color: '#ff0000',
          description: 'Todo state',
        },
        labels: [
          {
            id: 'label-1',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          stateId: 'state-1',
          externalId: '123',
          provider: 'plane',
        },
      });
    });
  });

  describe('getIssue', () => {
    test('should get and map single Plane issue', async () => {
      const issue = await client.getIssue('workspace-1/project-1', 'issue-1');
      expect(issue).toEqual({
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'state-1',
          name: 'Todo',
          color: '#ff0000',
          description: 'Todo state',
        },
        labels: [
          {
            id: 'label-1',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          stateId: 'state-1',
          externalId: '123',
          provider: 'plane',
        },
      });
    });
  });

  describe('createIssue', () => {
    test('should create Plane issue with all fields', async () => {
      const issue = await client.createIssue('workspace-1/project-1', {
        title: 'New Issue',
        description: 'New Description',
        state: {
          id: 'state-1',
          name: 'Todo',
        },
        labels: ['label-1'],
        metadata: {
          externalId: '123',
          provider: 'plane',
        },
      });

      expect(issue).toEqual({
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'state-1',
          name: 'Todo',
          color: '#ff0000',
          description: 'Todo state',
        },
        labels: [
          {
            id: 'label-1',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          stateId: 'state-1',
          externalId: '123',
          provider: 'plane',
        },
      });
    });
  });

  describe('updateIssue', () => {
    test('should update Plane issue with changed fields', async () => {
      const issue = await client.updateIssue('workspace-1/project-1', 'issue-1', {
        title: 'Updated Issue',
        description: 'Updated Description',
        state: {
          id: 'state-2',
          name: 'Done',
        },
        labels: ['label-2'],
        metadata: {
          externalId: '456',
          provider: 'plane',
        },
      });

      expect(issue).toEqual({
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Description 1',
        state: {
          id: 'state-1',
          name: 'Todo',
          color: '#ff0000',
          description: 'Todo state',
        },
        labels: [
          {
            id: 'label-1',
            name: 'bug',
            color: '#ff0000',
            description: 'Bug label',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        metadata: {
          stateId: 'state-1',
          externalId: '123',
          provider: 'plane',
        },
      });
    });
  });

  describe('deleteIssue', () => {
    test('should delete Plane issue', async () => {
      await expect(client.deleteIssue('workspace-1/project-1', 'issue-1')).resolves.not.toThrow();
    });
  });

  describe('getLabels', () => {
    test('should list and map Plane labels', async () => {
      const labels = await client.getLabels('workspace-1/project-1');
      expect(labels).toEqual([
        {
          id: 'label-1',
          name: 'bug',
          color: '#ff0000',
          description: 'Bug label',
        },
      ]);
    });
  });

  describe('getStates', () => {
    test('should list and map Plane states', async () => {
      const states = await client.getStates('workspace-1/project-1');
      expect(states).toEqual([
        {
          id: 'state-1',
          name: 'Todo',
          color: '#ff0000',
          description: 'Todo state',
        },
      ]);
    });
  });

  describe('createLabel', () => {
    test('should create Plane label with all fields', async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'label-1',
            name: 'new-label',
            color: '#ff0000',
            description: 'New label',
          }),
      }));

      const label = await client.createLabel('workspace-1/project-1', {
        name: 'new-label',
        color: '#ff0000',
        description: 'New label',
      });

      expect(label).toEqual({
        id: 'label-1',
        name: 'new-label',
        color: '#ff0000',
        description: 'New label',
      });
    });

    test('should handle label creation with minimal fields', async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'label-1',
            name: 'minimal-label',
            color: '#000000',
          }),
      }));

      const label = await client.createLabel('workspace-1/project-1', {
        name: 'minimal-label',
      });

      expect(label).toEqual({
        id: 'label-1',
        name: 'minimal-label',
        color: '#000000',
      });
    });
  });

  describe('error handling', () => {
    test('should handle API errors', async () => {
      fetchMock.mockImplementationOnce(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      await expect(client.listIssues('workspace-1/project-1')).rejects.toThrow(
        'Plane API error: 404 Not Found'
      );
    });

    test('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.listIssues('workspace-1/project-1')).rejects.toThrow('Network error');
    });

    test('should handle invalid workspace ID', async () => {
      await expect(client.listIssues('test')).rejects.toThrow('Invalid workspace ID: test');
    });
  });
});
