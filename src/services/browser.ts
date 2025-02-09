import puppeteer, { Page } from 'puppeteer';

interface WorkspaceResponse {
  members: Array<{
    id: string;
    member_id: string;
    member__display_name: string;
    member__avatar: string;
    member__avatar_url: string;
  }>;
}

interface InputElement {
  type: string;
  id: string;
  name: string;
  class: string;
}

export class BrowserService {
  private email: string;
  private password: string;
  private baseUrl: string;
  private workspaceSlug: string;
  private projectSlug: string;

  constructor(
    email: string,
    password: string,
    baseUrl: string,
    workspaceSlug: string,
    projectSlug: string
  ) {
    this.email = email;
    this.password = password;
    this.baseUrl = baseUrl;
    this.workspaceSlug = workspaceSlug;
    this.projectSlug = projectSlug;
  }

  async getWorkspaceMembers(): Promise<WorkspaceResponse['members']> {
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: null
    });

    try {
      const page = await browser.newPage();

      // Navigate to login page
      await page.goto(this.baseUrl, { waitUntil: 'networkidle0' });

      // Wait for the page to be fully loaded
      await page.waitForSelector('body');

      // Find and fill email input
      const emailInput = await page.evaluate(() => {
        const selectors = [
          'input[type="email"]',
          'input[name="email"]',
          '#email',
          'input[placeholder*="email" i]',
          'input[placeholder*="mail" i]'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return { selector, found: true };
          }
        }
        return { selector: null, found: false };
      });

      if (!emailInput.selector) {
        throw new Error('Could not find email input field');
      }

      await page.type(emailInput.selector, this.email);
      await page.keyboard.press('Enter');

      // Wait for network to be idle after email submission
      await page.waitForNetworkIdle();

      // Find and fill password input
      const passwordInput = await page.evaluate(() => {
        const selectors = [
          'input[type="password"]',
          'input[name="password"]',
          '#password',
          'input[placeholder*="password" i]'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return { selector, found: true };
          }
        }
        return { selector: null, found: false };
      });

      if (!passwordInput.selector) {
        throw new Error('Could not find password input field');
      }

      await page.type(passwordInput.selector, this.password);
      await page.keyboard.press('Enter');

      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });

      // Fetch workspace data
      const members = await page.evaluate(
        async (workspace: string, project: string) => {
          const resp = await fetch(`/api/workspaces/${workspace}/projects/${project}/`);
          if (!resp.ok) {
            throw new Error(`Failed to fetch members: ${resp.statusText}`);
          }
          const data = await resp.json() as WorkspaceResponse;
          return data.members;
        },
        this.workspaceSlug,
        this.projectSlug
      );

      return members;
    } catch (error) {
      console.error('Error fetching workspace members:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
