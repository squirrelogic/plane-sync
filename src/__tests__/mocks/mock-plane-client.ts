import {
  IssueTrackingClient,
  BaseIssue,
  BaseLabel,
  BaseState,
  CreateIssueData,
  UpdateIssueData,
  CreateLabelData,
} from '../../clients/base-client.js';
import { PlaneLabel } from '../../clients/plane-client.js';

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
    this.createLabel.mockImplementation(
      (projectRef: string, data: CreateLabelData): Promise<PlaneLabel> => {
        const labelId = 'label-' + Math.random().toString(36).substring(7);
        return Promise.resolve({
          id: labelId,
          name: data.name,
          color: data.color || '#000000',
          description: data.description,
          sort_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          project: projectRef.split('/')[1],
          workspace: projectRef.split('/')[0],
        });
      }
    );
  }
}
