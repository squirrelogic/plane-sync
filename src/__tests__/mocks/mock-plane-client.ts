import { IssueTrackingClient, BaseIssue, BaseLabel, BaseState, CreateIssueData, UpdateIssueData, CreateLabelData } from '../../clients/base-client';

export class MockPlaneClient implements IssueTrackingClient {
  listIssues = jest.fn();
  getIssue = jest.fn();
  createIssue = jest.fn();
  updateIssue = jest.fn();
  deleteIssue = jest.fn();
  getLabels = jest.fn();
  getStates = jest.fn();
  createLabel = jest.fn();

  constructor() {
    // Set up default mock implementations
    this.createLabel.mockImplementation((projectRef: string, data: CreateLabelData): Promise<BaseLabel> => {
      return Promise.resolve({
        id: 'label-' + data.name,
        name: data.name,
        color: data.color,
        description: data.description
      });
    });
  }
}
