import { Toast, getPreferenceValues, open, openExtensionPreferences, showHUD, showToast } from "@raycast/api";
import { exec } from "child_process";
import util from "util";

const asyncExec = util.promisify(exec);

type Preferences = {
  workerDir: string;
};

const GITLAB_PIPELINES_BASE_URL = "https://gitlab.ddbuild.io/DataDog/synthetics-worker/-/pipelines?page=1&scope=all";

function pipelinesUrlForBranch(branch: string): string {
  return `${GITLAB_PIPELINES_BASE_URL}&ref=${encodeURIComponent(branch)}`;
}

async function getCurrentRef(workerDir: string): Promise<string> {
  const cwd = String(workerDir || "").trim();
  if (!cwd) throw new Error("Missing workerDir preference.");

  // Repo sanity
  await asyncExec("git rev-parse --git-dir", { cwd });

  return (await asyncExec("git symbolic-ref --short -q HEAD || git rev-parse --short HEAD", { cwd })).stdout.trim();
}

export default async function Command() {
  const { workerDir } = getPreferenceValues<Preferences>();
  const normalizedWorkerDir = String(workerDir || "").trim();

  if (!normalizedWorkerDir) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Missing Preferences",
      message: "Set Worker Directory in extension preferences.",
    });
    await openExtensionPreferences();
    return;
  }

  try {
    const currentRef = await getCurrentRef(normalizedWorkerDir);
    if (!currentRef) throw new Error("Couldn't determine current branch.");

    await open(pipelinesUrlForBranch(currentRef));
    await showHUD(`Opening pipelines for ${currentRef}…`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await showToast({
      style: Toast.Style.Failure,
      title: "Couldn't open GitLab pipelines",
      message: msg,
    });
  }
}


