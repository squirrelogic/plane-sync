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

  async addIssueToProject(issueNumber: number): Promise<void> {
    // Get the project ID
    const projectQuery = this.isOrgProject ? `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
          }
        }
      }
    ` : `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          projectV2(number: $number) {
            id
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

    const projectResponse = await this.octokit.graphql<any>(projectQuery, variables);
    const projectId = this.isOrgProject
      ? projectResponse.organization.projectV2.id
      : projectResponse.repository.projectV2.id;

    // Get the issue node ID
    const { data: issue } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    // Add the issue to the project
    const addToProjectMutation = `
      mutation($input: AddProjectV2ItemByIdInput!) {
        addProjectV2ItemById(input: $input) {
          item {
            id
          }
        }
      }
    `;

    await this.octokit.graphql(addToProjectMutation, {
      input: {
        projectId: projectId,
        contentId: issue.node_id
      }
    });
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
      assignees: [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    }));
  }

  async createIssue(issue: Issue): Promise<{ id: string }> {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: issue.title,
      body: issue.description || '',
      state: issue.state as 'open' | 'closed',
      labels: issue.labels || []
    });

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { id: data.number.toString() };
  }

  async updateIssue(issueNumber: string, issue: Issue): Promise<void> {
    try {
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: parseInt(issueNumber),
        title: issue.title,
        body: issue.description || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels || []
      });

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      if (error.status === 500) {
        console.warn(`Warning: GitHub API error when updating issue #${issueNumber}. Will retry in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry once
        await this.octokit.issues.update({
          owner: this.owner,
          repo: this.repo,
          issue_number: parseInt(issueNumber),
          title: issue.title,
          body: issue.description || '',
          state: issue.state as 'open' | 'closed',
          labels: issue.labels || []
        });
      } else {
        throw error;
      }
    }
  }

  async createIssueOnly(title: string, body: string): Promise<number> {
    const { data: issue } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body
    });
    return issue.number;
  }

  private generateHash(issue: any): string {
    return objectHash({
      title: issue.title,
      description: issue.body || '',
      state: issue.state,
      labels: issue.labels.map((label: { name?: string } | string) =>
        typeof label === 'string' ? label : label.name || ''
      ) || []
    });
  }

  async updateProjectItemStatus(itemId: string, status: string): Promise<void> {
    // Get the project ID and status field ID
    const projectQuery = this.isOrgProject ? `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
                options {
                  id
                  name
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
            field(name: "Status") {
              ... on ProjectV2SingleSelectField {
                id
                options {
                  id
                  name
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

    const projectResponse = await this.octokit.graphql<any>(projectQuery, variables);
    const project = this.isOrgProject ? projectResponse.organization.projectV2 : projectResponse.repository.projectV2;
    const statusField = project.field;
    const statusOption = statusField.options.find((opt: any) => opt.name.toUpperCase() === status.toUpperCase());

    if (!statusOption) {
      console.warn(`Warning: Could not find status option "${status}" in project`);
      return;
    }

    // Update the status
    const updateMutation = `
      mutation($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await this.octokit.graphql(updateMutation, {
      input: {
        projectId: project.id,
        itemId: itemId,
        fieldId: statusField.id,
        value: {
          singleSelectOptionId: statusOption.id
        }
      }
    });
  }

  public mapPlaneStateToProjectStatus(state: string): string {
    // Map Plane states to GitHub project statuses
    switch (state.toLowerCase()) {
      case 'completed':
      case 'cancelled':
        return 'Done';
      case 'in_progress':
        return 'In Progress';
      case 'backlog':
        return 'Backlog';
      default:
        return 'Ready';
    }
  }
}
