import {
  Action,
  ActionPanel,
  Icon,
  List,
  getPreferenceValues,
  openExtensionPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { exec } from "child_process";
import util from "util";

const asyncExec = util.promisify(exec);

type Preferences = {
  workerDir: string;
  gitUsername: string;
};

const GITLAB_PIPELINES_BASE_URL = "https://gitlab.ddbuild.io/DataDog/synthetics-worker/-/pipelines?page=1&scope=all";

type BranchInfo = {
  branch: string;
  date?: string;
  subject?: string;
  isCurrent: boolean;
};

function truncate(input: string | undefined, max: number): string {
  const s = String(input || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function prettifyBranchName(branch: string, gitUsername: string): string {
  let disp = branch;
  const normalizedUser = String(gitUsername || "").trim();
  if (normalizedUser) {
    const re = new RegExp(`^${normalizedUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`);
    disp = disp.replace(re, "@me/");
  }
  disp = disp.replace(/\//g, " › ");
  return disp;
}

async function loadBranches(workerDir: string): Promise<{ currentRef: string; branches: BranchInfo[] }> {
  const cwd = String(workerDir || "").trim();
  if (!cwd) {
    throw new Error("Missing workerDir preference.");
  }

  // Repo sanity
  await asyncExec("git rev-parse --git-dir", { cwd });

  const currentRef = (await asyncExec("git symbolic-ref --short -q HEAD || git rev-parse --short HEAD", { cwd })).stdout.trim();

  const out = (
    await asyncExec(
      "git for-each-ref --sort=-committerdate --format='%(refname:short)\t%(committerdate:short)\t%(subject)' refs/heads",
      { cwd },
    )
  ).stdout;

  const branches: BranchInfo[] = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const branch = (parts[0] || "").trim();
      const date = (parts[1] || "").trim();
      // Subject might contain tabs (rare), so re-join.
      const subject = parts.slice(2).join("\t").trim();
      return {
        branch,
        date,
        subject,
        isCurrent: branch === currentRef,
      } satisfies BranchInfo;
    })
    .filter((b) => b.branch.length > 0);

  return { currentRef, branches };
}

function pipelinesUrlForBranch(branch: string): string {
  return `${GITLAB_PIPELINES_BASE_URL}&ref=${encodeURIComponent(branch)}`;
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const workerDir = useMemo(() => String(prefs.workerDir || "").trim(), [prefs.workerDir]);
  const gitUsername = useMemo(() => String(prefs.gitUsername || "").trim(), [prefs.gitUsername]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentRef, setCurrentRef] = useState<string>("");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [error, setError] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("open-gitlab");
  const userInteractedRef = useRef<boolean>(false);
  const autoSelectedRef = useRef<boolean>(false);
  const autoSelectingRef = useRef<boolean>(false);

  async function reload() {
    setIsLoading(true);
    setError("");
    try {
      const res = await loadBranches(workerDir);
      setCurrentRef(res.currentRef);
      setBranches(res.branches);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setBranches([]);
      setCurrentRef("");

      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't read git branches",
        message: msg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [workerDir]);

  useEffect(() => {
    // Raycast can keep selection when new items appear; we only want to auto-select once,
    // and never "fight" the user when they navigate with the keyboard.
    if (!currentRef) {
      autoSelectedRef.current = false;
      return;
    }
    if (autoSelectedRef.current) return;
    if (userInteractedRef.current) return;
    // If the user already navigated somewhere else, don't override.
    if (selectedItemId !== "open-gitlab") return;

    autoSelectedRef.current = true;
    autoSelectingRef.current = true;
    setSelectedItemId("current-branch");
    const t = setTimeout(() => {
      autoSelectingRef.current = false;
    }, 150);
    return () => clearTimeout(t);
  }, [currentRef, selectedItemId]);

  const sortedBranches = useMemo(() => {
    const current = branches.filter((b) => b.isCurrent);
    const rest = branches.filter((b) => !b.isCurrent);
    return [...current, ...rest];
  }, [branches]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search branch…"
      navigationTitle="GitLab Pipelines — Synthetics Worker"
      isShowingDetail={false}
      selectedItemId={selectedItemId}
      onSelectionChange={(id) => {
        if (!id) return;
        // Raycast sometimes emits selection events on mount/load; only treat it as user interaction
        // if the selection actually changes and we're not in the middle of auto-selecting.
        if (autoSelectingRef.current) return;
        if (id === selectedItemId) return;
        userInteractedRef.current = true;
        setSelectedItemId(id);
      }}
    >
      <List.Section title="Quick Open">
        {currentRef ? (
          <List.Item
            id="current-branch"
            title="Pipelines for Current Branch"
            subtitle={currentRef}
            icon={Icon.Star}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Pipelines for Current Branch"
                  url={pipelinesUrlForBranch(currentRef)}
                  onOpen={() => void showHUD(`Opening pipelines for ${currentRef}…`)}
                />
                <Action.CopyToClipboard title="Copy URL" content={pipelinesUrlForBranch(currentRef)} />
                <Action
                  title="Reload Branches"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={reload}
                />
              </ActionPanel>
            }
          />
        ) : null}

        <List.Item
          id="open-gitlab"
          title="Open GitLab (no branch filter)"
          subtitle="Pipelines (all branches)"
          icon={Icon.Globe}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open GitLab (No Filter)"
                url={GITLAB_PIPELINES_BASE_URL}
                onOpen={() => void showHUD("Opening GitLab (no filter)…")}
              />
              <Action
                title="Reload Branches"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={reload}
              />
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />

        <List.Item
          id="pipelines-prod"
          title="Pipelines for prod"
          subtitle="prod"
          icon={Icon.Star}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Pipelines for Prod"
                url={pipelinesUrlForBranch("prod")}
                onOpen={() => void showHUD("Opening pipelines for prod…")}
              />
              <Action.CopyToClipboard title="Copy URL" content={pipelinesUrlForBranch("prod")} />
              <Action
                title="Reload Branches"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={reload}
              />
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />

        <List.Item
          id="pipelines-staging"
          title="Pipelines for staging"
          subtitle="staging"
          icon={Icon.Star}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Pipelines for Staging"
                url={pipelinesUrlForBranch("staging")}
                onOpen={() => void showHUD("Opening pipelines for staging…")}
              />
              <Action.CopyToClipboard title="Copy URL" content={pipelinesUrlForBranch("staging")} />
              <Action
                title="Reload Branches"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={reload}
              />
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section
        title="Local Branches"
        subtitle={
          error
            ? "failed to read repo"
            : sortedBranches.length
              ? `${sortedBranches.length}`
              : isLoading
                ? ""
                : "none found"
        }
      >
        {sortedBranches.map((b) => {
          const pretty = prettifyBranchName(b.branch, gitUsername);
          const title = b.isCurrent ? `★ ${pretty}` : pretty;
          const subtitlePieces = [b.date, truncate(b.subject, 80)].filter(Boolean);
          const subtitle = subtitlePieces.join(" — ");

          return (
            <List.Item
              id={`branch:${b.branch}`}
              key={b.branch}
              title={title}
              subtitle={subtitle}
              icon={b.isCurrent ? Icon.CheckCircle : Icon.Dot}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser
                    title="Open Pipelines for This Branch"
                    url={pipelinesUrlForBranch(b.branch)}
                    onOpen={() => void showHUD(`Opening pipelines for ${b.branch}…`)}
                  />
                  <Action.CopyToClipboard title="Copy Branch Name" content={b.branch} />
                  <Action.CopyToClipboard title="Copy URL" content={pipelinesUrlForBranch(b.branch)} />
                  <Action
                    title="Reload Branches"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={reload}
                  />
                  <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}


