import { getPreferenceValues, open, showHUD } from "@raycast/api";

type Preferences = {
  jiraBoardUrl: string;
};

const DEFAULT_JIRA_BOARD_URL = "https://datadoghq.atlassian.net/jira/software/c/projects/SYNTH/boards/3245";

export default async function Command() {
  const { jiraBoardUrl } = getPreferenceValues<Preferences>();
  const url = String(jiraBoardUrl || "").trim() || DEFAULT_JIRA_BOARD_URL;

  await open(url);
  await showHUD("Opening Jira Board…");
}


