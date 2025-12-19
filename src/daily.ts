import { Toast, getPreferenceValues, open, openExtensionPreferences, showHUD, showToast } from "@raycast/api";

type Preferences = {
  dailyZoomUrl: string;
};

export default async function Command() {
  const { dailyZoomUrl } = getPreferenceValues<Preferences>();
  const url = String(dailyZoomUrl || "").trim();

  if (!url) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Missing Preference",
      message: "Set Daily Zoom URL in extension preferences.",
    });
    await openExtensionPreferences();
    return;
  }

  await open(url);
  await showHUD("Opening Daily Zoom…");
}


