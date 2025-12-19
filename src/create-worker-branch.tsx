import {
    Action,
    ActionPanel,
    Form,
    popToRoot,
    showHUD,
    showToast,
    Toast,
  } from "@raycast/api";
  import { exec } from "child_process";
  import util from "util";
  
  const asyncExec = util.promisify(exec);
  
  const WORKER_DIR =
    "/Users/guilherme.oliveira/go/src/github.com/DataDog/synthetics-worker/packages/synthetics/worker";
  
  type BaseBranch = "prod" | "current";
  
  interface FormValues {
    jiraId: string;
    description: string;
    baseBranch: BaseBranch;
  }
  
  function sanitizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric -> -
      .replace(/^-+|-+$/g, ""); // trim leading/trailing -
  }
  
  async function createBranch({ jiraId, description, baseBranch }: FormValues) {
    const sanitizedDesc = sanitizeDescription(description);
    const branchName = `guilherme.oliveira/${jiraId}/${sanitizedDesc}`;
  
    const opts = { cwd: WORKER_DIR };
  
    if (baseBranch === "prod") {
      await asyncExec("git checkout prod", opts);
      await asyncExec("git pull", opts);
    }
  
    await asyncExec(`git checkout -b "${branchName}"`, opts);
  
    return branchName;
  }
  
  export default function Command() {
    async function handleSubmit(values: Form.Values) {
      const jiraId = String(values.jiraId || "").trim();
      const description = String(values.description || "").trim();
      const baseBranch = (values.baseBranch as BaseBranch) || "prod";
  
      if (!jiraId) {
        await showToast({
          style: Toast.Style.Failure,
          title: "JIRA ID is required",
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
  
        const branchName = await createBranch({ jiraId, description, baseBranch });
  
        await showHUD(`✅ Created branch: ${branchName}`);
        await popToRoot();
      } catch (error: any) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to create branch",
          message: error?.stderr || error?.message || String(error),
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
        <Form.TextField id="jiraId" title="JIRA ID" placeholder="SYNTH-1234" />
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