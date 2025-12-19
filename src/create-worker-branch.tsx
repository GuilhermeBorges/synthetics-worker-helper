import {
    Action,
    ActionPanel,
    Form,
    getPreferenceValues,
    openExtensionPreferences,
    popToRoot,
    showHUD,
    showToast,
    Toast,
  } from "@raycast/api";
  import { useState } from "react";
  import { exec } from "child_process";
  import util from "util";
  
  const asyncExec = util.promisify(exec);
  
  const JIRA_PREFIX = "SYNTH-";
  
  type BaseBranch = "prod" | "current";
  
  interface FormValues {
    jiraId: string;
    description: string;
    baseBranch: BaseBranch;
  }
  
  function normalizeJiraId(input: string): string {
    const trimmed = String(input || "").trim();
    if (!trimmed) return JIRA_PREFIX;

    // Accept: "1234", "SYNTH-1234", "synth1234", "SYNTH1234", "SYNTH-"
    let rest = trimmed;
    const prefixRe = /^synth-?/i;
    if (prefixRe.test(rest)) rest = rest.replace(prefixRe, "");

    rest = rest.replace(/^\s*-?\s*/g, ""); // remove leading '-' and spaces
    rest = rest.replace(/\s+/g, ""); // remove inner spaces

    return `${JIRA_PREFIX}${rest}`;
  }

  function sanitizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric -> -
      .replace(/^-+|-+$/g, ""); // trim leading/trailing -
  }
  
  async function createBranch({
    jiraId,
    description,
    baseBranch,
    workerDir,
    gitUsername,
  }: FormValues & { workerDir: string; gitUsername: string }) {
    const sanitizedDesc = sanitizeDescription(description);
    const branchName = `${gitUsername}/${jiraId}/${sanitizedDesc}`;
  
    const opts = { cwd: workerDir };
  
    if (baseBranch === "prod") {
      await asyncExec("git checkout prod", opts);
      await asyncExec("git pull", opts);
    }
  
    await asyncExec(`git checkout -b "${branchName}"`, opts);
  
    return branchName;
  }
  
  export default function Command() {
    const [jiraIdInput, setJiraIdInput] = useState<string>(JIRA_PREFIX);

    async function handleSubmit(values: Form.Values) {
      const { workerDir, gitUsername } = getPreferenceValues<{ workerDir: string; gitUsername: string }>();

      const jiraId = normalizeJiraId(String(values.jiraId || ""));
      const description = String(values.description || "").trim();
      const baseBranch = (values.baseBranch as BaseBranch) || "prod";

      const normalizedWorkerDir = String(workerDir || "").trim();
      const normalizedGitUsername = String(gitUsername || "").trim().replace(/\s+/g, "");

      if (!normalizedWorkerDir || !normalizedGitUsername) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Missing Preferences",
          message: "Set Worker Directory and Git Username in extension preferences.",
        });
        await openExtensionPreferences();
        return;
      }
  
      if (jiraId === JIRA_PREFIX) {
        await showToast({
          style: Toast.Style.Failure,
          title: "JIRA ID is required",
        });
        return;
      }
  
      if (!/^SYNTH-\d+$/i.test(jiraId)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid JIRA ID",
          message: 'Use the format "SYNTH-1234"',
        });
        return;
      }

      if (!description) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Description is required",
        });
        return;
      }
  
      try {
        await showToast({
          style: Toast.Style.Animated,
          title: "Creating branch…",
        });
  
        const branchName = await createBranch({
          jiraId,
          description,
          baseBranch,
          workerDir: normalizedWorkerDir,
          gitUsername: normalizedGitUsername,
        });
  
        await showHUD(`✅ Created branch: ${branchName}`);
        await popToRoot();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error && "stderr" in error
              ? String((error as { stderr?: unknown }).stderr)
              : String(error);
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to create branch",
          message,
        });
      }
    }
  
    return (
      <Form
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Create Branch" onSubmit={handleSubmit} />
          </ActionPanel>
        }
      >
        <Form.TextField
          id="jiraId"
          title="JIRA ID"
          value={jiraIdInput}
          onChange={(v) => setJiraIdInput(normalizeJiraId(v))}
          placeholder="1234"
        />
        <Form.TextField
          id="description"
          title="Description"
          placeholder="short description, e.g. retry-backoff"
        />
        <Form.Dropdown id="baseBranch" title="Base Branch" defaultValue="prod">
          <Form.Dropdown.Item value="prod" title="prod" />
          <Form.Dropdown.Item value="current" title="current (stay on current branch)" />
        </Form.Dropdown>
      </Form>
    );
  }