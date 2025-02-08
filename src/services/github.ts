import { Octokit } from '@octokit/rest';
import { Issue, ProjectItem } from '../types';
import objectHash from 'object-hash';

interface GraphQLResponse {
  repository?: {
    projectV2?: {
      id: string;
      items: {
        nodes: Array<{
          id: string;
          content: {
            title: string;
            body?: string;
            number?: number;
          };
          fieldValues: {
            nodes: Array<{
              name?: string;
            }>;
          };
        }>;
      };
    };
  };
  organization?: {
    projectV2?: {
      id: string;
      items: {
        nodes: Array<{
          id: string;
          content: {
            title: string;
            body?: string;
            number?: number;
          };
          fieldValues: {
            nodes: Array<{
              name?: string;
            }>;
          };
        }>;
      };
    };
  };
}

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private projectNumber: number;
  private isOrgProject: boolean;

  constructor(token: string, owner: string, repo: string, projectNumber: number, isOrgProject: boolean) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.projectNumber = projectNumber;
    this.isOrgProject = isOrgProject;
  }

  async getProjectItems(): Promise<ProjectItem[]> {
    const projectQuery = this.isOrgProject ? `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            items(first: 100) {
              nodes {
                id
                content {
                  ... on DraftIssue {
                    title
                    body
                  }
                  ... on Issue {
                    title
                    body
                    number
                  }
                }
                fieldValues(first: 8) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    ` : `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          projectV2(number: $number) {
            id
            items(first: 100) {
              nodes {
                id
                content {
                  ... on DraftIssue {
                    title
                    body
                  }
                  ... on Issue {
                    title
                    body
                    number
                  }
                }
                fieldValues(first: 8) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = this.isOrgProject ? {
      owner: this.owner,
      number: this.projectNumber
    } : {
      owner: this.owner,
      repo: this.repo,
      number: this.projectNumber
    };

    const response = await this.octokit.graphql<GraphQLResponse>(projectQuery, variables);
    const project = this.isOrgProject ? response.organization?.projectV2 : response.repository?.projectV2;

    if (!project) {
      throw new Error('Project not found');
    }

    return project.items.nodes.map(item => ({
      id: item.id,
      title: item.content.title,
      body: item.content.body || '',
      status: this.getStatusFromFieldValues(item.fieldValues.nodes),
      convertedToIssue: !!item.content.number,
      issueNumber: item.content.number
    }));
  }

  private getStatusFromFieldValues(fieldValues: any[]): ProjectItem['status'] {
    const statusValue = fieldValues.find(v => v?.name)?.name?.toUpperCase();
    switch (statusValue) {
      case 'READY':
      case 'IN_PROGRESS':
      case 'DONE':
        return statusValue;
      default:
        return 'BACKLOG';
    }
  }

  async convertToIssue(projectItemId: string, title: string, body: string): Promise<number> {
    // Create the issue
    const { data: issue } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body
    });

    // Link the issue to the project item using GraphQL
    const linkMutation = `
      mutation($projectId: ID!, $itemId: ID!, $issueId: ID!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: "ISSUE"
          value: { issueId: $issueId }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await this.octokit.graphql(linkMutation, {
      projectId: projectItemId,
      itemId: projectItemId,
      issueId: issue.node_id
    });

    return issue.number;
  }

  async getIssues(): Promise<Issue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all'
    });

    return data.map(issue => ({
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      state: issue.state,
      labels: issue.labels.map(label => typeof label === 'string' ? label : label.name || ''),
      assignees: issue.assignees?.map(assignee => assignee.login) || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    }));
  }

  async updateIssue(issueNumber: string, issue: Partial<Issue>): Promise<void> {
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(issueNumber),
      title: issue.title,
      body: issue.description,
      state: issue.state as 'open' | 'closed',
      labels: issue.labels,
      assignees: issue.assignees
    });
  }

  private generateHash(issue: any): string {
    return objectHash({
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels,
      assignees: issue.assignees
    });
  }
}
