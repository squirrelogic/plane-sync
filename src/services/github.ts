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

interface ProjectV2ItemFieldValue {
  id: string;
  name: string;
  optionId?: string;
}

interface ProjectV2Field {
  id: string;
  name: string;
  options: Array<{
    id: string;
    name: string;
  }>;
}

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private projectNumber: number;
  private isOrgProject: boolean;
  private statusFieldId?: string;
  private statusOptions: Map<string, string> = new Map(); // name to id mapping

  constructor(token: string, owner: string, repo: string, projectNumber: number, isOrgProject: boolean) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.projectNumber = projectNumber;
    this.isOrgProject = isOrgProject;
  }

  private async initializeProjectFields(): Promise<void> {
    if (this.statusFieldId) return;

    const query = this.isOrgProject ? `
      query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) {
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

    const response = await this.octokit.graphql<any>(query, variables);
    const field = this.isOrgProject
      ? response.organization?.projectV2?.field
      : response.repository?.projectV2?.field;

    if (!field) {
      throw new Error('Could not find Status field in project');
    }

    this.statusFieldId = field.id;
    field.options.forEach((option: { id: string; name: string }) => {
      this.statusOptions.set(option.name.toLowerCase(), option.id);
    });
  }

  public async getStatusOptionId(statusName: string): Promise<string> {
    await this.initializeProjectFields();
    const optionId = this.statusOptions.get(statusName.toLowerCase());
    if (!optionId) {
      throw new Error(`Unknown status: ${statusName}`);
    }
    return optionId;
  }

  public async getStatusNameById(optionId: string): Promise<string> {
    await this.initializeProjectFields();
    for (const [name, id] of this.statusOptions.entries()) {
      if (id === optionId) return name;
    }
    return 'backlog'; // default fallback
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
    // Get all issues from the repository
    const issues = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all'
    });

    // Get all project items to map their states
    const projectItems = await this.getProjectItems();
    const issueToProjectItem = new Map(projectItems.map(item => [item.issueNumber, item]));

    return issues.data
      .filter(issue => !issue.pull_request) // Filter out PRs
      .map(issue => {
        const projectItem = issueToProjectItem.get(issue.number);
        const stateName = projectItem?.status || (issue.state === 'closed' ? 'DONE' : 'TODO');
        return {
          id: issue.number.toString(),
          title: issue.title,
          description: issue.body || '',
          state: {
            id: '',
            name: stateName
          },
          labels: issue.labels.map((label: any) => label.name),
          // Deduplicate assignees
          assignees: [...new Set(issue.assignees?.map(assignee => assignee.login) || [])],
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          hash: this.generateHash(issue)
        };
      });
  }

  async getIssue(issueId: string): Promise<Issue> {
    // Get the issue from the repository
    const response = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(issueId)
    });

    const issue = response.data;
    if (issue.pull_request) {
      throw new Error('Issue is a pull request');
    }

    // Get project item state if available
    const projectItems = await this.getProjectItems();
    const projectItem = projectItems.find(item => item.issueNumber === parseInt(issueId));
    const stateName = projectItem?.status || (issue.state === 'closed' ? 'DONE' : 'TODO');

    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      state: {
        id: '',
        name: stateName
      },
      labels: issue.labels.map((label: any) => label.name),
      // Deduplicate assignees
      assignees: [...new Set(issue.assignees?.map(assignee => assignee.login) || [])],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    };
  }

  async createIssue(issue: Issue): Promise<Issue> {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title: issue.title,
      body: issue.description || '',
      state: issue.state.name as 'open' | 'closed',
      labels: issue.labels || [],
      // Deduplicate assignees
      assignees: [...new Set(issue.assignees || [])]
    });

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Set the project status if we have a valid status ID
    if (issue.state.id) {
      await this.updateProjectItemStatus(data.node_id, issue.state.id);
    }

    return {
      id: data.number.toString(),
      title: data.title,
      description: data.body || '',
      state: {
        id: '',
        name: data.state
      },
      labels: data.labels.map((label: any) => label.name),
      // Deduplicate assignees
      assignees: [...new Set(data.assignees?.map(assignee => assignee.login) || [])],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      hash: this.generateHash(data)
    };
  }

  async updateIssue(issueNumber: string, issue: Issue): Promise<Issue> {
    try {
      // First update the basic issue properties
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: parseInt(issueNumber),
        title: issue.title,
        body: issue.description || '',
        state: issue.state.name.toLowerCase() === 'closed' ? 'closed' : 'open',
        labels: issue.labels || [],
        // Deduplicate assignees
        assignees: [...new Set(issue.assignees || [])]
      });

      // Then update the project status
      const { data: updatedIssue } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: parseInt(issueNumber)
      });

      // Map the state name to a project status
      const projectStatus = this.mapPlaneStateToProjectStatus(issue.state.name);
      await this.updateProjectItemStatus(updatedIssue.node_id, projectStatus);

      // Add a small delay to ensure changes are reflected
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the updated issue to return with its new hash
      return await this.getIssue(issueNumber);

    } catch (error: any) {
      if (error.status === 500) {
        console.warn(`Warning: GitHub API error when updating issue #${issueNumber}. Will retry in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.updateIssue(issueNumber, issue);
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
    // Normalize the state name to match Plane's format
    const state = typeof issue.state === 'string'
      ? this.normalizeStateName(issue.state)
      : this.normalizeStateName(issue.state.name);

    return objectHash({
      title: issue.title,
      description: issue.body || '',
      state,
      labels: issue.labels.map((label: { name?: string } | string) =>
        typeof label === 'string' ? label : label.name || ''
      ) || [],
      assignees: issue.assignees?.map((assignee: { login: string }) => assignee.login) || []
    });
  }

  private normalizeStateName(state: string): string {
    switch (state.toLowerCase()) {
      case 'backlog':
        return 'BACKLOG';
      case 'todo':
        return 'TODO';
      case 'in progress':
        return 'IN_PROGRESS';
      case 'ready':
        return 'READY';
      case 'done':
      case 'cancelled':
      case 'closed':
        return 'DONE';
      default:
        return 'BACKLOG';
    }
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
      case 'done':
      case 'cancelled':
      case 'closed':
        return 'DONE';
      case 'in progress':
        return 'IN_PROGRESS';
      case 'todo':
        return 'TODO';
      case 'ready':
        return 'READY';
      case 'backlog':
      default:
        return 'BACKLOG';
    }
  }
}
