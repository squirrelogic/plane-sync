import {
  IssueTrackingClient,
  BaseIssue,
  BaseLabel,
  BaseState,
  CreateIssueData,
  UpdateIssueData,
  CreateLabelData,
} from '../../clients/base-client.js';
import { PlaneClient, PlaneIssueProperty } from '../../clients/plane-client.js';

export class MockPlaneClient extends PlaneClient implements jest.Mocked<PlaneClient> {
  listIssues = jest.fn<Promise<BaseIssue[]>, [string]>();
  getIssue = jest.fn<Promise<BaseIssue>, [string, string]>();
  createIssue = jest.fn<Promise<BaseIssue>, [string, CreateIssueData]>();
  updateIssue = jest.fn<Promise<BaseIssue>, [string, string, UpdateIssueData]>();
  deleteIssue = jest.fn<Promise<void>, [string, string]>();
  getLabels = jest.fn<Promise<BaseLabel[]>, [string]>();
  getStates = jest.fn<Promise<BaseState[]>, [string]>();
  createLabel = jest.fn<Promise<BaseLabel>, [string, CreateLabelData]>();
  updateLabel = jest.fn<Promise<BaseLabel>, [string, string, Partial<BaseLabel>]>();
  getProperties = jest.fn<Promise<PlaneIssueProperty[]>, [string]>();

  constructor() {
    super('http://mock.plane.org', 'mock-api-key');
    this.listIssues.mockResolvedValue([]);
    this.getIssue.mockResolvedValue({
      id: '1',
      title: 'Test Issue',
      description: 'Test Description',
      state: { id: 'open', name: 'Open' },
      labels: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.getLabels.mockResolvedValue([]);
    this.getStates.mockResolvedValue([]);
    this.getProperties.mockResolvedValue([]);
  }
}
