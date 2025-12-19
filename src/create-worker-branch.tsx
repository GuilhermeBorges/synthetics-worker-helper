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
  import { useEffect, useMemo, useRef, useState } from "react";
  import { exec } from "child_process";
  import util from "util";
  
  const asyncExec = util.promisify(exec);
  
  const DEFAULT_JIRA_BASE_URL = "https://datadoghq.atlassian.net";
  const DEFAULT_JIRA_PROJECT_KEY = "SYNTH";
  
  type BaseBranch = "prod" | "current";
  
  type JiraPreferences = {
    workerDir: string;
    gitUsername: string;
    jiraEmail?: string;
    jiraApiToken?: string;
    jiraDefaultProjectKey?: string;
  };

  interface FormValues {
    jira: string;
    jiraId: string;
    description: string;
    baseBranch: BaseBranch;
  }
  
  function normalizeJiraBaseUrl(input: string): string {
    const trimmed = String(input || "").trim();
    return trimmed.replace(/\/+$/g, "");
  }

  function normalizeProjectKey(input: string | undefined): string {
    const trimmed = String(input || "").trim();
    return (trimmed || DEFAULT_JIRA_PROJECT_KEY).toUpperCase();
  }

  function extractIssueKey(input: string): string | null {
    // Generic Jira issue key format: ABC-123
    const match = String(input || "").toUpperCase().match(/\b([A-Z][A-Z0-9_]+-\d+)\b/);
    return match?.[1] ?? null;
  }

  function isProbablyUrl(input: string): boolean {
    const trimmed = String(input || "").trim().toLowerCase();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
  }

  function normalizeJiraIdFromInput(input: string, defaultProjectKey: string): string {
    const trimmed = String(input || "").trim();
    if (!trimmed) return "";

    // If it's a URL, try extracting the issue key from it.
    if (isProbablyUrl(trimmed)) {
      const issueKey = extractIssueKey(trimmed);
      return issueKey ?? "";
    }

    // If user typed an issue key, accept it as-is.
    const issueKey = extractIssueKey(trimmed);
    if (issueKey) return issueKey;

    // Back-compat: if user typed only digits, prefix with default project key.
    const digits = trimmed.replace(/\s+/g, "");
    if (/^\d+$/.test(digits)) {
      return `${defaultProjectKey}-${digits}`;
    }

    return "";
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

  async function fetchJiraSummary(opts: {
    jiraId: string;
    jiraEmail: string;
    jiraApiToken: string;
  }): Promise<string> {
    const base = normalizeJiraBaseUrl(DEFAULT_JIRA_BASE_URL);
    const url = `${base}/rest/api/3/issue/${encodeURIComponent(opts.jiraId)}?fields=summary`;
    const auth = Buffer.from(`${opts.jiraEmail}:${opts.jiraApiToken}`).toString("base64");
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira request failed (${res.status}): ${text || res.statusText}`);
    }

    const json = (await res.json()) as { fields?: { summary?: string } };
    const summary = json.fields?.summary?.trim();
    if (!summary) throw new Error("Jira response missing fields.summary");
    return summary;
  }

  export default function Command() {
    const prefs = getPreferenceValues<JiraPreferences>();
    const defaultProjectKey = useMemo(() => normalizeProjectKey(prefs.jiraDefaultProjectKey), [prefs.jiraDefaultProjectKey]);

    const [jiraUrlInput, setJiraUrlInput] = useState<string>("");
    const [jiraIdInput, setJiraIdInput] = useState<string>("");
    const [jiraId, setJiraId] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [descriptionDirty, setDescriptionDirty] = useState<boolean>(false);
    const lastAutofilledJiraIdInputFromUrlRef = useRef<string>("");
    const lastAutofilledJiraIdRef = useRef<string>("");
    const lastAutofillErrorJiraIdRef = useRef<string>("");
    const autofillReqIdRef = useRef<number>(0);

    useEffect(() => {
      // If URL contains an issue key, auto-fill the Jira ID input (but don't fight the user).
      const fromUrl = normalizeJiraIdFromInput(jiraUrlInput, defaultProjectKey);
      if (fromUrl) {
        const lastAutofilled = lastAutofilledJiraIdInputFromUrlRef.current;
        if (!jiraIdInput || jiraIdInput === lastAutofilled) {
          lastAutofilledJiraIdInputFromUrlRef.current = fromUrl;
          setJiraIdInput(fromUrl);
        }
      }

      // Jira ID used by the command comes from the Jira ID input (which may have been auto-filled from URL).
      setJiraId(normalizeJiraIdFromInput(jiraIdInput, defaultProjectKey));
    }, [jiraUrlInput, jiraIdInput, defaultProjectKey]);

    useEffect(() => {
      // Auto-fill description from Jira summary when:
      // - we have a jiraId
      // - user hasn't manually edited the description
      // - we have creds configured (email + api token)
      if (!jiraId) return;
      // Only block auto-fill if the user already typed a non-empty description.
      // Some Raycast form behaviors can trigger onChange without meaningful user input.
      if (descriptionDirty && description.trim().length > 0) return;
      if (lastAutofilledJiraIdRef.current === jiraId && description) return;

      // Read preferences at the time we run.
      const { jiraEmail, jiraApiToken } = getPreferenceValues<JiraPreferences>();
      const normalizedEmail = String(jiraEmail || "").trim();
      const normalizedToken = String(jiraApiToken || "").trim();
      if (!normalizedEmail || !normalizedToken) return;

      const reqId = ++autofillReqIdRef.current;
      const timer = setTimeout(async () => {
        try {
          const summary = await fetchJiraSummary({
            jiraId,
            jiraEmail: normalizedEmail,
            jiraApiToken: normalizedToken,
          });

          // Ignore stale responses.
          if (reqId !== autofillReqIdRef.current) return;

          lastAutofilledJiraIdRef.current = jiraId;
          lastAutofillErrorJiraIdRef.current = "";
          setDescription(summary);
        } catch (e) {
          // Show error once per Jira ID to avoid spam. User can still type description manually.
          if (lastAutofillErrorJiraIdRef.current === jiraId) return;
          lastAutofillErrorJiraIdRef.current = jiraId;
          const message = e instanceof Error ? e.message : String(e);
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to fetch Jira summary",
            message,
          });
        }
      }, 450);

      return () => clearTimeout(timer);
    }, [jiraId, descriptionDirty, description]);

    async function handleSubmit(values: Form.Values) {
      const { workerDir, gitUsername } = getPreferenceValues<JiraPreferences>();

      const rawJiraUrl = String(values.jiraUrl || "");
      const rawJiraId = String(values.jiraId || "");

      const normalizedFromUrl = normalizeJiraIdFromInput(rawJiraUrl, defaultProjectKey);
      const normalizedFromId = normalizeJiraIdFromInput(rawJiraId, defaultProjectKey);
      const normalizedJiraId = normalizedFromUrl || normalizedFromId;

      const normalizedDescription = String(values.description || "").trim();
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

      if (!normalizedJiraId) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Jira is required",
          message: "Paste a Jira URL (…/browse/ABC-123) or type an issue key (ABC-123).",
        });
        return;
      }
  
      if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(normalizedJiraId)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid JIRA ID",
          message: 'Use the format "ABC-123" or paste the Jira URL.',
        });
        return;
      }

      if (!normalizedDescription) {
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
          jira: rawJiraUrl || rawJiraId,
          jiraId: normalizedJiraId,
          description: normalizedDescription,
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
            <Action
              title="Open Extension Preferences"
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      >
        <Form.TextField
          id="jiraUrl"
          title="🔗 Paste Jira Link (auto-fill)"
          value={jiraUrlInput}
          onChange={setJiraUrlInput}
          placeholder="https://datadoghq.atlassian.net/browse/SYNTH-23559"
          info="Optional. Paste a Jira browse link to auto-fill the Jira ID field."
        />
        <Form.Separator />
        <Form.TextField
          id="jiraId"
          title="🏷️ Jira ID"
          value={jiraIdInput}
          onChange={setJiraIdInput}
          placeholder="SYNTH-23559 (or just 23559)"
          info="Issue key like SYNTH-23559. If you type only digits, we'll prefix the default project key."
        />
        <Form.TextField
          id="description"
          title="📝 Description"
          value={description}
          onChange={(v) => {
            setDescription(v);
            setDescriptionDirty(true);
          }}
          placeholder="Auto-filled from Jira summary (if Jira Email + API Token are configured)"
          info="Used to build the branch name suffix."
        />
        <Form.Dropdown id="baseBranch" title="🌿 Base Branch" defaultValue="prod" info="Branch to base from when creating a new branch.">
          <Form.Dropdown.Item value="prod" title="prod" />
          <Form.Dropdown.Item value="current" title="current (stay on current branch)" />
        </Form.Dropdown>
      </Form>
    );
  }