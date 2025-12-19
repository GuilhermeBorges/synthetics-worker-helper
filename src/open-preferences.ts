import { openExtensionPreferences, showHUD } from "@raycast/api";

export default async function Command() {
  await openExtensionPreferences();
  await showHUD("Opened extension preferences");
}


